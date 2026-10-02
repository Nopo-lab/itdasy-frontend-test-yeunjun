/**
 * @jest-environment jsdom
 */
/* [build-iap-native-03] Google 결제 보류(paymentState=0)를 '결제 성공' 으로 처리하지 않는다.
 *
 * 왜 (2026-10-01 감사, jsdom 재현):
 *   백엔드 /iap/google-verify 가 { status:'pending', plan:'free' } 를 200 으로 돌려주면
 *   app-iap.js 는 HTTP 상태만 보고 성공 분기로 갔다 —
 *     · tx.finish()  → 스토어에 '소비 확정' (보류 거래를 acknowledge)
 *     · itdasy:plan-activated 이벤트 (plan 'free')
 *     · purchaseMembership → { ok:true, plan:'free' }
 *   그래서 app-plan.js 가 '멤버십이 시작됐어요 🎉' 토스트를 띄우고 팝업을 닫았다. 돈은 아직 안 들어왔다.
 *
 * 잠그는 것:
 *   ① status 'pending' → { ok:false, reason:'pending' } · finish 미호출 · 활성화 이벤트 없음
 *   ② status 'failed'  → { ok:false, reason:'verify_failed' } · finish 미호출 (환불된 영수증 복원 등)
 *   ③ status 'ok'      → 예전 그대로 finish 1회 · ok:true · 활성화 이벤트 (회귀)
 *   ④ app-plan.js: pending 이면 '결제 확인 중' 안내, 팝업 유지, 버튼 복구, 플랜 배지 그대로
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** CdvPurchase/Capacitor/apiFetch 만 스텁하고 app-iap.js 원본을 그대로 올린다. */
function mountIap(verifyBody) {
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android' };
  const calls = { finish: 0, api: [] };
  let approvedCb = null;
  const tx = {
    transactionId: 'GPA.1234', purchaseToken: 'tok-pending-abcdefghijklmnop',
    products: [{ id: 'itdasy_pro_monthly_9900' }], finish() { calls.finish++; },
  };
  window.CdvPurchase = {
    Platform: { APPLE_APPSTORE: 'ios-appstore', GOOGLE_PLAY: 'android-playstore' },
    ProductType: { PAID_SUBSCRIPTION: 'paid subscription' },
    store: {
      register() {}, initialize() {},
      when() { return { approved(cb) { approvedCb = cb; return this; } }; },
      get(id) {
        return { id, getOffer: () => ({ order: () => { setTimeout(() => approvedCb(tx), 5); return Promise.resolve(undefined); } }) };
      },
    },
  };
  window.authHeader = () => ({ Authorization: 'Bearer x' });
  window.apiFetch = (p, opts) => {
    calls.api.push(p + ' ' + (opts && opts.body));
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(verifyBody) });
  };
  const activated = [];
  const onAct = (e) => activated.push(e.detail);
  window.addEventListener('itdasy:plan-activated', onAct);
  delete window.ItdasyIAP;
  // eslint-disable-next-line no-new-func
  new Function(read('app-iap.js')).call(window);
  return { iap: window.ItdasyIAP, calls, activated, tx, cleanup: () => window.removeEventListener('itdasy:plan-activated', onAct) };
}

