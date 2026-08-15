// Itdasy Studio - Instagram 연동 & 말투분석

// [보안감사 H-7 준비 2026-07-27] 인스타 OAuth 시작을 (네이티브에서) 인앱 웹뷰 이동 대신
//   Browser 플러그인(SFSafariViewController)으로 열기 위한 플래그. 기본 OFF.
//   ▶ 켜야 iOS App-Bound Domains(H-7)를 걸어도 인스타 로그인이 안 깨진다(웹뷰가 우리 도메인 밖으로 안 나감).
//   ▶ 기본 OFF 이므로 웹·현재 모든 네이티브 설치본은 기존 window.location.href 경로 그대로(바이트 동일).
//   ▶ 실제 ON 은 기기/시뮬 E2E 검증하는 별도 빌드 세션에서. 그 전엔 아무 동작 변화 없음.
//   오버라이드(?securetoken 과 동일 패턴, 1회 쿼리→localStorage 고정):
//     ?igbrowser=1 강제 ON(테스트) · ?igbrowser=0 강제 OFF(킬스위치) · 기본 null(OFF).
const _IG_BROWSER = (function () {
  try {
    if (/[?&]igbrowser=1/.test(location.search)) { try { localStorage.setItem('itdasy_igbrowser', '1'); } catch (_p) { void _p; } return true; }  // 쿼리 1회 → 리로드에도 유지
    if (/[?&]igbrowser=0/.test(location.search)) { try { localStorage.setItem('itdasy_igbrowser', '0'); } catch (_p) { void _p; } return false; }
    return localStorage.getItem('itdasy_igbrowser') === '1';
  } catch (_e) { return false; }
})();

// ===== 인스타 토큰 만료 배너 =====
// Instagram Graph API 장기 토큰은 60일 만료. 7일 이내 또는 이미 만료 시 재연동 배너 노출.
function _renderTokenExpiryBanner(expiresAtIso) {
  const existing = document.getElementById('tokenExpiryBanner');
  if (existing) existing.remove();
  if (!expiresAtIso) return;

  const expMs = new Date(expiresAtIso).getTime();
  if (isNaN(expMs)) return;
  const remainDays = Math.floor((expMs - Date.now()) / 86400000);
  if (remainDays > 7) return;  // 여유 있으면 표시 안 함

  const isExpired = remainDays < 0;
  const msg = isExpired
    ? '인스타 연동이 만료됐어요 — 재연동이 필요합니다'
    : `인스타 연동이 ${remainDays}일 뒤 만료돼요 — 지금 갱신하세요`;

  const banner = document.createElement('div');
  banner.id = 'tokenExpiryBanner';
  banner.setAttribute('role', 'alert');
  banner.className = `banner ${isExpired ? 'banner--danger' : 'banner--warn'}`;
  banner.innerHTML = `<span style="flex:1;">${msg}</span>
    <button class="banner__cta" data-ig-reconnect>재연동</button>`;
  // [보안감사 M-1 2026-07-26] 존재하지 않는 'connectInstaBtn'(실제 id 는 'instaBtn')을 클릭하려다
  //   폴백 no-op 으로 삼켜져 재연동 버튼이 죽어 있었다(토큰 만료 = 재연동이 가장 필요한 순간).
  //   홈 배너(app-home-customer-msgs)와 동일하게 connectInstagram() 을 직접 호출한다.
  banner.querySelector('[data-ig-reconnect]')?.addEventListener('click', () => {
    if (typeof window.connectInstagram === 'function') window.connectInstagram();
    else (document.getElementById('instaBtn') || { click: () => {} }).click();
  });

  const homePost = document.getElementById('homePostConnect');
  if (homePost && homePost.firstElementChild) {
    homePost.insertBefore(banner, homePost.firstElementChild);
  }
}

// [F1] /instagram/status 의 살아있는 persona → itdasy_latest_analysis 재수화.
//   내샵관리/AI Hub/인스타 화면의 "분석 리포트"는 이 localStorage 캐시만 읽는데, 캐시는 연결 직후
//   90초 폴링(L#332)·수동 재분석(L#458)에서만 채워짐. 그 창을 놓치면(이탈/콜드스타트/기기변경/캐시삭제)
//   백엔드엔 persona 가 있어도 리포트가 영원히 빔. → 캐시가 비었거나 무효일 때만 status persona 로 채움.
//   기존 풍부본(raw_analysis·top5 포함)은 절대 덮어쓰지 않음. 저장 포맷은 L#332 폴링 저장본과 동일.
function _hydrateAnalysisCacheFromStatus(persona) {
  try {
    if (!persona || !(persona.style_summary || persona.tone)) return false;
    let cur = {};
    try { cur = JSON.parse(localStorage.getItem('itdasy_latest_analysis') || '{}') || {}; } catch (_e) { cur = {}; }
    if (cur && (cur.style_summary || cur.tone_summary || cur.tone)) return false;  // 기존 유효 캐시 보존
    const flat = { ...persona, tone_summary: persona.tone || '', style_summary: persona.style_summary || '' };
    localStorage.setItem('itdasy_latest_analysis', JSON.stringify(flat));
    return true;
  } catch (_e) { return false; }
}

