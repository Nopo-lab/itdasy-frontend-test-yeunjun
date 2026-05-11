/* ─────────────────────────────────────────────────────────────
   플랜 팝업 — Free/Pro/Premium 비교 + 사용량 + 체험 시작/업그레이드

   기존 planPopup HTML은 있었으나 열기·액션 함수가 없어서
   모든 플랜 배지·업그레이드 버튼이 무반응이던 버그 수정.
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  let _selectedPlan = 'pro';
  let _currentPlan = 'free';

  function _planDisplayName(plan) {
    if (plan === 'premium') return 'Premium';
    if (plan === 'pro') return 'Pro';
    return 'Free';
  }

  async function openPlanPopup() {
    const pop = document.getElementById('planPopup');
    if (!pop) return;

    _selectedPlan = 'pro';
    pop.style.display = 'flex';
    _updatePlanCardHighlight();
    if (window.hapticLight) window.hapticLight();

    // 사용량 로드
    _loadUsage().catch(() => {});
    _loadStatus().catch(() => {});

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

  function _updatePlanCardHighlight() {
    document.querySelectorAll('#planPopup .plan-card').forEach((card) => {
      const selected = card.dataset.plan === _selectedPlan;
      card.style.transform = selected ? 'scale(1.02)' : 'scale(1)';
      card.style.boxShadow = selected ? '0 8px 24px rgba(241,128,145,0.25)' : 'none';
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
      btn.textContent = 'Free 로 전환하기';
      btn.style.background = 'linear-gradient(135deg,#888,#aaa)';
    } else if (_selectedPlan === 'pro') {
      btn.textContent = (_currentPlan === 'free') ? '14일 무료체험 시작하기' : 'Pro 로 업그레이드';
      btn.style.background = 'linear-gradient(135deg,var(--brand),#ff9aa8)';
    } else if (_selectedPlan === 'premium') {
      btn.textContent = (_currentPlan === 'free') ? 'Premium 시작하기' : 'Premium 으로 업그레이드';
      btn.style.background = 'linear-gradient(135deg,#833ab4,#a052d2)';
    }
  }

  async function _loadUsage() {
    const headers = window.authHeader && window.authHeader();
    if (!window.API || !headers || !headers.Authorization) return;
    const box = document.getElementById('planUsageContent');
    if (!box) return;
    try {
      const res = await fetch(window.API + '/subscription/usage', { headers });
      if (!res.ok) throw new Error('usage ' + res.status);
      const u = await res.json();
      const rows = [];
      if (u.caption_today !== undefined) rows.push(`• 캡션: ${u.caption_today}/${u.caption_limit || '∞'}`);
      if (u.removebg_today !== undefined) rows.push(`• 누끼: ${u.removebg_today}/${u.removebg_limit || '∞'}`);
      if (u.analyze_month !== undefined) rows.push(`• 말투 분석: ${u.analyze_month}/${u.analyze_limit || '∞'} (이번 달)`);
      if (u.publish_month !== undefined) rows.push(`• 인스타 발행: ${u.publish_month}/${u.publish_limit || '∞'} (이번 달)`);
      box.innerHTML = rows.length ? rows.join('<br>') : '사용량 정보를 불러올 수 없어요';
    } catch (_) {
      box.textContent = '사용량을 불러오지 못했어요';
    }
  }

  async function _loadStatus() {
    const headers = window.authHeader && window.authHeader();
    if (!window.API || !headers || !headers.Authorization) return;
    try {
      const res = await fetch(window.API + '/subscription/status', { headers });
      if (!res.ok) return;
      const d = await res.json();
      _currentPlan = (d.plan || 'free').toLowerCase();
      _updateActionButton();
      _updatePlanBadgeUI(_currentPlan);
    } catch (_) { void 0; }
  }

  function _updatePlanBadgeUI(plan) {
    const badge = document.getElementById('planBadge');
    if (!badge) return;
    if (plan === 'pro') {
      badge.textContent = _planDisplayName(plan);
      badge.style.background = 'linear-gradient(135deg,var(--brand),#ff9aa8)';
      badge.style.color = '#fff';
    } else if (plan === 'premium') {
      badge.textContent = _planDisplayName(plan);
      badge.style.background = 'linear-gradient(135deg,#833ab4,#a052d2)';
      badge.style.color = '#fff';
    } else {
      badge.textContent = _planDisplayName(plan);
      badge.style.background = '#e0e0e0';
      badge.style.color = '#888';
    }
    try {
      window.dispatchEvent(new CustomEvent('itdasy:plan-updated', { detail: { plan } }));
    } catch (_) { void 0; }
  }

  async function doPlanAction() {
    if (_selectedPlan === _currentPlan) return;
    if (_selectedPlan === 'free') {
      if (window.hapticMedium) window.hapticMedium();
      if (typeof window.showToast === 'function') window.showToast('Free 전환은 설정에서 플랜 취소로 진행해주세요');
      return;
    }

    // 네이티브 앱: IAP 플로우로 이동
    const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    if (isNative) {
      if (window.hapticMedium) window.hapticMedium();
      if (typeof window.showToast === 'function') {
        window.showToast(_selectedPlan === 'pro'
          ? '스토어 결제 화면으로 이동합니다 (준비중)'
          : 'Premium 결제 화면으로 이동합니다 (준비중)');
      }
      // TODO: @capacitor-community/in-app-purchases 플러그인 호출
      return;
    }

    // 웹: 14일 무료체험 API 호출 (Free → Pro 진입)
    if (_currentPlan === 'free' && _selectedPlan === 'pro') {
      try {
        const res = await fetch(window.API + '/subscription/start-trial', {
          method: 'POST',
          headers: window.authHeader(),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.detail || '요청 실패');
        }
        if (window.hapticSuccess) window.hapticSuccess();
        if (typeof window.showToast === 'function') window.showToast('14일 무료체험 시작!');
        _currentPlan = 'pro';
        _updateActionButton();
        _updatePlanBadgeUI('pro');
        setTimeout(closePlanPopup, 1200);
      } catch (e) {
        if (window.hapticError) window.hapticError();
        if (typeof window.showToast === 'function') window.showToast('체험 시작 실패: ' + (e.message || ''));
      }
      return;
    }

    if (typeof window.showToast === 'function') {
      window.showToast('웹에서는 스토어 결제만 지원돼요. 모바일 앱을 이용해주세요');
    }
  }

  // 전역 노출 (index.html onclick 에서 참조)
  window.openPlanPopup = openPlanPopup;
  window.closePlanPopup = closePlanPopup;
  window.doPlanAction = doPlanAction;

  // 외부에서 현재 플랜 조회 (고객·매출 한도 분기용)
  window.getCurrentPlan = () => _currentPlan;
  window.getCurrentPlanLabel = () => _planDisplayName(_currentPlan);
  window.isPaidPlan = () => _currentPlan === 'pro' || _currentPlan === 'premium';

  // planActionBtn 클릭 이벤트 바인딩 (app-core.js 의 on() 등록 외에 안전장치)
  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('planActionBtn');
    if (btn && !btn._planActionBound) {
      btn._planActionBound = true;
      btn.addEventListener('click', doPlanAction);
    }
    // 초기 진입 시 현재 플랜 로드
    setTimeout(() => { if (window.API && window.authHeader && window.authHeader()?.Authorization) _loadStatus().catch(() => {}); }, 1500);
  });
})();
