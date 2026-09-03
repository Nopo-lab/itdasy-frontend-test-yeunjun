/* ─────────────────────────────────────────────────────────────
   플랜 팝업 — 잇데이 Pro: 월 9,900 / 연 99,000(2개월 무료) · 10일 체험(월간)
   [2026-09-02 가격 개편] 금액 정본 = BE routers/billing.PLAN_PRICING.
   해지(웹 PortOne)는 #cancelSheet 2단계 바텀시트, 스토어 결제는 딥링크.
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  let _selectedPlan = 'pro';
  let _currentPlan = 'free';
  let _cancelScheduled = false;   // 취소 예약(만료일까지 유지)
  let _periodEnd = null;          // 다음 결제일/만료일
  let _store = null;              // 'apple' | 'google' | 'portone' | 'demo' | null — 누가 결제를 갖고 있나
  let _productId = null;          // 스토어 구독관리 딥링크의 sku (Google)
  let _stateUid = null;           // 위 캐시가 '누구 것' 인지 (계정 전환 시 폐기용)

  // Google Play 구독관리 딥링크에 필요한 패키지명.
  //   ⚠️ iOS(com.nopolab.itdasy)와 다르다 — Android 는 android/app/build.gradle 의
  //   applicationId(com.y2do.itdasy)가 스토어 등록분이다. capacitor.config.json 의 appId 는
  //   스캐폴딩 기본값(iOS 쪽)이라 여기 쓰면 안 된다.
  const ANDROID_PACKAGE = 'com.y2do.itdasy';

  function _planDisplayName(plan) {
    if (plan === 'free') return '체험';
    return '잇데이 Pro';
  }

  async function openPlanPopup() {
    const pop = document.getElementById('planPopup');
    if (!pop) return;

    _selectedPlan = 'pro';
    pop.style.display = 'flex';
    _updatePlanCardHighlight();
    _stylePopularCard();
    if (window.hapticLight) window.hapticLight();

    // 사용량/상태 로드 + 결제 가능여부(graceful)
    _loadUsage().catch(() => {});
    _loadStatus().then(() => _applyBillingAvailability()).catch(() => {});
    _applyCancelPathText();   // 구독 고지의 해지 경로를 플랫폼에 맞게

    // 취소 버튼 바인딩 (idempotent)
    const cancelBtn = document.getElementById('planCancelBtn');
    if (cancelBtn && !cancelBtn._bound) {
      cancelBtn._bound = true;
      cancelBtn.addEventListener('click', doCancelSubscription);
    }

    // 카드 클릭 바인딩 (idempotent)
    document.querySelectorAll('#planPopup .plan-card').forEach((card) => {
      if (card._bound) return;
      card._bound = true;
      card.addEventListener('click', () => {
        _selectedPlan = card.dataset.plan;
        _updatePlanCardHighlight();
        if (window.hapticLight) window.hapticLight();
      });
    });

    const closeBtn = document.getElementById('planCloseBtn');
    if (closeBtn && !closeBtn._bound) {
      closeBtn._bound = true;
      closeBtn.addEventListener('click', () => { pop.style.display = 'none'; });
    }
    // 배경 클릭으로 닫기
    if (!pop._bgBound) {
      pop._bgBound = true;
      pop.addEventListener('click', (e) => { if (e.target === pop) pop.style.display = 'none'; });
    }
  }

  function closePlanPopup() {
    const pop = document.getElementById('planPopup');
    if (pop) pop.style.display = 'none';
  }

  // [2026-09-02 가격 개편] 카드 디자인은 index.html(pw- 클래스)이 정본 — JS 덧칠 제거.
  function _stylePopularCard() { /* no-op: v5 페이월은 HTML/CSS 가 디자인을 가진다 */ }

  function _updatePlanCardHighlight() {
    document.querySelectorAll('#planPopup .plan-card').forEach((card) => {
      card.classList.toggle('pw-on', card.dataset.plan === _selectedPlan);
    });
    _updateActionButton();
  }

  function _updateActionButton() {
    const btn = document.getElementById('planActionBtn');
    if (!btn) return;
    // pro_yearly 는 결제 키일 뿐 저장 플랜은 'pro' — 이미 유료면 둘 다 "이용 중" 처리
    const paidNow = ['pro', 'premium', 'membership'].includes(_currentPlan);
    if (_selectedPlan === _currentPlan || (paidNow && (_selectedPlan === 'pro' || _selectedPlan === 'pro_yearly'))) {
      btn.textContent = '현재 이용 중인 플랜입니다';
      btn.disabled = true;
      btn.style.opacity = '0.5';
      btn.style.cursor = 'not-allowed';
      return;
    }
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.style.cursor = 'pointer';
    if (_selectedPlan === 'free') {
      btn.textContent = '체험 상태로 유지';
    } else if (_selectedPlan === 'pro_yearly') {
      // 연간은 무료체험 없이 즉시 결제 (체험 후 연간 청구 = 기만 패턴)
      btn.textContent = '연 99,000원으로 시작하기';
    } else {
      // "10일 무료" 는 스토어 IAP 체험이 붙는 네이티브에서만 — 웹 PortOne 은 즉시 청구라
      //   무료라고 쓰면 그 자체가 다크패턴이다.
      btn.textContent = (_currentPlan === 'free')
        ? (_isNative() ? '10일 무료로 시작하기' : '월 9,900원 시작하기')
        : '잇데이 Pro 로 전환';
    }
  }

  async function _loadUsage() {
    const headers = window.authHeader && window.authHeader();
    if (!window.API || !headers || !headers.Authorization) return;
    const box = document.getElementById('planUsageContent');
    if (!box) return;
    try {
      const res = await apiFetch('/subscription/usage', { headers });
      if (!res.ok) throw new Error('usage ' + res.status);
      const u = await res.json();
      // [버그6] BE 실제 응답 shape는 중첩 객체 — { plan, caption:{used,limit,period}, removebg:{…}, publish:{…}, analyze:{…}, portfolio_tag:{…} }
      // 기존 코드는 평면 필드(u.caption_today)를 읽어 항상 rows=0 → "불러올 수 없어요"로 빠지던 버그.
      const _fmtLimit = (l) => (l == null || l < 0) ? '∞' : l;
      const _defs = [
        // [잇비 실측감사 2026-08-15] 잇비 대화가 이 목록에 없었다. 무료 25회/월인데 게이지에
        //   항목이 없으니 원장님은 잔여를 볼 방법이 없고, 26번째 대화에서 예고 없이
        //   "월간 사용 한도(25회)를 초과했습니다" 를 맞는다. 다른 한도는 다 보여주면서 이것만 빠져 있었다.
        //   가장 자주 쓰는 기능이라 맨 위에 둔다. (BE 는 /subscription/usage.assistant 로 이미 준다)
        ['assistant', 'AI 잇비 대화', ' (이번 달)'],
        ['caption', 'AI 캡션/해시태그', ''],
        ['removebg', '누끼·배경', ''],
        ['analyze', '말투 분석', ' (이번 달)'],
        ['publish', '인스타 발행', ' (이번 달)'],
        ['portfolio_tag', '포트폴리오 자동태그', ''],
      ];
      const rows = [];
      let recognized = false; // 예상 shape의 키를 하나라도 이해했는지 (파싱 성공 판정)
      for (const [key, label, suffix] of _defs) {
        const it = u && u[key];
        if (it && typeof it === 'object' && it.used !== undefined) {
          recognized = true;
          rows.push(`• ${label}: ${it.used}/${_fmtLimit(it.limit)}${suffix}`);
        }
      }
      if (rows.length) box.innerHTML = rows.join('<br>');
      else if (recognized) box.textContent = '아직 사용 내역이 없어요'; // 200이지만 집계 전/빈 경우
      else box.textContent = '사용량 정보를 표시할 수 없어요'; // 응답 shape 예상 밖 (파싱 실패)
    } catch (_) {
      box.textContent = '사용량을 불러오지 못했어요'; // 네트워크/HTTP 실패
    }
  }

  // [2026-08-03 재감사] 계정이 바뀌면 이 모듈의 캐시를 버린다.
  //   로그아웃은 location.replace 로 페이지를 새로 띄우니 문제가 없다. 그런데 **리로드 없는
  //   계정 전환 경로**가 있다: 토큰 만료로 게이트가 잠긴 화면에서 다른 계정으로 로그인하면
  //   app-core 의 login() 이 applyNewSession(forcePurge) 후 lockOverlay 만 걷는다(app-core.js:1745).
  //   그때 storage·IDB 는 비워지지만 **여기 클로저 변수는 그대로 남아**, 다음 _loadStatus 가
  //   끝나기 전까지 이전 사용자의 플랜이 보인다 — 무료 계정에 "다음 갱신일"·유료 배지가 뜨고
  //   isPaidPlan() 이 true 를 돌려준다(서버 한도는 별도 강제라 표시·클라 게이트 한정).
  //   app-core 를 건드리지 않으려고 applyNewSession 이 갱신하는 last_user_id 를 그대로 쓴다.
  function _uid() {
    try { return localStorage.getItem('last_user_id'); } catch (_e) { return null; }
  }
  function _resetIfUserChanged() {
    const u = _uid();
    if (u === _stateUid) return;
    _stateUid = u;   // 먼저 갱신 — 아래 재렌더가 여기 다시 들어와도 이 줄에서 즉시 빠진다(재귀 방지)
    _currentPlan = 'free'; _store = null; _productId = null;
    _periodEnd = null; _cancelScheduled = false;
    // ⚠️ 변수만 비우면 **이미 그려진 DOM 은 그대로 남는다**(실측: 전환 직후 버튼이 계속
    //   "스토어에서 구독 관리", meta 에 이전 사용자의 갱신일이 떠 있었다). 같이 다시 그린다.
    try { _updatePlanBadgeUI('free'); _updateActionButton(); _renderSubMeta(); } catch (_e) { void _e; }
  }

  async function _loadStatus() {
    const headers = window.authHeader && window.authHeader();
    if (!window.API || !headers || !headers.Authorization) return;
    _resetIfUserChanged();
    try {
      const res = await apiFetch('/subscription/status', { headers });
      if (!res.ok) return;
      const d = await res.json();
      _stateUid = _uid();   // 응답이 도착한 시점의 주인을 기록
      _currentPlan = (d.plan || 'free').toLowerCase();
      _cancelScheduled = !!d.cancel_at_period_end;
      _periodEnd = d.current_period_end || d.next_bill_at || null;
      _store = d.store || null;
      _productId = d.product_id || null;
      _updateActionButton();
      _updatePlanBadgeUI(_currentPlan);
      _renderSubMeta();
    } catch (_) { void 0; }
  }

  // ─── 해지 경로 판정 ─────────────────────────────────────────────
  // [2026-08-03] 스토어(Apple/Google) 구독은 **스토어에서만** 해지된다.
  //   앱에서 POST /billing/cancel 을 불러도 우리 DB 의 cancel_at_period_end 만 켜질 뿐
  //   스토어 자동갱신은 계속 돌아 요금이 청구된다. 그런데 화면엔 "취소 예약됐어요" 라고 떠서
  //   사용자는 해지된 줄 안다 — Apple 3.1.2 / Google Play 구독 정책 위반이자 실제 소비자 피해.
  //   그래서 결제 주체가 스토어면 취소 API 를 아예 안 부르고 스토어 구독관리로 보낸다.
  function _storeOwner() {
    if (_store === 'apple' || _store === 'google') return _store;
    if (_store) return null;   // 'portone'/'demo' — 우리가 해지할 수 있는(또는 실결제 아닌) 경로
    // store 미상(구버전 서버 응답·체험 등). 네이티브 앱에서는 결제 경로가 IAP 뿐이므로
    // (doPlanAction 이 네이티브에서 웹 PG 를 막는다) 스토어 구독으로 보는 게 안전하다.
    if (!_isNative()) return null;
    let p = '';
    try { p = (window.Capacitor.getPlatform && window.Capacitor.getPlatform()) || ''; } catch (_e) { void 0; }
    return p === 'android' ? 'google' : 'apple';
  }

  function _storeSubUrl(owner) {
    if (owner === 'google') {
      const sku = _productId || (window.ItdasyIAP && window.ItdasyIAP.PRODUCT_ID) || '';
      return 'https://play.google.com/store/account/subscriptions'
        + (sku ? ('?sku=' + encodeURIComponent(sku) + '&package=' + ANDROID_PACKAGE) : '');
    }
    // iOS: 앱에서는 설정 앱으로 넘기는 itms-apps 스킴, 웹에서는 https 로.
    return _isNative()
      ? 'itms-apps://apps.apple.com/account/subscriptions'
      : 'https://apps.apple.com/account/subscriptions';
  }

  function _openStoreSubs() {
    const url = _storeSubUrl(_storeOwner() || 'apple');
    if (window.hapticLight) window.hapticLight();
    // 네이티브는 Capacitor 가 외부 스킴/외부 도메인 이동을 가로채 시스템에 넘긴다(웹뷰는 그대로).
    if (_isNative()) { window.location.href = url; return; }
    window.open(url, '_blank', 'noopener');
  }

  // 구독 메타(만료일/취소 예약) + 취소 버튼 노출. planPopup 안에서만 의미 있음.
  function _renderSubMeta() {
    _resetIfUserChanged();
    const meta = document.getElementById('planSubMeta');
    const cancelBtn = document.getElementById('planCancelBtn');
    const paid = ['pro', 'premium', 'membership'].includes(_currentPlan);  // [2026-07-26] membership 도 유료(취소·만료 UI 노출)
    const owner = paid ? _storeOwner() : null;   // 'apple'|'google' 이면 스토어 관리 구독
    if (meta) {
      if (paid && _periodEnd) {
        const dt = new Date(_periodEnd);
        const ds = isNaN(dt.getTime()) ? '' : (dt.getFullYear() + '.' + (dt.getMonth() + 1) + '.' + dt.getDate());
        if (owner) {
          // 스토어 구독은 우리 DB 의 cancel_at_period_end 가 실제 해지 여부를 말해주지 못한다.
          // (스토어에서 해지해도 이 값은 false 고, 반대로 과거 앱 버튼으로 켜졌어도 결제는 계속됐다)
          // 그래서 "취소 예약됨" 이라고 단정하지 않고 갱신일만 알린다.
          meta.textContent = '다음 갱신일 ' + ds + ' · 해지는 ' + (owner === 'google' ? 'Play 스토어' : 'App Store') + '에서';
        } else {
          meta.textContent = _cancelScheduled ? ('취소 예약됨 · ' + ds + '까지 이용 가능') : ('다음 결제일 ' + ds);
        }
        meta.style.display = 'block';
      } else {
        meta.style.display = 'none';
      }
    }
    if (cancelBtn) {
      if (owner) {
        // 스토어 구독 — 취소 API 를 부르지 않는다. 구독관리 화면으로 보낼 뿐.
        // (취소 예약 여부를 알 수 없으므로 _cancelScheduled 로 숨기지도 않는다)
        cancelBtn.textContent = '스토어에서 구독 관리';
        cancelBtn.style.display = 'block';
      } else {
        cancelBtn.textContent = '구독 취소';
        cancelBtn.style.display = (paid && !_cancelScheduled) ? 'block' : 'none';
      }
    }
    // [C-1] 구매 복원 버튼 — 네이티브 + IAP 플러그인 있을 때만 노출(Apple 3.1.1 필수).
    const restoreBtn = document.getElementById('planRestoreBtn');
    if (restoreBtn) {
      const showRestore = _isNative() && window.ItdasyIAP && window.ItdasyIAP.isAvailable && window.ItdasyIAP.isAvailable();
      restoreBtn.style.display = showRestore ? 'block' : 'none';
    }
  }

  // [graceful disable] 웹에서 결제 불가(env 미설정)면 결제 버튼 비활성. 네이티브는 별도(IAP).
  async function _applyBillingAvailability() {
    const btn = document.getElementById('planActionBtn');
    if (!btn || _selectedPlan === _currentPlan || _isNative()) return;
    if (!window.ItdasyBilling) return;
    try {
      const avail = await window.ItdasyBilling.isWebBillingAvailable();
      if (!avail) {
        btn.disabled = true; btn.style.opacity = '0.5'; btn.style.cursor = 'not-allowed';
        btn.textContent = '결제 준비 중';
      }
    } catch (_e) { void 0; }
  }

  function _updatePlanBadgeUI(plan) {
    const badge = document.getElementById('planBadge');
    if (!badge) return;
    // [C-1 2026-07-27] membership(정본 유료)도 브랜드색 — 예전엔 pro/premium 만 봐서
    //   6,900원 결제자에게 배지가 회색(체험)으로 보였다.
    if (plan === 'pro' || plan === 'premium' || plan === 'membership') {
      badge.textContent = _planDisplayName(plan);
      badge.style.background = 'var(--brand)';
      badge.style.color = '#fff';
    } else {
      badge.textContent = _planDisplayName(plan);
      badge.style.background = '#e0e0e0';
      badge.style.color = 'var(--text-subtle,#888)';
    }
    try {
      window.dispatchEvent(new CustomEvent('itdasy:plan-updated', { detail: { plan } }));
    } catch (_) { void 0; }
  }

  function _isNative() {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  }

  // [출시감사 2026-07-31] 자동갱신 구독 고지의 '해지 방법'은 플랫폼마다 경로가 다르다.
  //   Apple 3.1.2 는 해지 방법 안내를 요구하는데, 안드로이드에서 "Apple ID" 라고 적혀 있으면
  //   틀린 안내가 된다. 기본 문구는 중립("기기 설정 → 구독")이고 네이티브에서만 정확한 경로로 교체.
  function _applyCancelPathText() {
    const el = document.getElementById('planCancelPathTxt');
    if (!el || !_isNative()) return;
    let p = '';
    try { p = (window.Capacitor.getPlatform && window.Capacitor.getPlatform()) || ''; } catch (_e) { void 0; }
    if (p === 'ios') el.textContent = 'iPhone 설정 → Apple 계정 → 구독';
    else if (p === 'android') el.textContent = 'Play 스토어 → 프로필 → 결제 및 구독';
  }

  async function doPlanAction() {
    if (_selectedPlan === _currentPlan) return;
    if (_selectedPlan === 'free') {
      if (window.hapticMedium) window.hapticMedium();
      if (typeof window.showToast === 'function') window.showToast('체험 상태 변경은 설정에서 진행해주세요');
      return;
    }

    // 네이티브 앱: 앱스토어 IAP 만 사용 (Apple/Google anti-steering — 웹 PG 호출 금지).
    if (_isNative()) {
      if (window.hapticMedium) window.hapticMedium();
      // [C-1 2026-07-27] IAP 플러그인(cordova-plugin-purchase)이 설치된 빌드에서만 실제 결제.
      //   플러그인 없으면(현재 빌드) isAvailable()=false → 기존 '준비중' 안내 유지(무회귀).
      if (!(window.ItdasyIAP && window.ItdasyIAP.isAvailable && window.ItdasyIAP.isAvailable())) {
        if (typeof window.showToast === 'function') window.showToast('앱스토어 결제 준비 중이에요. 곧 열려요!');
        return;
      }
      var _btn = document.getElementById('planActionBtn');
      var _orig = _btn ? _btn.textContent : '';
      if (_btn) { _btn.disabled = true; _btn.style.opacity = '0.6'; _btn.textContent = '결제 진행 중…'; }
      window.ItdasyIAP.purchaseMembership().then(function (r) {
        if (r && r.ok) {
          if (window.hapticSuccess) window.hapticSuccess();
          _currentPlan = r.plan || 'membership';
          _updateActionButton();
          _updatePlanBadgeUI(_currentPlan);
          if (typeof window.showToast === 'function') window.showToast('멤버십이 시작됐어요 🎉');
          setTimeout(closePlanPopup, 1200);
        } else {
          if (_btn) { _btn.disabled = false; _btn.style.opacity = '1'; _btn.textContent = _orig; }
          if (r && r.reason === 'cancelled') return; // 사용자가 취소 — 조용히
          if (typeof window.showToast === 'function') {
            window.showToast(r && r.message ? ('결제 실패: ' + r.message) : '결제를 완료하지 못했어요. 잠시 후 다시 시도해 주세요');
          }
        }
      });
      return;
    }

    // 웹/PC: 포트원 PG 결제 (빌링키 우선, 단건 폴백 — app-billing.js)
    if (!window.ItdasyBilling) {
      if (typeof window.showToast === 'function') window.showToast('결제 모듈을 불러오지 못했어요');
      return;
    }
    const btn = document.getElementById('planActionBtn');
    const orig = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; btn.textContent = '결제 진행 중…'; }
    try {
      // pro_yearly 도 서버 저장 플랜은 'pro' — 금액·기간만 billing.PLAN_PRICING 이 다르게 청구
      const r = await window.ItdasyBilling.startWebSubscription(_selectedPlan);
      if (r && r.ok) {
        if (window.hapticSuccess) window.hapticSuccess();
        _currentPlan = 'pro';
        _updateActionButton();
        _updatePlanBadgeUI('pro');
        setTimeout(closePlanPopup, 1200);
      } else if (btn) {
        btn.disabled = false; btn.style.opacity = '1'; btn.textContent = orig;
      }
    } catch (e) {
      if (window.hapticError) window.hapticError();
      if (typeof window.showToast === 'function') window.showToast('결제 실패: ' + (e.message || ''));
      if (btn) { btn.disabled = false; btn.style.opacity = '1'; btn.textContent = orig; }
    }
  }

  // 구독 취소 / 스토어 구독 관리.
  //   스토어(Apple·Google) 결제면 서버 취소 API 를 **부르지 않는다** — 위 _storeOwner() 주석 참고.
  //   웹 PG(포트원) 결제일 때만 해지 바텀시트(#cancelSheet)로 취소 예약(cancel_at_period_end)을 건다.
  //   [2026-09-02] window.confirm → 2단계 시트(해지→완료). 시안: 시안_해지시트_390_360.html.
  //   다크패턴 금지: 해지 버튼은 항상 활성, 단계는 시트 1장, 만류는 정보 제공(유지 혜택·연간 업셀)까지만.
  async function doCancelSubscription() {
    if (_storeOwner()) { _openStoreSubs(); return; }
    if (!window.ItdasyBilling) return;
    _openCancelSheet();
  }

  function _fmtEndDate() {
    if (!_periodEnd) return '만료일';
    const dt = new Date(_periodEnd);
    return isNaN(dt.getTime()) ? '만료일' : ((dt.getMonth() + 1) + '월 ' + dt.getDate() + '일');
  }

  function _openCancelSheet() {
    const sheet = document.getElementById('cancelSheet');
    if (!sheet) return;
    document.querySelectorAll('#cancelSheet .csEndDate').forEach((el) => { el.textContent = _fmtEndDate(); });
    const shA = document.getElementById('cancelSheetA');
    const shB = document.getElementById('cancelSheetB');
    if (shA) shA.style.display = 'block';
    if (shB) shB.style.display = 'none';
    document.querySelectorAll('#csChips .cs-chip').forEach((ch) => {
      ch.style.borderColor = '#e5e5e5'; ch.style.background = '#fff'; ch.style.color = '#555';
      ch.dataset.on = '';
    });
    sheet.style.display = 'flex';
    _bindCancelSheet();
  }

  function _closeCancelSheet() {
    const sheet = document.getElementById('cancelSheet');
    if (sheet) sheet.style.display = 'none';
  }

  function _bindCancelSheet() {
    const sheet = document.getElementById('cancelSheet');
    if (!sheet || sheet._bound) return;
    sheet._bound = true;
    // 이유 칩(선택) — 서버 전송 없음, 단일 선택 토글
    document.querySelectorAll('#csChips .cs-chip').forEach((ch) => {
      ch.addEventListener('click', () => {
        const on = ch.dataset.on === '1';
        document.querySelectorAll('#csChips .cs-chip').forEach((c) => {
          c.dataset.on = ''; c.style.borderColor = '#e5e5e5'; c.style.background = '#fff'; c.style.color = '#555';
        });
        if (!on) { ch.dataset.on = '1'; ch.style.borderColor = 'var(--brand)'; ch.style.background = '#fff5f7'; ch.style.color = '#BC6675'; }
        if (window.hapticLight) window.hapticLight();
      });
    });
    // 연간 업셀 → 시트 닫고 결제 팝업에서 연간 선택
    const upsell = document.getElementById('csUpsellBtn');
    if (upsell) upsell.addEventListener('click', () => {
      _closeCancelSheet();
      _selectedPlan = 'pro_yearly';
      _updatePlanCardHighlight();
    });
    const stay = document.getElementById('csStayBtn');
    if (stay) stay.addEventListener('click', _closeCancelSheet);
    const closeB = document.getElementById('csCloseBtn');
    if (closeB) closeB.addEventListener('click', _closeCancelSheet);
    sheet.addEventListener('click', (e) => { if (e.target === sheet) _closeCancelSheet(); });
    // 해지하기 → 서버 취소 예약 → 완료 상태(②)로 전환
    const doIt = document.getElementById('csCancelBtn');
    if (doIt) doIt.addEventListener('click', async () => {
      if (!(window.ItdasyBilling && window.ItdasyBilling.cancelSubscription)) return;
      doIt.disabled = true; doIt.textContent = '처리 중…';
      const r = await window.ItdasyBilling.cancelSubscription();
      doIt.disabled = false; doIt.textContent = '해지하기';
      if (r && r.ok) {
        _cancelScheduled = true; _renderSubMeta();
        const a = document.getElementById('cancelSheetA');
        const b = document.getElementById('cancelSheetB');
        if (a) a.style.display = 'none';
        if (b) b.style.display = 'block';
      }
    });
    // 마음 바뀌면 다시 시작하기 → 해지 예약 철회(POST /billing/resume)
    const resume = document.getElementById('csResumeBtn');
    if (resume) resume.addEventListener('click', async () => {
      if (!(window.ItdasyBilling && window.ItdasyBilling.resumeSubscription)) return;
      resume.disabled = true;
      const r = await window.ItdasyBilling.resumeSubscription();
      resume.disabled = false;
      if (r && r.ok) { _cancelScheduled = false; _renderSubMeta(); _closeCancelSheet(); }
    });
  }

  // 전역 노출 (index.html onclick 에서 참조)
  window.openPlanPopup = openPlanPopup;
  window.closePlanPopup = closePlanPopup;
  window.doPlanAction = doPlanAction;
  window.doCancelSubscription = doCancelSubscription;
  window.refreshPlanStatus = _loadStatus;   // 결제/취소 성공 후 app-billing 이 호출

  // 외부에서 현재 플랜 조회 (고객·매출 한도 분기용)
  // 읽기 진입점마다 계정 확인 — 리로드 없는 계정 전환에서 이전 사용자 플랜이 새는 걸 막는다.
  window.getCurrentPlan = () => { _resetIfUserChanged(); return _currentPlan; };
  window.getCurrentPlanLabel = () => { _resetIfUserChanged(); return _planDisplayName(_currentPlan); };
  // [2026-07-26 결제] membership(정본 단일 멤버십)도 유료로 인식 — 예전엔 pro/premium 만 봐서
  //   6,900원 결제자가 무료 취급(취소 UI·유료기능 클라 게이트에서 배제)됐다.
  window.isPaidPlan = () => { _resetIfUserChanged(); return ['pro', 'premium', 'membership'].includes(_currentPlan); };

  // [C-1] 구매 복원 — 스토어에서 소유한 구독을 다시 활성화(기기 변경·재설치 후).
  async function doRestorePurchases() {
    if (!(window.ItdasyIAP && window.ItdasyIAP.restore)) return;
    const rb = document.getElementById('planRestoreBtn');
    const orig = rb ? rb.textContent : '';
    if (rb) { rb.disabled = true; rb.textContent = '복원 중…'; }
    try {
      const r = await window.ItdasyIAP.restore();
      if (r && r.ok) {
        if (window.hapticSuccess) window.hapticSuccess();
        _currentPlan = r.plan || 'membership';
        _updateActionButton(); _updatePlanBadgeUI(_currentPlan); _renderSubMeta();
        if (typeof window.showToast === 'function') window.showToast('구매를 복원했어요 ✅');
      } else if (typeof window.showToast === 'function') {
        window.showToast('복원할 구매 내역이 없어요');
      }
    } catch (_e) {
      if (typeof window.showToast === 'function') window.showToast('복원에 실패했어요. 잠시 후 다시 시도해 주세요');
    } finally {
      if (rb) { rb.disabled = false; rb.textContent = orig; }
    }
  }
  window.doRestorePurchases = doRestorePurchases;

  // [C-1] IAP/복원 성공으로 멤버십이 켜지면 플랜 상태 최신화(서버 기준).
  window.addEventListener('itdasy:plan-activated', (e) => {
    const plan = (e && e.detail && e.detail.plan) || 'membership';
    _currentPlan = plan;
    try { _updateActionButton(); _updatePlanBadgeUI(plan); _renderSubMeta(); } catch (_err) { void _err; }
    if (typeof _loadStatus === 'function') _loadStatus().catch(() => {});
  });

  // planActionBtn 클릭 이벤트 바인딩 (app-core.js 의 on() 등록 외에 안전장치)
  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('planActionBtn');
    if (btn && !btn._planActionBound) {
      btn._planActionBound = true;
      btn.addEventListener('click', doPlanAction);
    }
    const rbtn = document.getElementById('planRestoreBtn');
    if (rbtn && !rbtn._bound) { rbtn._bound = true; rbtn.addEventListener('click', doRestorePurchases); }
    // 초기 진입 시 현재 플랜 로드
    setTimeout(() => { if (window.API && window.authHeader && window.authHeader()?.Authorization) _loadStatus().catch(() => {}); }, 1500);
  });
})();
