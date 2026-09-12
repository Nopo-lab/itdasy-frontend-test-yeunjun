/* ─────────────────────────────────────────────────────────────
   OAuth 완료 후 앱으로 복귀했을 때 처리

   Capacitor 네이티브 앱에서:
   - 브라우저에서 인스타 OAuth 마침
   - 백엔드가 itdasy://oauth/callback?connected=success 로 리다이렉트
   - Android intent-filter(itdasy scheme)가 앱 실행
   - Capacitor App 플러그인의 appUrlOpen 리스너가 URL 수신
   - connected=success 파라미터 확인 후 인스타 상태 재조회 + 토스트

   웹 브라우저에서는 no-op.
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  if (!isNative) return;

  const AppPlugin = window.Capacitor?.Plugins?.App;
  if (!AppPlugin) {
    console.warn('[oauth-return] Capacitor App 플러그인 없음');
    return;
  }

  // Google/Kakao/Naver OAuth 딥링크 처리
  // 백엔드가 itdasy://oauth-return?code=1회용코드&provider=google|kakao|naver 로 리다이렉트
  // ([2026-08-03 P0-1-a] 예전엔 ?token=JWT 를 직접 넘겼다 — 세션 고정이라 양쪽 다 제거)
  function _handleSocialLogin(u, fullUrl) {
    const isOAuthReturn =
      u.host === 'oauth-return' ||
      u.pathname === '/oauth-return' ||
      u.pathname === 'oauth-return' ||
      /oauth-return/.test(fullUrl);
    if (!isOAuthReturn) return false;

    // query string 또는 hash fragment 둘 다 지원
    let params;
    try {
      params = new URLSearchParams(u.search || '');
    } catch (_e) {
      void _e;
      params = new URLSearchParams('');
    }
    if ((!params.get('code') && !params.get('error')) && u.hash) {
      try {
        params = new URLSearchParams(u.hash.replace(/^#/, ''));
      } catch (_e2) { void _e2; }
    }

    const code = params.get('code');
    const provider = params.get('provider') || 'oauth';
    const err = params.get('error');
    const api = (window.API || '');

    if (err) {
      // pkce_required: 백엔드가 PKCE 없는 로그인을 거부했다(레거시 token 폴백 제거).
      if (err === 'pkce_required') {
        if (window.showToast) window.showToast('앱을 새로고침한 뒤 다시 로그인해 주세요.');
        return true;
      }
      if (window.showToast) window.showToast('로그인 실패: ' + decodeURIComponent(err));
      return true;
    }

    // [보안감사 C-2/C-3 2026-07-27] 신규: 백엔드가 JWT 대신 1회용 code 만 넘긴다.
    //   app-core._oauthPkceStart 가 로컬에 저장해둔 code_verifier 로 POST /auth/oauth/exchange 해서 JWT 교환.
    //   딥링크(itdasy://oauth-return?code=)를 가로챈 악성 앱은 verifier 없어 교환 불가(C-3 토큰탈취 차단),
    //   공격자 code 는 우리 verifier 로 만든 challenge 와 안 맞아 실패(C-2 세션고정 차단).
    if (code) {
      let pk = null;
      try { pk = JSON.parse(localStorage.getItem('itdasy_oauth_pkce') || 'null'); } catch (_e) { void _e; }
      if (!pk || !pk.v) {
        if (window.showToast) window.showToast('로그인을 처음부터 다시 시작해 주세요.');
        return true;
      }
      fetch(api + '/auth/oauth/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code, code_verifier: pk.v }),
      })
        .then(function (res) { return res.ok ? res.json() : Promise.reject(new Error('exchange_failed')); })
        .then(function (d) {
          if (!d || !d.access_token) throw new Error('no_token');
          try { localStorage.removeItem('itdasy_oauth_pkce'); } catch (_e) { void _e; }
          try {
            const keySuffix = api.includes('staging') ? 'staging' : (api.includes('localhost') ? 'local' : 'prod');
            localStorage.setItem('itdasy_token::' + keySuffix, d.access_token);
          } catch (_e) { void _e; }
          try { if (typeof window.applyNewSession === 'function') window.applyNewSession(d.access_token).catch(function () {}); } catch (_e) { void _e; }
          if (window.showToast) window.showToast(provider + ' 로그인 완료!');
          setTimeout(function () { window.location.reload(); }, 300);
        })
        .catch(function () {
          if (window.showToast) window.showToast('로그인 코드가 만료됐어요. 다시 시도해 주세요.');
        });
      return true;
    }

    // [2026-08-03 P0-1-a] 여기 있던 레거시 `?token=<JWT>` 분기를 **삭제**했다. 되살리지 말 것 —
    //   딥링크로 받은 JWT 를 저장하면 세션 고정이다. 같은 스킴을 등록한 악성 앱이 사용자 클릭
    //   없이 딥링크를 쏠 수 있어 웹보다 더 위험했다. 붙어 있던 /auth/me 대조는 방어가 아니었다
    //   (sub 과 me.id 가 같은 토큰 출처라 공격자 자기 토큰이면 항상 일치).
    //   백엔드도 같은 라운드에 폴백 제거(google_oauth.py _build_return_url — 3사 공용).
    return true;
  }

  function _handleReturn(url) {
    if (!url) return;
    try {
      const u = new URL(url);
      if (u.protocol !== 'itdasy:') return;

      // Google/Kakao OAuth 복귀 먼저 시도
      if (_handleSocialLogin(u, url)) return;

      if (u.searchParams.get('connected') === 'success') {
        if (window.showToast) window.showToast('인스타 연동 완료!');

        // [QA #3] 인스타 상태 재조회 — 함수 존재 가드 + 다중 alias 시도.
        // 함수 없으면 location.reload 로 강제 새로고침 (cache vs live 불일치 방지).
        const refresh = window.checkInstagramStatus
          || window.checkInstaStatus
          || window.refreshInstagramUI
          || (window.IGState && window.IGState.refresh);
        if (typeof refresh === 'function') {
          try { Promise.resolve(refresh()).catch(() => {}); } catch (_e) { /* ignore */ }
        } else {
          try { setTimeout(() => location.reload(), 300); } catch (_e) { /* ignore */ }
        }

        // 홈 탭으로 유도 (선택)
        const homeTabBtn = document.querySelector('.tab-bar__btn[data-tab="home"]');
        if (homeTabBtn) homeTabBtn.click();

        // [2026-05-13 QA #blocker1] 연동 직후 자동 분석 — runAutoAnalysisAfterConnect 가
        // 즉시 진행 토스트 + analyzeOverlay + status 90초 폴링 + force fallback 처리.
        try {
          setTimeout(() => {
            try {
              if (typeof window.runAutoAnalysisAfterConnect === 'function') {
                window.runAutoAnalysisAfterConnect();
              } else if (typeof window.runPersonaAnalyze === 'function') {
                window.runPersonaAnalyze();
              }
            } catch (_e2) { /* ignore */ }
          }, 800);
        } catch (_e3) { /* ignore */ }
      } else if (u.searchParams.get('ig_conflict') === '1') {
        // [2026-09-12] 이 인스타 계정이 이미 다른 잇데이 계정에 물려 있다.
        //   웹은 app-core 가 같은 신호를 처리한다. 네이티브는 처리하는 데가 없어서
        //   **아무 일도 안 일어난 것처럼** 보였다(BE 가 이제 딥링크로도 보낸다).
        const h = u.searchParams.get('handle') || '';
        if (typeof window.showInstaConflictModal === 'function') window.showInstaConflictModal(h);
        else if (window.showToast) window.showToast('이 인스타 계정은 다른 잇데이 계정에서 쓰고 있어요');
      } else if (u.searchParams.get('ig_error')) {
        // [2026-09-12] 백엔드가 실패 사유를 슬러그로 실어 딥링크로 돌려보낸다.
        //   웹(app-core 의 ?ig_error 처리)과 **같은 문구·같은 모달**을 쓴다 — 두 벌로 갈리면
        //   한쪽만 고쳐지는 게 이 레포의 단골 사고다.
        const slug = u.searchParams.get('ig_error');
        if (typeof window.showIgReturnFailModal === 'function') window.showIgReturnFailModal(slug);
        else if (window.showToast) window.showToast('인스타 연동을 마치지 못했어요. 다시 시도해 주세요');
      } else if (u.searchParams.get('error')) {
        const err = u.searchParams.get('error');
        if (window.showToast) window.showToast('연동 실패: ' + err);
      }
    } catch (e) {
      console.warn('[oauth-return] URL 파싱 실패:', e);
    }
  }

  AppPlugin.addListener('appUrlOpen', (event) => {
    _handleReturn(event && event.url);
  });

  // 앱이 닫혀있다가 딥링크로 처음 열린 경우 (cold start)
  if (typeof AppPlugin.getLaunchUrl === 'function') {
    AppPlugin.getLaunchUrl().then((r) => {
      if (r && r.url) _handleReturn(r.url);
    }).catch(() => {});
  }
})();
