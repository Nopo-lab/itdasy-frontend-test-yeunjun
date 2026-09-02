/* ─────────────────────────────────────────────────────────────
   웹 PG (PortOne) 구독 결제 — 빌링키 정기결제 우선, 단건 폴백.

   정책:
   - 웹/PC 브라우저 전용. 네이티브 앱(Capacitor)에서는 절대 동작 안 함(Apple/Google anti-steering).
   - 카드정보는 PortOne SDK 가 직접 처리(우리 서버 미경유). 프론트는 billingKey 만 서버로 전달.
   - 공개키(storeId/channelKey)는 GET /billing/config 로 받음. 시크릿은 서버 전용.
   - env 미설정(enabled:false) 이면 결제 UI graceful disable.
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var PORTONE_SDK_URL = 'https://cdn.portone.io/v2/browser-sdk.js';
  var _config = null;        // { storeId, channelKey, enabled }
  var _sdkPromise = null;

  function _isNative() {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  }
  function _toast(m) { if (window.showToast) window.showToast(m); }
  function _jsonAuth() {
    return Object.assign({ 'Content-Type': 'application/json' }, (window.authHeader && window.authHeader()) || {});
  }
  function _userId() {
    try {
      var v = localStorage.getItem('last_user_id');
      if (v) return v;
      var t = window.getToken && window.getToken();
      if (t) return JSON.parse(atob(t.split('.')[1])).sub;
    } catch (_e) { void 0; }
    return null;
  }
  function _rid(prefix) { return prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10); }

  // 결제 시점에만 SDK 동적 로드 — 초기 로딩 영향 0, 앱에서는 호출 자체를 안 함.
  function _ensureSdk() {
    if (window.PortOne) return Promise.resolve(true);
    if (_sdkPromise) return _sdkPromise;
    _sdkPromise = new Promise(function (resolve) {
      var s = document.createElement('script');
      s.src = PORTONE_SDK_URL;
      s.onload = function () { resolve(!!window.PortOne); };
      s.onerror = function () { resolve(false); };
      document.head.appendChild(s);
    });
    return _sdkPromise;
  }

  async function _loadConfig(force) {
    if (_config && !force) return _config;
    try {
      var res = await apiFetch('/billing/config');
      if (res.ok) _config = await res.json();
    } catch (_e) { void 0; }
    return _config || { enabled: false };
  }

  // 웹 PG 결제 가능 여부 — 네이티브면 false, env 미설정이면 false.
  async function isWebBillingAvailable() {
    if (_isNative()) return false;
    var c = await _loadConfig();
    return !!(c && c.enabled);
  }

  // [정기결제] 빌링키 발급 → 서버에 billingKey 만 전달(서버가 금액·paymentId 결정 후 첫 결제).
  async function startWebSubscription(plan) {
    plan = plan || 'pro';
    if (_isNative()) { _toast('앱에서는 앱스토어 결제로 진행돼요'); return { ok: false, reason: 'native' }; }
    var c = await _loadConfig();
    if (!c.enabled) { _toast('결제 준비 중이에요'); return { ok: false, reason: 'disabled' }; }
    if (!(await _ensureSdk()) || !window.PortOne) { _toast('결제 모듈을 불러오지 못했어요'); return { ok: false, reason: 'sdk' }; }

    var r;
    try {
      r = await window.PortOne.requestIssueBillingKey({
        storeId: c.storeId,
        channelKey: c.channelKey,
        billingKeyMethod: 'CARD',
        issueId: _rid('bk'),
      });
    } catch (e) { r = { code: 'ERR', message: String((e && e.message) || e) }; }

    // PortOne 규약: 성공이면 code 없음(undefined), 실패/취소면 code 존재 → 단건 폴백.
    if (!r || (r.code !== undefined && r.code !== null) || !r.billingKey) {
      return await _onetimeFallback(c, plan);
    }
    try {
      var res = await apiFetch('/billing/issue', {
        method: 'POST', headers: _jsonAuth(),
        body: JSON.stringify({ billing_key: r.billingKey, plan: plan }),
      });
      if (!res.ok) throw new Error(((await res.json().catch(function () { return {}; })).detail) || '결제 실패');
      _toast('잇데이 멤버십이 시작됐어요!');
      await _afterSuccess();
      return { ok: true };
    } catch (e) { _toast('결제 실패: ' + (e.message || '')); return { ok: false }; }
  }

  // [단건 폴백] 빌링키 미지원/실패 시. customer.id 로 계정 매칭(서버가 재검증).
  // [2026-09-02 가격 개편] 표시용 금액 — 청구 권위값은 서버 PLAN_PRICING(불일치 시 서버가 거부).
  var PLAN_DISPLAY = {
    pro:        { amount: 9900,  orderName: '잇데이 Pro (월간)' },
    pro_yearly: { amount: 99000, orderName: '잇데이 Pro (연간)' },
  };

  async function _onetimeFallback(c, plan) {
    var uid = _userId();
    var paymentId = _rid('pay');
    var disp = PLAN_DISPLAY[plan] || PLAN_DISPLAY.pro;
    var r;
    try {
      r = await window.PortOne.requestPayment({
        storeId: c.storeId,
        channelKey: c.channelKey,
        paymentId: paymentId,
        orderName: disp.orderName,
        totalAmount: disp.amount,
        currency: 'CURRENCY_KRW',
        payMethod: 'CARD',
        customer: uid ? { id: 'user-' + uid } : {},
      });
    } catch (e) { r = { code: 'ERR', message: String((e && e.message) || e) }; }
    if (!r || (r.code !== undefined && r.code !== null)) { _toast('결제가 취소됐어요'); return { ok: false }; }
    try {
      var res = await apiFetch('/billing/onetime/verify', {
        method: 'POST', headers: _jsonAuth(),
        body: JSON.stringify({ payment_id: paymentId, plan: plan }),
      });
      if (!res.ok) throw new Error(((await res.json().catch(function () { return {}; })).detail) || '결제 검증 실패');
      _toast('잇데이 멤버십이 시작됐어요!');
      await _afterSuccess();
      return { ok: true };
    } catch (e) { _toast('결제 검증 실패: ' + (e.message || '')); return { ok: false }; }
  }

  // 취소 — 서버는 만료일까지 Pro 유지(cancel_at_period_end).
  async function cancelSubscription() {
    try {
      var res = await apiFetch('/billing/cancel', { method: 'POST', headers: (window.authHeader && window.authHeader()) || {} });
      if (!res.ok) throw new Error(((await res.json().catch(function () { return {}; })).detail) || '취소 실패');
      _toast('구독이 취소 예약됐어요. 만료일까지 이용할 수 있어요');
      await _afterSuccess();
      return { ok: true };
    } catch (e) { _toast('취소 실패: ' + (e.message || '')); return { ok: false }; }
  }

  // [2026-09-02] 해지 예약 철회 — 해지 시트 "마음 바뀌면 다시 시작하기".
  async function resumeSubscription() {
    try {
      var res = await apiFetch('/billing/resume', { method: 'POST', headers: (window.authHeader && window.authHeader()) || {} });
      if (!res.ok) throw new Error(((await res.json().catch(function () { return {}; })).detail) || '재시작 실패');
      _toast('구독이 다시 이어져요');
      await _afterSuccess();
      return { ok: true };
    } catch (e) { _toast('재시작 실패: ' + (e.message || '')); return { ok: false }; }
  }

  async function _afterSuccess() {
    try { if (window.refreshPlanStatus) await window.refreshPlanStatus(); } catch (_e) { void 0; }
  }

  window.ItdasyBilling = {
    startWebSubscription: startWebSubscription,
    cancelSubscription: cancelSubscription,
    resumeSubscription: resumeSubscription,
    isWebBillingAvailable: isWebBillingAvailable,
    loadConfig: _loadConfig,
  };
})();
