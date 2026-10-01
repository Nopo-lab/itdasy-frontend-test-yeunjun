/**
 * @jest-environment jsdom
 *
 * flow-account-firstrun-01 (P1) — 비밀번호 변경 화면에 앱 어디서도 도달할 수 없다.
 *   버튼(#changePwBtn)은 아무도 열지 않는 레거시 #settingsSheet 안에만 있고(app-core openSettings 는 허브로만
 *   리다이렉트), 새 설정 허브(app-settings-hub.js) 계정 섹션엔 행이 없다. 계정 탈퇴가 2026-07-26 에 같은
 *   이유로 막혔다가 허브 행으로 고친 전례와 동일한 누락. (실측 s1b_screens.js: pwChangeVisible visible:false)
 * flow-account-firstrun-05 (P3) — 샵 이름을 바꿔 저장해도 새로고침 전까지 헤더·내 샵 관리는 옛 이름.
 *   app-shop-settings.js _save 가 `itdasy_shop_name` 만 갱신하고 헤더·홈·허브가 읽는 `shop_name` 키와
 *   updateHeaderProfile 을 건드리지 않는다 (실측 s6: .ms-shop__name-t = 'tenant-b…의 샵').
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const HUB = fs.readFileSync(path.join(ROOT, 'app-settings-hub.js'), 'utf8');
const CORE = fs.readFileSync(path.join(ROOT, 'app-core.js'), 'utf8');
const SHOP = fs.readFileSync(path.join(ROOT, 'app-shop-settings.js'), 'utf8');

const flush = async () => { for (let i = 0; i < 10; i++) await new Promise(r => setTimeout(r, 0)); };

function bootHub(provider) {
  document.body.innerHTML = '';
  localStorage.clear();
  if (provider) localStorage.setItem('user_oauth_provider', provider);
  window._esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  window.openChangePwModal = jest.fn();
  // eslint-disable-next-line no-eval
  window.eval(HUB);
  window.openSettingsHub();
  return document.getElementById('settingsHubSheet');
}
afterEach(() => { jest.useRealTimers(); });

describe('01 — 설정 허브 → 비밀번호 변경', () => {
  test('🔴 계정 섹션에 "비밀번호 변경" 행이 있고, 누르면 openChangePwModal 이 열린다', () => {
    jest.useFakeTimers();
    const sheet = bootHub('');
    const row = sheet.querySelector('.ms-sh__row[data-act="changepw"]');
    expect(row).toBeTruthy();
    expect(row.textContent).toMatch(/비밀번호 변경/);
    row.click();
    jest.advanceTimersByTime(300);
    expect(window.openChangePwModal).toHaveBeenCalledTimes(1);
  });
  test('이메일 계정(provider=email)도 행이 보인다', () => {
    const sheet = bootHub('email');
    expect(sheet.querySelector('.ms-sh__row[data-act="changepw"]')).toBeTruthy();
  });
  test('소셜 로그인(google/kakao/naver/apple)은 비밀번호가 없으니 행을 그리지 않는다', () => {
    ['google', 'kakao', 'naver', 'apple'].forEach((p) => {
      const sheet = bootHub(p);
      expect(sheet.querySelector('.ms-sh__row[data-act="changepw"]')).toBeNull();
    });
  });
  test('app-core 가 openChangePwModal 을 window 에 명시적으로 노출한다 (허브가 부르는 이름)', () => {
    expect(CORE).toMatch(/Object\.assign\(window, \{[^}]*\bopenChangePwModal,/);
    expect(CORE).toMatch(/^function openChangePwModal\(\)/m);
  });
});

describe('05 — 샵 이름 저장 즉시 반영', () => {
  async function bootShop() {
    document.body.innerHTML = '<div id="headerShopName">old</div>';
    localStorage.clear();
    localStorage.setItem('shop_name', 'tenant-b의 샵');
    window.API = 'http://127.0.0.1:8000';
    window.authHeader = () => ({ Authorization: 'Bearer t' });
    window._esc = (s) => String(s == null ? '' : s);
    window.showToast = jest.fn();
    window.updateHeaderProfile = jest.fn();
    window.ShopDrawer = { refreshHeader: jest.fn() };
    window.fetch = jest.fn(async (url, o) => ({ ok: true, status: 200, json: async () => ((o && o.method) === 'PUT' ? { ok: true } : { shop_name: 'tenant-b의 샵' }) }));
    const events = [];
    window.addEventListener('itdasy:data-changed', (e) => events.push(e.detail && e.detail.kind));
    // eslint-disable-next-line no-eval
    window.eval(SHOP);
    window.openShopSettings();
    await flush();
    return { events };
  }
  test('🔴 저장하면 shop_name 키·헤더가 새 이름이고 data-changed(shop_settings) 가 난다', async () => {
    const { events } = await bootShop();
    document.getElementById('ssShopName').value = 'B샵-새이름';
    document.querySelector('#shopSettingsScreen [data-ss-save]').click();
    await flush();
    expect(localStorage.getItem('shop_name')).toBe('B샵-새이름');
    expect(localStorage.getItem('itdasy_shop_name')).toBe('B샵-새이름');
    expect(window.updateHeaderProfile).toHaveBeenCalled();
    expect(events).toContain('shop_settings');
    expect(window.fetch.mock.calls.some(c => (c[1] && c[1].method) === 'PUT')).toBe(true);
  });
  test('이름이 비면 저장하지 않고 키도 안 바꾼다', async () => {
    await bootShop();
    document.getElementById('ssShopName').value = '   ';
    document.querySelector('#shopSettingsScreen [data-ss-save]').click();
    await flush();
    expect(localStorage.getItem('shop_name')).toBe('tenant-b의 샵');
    expect(window.updateHeaderProfile).not.toHaveBeenCalled();
  });
});