// ===== 인스타그램 연동 =====
async function checkInstaStatus(fromLogin = false) {
  if (!getToken()) return;
  try {
    const res = await apiFetch('/instagram/status', { headers: authHeader() });
    if (!res.ok) return;
    const data = await res.json();

    // [2026-06-25] 재로그인 환영(showWelcome) 제거 — 인사는 app-core 의 _finishLoginLoad 가
    //   로딩 화면(#ldGreet)에서 localStorage shop_name 으로 직접 처리. (fromLogin 은 시그니처 호환용)

    // 3단계 인디케이터 상태 업데이트 (인스타 연동 / 말투 학습 / 첫 글 완성)
    const updateStep = (id, done) => {
      const el = document.querySelector('#' + id + ' .step-circle');
      if (!el) return;
      if (done) { el.style.background = 'linear-gradient(135deg,var(--accent),var(--accent2))'; el.style.color = '#fff'; }
      else      { el.style.background = '#f0f0f0'; el.style.color = '#aaa'; }
    };

    if (data.connected) {
      // [2026-06-12 Bug] 다른 계정으로 재연동 시 옛 분석 리포트가 localStorage 에 잔존하는 문제.
      //   캐시된 핸들과 새 data.handle 이 다르면(둘 다 truthy) 옛 분석 캐시부터 제거 →
      //   아래 hydrate 가 새 persona 로 다시 채움.
      try {
        const _prevHandle = localStorage.getItem('itdasy:ig_handle');
        if (_prevHandle && data.handle && _prevHandle !== data.handle) {
          localStorage.removeItem('itdasy_latest_analysis');
        }
      } catch (_e) { void _e; }
      // [2026-06-12 Bug] 같은 핸들 재연동·재분석 후 서버는 done 인데 캐시가 옛 분석본을 유지해
      //   리포트가 안 갱신되는 문제. status=done 이고 서버 style_summary 가 캐시와 다르면 서버
      //   persona 로 덮어쓰기(_hydrate 의 "기존 유효 캐시 보존" 우회). flat 포맷은 폴링 저장본과 동일.
      try {
        const _sp = data.persona || {};
        if (data.style_analysis_status === 'done' && (_sp.style_summary || '').trim()) {
          let _cur = {};
          try { _cur = JSON.parse(localStorage.getItem('itdasy_latest_analysis') || '{}') || {}; } catch (_e) { _cur = {}; }
          if ((_cur.style_summary || '') !== _sp.style_summary) {
            const _flat = { ..._sp, tone_summary: _sp.tone || '', style_summary: _sp.style_summary || '' };
            localStorage.setItem('itdasy_latest_analysis', JSON.stringify(_flat));
          }
        }
      } catch (_e) { void _e; }
      // [F1/F2] 아래 DOM 렌더(updateHeaderProfile·배너 등)보다 먼저 — 그쪽이 실패해도 분석 캐시
      //   재수화·상태 저장은 보장. 내샵관리/리포트는 itdasy_latest_analysis 만 읽으므로 이게 핵심.
      _hydrateAnalysisCacheFromStatus(data.persona || {});
      try { localStorage.setItem('itdasy_persona_status', data.style_analysis_status || ''); } catch (_e) { void _e; }
      // 2026-05-01 ── 다음 방문 시 깜빡임 없게 캐시. checkInstaStatus 응답 오기 전에
      // 인라인 스크립트가 이 캐시 보고 즉시 homePostConnect 표시.
      try {
        localStorage.setItem('itdasy:ig_connected_cache', '1');
        // 프로필 사진/핸들도 캐시 — 내샵관리 등 다른 화면에서 즉시 사용
        if (data.profile_picture_url) localStorage.setItem('itdasy:ig_profile_pic', data.profile_picture_url);
        if (data.handle) localStorage.setItem('itdasy:ig_handle', data.handle);
      } catch (_e) { /* ignore */ }
      document.getElementById('homePreConnect').style.display = 'none';
      document.getElementById('homePostConnect').style.display = 'flex';
      // [2026-05-08 hotfix] 연결됐으면 mini-bar 도 숨김
      const bar = document.getElementById('ipcMiniBar');
      if (bar) bar.style.display = 'none';
      // [2026-05-08 28차 2단계] 인스타 연결되면 dismissed 자동 해제 — 해제 후 다시 미연결 시 카드 다시 보이게
      try { localStorage.removeItem('itdasy_ipc_dismissed'); } catch (_e) { void _e; }
      _instaHandle = data.handle || '';
      updateHeaderProfile(_instaHandle, data.persona ? data.persona.tone : null, data.profile_picture_url || '');
      updateStep('stepInsta', true);
      _renderTokenExpiryBanner(data.expires_at);
      // [죽은코드 정리 2026-07-27] KillerWidgets.renderRow('homeKillerWidgets') 호출 제거 —
      //   렌더 타깃 컨테이너 'homeKillerWidgets'/'dashKiller' 가 DOM 어디에도 없어(HomeV41 로 대체됨)
      //   render 가 getElementById=null 로 즉시 return, 모든 위젯이 안 떴다. 매 부팅 헛로드도 제거.
      if (typeof window.renderHomeResume === 'function') {
        window.renderHomeResume().catch(() => {});
      }
      const persona = data.persona || {};
      const personaDone = !!(persona.style_summary);
      updateStep('stepPersona', personaDone);
      // [2026-05-08 hotfix] OAuth 직후 (?connected=success) 자동 분석이 곧 따라옴 → 옛 persona 안 깜빡이게 강제 숨김
      const justOAuthed = (function(){ try { return new URLSearchParams(location.search).get('connected') === 'success'; } catch (_) { return false; } })();
      if (personaDone && !justOAuthed) renderPersonaDash(persona);
      else { const _pd = document.getElementById('personaDash'); if (_pd) _pd.style.display = 'none'; }
      // 첫 글 완성 여부는 generationLog 기반. 백엔드 지원 전까진 localStorage hint로
      updateStep('stepCaption', !!localStorage.getItem('_first_caption_done'));
      // [A안] 연동되면 "사진으로 시작" 가이드는 항상 숨김
      { const _sg = document.getElementById('homeStartGuide'); if (_sg) _sg.style.display = 'none'; }
    } else {
      // [2026-05-12 QA #1 CRITICAL] disconnect 직후 다른 화면 (내샵관리·캡션·갤러리) 이 아직 옛 IG 핸들·
      // 프로필 사진 들고 있던 문제. ig_connected_cache 만 지워서 캐시 분기들이 OLD value 노출.
      // 모든 IG 캐시 + global var + 헤더까지 한 번에 청소.
      try {
        localStorage.removeItem('itdasy:ig_connected_cache');
        localStorage.removeItem('itdasy:ig_handle');
        localStorage.removeItem('itdasy:ig_profile_pic');
        // 이전 분석 결과도 미연결 표시와 맞춤 (재연동 시 갱신)
        localStorage.removeItem('itdasy_latest_analysis');
      } catch (_e) { /* ignore */ }
      _instaHandle = '';
      try { if (typeof window !== 'undefined') window._instaHandle = ''; } catch (_e) { /* ignore */ }
      try {
        if (typeof updateHeaderProfile === 'function') updateHeaderProfile('', null, '');
      } catch (_e) { /* ignore */ }
      // 페르소나 대시 카드 즉시 숨김 (옛 분석 결과가 잠시 보이는 문제 방지)
      try { const pd = document.getElementById('personaDash'); if (pd) pd.style.display = 'none'; } catch (_e) { /* ignore */ }
      // [2026-05-08 28차 hotfix] 잇비 카드 / 메인홈 교차 표시 — 둘 다 보이면 스크롤 어색.
      //   미연결 + 카드 visible       → 잇비 카드만
      //   미연결 + 카드 dismissed     → 메인홈만
      //   연결됨                      → 메인홈만 (위 if(data.connected) 처리)
      const dismissed = (function(){ try { return localStorage.getItem('itdasy_ipc_dismissed') === '1'; } catch (_) { return false; } })();
      const miniBar = document.getElementById('ipcMiniBar');
      if (dismissed) {
        document.getElementById('homePreConnect').style.display = 'none';
        document.getElementById('homePostConnect').style.display = 'flex';
        if (miniBar) miniBar.style.display = 'flex';
      } else {
        document.getElementById('homePreConnect').style.display = 'flex';
        document.getElementById('homePostConnect').style.display = 'none';
        if (miniBar) miniBar.style.display = 'none';
      }
      updateStep('stepInsta', false);
      updateStep('stepPersona', false);
      updateStep('stepCaption', false);
      // [A안] 인스타 건너뛴 상태면 "사진으로 시작" 가이드 노출 (연결/닫음이면 자동 숨김)
      _syncStartGuide();
    }
    // [QA #8] single source-of-truth — 매 fetch 결과를 store 에 저장 + 변경 이벤트 dispatch.
    try {
      const prev = window._lastIgState || {};
      const next = {
        connected: !!data.connected,
        // [버그수정] connected 는 "한 번이라도 연동했는가"만 뜻함(백엔드 그대로) — 실제 게시 가능 여부는
        //   tokenValid(백엔드가 Meta 실시간 검증까지 마친 값)로 따로 봐야 함. 죽은 토큰인데 connected 만
        //   보고 게시 시도하다 조용히 실패하던 버그의 프론트 쪽 반쪽.
        tokenValid: data.token_valid !== false,
        handle: data.handle || '',
        profile_picture_url: data.profile_picture_url || '',
        persona: data.persona || null,
        expires_at: data.expires_at || null,
        // [출시감사 2026-07-31] 권한별 가용 여부 — 백엔드가 SCOPE 기준으로 내려준다.
        //   Meta 심사가 권한마다 따로 통과해서(2026-07-31 기준 content_publish 심사 중),
        //   연동돼 있어도 자동 발행이 안 되는 상태가 있다. 이 값을 안 담으면 백엔드가 줘도
        //   작업실이 못 보고 되지도 않는 '인스타에 올리기' 버튼을 계속 띄운다.
        //   백엔드가 아직 안 주는 경우(구버전) undefined → 소비 측에서 낙관적 true 로 처리.
        capabilities: data.capabilities || null,
        ts: Date.now(),
      };
      window._lastIgState = next;
      if (prev.connected !== next.connected || prev.handle !== next.handle) {
        window.dispatchEvent(new CustomEvent('itdasy:ig:changed', { detail: next }));
      }
    } catch (_e) { /* ignore */ }
  } catch(_e) { /* ignore */ }
}

// [QA #8] 외부 컴포넌트용 IG 상태 store — 현재 상태 read + 변경 구독.
window.IGState = {
  get() { return window._lastIgState || null; },
  subscribe(handler) {
    if (typeof handler !== 'function') return () => {};
    const wrap = (e) => { try { handler(e.detail || null); } catch (_e) { /* ignore */ } };
    window.addEventListener('itdasy:ig:changed', wrap);
    return () => window.removeEventListener('itdasy:ig:changed', wrap);
  },
  refresh() {
    try { return checkInstaStatus(); } catch (_e) { return Promise.resolve(); }
  },
};

