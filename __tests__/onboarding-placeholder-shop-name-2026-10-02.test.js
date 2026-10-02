/**
 * @jest-environment jsdom
 *
 * flow-account-firstrun-02 (P2) — 신규 가입자가 온보딩(업종·샵 이름)을 한 번도 보지 못한다.
 *   BE register 가 "<이름>의 샵" 임시 이름을 넣고, app-core.js checkOnboarding 은 shop_name 이 비어있지 않으면
 *   '서버에 이미 설정된 계정' 으로 보고 #onboardingOverlay 를 숨기며 onboarding_done=1 을 박았다.
 *   (실측: 새 컨텍스트 첫 로그인 → overlay hidden, onboarding_done=1, shop_name='tenant-a의 샵')
 *
 *   고정하는 계약 (checkOnboarding 함수만 떼어 실행):
 *     · shop_name 빈 값(새 가입)                       → 온보딩 표시
 *     · shop_name_is_placeholder=true + 이 기기 미완료 → 온보딩 표시 (옛 가입자 구제)
 *     · shop_name_is_placeholder=true + 이 기기에서 _obFinish 로 완료(onboarding_done=1) → 숨김 (우연히 같은 이름인 원장 루프 방지)
 *     · 진짜 이름                                     → 숨김 + localStorage 동기화 (기존 동작)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const CORE = fs.readFileSync(path.join(__dirname, '..', 'app-core.js'), 'utf8');

function slice(from, to) {
  const a = CORE.indexOf(from); const b = CORE.indexOf(to, a + 1);
  if (a < 0 || b < 0) throw new Error('slice not found: ' + from + ' .. ' + to);
  return CORE.slice(a, b);
}
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise(r => setTimeout(r, 0)); };

function boot(settings) {
  document.body.innerHTML = '<div class="ob-overlay hidden" id="onboardingOverlay"></div>';
  const src = slice('async function checkOnboarding() {', '\nfunction updateHomeQuestion() {');
  const applied = [];
  const env = {
    getToken: () => 'tok',
    authHeader: () => ({ Authorization: 'Bearer tok' }),
    apiFetch: jest.fn(async () => ({ ok: true, json: async () => settings })),
    applyShopType: (t) => applied.push(t),
    localStorage,
  };
  // eslint-disable-next-line no-new-func
  const f = new Function(...Object.keys(env), src + '; return { checkOnboarding, _applyLocalOnboarding };');
  return { api: f(...Object.values(env)), applied, ov: () => document.getElementById('onboardingOverlay') };
}
beforeEach(() => { localStorage.clear(); });

test('소스 가드: app-core 가 checkOnboarding 과 온보딩 UI 경계를 그대로 가진다', () => {
  expect(CORE).toMatch(/async function checkOnboarding\(\)/);
  expect(CORE).toMatch(/shop_name_is_placeholder/);
});

test('🔴 새 가입(shop_name 빈 값) → 온보딩 overlay 표시', async () => {
  const { api, ov } = boot({ shop_name: '', shop_type: 'beauty', shop_name_is_placeholder: false });
  await api.checkOnboarding(); await flush();
  expect(ov().classList.contains('hidden')).toBe(false);
  expect(localStorage.getItem('onboarding_done')).toBeNull();
});

test('🔴 옛 가입자(임시 이름 그대로, placeholder=true) + 이 기기 미완료 → 온보딩 표시, onboarding_done 안 박음', async () => {
  const { api, ov } = boot({ shop_name: 'tenant-a의 샵', shop_type: 'beauty', shop_name_is_placeholder: true });
  await api.checkOnboarding(); await flush();
  expect(ov().classList.contains('hidden')).toBe(false);
  expect(localStorage.getItem('onboarding_done')).toBeNull();
  expect(localStorage.getItem('shop_name')).toBeNull();
});

test('placeholder=true 라도 이 기기에서 온보딩을 마친 적이 있으면(onboarding_done=1) 다시 띄우지 않는다', async () => {
  localStorage.setItem('onboarding_done', '1');
  const { api, ov, applied } = boot({ shop_name: '홍길동의 샵', shop_type: 'nail', shop_name_is_placeholder: true });
  await api.checkOnboarding(); await flush();
  expect(ov().classList.contains('hidden')).toBe(true);
  expect(localStorage.getItem('shop_name')).toBe('홍길동의 샵');
  expect(applied).toEqual(['nail']);
});

test('진짜 이름(placeholder=false) → 숨김 + localStorage 동기화 (기존 동작 회귀 없음)', async () => {
  const { api, ov, applied } = boot({ shop_name: '길동 네일', shop_type: 'nail', shop_name_is_placeholder: false });
  await api.checkOnboarding(); await flush();
  expect(ov().classList.contains('hidden')).toBe(true);
  expect(localStorage.getItem('onboarding_done')).toBe('1');
  expect(localStorage.getItem('shop_name')).toBe('길동 네일');
  expect(applied).toEqual(['nail']);
});

test('플래그 필드가 아예 없는 옛 서버 응답도 기존대로(이름 있으면 숨김)', async () => {
  const { api, ov } = boot({ shop_name: '길동 네일', shop_type: 'nail' });
  await api.checkOnboarding(); await flush();
  expect(ov().classList.contains('hidden')).toBe(true);
});
