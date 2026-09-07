/* ───────────────────────────────────────────────────────────────
   앱 인앱결제(IAP) 클라이언트 — window.ItdasyIAP
   ───────────────────────────────────────────────────────────────
   목적: 네이티브(iOS/Android) 앱에서 StoreKit / Play Billing 구매를 실행하고,
        구매 영수증/토큰을 백엔드로 보내 교차검증 → 멤버십 활성화.

   백엔드 계약(itdasy_backend routers/iap.py):
     POST /iap/apple-verify  { transaction_id, receipt }        → { status, plan, expires_at, auto_renewing }
     POST /iap/google-verify { purchase_token, product_id }     → 동일
     GET  /iap/status                                            → { plan, active, auto_renewing, expires_at }

   플러그인: cordova-plugin-purchase (CdvPurchase, v13+).
     · 서버측 직접 검증(Apple verifyReceipt / Google Developer API)에 맞춰,
       영수증/purchaseToken 을 그대로 얻어 백엔드에 넘기는 방식(RevenueCat 아님).
     · 플러그인이 없으면 isAvailable()=false → 호출부는 기존 동작 유지(무회귀).

   ⚠️ 실기기 검증 필요: CdvPurchase 의 영수증 추출 필드는 플랫폼/버전에 따라 위치가
      달라, _appleReceipt()/_googleToken() 은 방어적으로 여러 경로를 시도한다.
      추출 실패 시 트랜잭션을 finish() 하지 않고(=스토어가 다음 기회에 재통지) 에러를 알린다.
   ─────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  // 스토어 상품 ID — 결제창의 플랜 카드(app-plan.js `_selectedPlan`)와 1:1로 대응한다.
  //   App Store Connect / Play Console 에 **이 id 그대로** 등록돼 있어야 한다.
  //
  // [결제 게이트 2026-09-07] 예전엔 `itdasy_membership_monthly_6900` **하나뿐**이었고
  //   purchaseMembership() 이 선택한 플랜을 아예 안 받았다. 2026-09-02 에 결제창이
  //   월 9,900 / 연 99,000 두 장으로 바뀌었는데 여기가 안 따라와서,
  //   **"연 99,000원으로 시작하기" 를 눌러도 6,900원짜리 월간 상품이 결제됐다.**
  //   화면 금액·기간·상품이 셋 다 다른 결제라, 발견 즉시 출시 블로커로 잡았다.
  //   ⚠️ 카드를 새로 추가하면 여기 매핑도 같이 추가해야 한다 — 안 하면 조용히 월간이 팔린다.
  //      (백엔드도 모르는 상품이면 409 로 거절한다: routers/iap.py `_assert_known_product`)
  var PRODUCTS = {
    pro:        'itdasy_pro_monthly_9900',   // ₩9,900 / 월 (10일 무료체험 오퍼는 스토어 설정)
    pro_yearly: 'itdasy_pro_yearly_99000',   // ₩99,000 / 년 (체험 없음)
  };
  var DEFAULT_PLAN = 'pro';
  // 폐기된 ₩6,900 상품. 스토어엔 아직 등록돼 있어 이미 구독 중인 사용자의 갱신/복원
  //   영수증이 들어올 수 있다. 그래서 **읽기(복원·검증)는 되게** 등록만 해 둔다 — 팔지는 않는다.
  var LEGACY_PRODUCT_IDS = ['itdasy_membership_monthly_6900'];

  function _productIdFor(plan) {
    return PRODUCTS[plan] || PRODUCTS[DEFAULT_PLAN];
  }
  function _allProductIds() {
    return Object.keys(PRODUCTS).map(function (k) { return PRODUCTS[k]; })
      .concat(LEGACY_PRODUCT_IDS);
  }

  var _initialized = false;
  var _pending = null;      // { resolve, reject } — 진행 중인 구매 1건
  var _lastError = '';

  // ─── 환경 판별 ────────────────────────────────────────────────
  function _isNative() {
    try { return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); }
    catch (_e) { return false; }
  }
  function _platform() {
    try {
      var p = window.Capacitor && window.Capacitor.getPlatform && window.Capacitor.getPlatform();
      if (p === 'ios') return 'apple';
      if (p === 'android') return 'google';
    } catch (_e) { /* ignore */ }
    return '';
  }
  // 플러그인 전역(CdvPurchase) 은 cap sync 후 네이티브 런타임에만 존재.
  function _cdv() { return window.CdvPurchase || null; }

  function isAvailable() {
    return _isNative() && !!_cdv() && (_platform() === 'apple' || _platform() === 'google');
  }

  // ─── 백엔드 검증 호출 ─────────────────────────────────────────
  function _authHeaders() {
    var h = (window.authHeader && window.authHeader()) || {};
    h = Object.assign({}, h);
    h['Content-Type'] = 'application/json';
    return h;
  }
  function _api(path, bodyObj) {
    var fetcher = (typeof window.apiFetch === 'function') ? window.apiFetch : window.fetch;
    return fetcher(path, {
      method: 'POST',
      headers: _authHeaders(),
      body: JSON.stringify(bodyObj || {}),
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          var msg = (data && data.detail) || ('검증 실패 (' + res.status + ')');
          var err = new Error(msg); err.status = res.status; throw err;
        }
        return data;
      });
    });
  }

  // ─── 영수증/토큰 추출 (플러그인 버전차 방어) ─────────────────
  function _appleReceipt(tx) {
    try {
      var pr = tx && tx.parentReceipt;
      var cdv = _cdv();
      return (pr && (pr.nativeData && pr.nativeData.appStoreReceipt)) ||
             (pr && pr.appStoreReceipt) ||
             (cdv && cdv.AppleAppStore && cdv.AppleAppStore.appStoreReceipt) ||
             (tx && tx.appStoreReceipt) || '';
    } catch (_e) { return ''; }
  }
  function _googleToken(tx) {
    try {
      return (tx && tx.purchaseToken) ||
             (tx && tx.nativePurchase && tx.nativePurchase.purchaseToken) || '';
    } catch (_e) { return ''; }
  }
  function _productIdOf(tx) {
    try {
      return (tx && tx.products && tx.products[0] && tx.products[0].id) ||
             (tx && tx.productId) || _productIdFor(DEFAULT_PLAN);
    } catch (_e) { return _productIdFor(DEFAULT_PLAN); }
  }

  // 승인된 트랜잭션을 백엔드에 검증 → 성공 시 true(그리고 _pending resolve)
  function _verify(tx) {
    var plat = _platform();
    var call;
    if (plat === 'apple') {
      var receipt = _appleReceipt(tx);
      if (!receipt) return Promise.reject(new Error('영수증을 읽지 못했어요'));
      call = _api('/iap/apple-verify', { transaction_id: String((tx && tx.transactionId) || ''), receipt: receipt });
    } else if (plat === 'google') {
      var token = _googleToken(tx);
      if (!token) return Promise.reject(new Error('구매 정보를 읽지 못했어요'));
      call = _api('/iap/google-verify', { purchase_token: token, product_id: _productIdOf(tx) });
    } else {
      return Promise.reject(new Error('지원하지 않는 결제 환경'));
    }
    return call.then(function (data) {
      // 활성화 알림 — app-plan 등이 구독 UI 갱신
      try { window.dispatchEvent(new CustomEvent('itdasy:plan-activated', { detail: { plan: (data && data.plan) || 'membership', store: plat } })); } catch (_e) { void _e; }
      return data;
    });
  }

  // ─── 플러그인 초기화 (최초 1회) ──────────────────────────────
  function _ensureInit() {
    if (_initialized) return true;
    var CdvPurchase = _cdv();
    if (!CdvPurchase) return false;
    try {
      var store = CdvPurchase.store;
      var Platform = CdvPurchase.Platform;
      var ProductType = CdvPurchase.ProductType;
      var plat = _platform() === 'apple' ? Platform.APPLE_APPSTORE : Platform.GOOGLE_PLAY;

      // 파는 상품 2개 + 폐기 상품(기존 구독자 복원용)을 전부 등록한다.
      //   등록 안 된 상품은 store.get() 이 못 찾아서 **복원이 조용히 실패**한다.
      store.register(_allProductIds().map(function (id) {
        return { id: id, type: ProductType.PAID_SUBSCRIPTION, platform: plat };
      }));

      // 승인 → 백엔드 검증 → 성공 시에만 finish()(스토어에 소비 확정).
      //   검증 실패면 finish 하지 않아 다음 기회(restore/재기동)에 재검증된다(과금 후 미활성 자가복구).
      store.when()
        .approved(function (tx) {
          _verify(tx).then(function (data) {
            try { tx.finish(); } catch (_e) { void _e; }
            if (_pending) { _pending.resolve({ ok: true, plan: (data && data.plan) || 'membership' }); _pending = null; }
          }).catch(function (err) {
            _lastError = (err && err.message) || '검증 실패';
            // 검증 실패 — finish 하지 않음(재검증 여지). 진행 중 구매면 실패로 알림.
            if (_pending) { _pending.resolve({ ok: false, reason: 'verify_failed', message: _lastError }); _pending = null; }
          });
        });

      store.initialize([plat]);
      _initialized = true;
      return true;
    } catch (e) {
      _lastError = (e && e.message) || 'IAP 초기화 실패';
      return false;
    }
  }

  // ─── 공개 API ────────────────────────────────────────────────
  // 멤버십 구매. 반환: Promise<{ok, plan}|{ok:false, reason, message}>
  function purchaseMembership(plan) {
    if (!isAvailable()) return Promise.resolve({ ok: false, reason: 'unavailable' });
    if (!_ensureInit()) return Promise.resolve({ ok: false, reason: 'init_failed', message: _lastError });
    if (_pending) return Promise.resolve({ ok: false, reason: 'in_progress' });

    // [결제 게이트 2026-09-07] 선택한 플랜의 상품을 산다. 인자가 없으면 월간(기존 동작).
    var productId = _productIdFor(plan);
    var CdvPurchase = _cdv();
    var store = CdvPurchase.store;
    var product = store.get(productId);
    var offer = product && (product.getOffer ? product.getOffer() : (product.offers && product.offers[0]));
    if (!offer) return Promise.resolve({ ok: false, reason: 'no_product', message: '상품 정보를 불러오지 못했어요' });

    return new Promise(function (resolve) {
      _pending = { resolve: resolve };
      var timer = setTimeout(function () {
        if (_pending) { _pending.resolve({ ok: false, reason: 'timeout' }); _pending = null; }
      }, 120000); // 2분 안전망 — 사용자가 결제창을 방치해도 promise 가 영영 안 끝나지 않게
      var _wrap = _pending.resolve;
      _pending.resolve = function (v) { clearTimeout(timer); _wrap(v); };
      try {
        var p = offer.order();
        if (p && typeof p.then === 'function') {
          p.then(function (errOrNull) {
            // order() 자체 에러(취소 포함) — approved 가 안 오는 경로
            if (errOrNull && _pending) {
              var code = (errOrNull.code != null) ? String(errOrNull.code) : '';
              var cancelled = /cancel/i.test((errOrNull.message || '')) || code === '6777006';
              _pending.resolve({ ok: false, reason: cancelled ? 'cancelled' : 'order_failed', message: errOrNull.message || '' });
              _pending = null;
            }
          }).catch(function (e) {
            if (_pending) { _pending.resolve({ ok: false, reason: 'order_failed', message: (e && e.message) || '' }); _pending = null; }
          });
        }
      } catch (e) {
        if (_pending) { _pending.resolve({ ok: false, reason: 'order_failed', message: (e && e.message) || '' }); _pending = null; }
      }
    });
  }

  // 구매 복원 (Apple 필수 요건). 반환: Promise<{ok, plan?}>
  function restore() {
    if (!isAvailable()) return Promise.resolve({ ok: false, reason: 'unavailable' });
    if (!_ensureInit()) return Promise.resolve({ ok: false, reason: 'init_failed' });
    var store = _cdv().store;
    return Promise.resolve()
      .then(function () { return store.restorePurchases ? store.restorePurchases() : null; })
      .then(function () { return refreshStatus(); })
      .then(function (st) { return { ok: !!(st && st.active), plan: st && st.plan }; })
      .catch(function (e) { return { ok: false, reason: 'restore_failed', message: (e && e.message) || '' }; });
  }

  // 서버 기준 현재 구독 상태. 반환: Promise<{plan, active, ...}|null>
  function refreshStatus() {
    var fetcher = (typeof window.apiFetch === 'function') ? window.apiFetch : window.fetch;
    return fetcher('/iap/status', { headers: (window.authHeader && window.authHeader()) || {} })
      .then(function (res) { return res.ok ? res.json() : null; })
      .catch(function () { return null; });
  }

  window.ItdasyIAP = {
    isAvailable: isAvailable,
    purchaseMembership: purchaseMembership,
    restore: restore,
    refreshStatus: refreshStatus,
    PRODUCTS: PRODUCTS,
    productIdFor: _productIdFor,
    // 하위호환 — app-plan.js 의 Play 구독관리 딥링크가 sku 폴백으로 쓴다.
    PRODUCT_ID: _productIdFor(DEFAULT_PLAN),
  };
})();
