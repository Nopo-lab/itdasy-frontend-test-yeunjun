/* ─────────────────────────────────────────────────────────────
   플랜 팝업 — md 정리: 월 6,900원 단일 멤버십 + 사용량 안내

   기존 planPopup HTML은 있었으나 열기·액션 함수가 없어서
   모든 플랜 배지·업그레이드 버튼이 무반응이던 버그 수정.
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  let _selectedPlan = 'pro';
  let _currentPlan = 'free';
  let _cancelScheduled = false;   // 취소 예약(만료일까지 유지)
  let _periodEnd = null;          // 다음 결제일/만료일
  let _store = null;              // 'apple' | 'google' | 'portone' | null — 누가 결제를 갖고 있나
  let _productId = null;          // 스토어 구독관리 딥링크의 sku (Google)

  // Google Play 구독관리 딥링크에 필요한 패키지명.
  //   ⚠️ iOS(com.nopolab.itdasy)와 다르다 — Android 는 android/app/build.gradle 의
  //   applicationId(com.y2do.itdasy)가 스토어 등록분이다. capacitor.config.json 의 appId 는
  //   스캐폴딩 기본값(iOS 쪽)이라 여기 쓰면 안 된다.
  const ANDROID_PACKAGE = 'com.y2do.itdasy';

  function _planDisplayName(plan) {
    if (plan === 'free') return '체험';
    return '잇데이';
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

  // 추천(pro) 카드 — index.html 수정 없이 JS에서 플랫 로즈 배지/보더로 통일
  function _stylePopularCard() {
    const proCard = document.getElementById('planCardPro');
    if (!proCard) return;
    proCard.style.border = '2px solid var(--brand)';
    const badge = Array.from(proCard.children).find((el) => el.style && el.style.position === 'absolute');
    if (badge) {
      badge.textContent = '가장 인기';
      badge.style.background = 'var(--brand)';
      badge.style.borderRadius = 'var(--r-pill,999px)';
      badge.style.fontSize = '11px';
      badge.style.fontWeight = '700';
      badge.style.padding = '3px 10px';
    }
  }

  function _updatePlanCardHighlight() {
    document.querySelectorAll('#planPopup .plan-card').forEach((card) => {
      const selected = card.dataset.plan === _selectedPlan;
      card.style.transform = selected ? 'scale(1.02)' : 'scale(1)';
      card.style.boxShadow = selected ? 'var(--shadow-brand)' : 'none';
    });
    _updateActionButton();
  }

  function _updateActionButton() {
    const btn = document.getElementById('planActionBtn');
    if (!btn) return;
    if (_selectedPlan === _currentPlan) {
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
      btn.style.background = 'var(--text-subtle,#888)';
    } else if (_selectedPlan === 'pro') {
      btn.textContent = (_currentPlan === 'free') ? '월 6,900원 시작하기' : '잇데이 멤버십으로 전환';
      btn.style.background = 'var(--brand)';
    } else if (_selectedPlan === 'premium') {
      btn.textContent = '잇데이 멤버십으로 전환';
      btn.style.background = 'var(--brand)';
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

  async function _loadStatus() {
    const headers = window.authHeader && window.authHeader();
    if (!window.API || !headers || !headers.Authorization) return;
    try {
      const res = await apiFetch('/subscription/status', { headers });
      if (!res.ok) return;
      const d = await res.json();
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
    if (_store) return null;   // 'portone'/'toss' — 우리가 해지할 수 있는 웹 PG 결제
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
      const r = await window.ItdasyBilling.startWebSubscription('pro');
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
  //   웹 PG(포트원) 결제일 때만 만료일까지 유지하는 취소 예약(cancel_at_period_end)을 건다.
  async function doCancelSubscription() {
    if (_storeOwner()) { _openStoreSubs(); return; }
    if (!window.ItdasyBilling) return;
    if (!window.confirm('구독을 취소할까요?\n\n· 만료일까지는 계속 이용할 수 있어요.\n· 앱스토어·Play 스토어로 결제하셨다면 여기서는 해지되지 않아요. 스토어 구독 화면에서 해지해 주세요.')) return;
    const r = await window.ItdasyBilling.cancelSubscription();
    if (r && r.ok) { _cancelScheduled = true; _renderSubMeta(); }
  }

  // 전역 노출 (index.html onclick 에서 참조)
  window.openPlanPopup = openPlanPopup;
  window.closePlanPopup = closePlanPopup;
  window.doPlanAction = doPlanAction;
  window.doCancelSubscription = doCancelSubscription;
  window.refreshPlanStatus = _loadStatus;   // 결제/취소 성공 후 app-billing 이 호출

  // 외부에서 현재 플랜 조회 (고객·매출 한도 분기용)
  window.getCurrentPlan = () => _currentPlan;
  window.getCurrentPlanLabel = () => _planDisplayName(_currentPlan);
  // [2026-07-26 결제] membership(정본 단일 멤버십)도 유료로 인식 — 예전엔 pro/premium 만 봐서
  //   6,900원 결제자가 무료 취급(취소 UI·유료기능 클라 게이트에서 배제)됐다.
  window.isPaidPlan = () => ['pro', 'premium', 'membership'].includes(_currentPlan);

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
