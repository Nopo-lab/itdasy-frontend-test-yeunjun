/**
 * @jest-environment jsdom
 */
/* [build-iap-native-05 · 07] 체험·해지 안내 문구는 실제 결제 경로를 말해야 하고,
 * 레거시 plan='membership' 유료 계정은 웹에서 '결제 준비 중' 으로 잠기면 안 된다.
 *
 * 실측(2026-10-01, Playwright 웹·데모 membership):
 *   가입 오버레이  "14일 무료 체험 · 카드 정보 불필요"   ← 가입 시 체험은 부여되지 않는다(FE 는 start-trial
 *                                                      미호출, 서버 라우트도 제거됨). 체험은 스토어 월간 오퍼뿐.
 *   플랜 팝업      "체험 기간엔 요금이 청구되지 않아요"  ← 정적 텍스트라 웹·연간·기결제자에게도 고정 노출
 *   구독 안내      "해지는 기기 설정 → 구독에서"         ← 웹 PortOne 구독자의 실제 해지 경로는 이 화면의 버튼
 *   버튼           "결제 준비 중"(disabled)              ← membership 유료인데 _applyBillingAvailability 가
 *                                                      '현재 이용 중' 판정을 덮어썼다(07)
 *
 * 잠그는 것:
 *   ① 가입 오버레이에 '14일 무료 체험' 이 없고 사실만 적혀 있다
 *   ② .pw-cta-sub 는 상태별: 네이티브+무료+월간 → 체험 문구 / 연간 → 체험 없음 / 웹 → 즉시 결제 / 유료 → 숨김
 *   ③ 해지 경로: 웹 portone·demo → '이 화면의 구독 취소 버튼' / iOS·Android 네이티브 → 각 스토어 경로 /
 *      웹에서 스토어 구독이면 스토어 경로
 *   ④ (07) 웹 + membership 유료 + 결제 미설정 → '현재 이용 중인 플랜입니다' / 웹 + 무료 → '결제 준비 중'
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const INDEX = new DOMParser().parseFromString(read('index.html'), 'text/html');
const flush = () => new Promise((r) => setTimeout(r, 30));

function mountPlan({ native = null, status, billingEnabled = true } = {}) {
  document.body.innerHTML = INDEX.getElementById('planPopup').outerHTML;
  if (native) window.Capacitor = { isNativePlatform: () => true, getPlatform: () => native };
  else delete window.Capacitor;
  window.API = 'https://api.test';
  window.authHeader = () => ({ Authorization: 'Bearer t' });
  const st = Object.assign({ plan: 'free', status: 'active', expired: false, expired_at: null,
    next_bill_at: null, current_period_end: null, cancel_at_period_end: false, store: null, product_id: null }, status || {});
  window.apiFetch = async (p) => ({
    ok: true, status: 200,
    json: async () => (String(p).includes('/usage') ? { plan: st.plan, caption: { used: 0, limit: 1, period: 'daily' } } : st),
  });
  window.ItdasyBilling = { isWebBillingAvailable: async () => billingEnabled };
  window.ItdasyIAP = { isAvailable: () => !!native, PRODUCTS: { pro: 'itdasy_pro_monthly_9900', pro_yearly: 'itdasy_pro_yearly_99000' } };
  try { localStorage.setItem('last_user_id', '1'); } catch (_e) { void 0; }
  delete window.openPlanPopup;
  // eslint-disable-next-line no-new-func
  new Function(read('app-plan.js')).call(window);
}

async function open(opts) {
  mountPlan(opts);
  await window.openPlanPopup();
  await flush();
  return snapshot();
}

function snapshot() {
  const btn = document.getElementById('planActionBtn');
  const cta = document.querySelector('#planPopup .pw-cta-sub');
  return {
    btn: btn.textContent, disabled: btn.disabled,
    cta: cta.textContent.trim(), ctaShown: cta.style.display !== 'none',
    cancelPath: document.getElementById('planCancelPathTxt').textContent,
  };
}

async function selectYearly() {
  document.getElementById('planCardYearly').click();
  await flush();
  return snapshot();
}

// ── ① 가입 오버레이 ──────────────────────────────────────────
test('가입 오버레이는 체험을 약속하지 않는다 — 가입은 무료, 카드 등록 없음', () => {
  const sub = INDEX.querySelector('#signupOverlay .lock-sub').textContent;
  expect(sub).not.toMatch(/무료\s*체험/);
  expect(sub).toMatch(/가입은 무료/);
  expect(sub).toMatch(/카드/);
});

test('.pw-cta-sub 는 정적 체험 문구를 갖지 않는다 (JS 가 상태별로 채운다)', () => {
  const cta = INDEX.querySelector('#planPopup .pw-cta-sub');
  expect(cta).toBeTruthy();
  expect(cta.textContent.trim()).not.toMatch(/체험/);
});

test('구독 안내는 체험이 앱 월간 결제에만 붙고 웹은 바로 결제됨을 말한다', () => {
  const notice = INDEX.getElementById('planCancelPathTxt').parentElement.textContent.replace(/\s+/g, ' ');
  expect(notice).toMatch(/14일 무료 체험/);
  expect(notice).toMatch(/앱/);
  expect(notice).toMatch(/웹/);
});

// ── ② 보조 문구(.pw-cta-sub) 상태별 ──────────────────────────
test('네이티브(iOS)+무료+월간 → 체험 문구', async () => {
  const s = await open({ native: 'ios' });
  expect(s.btn).toBe('14일 무료로 시작하기');
  expect(s.ctaShown).toBe(true);
  expect(s.cta).toMatch(/체험 기간엔 요금이 청구되지 않아요/);
});

test('네이티브+무료+연간 → 체험 문구 없음(바로 결제)', async () => {
  await open({ native: 'ios' });
  const s = await selectYearly();
  expect(s.btn).toBe('연 99,000원으로 시작하기');
  expect(s.cta).not.toMatch(/체험 기간엔/);
  expect(s.cta).toMatch(/바로 결제/);
});

test('웹+무료+월간 → 체험 문구 없음(바로 결제 · 언제든 해지)', async () => {
  const s = await open({});
  expect(s.btn).toBe('월 9,900원 시작하기');
  expect(s.cta).not.toMatch(/체험/);
  expect(s.cta).toMatch(/바로 결제/);
});

test('이미 유료(웹 portone pro) → 보조 문구 숨김', async () => {
  const s = await open({ status: { plan: 'pro', store: 'portone', next_bill_at: '2026-11-01T00:00:00Z' } });
  expect(s.btn).toBe('현재 이용 중인 플랜입니다');
  expect(s.ctaShown).toBe(false);
});

// ── ③ 해지 경로 ─────────────────────────────────────────────
test('웹 PortOne 구독자 → 해지 경로는 이 화면의 구독 취소 버튼', async () => {
  const s = await open({ status: { plan: 'pro', store: 'portone', next_bill_at: '2026-11-01T00:00:00Z' } });
  expect(s.cancelPath).toMatch(/구독 취소 버튼/);
  expect(s.cancelPath).not.toMatch(/기기 설정/);
});

test('웹 데모(membership, store demo) → 해지 경로는 이 화면의 구독 취소 버튼', async () => {
  const s = await open({ status: { plan: 'membership', store: 'demo', next_bill_at: '2027-10-01T00:00:00Z' } });
  expect(s.cancelPath).toMatch(/구독 취소 버튼/);
});

test('웹에서 스토어(apple) 구독을 보면 → App Store 경로', async () => {
  const s = await open({ status: { plan: 'pro', store: 'apple', product_id: 'itdasy_pro_monthly_9900', next_bill_at: '2026-11-01T00:00:00Z' } });
  expect(s.cancelPath).toMatch(/App Store|Apple/);
});

test('네이티브 Android → Play 스토어 경로 / iOS → iPhone 설정 경로', async () => {
  expect((await open({ native: 'android' })).cancelPath).toMatch(/Play 스토어/);
  expect((await open({ native: 'ios' })).cancelPath).toMatch(/iPhone 설정/);
});

// ── ④ (07) 레거시 membership 유료는 웹에서 잠기지 않는다 ──────────────
test('웹 + membership 유료(store demo) + 결제 미설정 → "현재 이용 중인 플랜입니다"', async () => {
  const s = await open({ billingEnabled: false,
    status: { plan: 'membership', store: 'demo', next_bill_at: '2027-10-01T00:00:00Z' } });
  expect(s.btn).toBe('현재 이용 중인 플랜입니다');
  expect(s.disabled).toBe(true);
  const y = await selectYearly();
  expect(y.btn).toBe('현재 이용 중인 플랜입니다');
});

test('웹 + 무료 + 결제 미설정 → "결제 준비 중" (회귀)', async () => {
  const s = await open({ billingEnabled: false });
  expect(s.btn).toBe('결제 준비 중');
  expect(s.disabled).toBe(true);
});