describe('app-iap.js — 백엔드 VerifyResponse.status 를 본다', () => {
  test('① pending(결제 보류) → ok:false reason:pending, finish 안 함, 활성화 이벤트 없음', async () => {
    const m = mountIap({ status: 'pending', plan: 'free', store: 'google', expires_at: null, auto_renewing: false,
      message: '결제 확인 중이에요. 결제가 완료되면 자동으로 열려요.' });
    const r = await m.iap.purchaseMembership('pro');
    m.cleanup();
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('pending');
    expect(r.message).toContain('결제 확인 중');
    expect(m.calls.finish).toBe(0);           // 보류 거래를 acknowledge 하면 안 된다
    expect(m.activated).toEqual([]);          // plan 'free' 로 활성화 이벤트가 나가면 안 된다
    expect(m.calls.api[0]).toContain('/iap/google-verify');
  });

  test('② failed(환불된 영수증 등) → ok:false reason:verify_failed, finish 안 함', async () => {
    const m = mountIap({ status: 'failed', plan: 'free', store: 'google', message: '환불된 구매라 복원할 수 없어요.' });
    const r = await m.iap.purchaseMembership('pro');
    m.cleanup();
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('verify_failed');
    expect(r.message).toContain('환불');
    expect(m.calls.finish).toBe(0);
    expect(m.activated).toEqual([]);
  });

  test('③ ok → finish 1회 · ok:true · 활성화 이벤트 (회귀)', async () => {
    const m = mountIap({ status: 'ok', plan: 'pro', store: 'google', expires_at: '2026-11-01T00:00:00Z', auto_renewing: true });
    const r = await m.iap.purchaseMembership('pro');
    m.cleanup();
    expect(r).toEqual({ ok: true, plan: 'pro' });
    expect(m.calls.finish).toBe(1);
    expect(m.activated).toEqual([{ plan: 'pro', store: 'google' }]);
  });
});

describe('app-plan.js — pending 결과 처리', () => {
  function mountPlan() {
    const doc = new DOMParser().parseFromString(read('index.html'), 'text/html');
    document.body.innerHTML = doc.getElementById('planPopup').outerHTML;
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android' };
    window.API = 'https://api.test';
    window.authHeader = () => ({ Authorization: 'Bearer t' });
    window.apiFetch = async (p) => ({
      ok: true, status: 200,
      json: async () => (String(p).includes('/usage')
        ? { plan: 'free', caption: { used: 0, limit: 1, period: 'daily' } }
        : { plan: 'free', status: 'active', expired: false, next_bill_at: null, cancel_at_period_end: false, store: null }),
    });
    try { localStorage.setItem('last_user_id', '1'); } catch (_e) { void 0; }
    const toasts = [];
    window.showToast = (t) => toasts.push(t);
    delete window.openPlanPopup; delete window.doPlanAction;
    // eslint-disable-next-line no-new-func
    new Function(read('app-plan.js')).call(window);
    return { toasts };
  }
  const flush = () => new Promise((r) => setTimeout(r, 30));

  test('④ pending → "결제 확인 중" 안내 · 팝업 유지 · 버튼 복구 · 배지는 그대로 체험', async () => {
    const { toasts } = mountPlan();
    window.ItdasyIAP = {
      isAvailable: () => true,
      purchaseMembership: async () => ({ ok: false, reason: 'pending', message: '결제 확인 중이에요. 결제가 완료되면 자동으로 열려요.' }),
      PRODUCTS: { pro: 'itdasy_pro_monthly_9900', pro_yearly: 'itdasy_pro_yearly_99000' },
    };
    await window.openPlanPopup();
    await flush();
    const btn = document.getElementById('planActionBtn');
    const before = btn.textContent;
    await window.doPlanAction();
    await flush();
    // 수정 전엔 '결제 실패: 결제 확인 중이에요…' 로 **실패**라고 말했다 — 보류는 실패가 아니다.
    expect(toasts.some((t) => /결제 확인 중/.test(t) && !/결제 실패/.test(t))).toBe(true);
    expect(toasts.some((t) => /결제 실패/.test(t))).toBe(false);
    expect(toasts.some((t) => /멤버십이 시작됐어요/.test(t))).toBe(false);
    expect(document.getElementById('planPopup').style.display).toBe('flex'); // 닫지 않는다
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toBe(before);
    expect(window.getCurrentPlan()).toBe('free');
  });

  test('ok 면 예전처럼 성공 토스트 (회귀)', async () => {
    const { toasts } = mountPlan();
    window.ItdasyIAP = {
      isAvailable: () => true,
      purchaseMembership: async () => ({ ok: true, plan: 'pro' }),
      PRODUCTS: { pro: 'itdasy_pro_monthly_9900', pro_yearly: 'itdasy_pro_yearly_99000' },
    };
    await window.openPlanPopup();
    await flush();
    await window.doPlanAction();
    await flush();
    expect(toasts.some((t) => /멤버십이 시작됐어요/.test(t))).toBe(true);
    expect(window.getCurrentPlan()).toBe('pro');
  });
});