function renderPersonaDash(p, _showTestBtn) {
  // [2026-05-16] 홈 #personaDash 는 내샵관리로 이동했으므로 홈에서 자동 노출 안 함.
  // myshop-v3.js 가 자체적으로 동일 데이터를 렌더. 단, #personaContent DOM 은 그대로 두어
  // 다른 화면(showDetailedAnalysis 등)에서 호환 유지.
  const _pdEl = document.getElementById('personaDash');
  if (_pdEl) _pdEl.style.display = 'none';
  const content = document.getElementById('personaContent');
  if (!content) return;
  // [2026-05-08 28차 [K]] tone 카테고리 (친근/정중/귀여움) 제거 — 사장님 본인 말투를 분류 X.
  // BE Persona.style_summary (한 줄 요약) 그대로 노출.
  const summary = (p && typeof p.style_summary === 'string' && p.style_summary.trim())
    ? p.style_summary.trim()
    : '아직 분석 전이에요. 분석 후에 사장님 말투 요약이 여기 보여요.';
  const _esc = (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  content.innerHTML = `
    <div style="background:rgba(213,138,149,0.04); padding:14px; border-radius:14px; border:0.5px solid rgba(213,138,149,0.15); margin-bottom:16px;">
      <div style="margin-bottom:8px; font-size:11px; color:var(--accent2); font-weight:700; letter-spacing:-0.2px;">사장님 말투</div>
      <div style="font-size:13px; color:var(--text); line-height:1.6; font-weight:500;">${_esc(summary)}</div>
    </div>
    <div style="display:flex; flex-direction:column; gap:8px;">
      <button class="btn-copy" data-ig-detail style="width:100%; height:42px; font-size:13px; font-weight:600; border:1px solid var(--accent2); background:white; color:var(--accent2); border-radius:10px;">전체 분석 리포트 확인</button>
    </div>
  `;
  // [2026-06-26] '내 말투로 테스트 글 만들기' 제거 — 내 말투 영역은 '확인만'(글쓰기 동선은 작업실로 일원화, 중복·혼동 방지).
  content.querySelector('[data-ig-detail]')?.addEventListener('click', () => showDetailedAnalysis());
}

function showDetailedAnalysis() {
  let raw = {};
  try { raw = JSON.parse(localStorage.getItem('itdasy_latest_analysis') || '{}') || {}; }
  catch (_e) { raw = {}; }
  // [2026-05-25] tone_summary 만 체크하면 style_summary 만 있는 경우 (내샵관리 카드는 보이는데
  //   리포트 버튼 누르면 무반응) 사용자 혼란. style_summary 도 폴백으로 인정.
  const hasAny = !!(raw && (raw.tone_summary || raw.style_summary || raw.tone));
  if (!hasAny) {
    // [F2] 빈 화면/무반응 대신 분석 상태별 안내. pending=진행 중, failed=재시도, 그 외=연동 안내.
    let st = '';
    try { st = localStorage.getItem('itdasy_persona_status') || ''; } catch (_e) { st = ''; }
    if (st === 'pending') {
      if (window.showToast) window.showToast('말투 분석 중이에요. 잠시 뒤 다시 확인해 주세요.');
    } else if (st === 'failed') {
      // [F2] safe 안내만 — 리포트 열기로 자동 재분석 금지. 재분석은 사용자가 직접 동선을 눌러야 함.
      if (window.showToast) window.showToast('말투 분석에 실패했어요. 설정 → 말투 분석에서 다시 시도해 주세요.');
    } else {
      if (window.showToast) window.showToast('학습된 말투 데이터가 없어요. 인스타 연동 후 분석을 진행해주세요');
    }
    return;
  }
  // tone_summary 가 없으면 style_summary / tone 으로 채워서 렌더 (renderDetailedPopup 안정성)
  if (!raw.tone_summary) raw.tone_summary = raw.tone || raw.style_summary || '';
  renderDetailedPopup({ raw_analysis: raw, persona: { avg_caption_length: raw.avg_caption_length || 0, emojis: raw.emojis, hashtags: raw.hashtags, style_summary: raw.style_summary, tone: raw.tone || raw.tone_summary } });
  const pop = document.getElementById('analyzeResultPopup');
  if (pop) {
    // [2026-06-10 #5] 팝업이 다른 시트 아래에 깔리는 버그 — body 최상위로 이동해서 stacking context 이슈 완전 해결
    if (pop.parentElement !== document.body) document.body.appendChild(pop);
    pop.style.display = 'flex';
  } else if (window.showToast) window.showToast('리포트 영역을 찾을 수 없어요');
}

// [2026-06-09 Phase2 v9] 말투 분석 리포트 — 회색 배경 + 헤더 카드 / 내용 카드 2장.
// 흰 바탕·네이비 텍스트·중립 그레이, 로즈는 뱃지·CTA 포인트만. word-break:keep-all.
// 제거: TOP5·"이렇게 쓰면"·추상 말투요약·자주 쓰는 어미 섹션.
function renderDetailedPopup(data) {
    const p = data.persona || {};
    const raw = data.raw_analysis || {};
    const ROSE = '#BC6675';
    const _esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
        ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

    const capTmpl   = (raw.caption_template || p.caption_template || '').trim();
    const postCount = parseInt(raw.post_count != null ? raw.post_count : (p.post_count || 0), 10) || 0;
    const handle    = String(raw.instagram_handle || p.instagram_handle || _instaHandle || '').replace(/^@/, '').trim();
    const emojis    = String(p.emojis || raw.emojis || '').trim();
    // 해시태그: 콤마·공백 분리 → 배열, # 1개만
    const tagArr    = String(p.hashtags || raw.hashtags || '')
        .split(/[,\s]+/).map(t => t.trim()).filter(Boolean)
        .map(t => '#' + t.replace(/^#+/, ''));
    // [5] 말끝: 배열 JSON 또는 콤마·공백 분리 문자열 둘 다 처리 (값은 '~' 접두 포함)
    const sigArr = Array.isArray(p.signature_phrases || raw.signature_phrases)
        ? (p.signature_phrases || raw.signature_phrases)
        : String(p.signature_phrases || raw.signature_phrases || '').split(/[,\s]+/).filter(Boolean);

    // 프사: localStorage 캐시 우선, 실패 시 실루엣 폴백
    const picUrl = (() => { try { return localStorage.getItem('itdasy:ig_profile_pic') || ''; } catch (_e) { return ''; } })();
    const SIL = '<svg viewBox="0 0 24 24" width="36" height="36" fill="#C9CDD4" aria-hidden="true"><path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2.2c-4.5 0-8 2.6-8 5.9V21h16v-.9c0-3.3-3.5-5.9-8-5.9Z"/></svg>';
    const avatarInner = picUrl
        ? `<img src="${_esc(picUrl)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" onerror="this.style.display='none';this.parentNode.querySelector('svg').style.display='block';" alt="">${SIL.replace('<svg', '<svg style="display:none"')}`
        : SIL;

    // ── 히어로 섹션
    let html = `
    <div style="background:#FBEAF0;border-radius:26px 26px 0 0;padding:32px 20px 24px;text-align:center;position:relative;">
      <button data-static-action="analyze-result-close" aria-label="닫기" style="position:absolute;top:14px;right:14px;width:32px;height:32px;border:none;border-radius:50%;background:rgba(255,255,255,0.6);color:var(--text-muted);cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </button>
      <div style="margin-bottom:14px;display:flex;justify-content:center;">
        <svg width="46" height="46" class="itb-float" aria-hidden="true"><use href="#ic-bot"/></svg>
      </div>
      <div style="font-size:16px;font-weight:800;color:var(--text);line-height:1.4;margin-bottom:6px;">말투 분석이 완료됐어요!</div>
      <div style="font-size:13px;color:${ROSE};font-weight:600;">${postCount > 0 ? `게시물 ${postCount}개 분석 완료` : '말투 분석 완료'}</div>
    </div>`;

    // ── 아바타/핸들/배지
    html += `
    <div style="padding:20px 20px 16px;display:flex;align-items:center;gap:12px;border-bottom:0.5px solid var(--border);">
      <div style="width:44px;height:44px;border-radius:50%;background:#F2F4F6;flex-shrink:0;overflow:hidden;display:flex;align-items:center;justify-content:center;">${avatarInner}</div>
      <div>
        ${handle ? `<div style="font-size:15px;font-weight:700;color:var(--text);">@${_esc(handle)}</div>` : ''}
        ${postCount > 0 ? `<div style="display:inline-flex;align-items:center;gap:4px;background:${ROSE};color:#fff;font-size:11px;font-weight:700;padding:3px 8px;border-radius:999px;margin-top:4px;"><svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M2 6l3 3 5-5" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>${postCount}개 분석</div>` : ''}
      </div>
    </div>`;

    // ── 섹션 목록 (hairline 구분선)
    const DIV = '<div style="height:.5px;background:var(--border);"></div>';
    const secs = [];

    // 말투
    const styleSummary = String(raw.style_summary || p.style_summary || raw.tone_summary || '').trim();
    if (styleSummary) {
        secs.push(`<div style="padding:18px 20px;">
            <div style="font-size:11px;font-weight:600;color:var(--text-subtle);margin-bottom:6px;">원장님 말투</div>
            <div style="font-size:14px;color:var(--text);line-height:1.7;word-break:keep-all;">${_esc(styleSummary)}</div>
        </div>`);
    }

    // 말끝 칩 (고정문구보다 위에 배치)
    if (sigArr.length) {
        const sigChips = sigArr.map(s =>
            `<span style="display:inline-flex;background:var(--surface);color:var(--text-muted);border:0.5px solid var(--border-strong);padding:5px 11px;border-radius:var(--r-pill);font-size:12px;font-weight:500;margin:3px 3px 0 0;word-break:keep-all;">${_esc(s)}</span>`
        ).join('');
        secs.push(`<div style="padding:18px 20px;">
            <div style="font-size:11px;font-weight:600;color:var(--text-subtle);margin-bottom:10px;">원장님이 자주 쓰는 말끝</div>
            <div style="line-height:1;">${sigChips}</div>
        </div>`);
    }

    // 고정문구: 항상 렌더, 없으면 '없음'
    secs.push(`<div style="padding:18px 20px;">
        <div style="font-size:11px;font-weight:600;color:var(--text-subtle);margin-bottom:10px;">원장님이 꼭 쓰는 고정문구</div>
        ${capTmpl
            ? `<div style="font-size:13.5px;color:var(--text);line-height:1.8;white-space:pre-wrap;word-break:keep-all;">${_esc(capTmpl)}</div>`
            : `<div style="font-size:13.5px;color:var(--text-subtle);">없음</div>`
        }
    </div>`);

    if (tagArr.length) {
        const chips = tagArr.map(t =>
            `<span style="display:inline-flex;background:var(--surface);color:var(--text-muted);border:0.5px solid var(--border-strong);padding:5px 11px;border-radius:var(--r-pill);font-size:12px;font-weight:500;margin:3px 3px 0 0;word-break:keep-all;">${_esc(t)}</span>`
        ).join('');
        secs.push(`<div style="padding:18px 20px;">
            <div style="display:flex;align-items:center;justify-content:space-between;">
                <span style="font-size:11px;font-weight:600;color:var(--text-subtle);">원장님이 자주 쓰는 해시태그 <span style="font-weight:500;">${tagArr.length}개</span></span>
                <button data-ig-tag-toggle style="background:none;border:none;padding:0;font-size:12px;color:var(--text-subtle);cursor:pointer;font-weight:600;">전체 보기 ›</button>
            </div>
            <div data-ig-tag-chips style="display:none;margin-top:10px;line-height:1;">${chips}</div>
        </div>`);
    }

    if (emojis) {
        secs.push(`<div style="padding:18px 20px;">
            <div style="font-size:11px;font-weight:600;color:var(--text-subtle);margin-bottom:10px;">원장님이 자주 쓰는 이모지</div>
            <div style="font-size:21px;letter-spacing:4px;word-break:break-all;">${_esc(emojis)}</div>
        </div>`);
    }

    if (secs.length) {
        html += `<div style="overflow:hidden;">${secs.join(DIV)}</div>`;
    }

    // ── 안내 문구(작업실/글쓰기 진입 CTA 제거 — 분석 결과 저장 위치만 안내) [2026-06-26]
    html += `
    <div style="padding:18px 22px 24px;">
        <div style="display:flex;gap:8px;align-items:flex-start;background:var(--surface-2,#F7F8FA);border-radius:14px;padding:14px 16px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" style="flex-shrink:0;margin-top:1px;color:var(--text-subtle);"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/><path d="M12 11v5M12 8h.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
            <span style="font-size:12.5px;color:var(--text-muted);line-height:1.65;word-break:keep-all;">원장님 말투 분석 결과는 <b style="font-weight:700;color:var(--text);">내샵관리 › 잇비/자동화 › 내 말투</b>에서 언제든 확인할 수 있어요.</span>
        </div>
    </div>`;

    const body = document.getElementById('analyzeResultBody');
    if (!body) return;
    body.innerHTML = html;
    // [2026-06-26] '내 말투로 글 써보기' CTA 제거 — 말투분석 보고서에서 작업실/글쓰기 진입 차단(중복·혼동 방지).
    //   분석 결과는 내샵관리 › 잇비/자동화 › 내 말투에서 확인. 닫기는 헤더 X(analyze-result-close).
    body.querySelector('[data-ig-tag-toggle]')?.addEventListener('click', function () {
        const chips = body.querySelector('[data-ig-tag-chips]');
        if (!chips) return;
        const open = chips.style.display !== 'none';
        chips.style.display = open ? 'none' : 'block';
        this.textContent = open ? '전체 보기 ›' : '접기 ›';
    });
}

// [2026-05-13 QA #blocker1] 인스타 연동 직후 자동 분석 진입점 — backend 가 _auto_analyze_persona_bg
// 를 백그라운드 실행하지만 프론트가 시각 피드백을 안 줘서 "연동만 되고 끝" 인상이던 문제.
// 흐름:
//  1) 진입 즉시 analyzeOverlay + "AI 말투 분석 시작했어요" 토스트
//  2) /instagram/status 3초마다 폴 (max 90초) — persona.style_summary 채워지면 success
//  3) 90초 timeout → /instagram/analyze?force=true 1회 시도 (BG task 실패 fallback)
async function runAutoAnalysisAfterConnect() {
  const overlay = document.getElementById('analyzeOverlay');
  const bar     = document.getElementById('analyzeProgressBar');
  const stepTxt = document.getElementById('analyzeStepText');
  const subTxt  = document.getElementById('analyzeSubText');
  // [2026-06-12] 오버레이 종료 = 분석 흐름 끝 → OAuth inflight 플래그 해제(SW reload 가드 풀기).
  const _endOverlay = () => {
    if (overlay) overlay.style.display = 'none';
    try { sessionStorage.removeItem('itdasy_oauth_inflight'); } catch (_e) { void _e; }
    try { sessionStorage.removeItem('itdasy_pending_report'); } catch (_e) { void _e; }   // [v570] 보고서 복원 의도 플래그 정리(터미널)
  };
  if (overlay && overlay.parentElement !== document.body) document.body.appendChild(overlay);
  if (overlay) overlay.style.display = 'flex';
  const STEP_MSGS = ['게시물 가져오는 중…','최근 게시물을 읽는 중…','사장님 말투 익히는 중…','해시태그·이모지 모으는 중…'];
  let _mi = 0;
  if (stepTxt) stepTxt.textContent = STEP_MSGS[0];
  if (bar) bar.style.width = '22%';
  const _msgTimer = setInterval(() => {
    _mi = Math.min(_mi + 1, STEP_MSGS.length - 1);
    if (stepTxt) stepTxt.textContent = STEP_MSGS[_mi];
    if (bar) bar.style.width = (22 + _mi * 18) + '%';
  }, 1200);
  if (subTxt)  subTxt.textContent  = '최근 사장님의 게시물들을 읽고 잇비가 학습 중이에요';
  try { if (typeof showToast === 'function') showToast('🪄 AI 말투 분석을 시작했어요. 결과 곧 보여드릴게요'); } catch (_e) { void _e; }

  const startedAt = Date.now();
  const MAX_MS = 90_000;
  const STEP_MS = 3_000;
  const MIN_OVERLAY_MS = 4_800;
  let success = false;
  let failCode = null;            // [2026-06-12] BG 분석 실패 사유 (media_fetch_failed/no_captioned_posts/ai_failed)
  let lastStatusData = null;
  console.log('[IG-ANALYZE] start');

  // 백그라운드 task 폴링 — 멘트·게이지는 _msgTimer 가 단독 소유
  while (Date.now() - startedAt < MAX_MS) {
    try {
      const res = await apiFetch('/instagram/status', { headers: authHeader() });
      if (res.ok) {
        const d = await res.json();
        lastStatusData = d;
        const p = (d && d.persona) || null;
        if (p && (p.style_summary || '').trim()) {
          success = true;
          console.log('[IG-ANALYZE] success', { handle: d.handle, post_count: p.post_count });
          break;
        }
        // [2026-06-12] BG 분석이 사유 코드 남기고 실패 → 폴링 중단·사유별 안내.
        if (d && d.style_analysis_status === 'failed' && d.analysis_error) {
          failCode = d.analysis_error;
          console.log('[IG-ANALYZE] failed', { analysis_error: failCode });
          break;
        }
      }
    } catch (_e) { /* network blip ok */ }
    await new Promise(r => setTimeout(r, STEP_MS));
  }

  // 즉시 성공/실패해도 오버레이가 최소 4.8초는 보이게 — 빠른 응답에도 _msgTimer 4개 문구 다 노출.
  const _elapsed = Date.now() - startedAt;
  if (_elapsed < MIN_OVERLAY_MS) await new Promise(r => setTimeout(r, MIN_OVERLAY_MS - _elapsed));
  clearInterval(_msgTimer);

  // [2026-06-12] BG 분석이 명시적으로 실패 → 오버레이 닫고 사유별 안내 + 재분석 버튼.
  if (failCode) {
    _showAnalyzeError(failCode);
    return;
  }

  if (success && lastStatusData) {
    const p = lastStatusData.persona || {};
    if (bar) bar.style.width = '100%';
    if (stepTxt) stepTxt.textContent = '완료! 잇비가 자료 정리 중…';
    // [2026-05-21] localStorage 저장은 그대로 유지 (다른 화면·다음 방문이 읽음).
    // persona 필드를 raw_analysis 호환 형태로 평탄화해서 저장.
    try {
      const flat = { ...p, tone_summary: p.tone || '', style_summary: p.style_summary || '' };
      localStorage.setItem('itdasy_latest_analysis', JSON.stringify(flat));
    } catch (_e) { void _e; }
    try {
      const curPic = document.getElementById('headerAvatar')?.querySelector('img')?.src || '';
      updateHeaderProfile(_instaHandle, p.tone, curPic);
      renderPersonaDash(p, true);
    } catch (_e) { void _e; }
    // [2026-06-12] 리포트 팝업은 localStorage 경유(showDetailedAnalysis) 금지 — 재연동 캐시 정리와
    //   경합하면 팝업 대신 토스트만 뜸. 폴링으로 받은 persona 를 renderDetailedPopup 에 직접 전달.
    setTimeout(() => {
      _endOverlay();
      console.log('[IG-ANALYZE] open-report');
      if (!_openReportPopupDirect(p)) {
        try { if (typeof showToast === 'function') showToast('✅ 말투 분석 완료!'); } catch (_e2) { void _e2; }
      }
    }, 1000);
    return;
  }

  // Timeout fallback — BG task 가 실패했거나 너무 느림. force 재분석 1회.
  console.log('[IG-ANALYZE] timeout-fallback force-reanalyze');
  if (stepTxt) stepTxt.textContent = '한 번 더 시도하는 중…';
  try {
    const r2 = await apiFetch('/instagram/analyze?force=true', { method: 'POST', headers: authHeader() });
    if (r2.ok) {
      const d2 = await r2.json();
      const p = d2.persona || {};
      if (p.style_summary) {
        console.log('[IG-ANALYZE] fallback-success');
        try { localStorage.setItem('itdasy_latest_analysis', JSON.stringify({ ...(d2.raw_analysis || {}), ...p })); } catch (_e) { void _e; }
        try {
          const curPic = document.getElementById('headerAvatar')?.querySelector('img')?.src || '';
          updateHeaderProfile(_instaHandle, p.tone, curPic);
          renderPersonaDash(p, true);
        } catch (_e) { void _e; }
        _endOverlay();
        if (!_openReportPopupDirect(p)) {
          try { if (typeof showToast === 'function') showToast('✅ 말투 분석 완료!'); } catch (_e) { void _e; }
        }
        return;
      }
    } else {
      let friendly = '분석에 실패했어요. 설정에서 "말투 새로 분석" 을 눌러주세요.';
      try {
        const j = await r2.json();
        const detail = (j && j.detail) || '';
        if (typeof detail === 'string' && detail) friendly = detail;
      } catch (_e) { void _e; }
      console.log('[IG-ANALYZE] fallback-failed', { detail: friendly });
      _endOverlay();
      try { if (typeof showToast === 'function') showToast(friendly); } catch (_e) { void _e; }
      return;
    }
  } catch (_e) { /* ignore */ }

  console.log('[IG-ANALYZE] timeout-give-up');
  _endOverlay();
  try { if (typeof showToast === 'function') showToast('분석이 평소보다 오래 걸려요. 설정 > 말투 새로 분석 으로 다시 시도해주세요'); } catch (_e) { void _e; }
}
window.runAutoAnalysisAfterConnect = runAutoAnalysisAfterConnect;

// [2026-06-12] 폴링으로 받은 persona 를 localStorage 경유 없이 리포트 팝업에 직접 전달·오픈.
//   재연동 캐시 정리(checkInstaStatus)와 경합해도 팝업이 토스트로 새지 않게.
function _openReportPopupDirect(p) {
  try {
    const flat = { ...p, tone_summary: p.tone || p.tone_summary || '', style_summary: p.style_summary || '' };
    renderDetailedPopup({ raw_analysis: flat, persona: p });
    const pop = document.getElementById('analyzeResultPopup');
    if (pop) {
      // stacking context 이슈 방지 — body 최상위로
      if (pop.parentElement !== document.body) document.body.appendChild(pop);
      pop.style.display = 'flex';
      return true;
    }
  } catch (_e) { console.log('[IG-ANALYZE] popup-open-failed', _e && _e.message); }
  return false;
}
// [v570] reload 복원 경로(app-core 부팅)가 캐시 분석결과로 보고서를 직접 열 때 사용.
try { if (typeof window !== 'undefined') window._openReportPopupDirect = _openReportPopupDirect; } catch (_e) { void _e; }

// [2026-06-12] 말투 분석 실패 사유별 안내 배너 + 재분석 버튼 (showToast 는 액션 버튼 미지원).
function _showAnalyzeError(code) {
  const MSG = {
    media_fetch_failed: '게시물을 가져올 수 없어요. 인스타가 프로페셔널(비즈니스/크리에이터) 계정인지 확인해 주세요.',
    no_captioned_posts: '분석하려면 캡션(글)이 있는 게시물이 필요해요.',
    ai_failed:          '분석이 잠시 실패했어요. 잠시 후 다시 시도해 주세요.',
  };
  console.log('[IG-ANALYZE] show-error', { code });
  const overlay = document.getElementById('analyzeOverlay');
  if (overlay) overlay.style.display = 'none';
  try { sessionStorage.removeItem('itdasy_oauth_inflight'); } catch (_e) { void _e; }
  try { sessionStorage.removeItem('itdasy_pending_report'); } catch (_e) { void _e; }   // [v570] 보고서 복원 의도 플래그 정리(실패 터미널)
  let barEl = document.getElementById('igAnalyzeErrorBar');
  if (!barEl) {
    barEl = document.createElement('div');
    barEl.id = 'igAnalyzeErrorBar';
    barEl.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);top:calc(var(--safe-area-inset-top, env(safe-area-inset-top, 0px)) + 16px);z-index:99999;max-width:calc(100vw - 32px);background:#FEE8E8;color:#A32D2D;padding:12px 16px;border-radius:14px;box-shadow:var(--shadow-md,0 4px 16px rgba(0,0,0,.12));font-size:13px;font-weight:600;display:flex;align-items:center;gap:10px;';
    document.body.appendChild(barEl);
  }
  barEl.innerHTML = '<span style="flex:1;word-break:keep-all;line-height:1.4;"></span>' +
    '<button data-ig-retry style="flex-shrink:0;background:#A32D2D;color:#fff;border:none;border-radius:10px;padding:7px 13px;font-size:12px;font-weight:700;cursor:pointer;">다시 분석</button>';
  barEl.querySelector('span').textContent = MSG[code] || '말투 분석에 실패했어요. 다시 시도해 주세요.';
  barEl.style.display = 'flex';
  barEl.querySelector('[data-ig-retry]').onclick = () => {
    barEl.style.display = 'none';
    if (typeof window.runPersonaAnalyze === 'function') window.runPersonaAnalyze(true);
  };
}


async function reAnalyzePersona() {
  if (await nativeConfirm("확인", '최신 게시물들을 바탕으로 말투와 성과 비결을 다시 분석하시겠습니까?')) {
    // [QA #8] 사용자가 명시적으로 "다시 분석" — force=true 로 5분 캐시 우회.
    runPersonaAnalyze(true);
  }
}

async function runPersonaAnalyze(force) {
  const overlay = document.getElementById('analyzeOverlay');
  const bar     = document.getElementById('analyzeProgressBar');
  const stepTxt = document.getElementById('analyzeStepText');
  const subTxt  = document.getElementById('analyzeSubText');

  const steps = [
    { pct: 10, text: '게시물 가져오는 중…',       sub: '최근 사장님의 게시물들을 읽고 잇비가 학습 중이에요' },
    { pct: 35, text: '최근 게시물을 읽는 중…',     sub: '최근 사장님의 게시물들을 읽고 잇비가 학습 중이에요' },
    { pct: 55, text: '사장님 말투 익히는 중…',     sub: '최근 사장님의 게시물들을 읽고 잇비가 학습 중이에요' },
    { pct: 75, text: '해시태그·이모지 모으는 중…', sub: '최근 사장님의 게시물들을 읽고 잇비가 학습 중이에요' },
    { pct: 90, text: '완료! 잇비가 자료 정리 중…', sub: '최근 사장님의 게시물들을 읽고 잇비가 학습 중이에요' },
  ];

  if (overlay && overlay.parentElement !== document.body) document.body.appendChild(overlay);
  overlay.style.display = 'flex';
  const _reStart = Date.now();
  let stepIdx = 0;

  // 애니메이션: API 응답 전까지 단계 순서대로 진행
  const ticker = setInterval(() => {
    if (stepIdx < steps.length) {
      const s = steps[stepIdx++];
      bar.style.width = s.pct + '%';
      stepTxt.textContent = s.text;
      subTxt.textContent  = s.sub;
    }
  }, 2200);

  try {
    // [2026-06-10 #4] 말투 분석은 Gemini 호출로 60~90s 걸릴 수 있어 safeFetch(120s) 사용.
    //   브라우저 기본 fetch 는 네트워크 이슈 시 연결을 끊어 "네트워크 오류" 토스트가 뜨던 버그.
    const _analyzeFetch = window.safeFetch || apiFetch;
    const res = await _analyzeFetch(apiUrl('/instagram/analyze' + (force ? '?force=true' : '')), {
      method: 'POST',
      headers: authHeader(),
      timeout: 120000,
    });
    clearInterval(ticker);

    if (!res.ok) {
      // [2026-05-08 hotfix] status code 별 친절 메시지 + personaDash 명시 숨김
      let friendly = '인스타 분석에 실패했습니다. 잠시 후 다시 시도해주세요';
      if (res.status === 404) friendly = '분석할 게시물이 아직 없어요. 게시물을 먼저 올려주세요!';
      else if (res.status === 429) friendly = '이번 달 분석 한도(1회)를 다 썼어요. 다음 달에 다시 시도해주세요';
      else if (res.status === 401) friendly = '인스타 토큰이 만료됐어요. 재연동해주세요';
      try {
        const err = await res.json();
        const detail = (err && typeof err.detail === 'string') ? err.detail : '';
        // [2026-05-08 v116] Vertex AI / Gemini 사용량 초과 — BE 가 500 으로 wrap 해서 보냄.
        // 이 케이스는 status 분기 안 타니까 detail 패턴으로 별도 감지.
        if (detail.includes('RESOURCE_EXHAUSTED') || detail.includes('Resource exhausted')) {
          friendly = 'AI 분석 서버가 잠시 바빠요. 1~2분 뒤 다시 시도해주세요';
        }
        // 친절 detail 만 채택 — 기술 메시지(에러/예외/JSON 덤프 등)는 거름
        else if (detail && detail.length < 120
                 && !detail.includes('Error') && !detail.includes('Exception')
                 && !detail.includes('Traceback') && !detail.includes("'error'")) {
          friendly = detail;
        }
      } catch(_) { /* ignore */ }
      overlay.style.display = 'none';
      // 옛 persona 카드 남지 않도록 강제 숨김
      const pd = document.getElementById('personaDash');
      if (pd) pd.style.display = 'none';
      showToast(friendly);
      return;
    }

    const data = await res.json();
    // [B4] BE가 background 처리로 pending 반환 → runAutoAnalysisAfterConnect 폴링 흐름으로 전환
    if (data && data.status === 'pending') {
      clearInterval(ticker);
      if (stepTxt) stepTxt.textContent = '분석 중이에요...';
      if (subTxt)  subTxt.textContent  = '완료되면 알려드릴게요';
      if (bar) bar.style.width = '40%';
      // /instagram/status 폴링 — done 되면 결과 반영
      const MAX_MS = 120_000; const startedAt = Date.now();
      while (Date.now() - startedAt < MAX_MS) {
        try {
          const sr = await apiFetch('/instagram/status', { headers: authHeader() });
          if (sr.ok) {
            const sd = await sr.json();
            if (sd && sd.persona && (sd.persona.style_summary || '').trim()) {
              const sp = sd.persona;
              if (bar) bar.style.width = '100%';
              if (stepTxt) stepTxt.textContent = '분석 성공!';
              if (subTxt)  subTxt.textContent  = '말투 데이터가 업데이트됐어요';
              try { const flat = { ...sp, tone_summary: sp.tone || '', style_summary: sp.style_summary || '' }; localStorage.setItem('itdasy_latest_analysis', JSON.stringify(flat)); } catch(_e){ void _e; }
              try { const cp = document.getElementById('headerAvatar')?.querySelector('img')?.src || ''; updateHeaderProfile(_instaHandle, sp.tone, cp); renderPersonaDash(sp, true); } catch(_e){ void _e; }
              const _re = Date.now() - _reStart;
              if (_re < 4800) await new Promise(r => setTimeout(r, 4800 - _re));
              setTimeout(() => {
                if (overlay) overlay.style.display = 'none';
                if (!_openReportPopupDirect(sp)) {
                  try { if (typeof showToast === 'function') showToast('말투 분석 완료!'); } catch(_e){ void _e; }
                }
              }, 800);
              return;
            }
          }
        } catch(_e) { /* network blip */ }
        await new Promise(r => setTimeout(r, 4000));
      }
      if (overlay) overlay.style.display = 'none';
      try { if (typeof showToast === 'function') showToast('분석이 오래 걸리고 있어요. 설정 > 말투 리포트에서 확인하세요'); } catch(_e){ void _e; }
      return;
    }
    const p = data.persona;
    const raw = data.raw_analysis || {};

    // 로컬 스토리지에 최신 분석 결과 저장 (자세히보기용)
    localStorage.setItem('itdasy_latest_analysis', JSON.stringify({
        ...raw,
        avg_caption_length: p.avg_caption_length,
        emojis: p.emojis,
        hashtags: p.hashtags,
        style_summary: p.style_summary
    }));

    bar.style.width = '100%';
    stepTxt.textContent = '분석 성공!';
    subTxt.textContent  = '말투 데이터가 업데이트됐어요';

    // 헤더 + 대시보드 갱신
    const curPic = document.getElementById('headerAvatar').querySelector('img')?.src || '';
    updateHeaderProfile(_instaHandle, p.tone, curPic);
    renderPersonaDash(p);

    const _re = Date.now() - _reStart;
    if (_re < 4800) await new Promise(r => setTimeout(r, 4800 - _re));
    setTimeout(() => {
      overlay.style.display = 'none';
      renderPersonaDash(p, true);
      // 분석 완료 팝업 자동 오픈
      renderDetailedPopup({ raw_analysis: raw, persona: p });
      const _apop = document.getElementById('analyzeResultPopup');
      if (_apop) {
        // [F6] body 최상위 이동 → 설정 시트(z-index 9996) 위로 즉시 노출
        if (_apop.parentElement !== document.body) document.body.appendChild(_apop);
        _apop.style.display = 'flex';
      }
      // [2026-04-24] 말투 테스트 자동 트리거 제거 — 사용자가 설정 메뉴에서 명시적 호출
      // window.openPersonaSurveyModal() 함수 자체는 app-persona-survey.js 에 그대로 남아있음
    }, 800);

  } catch(e) {
    clearInterval(ticker);
    // [2026-06-10 #4] timeout은 "진행 중" 처리 — /status 폴링으로 완료 확인.
    //   이전엔 타임아웃도 "네트워크 오류" 토스트가 떠서 사용자 혼란.
    if (e && e.timeout) {
      if (stepTxt) stepTxt.textContent = '분석 중 (백그라운드에서 계속 진행 중)...';
      if (subTxt) subTxt.textContent = '완료되면 알려드릴게요. 화면을 닫아도 됩니다.';
      setTimeout(() => {
        if (overlay) overlay.style.display = 'none';
        try { if (typeof showToast === 'function') showToast('분석이 진행 중이에요. 잠시 후 설정 > 말투 리포트에서 확인하세요'); } catch(_e){ void _e; }
      }, 2000);
      return;
    }
    overlay.style.display = 'none';
    const pd = document.getElementById('personaDash');
    if (pd) pd.style.display = 'none';
    showToast('분석 중 오류가 발생했어요. 잠시 후 다시 시도해주세요');
  }
}

async function disconnectInstagram() {
  // [2026-05-11 QA #1] 인스타 해제 ≠ 잇데이 로그아웃 (사용자 피드백: "해제했더니 강제 로그아웃 당했다").
  // OAuth provider (google/kakao/naver/email) 세션은 유지. IG 상태만 끊고 UI 갱신.
  if (!(await nativeConfirm(
    '인스타 연동 해제',
    '인스타 연동을 끊을게요. 잇데이 로그인은 그대로 유지돼요.\n나중에 다시 연결하면 분석 결과를 새 인스타 기준으로 갱신해요.\n\n고객·예약·매출·말투 분석 데이터는 안전하게 보관돼요.'
  ))) return;
  try {
    const res = await apiFetch('/instagram/disconnect', {
      method: 'POST',
      headers: authHeader(),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`해제 실패 (HTTP ${res.status}) ${txt.slice(0, 60)}`);
    }
    // [2026-05-12 QA #1] 캐시 클린업 — checkInstaStatus 가 미연결 분기에서도 처리하지만
    // 다른 화면이 다음 렌더 전까지 stale 값 노출 가능 → disconnect 시점에 선제 청소.
    try {
      localStorage.removeItem('itdasy:ig_connected_cache');
      localStorage.removeItem('itdasy:ig_handle');
      localStorage.removeItem('itdasy:ig_profile_pic');
      localStorage.removeItem('itdasy_latest_analysis');
    } catch (_e) { /* ignore */ }
    try { if (typeof window !== 'undefined') window._instaHandle = ''; } catch (_e) { /* ignore */ }
    showToast('✓ 인스타 해제됨');
    // [QA #8] single source-of-truth — 모든 IG 상태 listener 에게 변경 통보.
    try {
      window.dispatchEvent(new CustomEvent('itdasy:ig:changed', {
        detail: { connected: false, source: 'disconnect' },
      }));
      // 내샵관리·홈 다른 위젯들 동기 갱신 — 헤더·아바타·핸들 즉시 반영.
      window.dispatchEvent(new CustomEvent('itdasy:data-changed', {
        detail: { kind: 'ig_disconnect' },
      }));
    } catch (_e) { /* ignore */ }
    // 상태 카드 즉시 재조회 (로그아웃 대신).
    try {
      const fn = window.checkInstagramStatus || window.checkInstaStatus || checkInstaStatus;
      if (typeof fn === 'function') await fn();
    } catch (_e) { /* ignore */ }
  } catch (e) {
    showToast('해제 실패: ' + (e && e.message ? e.message : '잠시 후 다시 시도해주세요'));
  }
}
// [2026-04-24] 전역 노출 — index.html 의 onclick 핸들러가 호출.
window.disconnectInstagram = disconnectInstagram;
// [QA #8] 외부에서 IG 상태 재조회 (호환 alias — 일부 코드가 checkInstagramStatus 라는 이름으로 호출).
window.checkInstaStatus = checkInstaStatus;
window.checkInstagramStatus = checkInstaStatus;
/* exported connectInstagram */
// [2026-05-21] 설정 → 말투분석 / 인스타 재분석 진입점. app-settings-hub·app-oauth-return·app-persona-survey 에서 window.runPersonaAnalyze 로 호출 → 노출 누락 시 silent fail.
window.runPersonaAnalyze = runPersonaAnalyze;
window.reAnalyzePersona = reAnalyzePersona;
// [2026-05-21] 내샵관리 → "전체 분석 리포트 보기" 클릭 진입점. myshop-v3 가 window.showDetailedAnalysis 로 호출.
window.showDetailedAnalysis = showDetailedAnalysis;

async function connectInstagram() {
  if (!getToken()) {
    document.getElementById('lockOverlay').classList.remove('hidden');
    if (window.applyStoreReviewLoginGuard) window.applyStoreReviewLoginGuard();
    if (document.body) document.body.classList.add('itdasy-locked');
    return;
  }

  const btn = document.getElementById('instaBtn');

  // PWA(홈화면 추가) 또는 네이티브 앱인지 확인
  //   [2026-07-29 시뮬 검증] 네이티브 Capacitor 앱은 navigator.standalone/display-mode 로는 '설치됨'으로
  //   안 잡혀서, 인스타 연동이 "홈 화면에 추가하세요" 안내에 막혀 OAuth 가 시작조차 안 됐다(실기기 iOS 앱도 동일).
  //   네이티브면 이미 앱으로 설치된 것이므로 PWA 로 취급해 정상 진행시킨다.
  const _isNativeApp = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const isPWA = _isNativeApp || window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  // 카톡 인앱브라우저: Safari로 열도록 안내
  if (isKakaoTalk()) {
    showInstallGuide('카카오톡 내부 브라우저에서는 인스타 연동이 안 됩니다.');
    return;
  }

  // iOS Safari (비PWA): 홈화면 추가 안내
  if (isIOS && !isPWA) {
    showInstallGuide();
    return;
  }

  btn.textContent = '연결 중...';
  btn.disabled = true;


  try {
    // 동의 내역 서버 로그 및 로컬 저장 (타임스탬프 포함)
    apiFetch('/instagram/consent', { method: 'POST', headers: authHeader() })
      .then(() => {
        const now = new Date().toLocaleString('ko-KR');
        localStorage.setItem('itdasy_consented', 'true');
        localStorage.setItem('itdasy_consented_at', now);
        const tsEl = document.getElementById('consentTimestampDisplay');
        if (tsEl) { tsEl.textContent = `동의 완료: ${now}`; tsEl.style.display = 'block'; }
      })
      .catch(e => console.warn('[instagram] 동의 기록 실패', e));

    // iOS Universal Link 우회: 백엔드 ngrok URL로 이동 (instagram.com 직접 아님)
    // 백엔드가 302로 인스타에 전달 → 앱 납치 없이 Safari에서 OAuth 진행
    const token = getToken();
    let baseOrigin = window.location.origin;
    if (baseOrigin === 'null' || baseOrigin === 'file://') {
      baseOrigin = window.location.href.split('/index.html')[0];
    } else {
      // [2026-06-12] pathname 의 // 누적 접기 — return_to 슬래시 증식(재연동마다 +1) 원인 제거.
      baseOrigin += window.location.pathname.replace(/\/index\.html$/, '').replace(/\/{2,}/g, '/');
    }
    const origin = encodeURIComponent(baseOrigin);
    // Capacitor 네이티브 앱에선 OAuth 완료 후 딥링크(itdasy://oauth/callback)로 앱에 복귀
    const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    // 끝의 슬래시를 하나로 정규화 후 단일 '/' 부여 — baseOrigin 이 '/' 로 끝나도 '//' 안 됨.
    const returnTo = isNative ? 'itdasy://oauth/callback' : baseOrigin.replace(/\/+$/, '') + '/';
    const returnToEnc = encodeURIComponent(returnTo);
    // [2026-06-12] OAuth 출발 표시 — 복귀 직후 SW controllerchange→reload 가 ?connected=success
    //   를 날리지 못하게 app-core 의 reload 가드가 이 플래그를 본다. 분석 오버레이 종료 시 remove.
    try { sessionStorage.setItem('itdasy_oauth_inflight', '1'); } catch (_e) { void _e; }
    // [보안감사 H-7 준비 2026-07-27] 플래그 ON + 네이티브 + Browser 플러그인일 때만 SFSafariViewController 로 연다
    //   (구글/카카오 _navigateOAuth 와 동일한 방식 — 웹뷰가 instagram.com 로 안 나가므로 App-Bound Domains 와 양립).
    //   복귀는 기존과 동일하게 itdasy://oauth/callback 딥링크(app-oauth-return.js connected=success)로 돌아온다.
    //   구글/카카오도 복귀 시 Browser.close() 를 명시 호출하지 않으므로 인스타도 별도 close 로직을 추가하지 않는다.
    //   else 분기는 원본 그대로 — 웹·플래그OFF 네이티브(현재 전부)는 100% 기존 동작.
    // [출시감사 2026-08-01 카오스QA] 주소에 로그인 토큰을 싣지 않는다.
    //   예전엔 `?token=<JWT>` 였는데, Cloud Run 액세스 로그에 그 JWT 가 전체 URL 째로
    //   평문으로 남는 걸 실측했다 — 로그만 봐도 계정을 그대로 쓸 수 있었다.
    //   대신 헤더 인증으로 60초짜리 1회용 티켓을 받아 그걸 주소에 싣는다.
    //   티켓이 로그에 남아도 연동 화면 진입 외엔 아무것도 못 한다.
    //   티켓 발급이 실패하면 옛 방식으로 폴백한다 — 연동이 아예 막히는 것보다 낫다.
    let _entry = '';
    try {
      const tr = await apiFetch('/instagram/go-ticket', { method: 'POST' });
      if (tr.ok) {
        const tj = await tr.json();
        if (tj && tj.ticket) _entry = `ticket=${encodeURIComponent(tj.ticket)}`;
      }
    } catch (_e) { void _e; }
    if (!_entry) _entry = `token=${encodeURIComponent(token)}`;
    const goUrl = `${API}/instagram/go?${_entry}&origin=${origin}&return_to=${returnToEnc}`;

    if (_IG_BROWSER && isNative && window.Capacitor?.Plugins?.Browser) {
      window.Capacitor.Plugins.Browser.open({ url: goUrl });
    } else {
      window.location.href = goUrl;
    }

  } catch(e) {
    showToast('연동 중 오류가 발생했습니다. 크롬/사파리에서 재시도해주세요');
    btn.textContent = 'Instagram 연동';
    btn.disabled = false;
  }
}

// [2026-05-08 27차 [G]] 인스타 충돌 모달 — 다른 user 가 이미 사용 중인 IG 계정
function showInstaConflictModal(handle) {
  const modal = document.createElement('div');
  modal.id = 'instaConflictModal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.88);display:flex;align-items:center;justify-content:center;padding:20px;';
  modal.innerHTML = `
    <div style="background:#fff;max-width:340px;width:100%;border-radius:18px;padding:24px 22px;box-shadow:0 12px 40px rgba(0,0,0,0.18);">
      <div style="font-size:17px;font-weight:700;color:#111;margin-bottom:10px;">이미 다른 잇데이 계정에 연결돼 있어요</div>
      <div style="font-size:14px;color:#444;line-height:1.6;margin-bottom:20px;">
        ${handle ? `<strong>@${handle}</strong>` : '이 인스타그램 계정'}은 다른 잇데이 계정에서 사용 중이에요.<br><br>
        그 계정으로 로그인해서 <strong>[설정 → 인스타 연결 해제]</strong> 한 다음<br>이 계정에서 다시 연결해 주세요.
      </div>
      <div style="display:flex;gap:8px;">
        <button id="igConflictClose" style="flex:1;height:46px;border:1px solid #E5E7EB;background:#fff;color:#444;border-radius:12px;font-weight:600;cursor:pointer;">닫기</button>
        <button id="igConflictSwitch" style="flex:1.4;height:46px;border:none;background:#111;color:#fff;border-radius:12px;font-weight:700;cursor:pointer;">다른 계정으로 로그인</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById('igConflictClose').addEventListener('click', () => {
    modal.remove();
  });
  document.getElementById('igConflictSwitch').addEventListener('click', async () => {
    modal.remove();
    try {
      if (typeof window.logout === 'function') {
        await window.logout();
      } else {
        if (typeof window.setToken === 'function') window.setToken(null);
        location.href = 'index.html';
      }
    } catch (_e) { void _e; }
  });
}
window.showInstaConflictModal = showInstaConflictModal;

// [2026-05-08 28차 2단계] 잇비 카드 닫기 핸들러
//   - localStorage 저장 → 다음 진입 시 카드 미표시
//   - 토스트로 재진입 경로 안내
//   - itdasy_ prefix 라 logout 시 _purgeUserScopedStorage 가 자연 정리
function _dismissIpcCard() {
  try { localStorage.setItem('itdasy_ipc_dismissed', '1'); } catch (_e) { void _e; }
  const card = document.getElementById('homePreConnect');
  if (card) card.style.display = 'none';
  // 카드 닫으면 메인홈 visible 시킴 (교차 표시)
  const post = document.getElementById('homePostConnect');
  if (post) post.style.display = 'flex';
  // [2026-05-08 hotfix] 메인홈 상단에 작은 띠 표시 — 재진입 경로
  const bar = document.getElementById('ipcMiniBar');
  if (bar) bar.style.display = 'flex';
  // [A안 2026-07-21] 인스타 건너뛰면 "사진으로 시작" 가이드 카드 노출 — 인스타 없이도 핵심가치 진입로.
  _syncStartGuide();
  if (typeof showToast === 'function') {
    showToast('설정에서 다시 인스타 연결할 수 있어요');
  }
}
window._dismissIpcCard = _dismissIpcCard;

// [A안 2026-07-21] "사진으로 시작" 가이드(#homeStartGuide) 노출 동기화 — 전부 sync 신호.
//   조건: 인스타 건너뜀 + 미연동 + 안 닫음. 인스타 연결하거나 ✕ 닫으면 사라짐.
function _syncStartGuide() {
  const el = document.getElementById('homeStartGuide');
  if (!el) return;
  let connected = false, skipped = false, guideDismissed = false;
  try {
    connected = localStorage.getItem('itdasy:ig_connected_cache') === '1';
    skipped = localStorage.getItem('itdasy_ipc_dismissed') === '1';
    guideDismissed = localStorage.getItem('itdasy_home_guide_dismissed') === '1';
  } catch (_e) { /* ignore */ }
  el.style.display = (skipped && !connected && !guideDismissed) ? 'block' : 'none';
}
window._syncStartGuide = _syncStartGuide;

function _dismissStartGuide() {
  try { localStorage.setItem('itdasy_home_guide_dismissed', '1'); } catch (_e) { void _e; }
  const el = document.getElementById('homeStartGuide');
  if (el) el.style.display = 'none';
}
window._dismissStartGuide = _dismissStartGuide;

// ═══════════════════════════════════════════════════════
// [2026-05-18] 인스타 미리보기 — ratio 자동 매핑
// ═══════════════════════════════════════════════════════
// 설계 §10:
//   1:1   → 1080×1080 (피드 정사각)
//   4:5   → 1080×1350 (피드 세로, 디폴트 추천)
//   9:16  → 1080×1920 (스토리)
// 사진 편집기에서 저장하면 _state.ratio 가 자동 전달돼서
// 인스타 미리보기 컨테이너의 aspect-ratio 가 그 비율에 맞춰 잡힘.
// 'original' 이나 누락 시 4:5 추천 (인스타 권장 비율).
function _resolveIgPreviewRatio(ratio) {
  // 'original' / undefined → 4:5 추천
  const map = {
    '1:1':  { ar: '1/1',   w: 1080, h: 1080, label: '피드 정사각' },
    '4:5':  { ar: '4/5',   w: 1080, h: 1350, label: '피드 세로' },
    '9:16': { ar: '9/16',  w: 1080, h: 1920, label: '스토리' },
  };
  if (ratio && map[ratio]) return { key: ratio, ...map[ratio] };
  // back-compat: 인자 없으면 1:1 기본 (기존 호출자 보호)
  if (ratio === undefined || ratio === null) return { key: '1:1', ...map['1:1'] };
  // 'original' 이나 알 수 없는 값 → 4:5 추천
  return { key: '4:5', ...map['4:5'] };
}

function openInstagramPreview(opts) {
  opts = opts || {};
  const meta = _resolveIgPreviewRatio(opts.ratio);
  const src  = opts.src || '';
  // [v181 2026-05-18] caption prefill — opts.caption 우선, 없으면 CaptionPrefill 모듈에서 가져옴
  let captionPrefill = opts.caption || '';
  if (!captionPrefill) {
    try {
      if (window.CaptionPrefill && typeof window.CaptionPrefill.get === 'function') {
        captionPrefill = window.CaptionPrefill.get() || '';
      }
    } catch (_e) { void _e; }
  }
  const enableUpload = !!opts.enableUpload;
  const hidePop = () => pop.style.setProperty('display', 'none', 'important');

  let pop = document.getElementById('_igPreviewPop');
  if (!pop) {
    pop = document.createElement('div');
    pop.id = '_igPreviewPop';
    // [v178 2026-05-18] z-index 9000 → 10020. 챗봇(9999)·편집기(10000)·편집기 sub-modal(10010) 위로 모두 덮음.
    pop.style.cssText = 'position:fixed;inset:0;z-index:10020;background:rgba(0,0,0,0.6);display:flex;align-items:flex-end;justify-content:center;';
    pop.onclick = e => { if (e.target === pop) hidePop(); };
  }
  // [P0b] 잇비 시트가 열려 있으면 시트 panel 내부로 마운트(입력창/시트 뒤로 안 깔림). 매번 재마운트.
  if (window.ItdasyMountOverlay) window.ItdasyMountOverlay(pop);
  else document.body.appendChild(pop);

  const shopName     = (localStorage.getItem('shop_name') || '잇데이 스튜디오');
  const avatarLetter = (shopName[0] || '잇');

  // 미리보기 사진 영역 — ratio 별 aspect-ratio 자동 매핑
  const photoHtml = src
    ? `<div style="position:relative;width:100%;aspect-ratio:${meta.ar};background:#000;overflow:hidden;">
         <img src="${src}" alt="편집본 미리보기" style="width:100%;height:100%;object-fit:cover;display:block;" />
       </div>`
    : `<div style="width:100%;aspect-ratio:${meta.ar};background:#f0f0f0;display:flex;align-items:center;justify-content:center;color:#999;font-size:13px;">사진을 먼저 편집해 주세요</div>`;

  // 비율 배지 (어떤 포맷으로 보여지는지 사장님이 한눈에)
  const ratioBadge = `<span style="display:inline-block;padding:2px 8px;border-radius:8px;background:rgba(213,138,149,0.12);color:var(--accent2,#e26a85);font-size:11px;font-weight:700;margin-left:6px;">${meta.key} · ${meta.w}×${meta.h}</span>`;

  pop.innerHTML = `
    <div style="width:100%;max-width:480px;background:#fff;border-radius:20px 20px 0 0;max-height:92vh;overflow-y:auto;">
      <div style="display:flex;justify-content:center;padding:10px 0 0;">
        <div style="width:36px;height:4px;border-radius:2px;background:rgba(0,0,0,0.12);"></div>
      </div>
      <div style="display:flex;align-items:center;padding:10px 12px 10px;">
        <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888);padding:2px;margin-right:10px;">
          <div style="width:100%;height:100%;border-radius:50%;background:linear-gradient(135deg,var(--accent,#D58A95),var(--accent2,#e26a85));display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;font-weight:800;">${avatarLetter}</div>
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:700;line-height:1.2;">${window._esc ? window._esc(shopName) : shopName}</div>
          <div style="font-size:11px;color:var(--text-subtle,#888);">미리보기 ${ratioBadge}</div>
        </div>
        <button data-ig-preview-x style="background:transparent;border:none;font-size:20px;color:var(--text-subtle,#888);cursor:pointer;margin-left:8px;" aria-label="닫기">×</button>
      </div>
      ${photoHtml}
      <div style="display:flex;align-items:center;gap:14px;padding:10px 12px 4px;">
        <svg style="width:22px;height:22px;" viewBox="0 0 24 24" fill="none" stroke="#262626" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        <svg style="width:22px;height:22px;" viewBox="0 0 24 24" fill="none" stroke="#262626" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
        <svg style="width:22px;height:22px;" viewBox="0 0 24 24" fill="none" stroke="#262626" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        <svg style="width:22px;height:22px;margin-left:auto;" viewBox="0 0 24 24" fill="none" stroke="#262626" stroke-width="2"><polygon points="19 21 12 16 5 21 5 3 19 3 19 21"/></svg>
      </div>
      <!-- [v179 2026-05-18] 캡션 영역 — editable. opts.caption 또는 caption_prefill 자동 채움. -->
      <div style="padding:2px 12px 12px;">
        <div style="font-size:11px;color:var(--text-subtle,#888);font-weight:700;margin-bottom:4px;">캡션 (수정 가능)</div>
        <textarea id="_igPreviewCaption" rows="5" placeholder="캡션을 입력하세요…"
          style="width:100%;padding:10px;border:1px solid #E2D6F7;border-radius:10px;font-size:13px;color:#262626;line-height:1.5;background:#fff;resize:vertical;font-family:inherit;box-sizing:border-box;">${captionPrefill.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</textarea>
        <div style="font-size:11px;color:var(--text-subtle,#888);margin-top:4px;">${captionPrefill ? '자동 생성된 캡션이에요. 사장님 톤으로 다듬어 보세요.' : '메시지에 시술 정보를 같이 적으면 캡션이 자동 생성돼요.'}</div>
      </div>
      <div style="padding:0 12px 28px;display:flex;gap:8px;">
        <button id="_igPreviewClose" style="flex:1;height:46px;border-radius:14px;border:1.5px solid #dbdbdb;background:#fff;color:#262626;font-size:13px;font-weight:700;cursor:pointer;">닫기</button>
        ${enableUpload
          ? `<button id="_igPreviewUpload" data-igpv-src="${src}" style="flex:1.6;height:46px;border-radius:14px;border:none;background:linear-gradient(135deg,var(--accent,#D58A95),var(--accent2,#e26a85));color:#fff;font-size:13px;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;">📤 인스타에 올리기</button>`
          : `<button id="_igPreviewCaptionBtn" style="flex:1.4;height:46px;border-radius:14px;border:none;background:linear-gradient(135deg,var(--accent,#D58A95),var(--accent2,#e26a85));color:#fff;font-size:13px;font-weight:800;cursor:pointer;">캡션 만들기</button>`}
      </div>
    </div>
  `;
  pop.style.setProperty('display', 'flex', 'important');
  pop.querySelector('[data-ig-preview-x]')?.addEventListener('click', hidePop);

  // [v179 2026-05-18] 버튼 핸들러 바인딩 (innerHTML 재적용 후 항상 새로 wire)
  const closeBtn = pop.querySelector('#_igPreviewClose');
  if (closeBtn) closeBtn.onclick = hidePop;
  const captionBtn = pop.querySelector('#_igPreviewCaptionBtn');
  if (captionBtn) {
    captionBtn.onclick = () => {
      hidePop();
      if (typeof window.openCaptionScenarioPopup === 'function') window.openCaptionScenarioPopup();
    };
  }
  const upBtn = pop.querySelector('#_igPreviewUpload');
  if (upBtn) {
    upBtn.onclick = async () => {
      const captionEl = pop.querySelector('#_igPreviewCaption');
      const finalCaption = captionEl ? captionEl.value.trim() : '';
      const dataUrl = upBtn.dataset.igpvSrc || src;
      const apiBase = window.API || '';
      const baseHeaders = window.authHeader ? Object.assign({}, window.authHeader()) : {};

      const originalLabel = upBtn.textContent;
      upBtn.disabled = true;
      upBtn.textContent = '확인 중…';

      // [v182] 사전 가드 — /instagram/status connected 확인. 미연동이면 토스트 + 차단.
      try {
        const statusRes = await fetch(apiBase + '/instagram/status', { method: 'GET', headers: baseHeaders });
        const statusData = await statusRes.json().catch(() => ({}));
        if (!statusRes.ok) throw new Error(statusData.detail || 'status check 실패');
        if (!statusData.connected) {
          if (window.showToast) window.showToast('인스타 먼저 연동해주세요. 설정 → Instagram 연동');
          upBtn.disabled = false;
          upBtn.textContent = originalLabel;
          return;
        }
        // [보안감사 M-2 2026-07-26] connected 는 '한 번이라도 연동했나'일 뿐 — 실제 게시 가능 여부는
        //   token_valid 로 봐야 한다(만료·권한철회·Business→Personal 전환 후엔 connected=true 인데 죽은 토큰).
        //   작업실 경로는 이미 tokenValid 를 게이트하는데 이 예전 발행 팝업만 빠져 있어 사후 에러로만 떴다.
        if (statusData.token_valid === false) {
          if (window.showToast) window.showToast('인스타 연동이 끊겼어요 — 설정에서 다시 연결해 주세요');
          upBtn.disabled = false;
          upBtn.textContent = originalLabel;
          return;
        }
      } catch (e) {
        console.warn('[ig-preview] status 확인 실패:', e);
        if (window.showToast) window.showToast('연동 상태 확인 실패: ' + ((e && e.message) || '').slice(0, 60));
        upBtn.disabled = false;
        upBtn.textContent = originalLabel;
        return;
      }

      // Meta 심사 대응 — 발행 전 명시적 사용자 확인
      const confirmMsg = '정말 인스타 피드에 올릴까요?\n발행 후엔 바로 공개돼요.';
      let confirmed = false;
      try {
        if (typeof window.nativeConfirm === 'function') {
          confirmed = await window.nativeConfirm('인스타 발행', confirmMsg);
        } else {
          confirmed = window.confirm(confirmMsg);
        }
      } catch (_) { confirmed = window.confirm(confirmMsg); }
      if (!confirmed) {
        upBtn.disabled = false;
        upBtn.textContent = originalLabel;
        return;
      }

      upBtn.textContent = '올리는 중…';

      try {
        const blobRes = await fetch(dataUrl);
        const blob = await blobRes.blob();
        const fd = new FormData();
        fd.append('image', blob, 'photo.jpg');
        fd.append('caption', finalCaption);
        const res = await fetch(apiBase + '/instagram/publish-file', {
          method: 'POST',
          headers: baseHeaders,  // multipart 일 땐 Content-Type 자동 설정
          body: fd,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.detail || ('HTTP ' + res.status));
        if (window.showToast) window.showToast('인스타 피드에 올라갔어요 🎉');
        if (typeof window.createConfetti === 'function') {
          for (let i = 0; i < 20; i++) setTimeout(window.createConfetti, i * 100);
        }
        try {
          if (window.CaptionPrefill && typeof window.CaptionPrefill.clear === 'function') {
            window.CaptionPrefill.clear();
          }
        } catch (_e) { void _e; }
        hidePop();
      } catch (e) {
        console.warn('[ig-preview] 인스타 발행 실패:', e);
        const msg = (e && e.message) || '알 수 없음';
        if (window.showToast) window.showToast('발행 실패: ' + msg.slice(0, 80));
        upBtn.disabled = false;
        upBtn.textContent = originalLabel;
      }
    };
  }

  // 외부에서 ratio 확인할 수 있게 마지막 상태 노출 (테스트·디버그용)
  window._lastIgPreviewMeta = meta;
  return meta;
}
window.openInstagramPreview = openInstagramPreview;
window.connectInstagram = connectInstagram;
