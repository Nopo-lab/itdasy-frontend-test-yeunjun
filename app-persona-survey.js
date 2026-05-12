/* ─────────────────────────────────────────────────────────────
   app-persona-survey.js
   인스타 말투 분석 직후 자동으로 띄우는 "테스트 메시지 작성" 설문 팝업.

   3카드 UX:
     [신규]    → 시술 종류 선택 → POST /caption/generate (segment=new)
     [단골]    → 시술 종류 선택 → POST /caption/generate (segment=vip)
     [직접작성] → 자유 텍스트 입력 → POST /caption/generate

   분석된 말투 fingerprint(persona)는 백엔드 /caption/generate 가 자동 사용.
   복원 출처: 5260425 에서 components/persona-popup.js 가 삭제되며 사라짐.

   export(window): openPersonaSurveyModal(), closePersonaSurveyModal()
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  // ── 상수 — [2026-04-29] 헤어/속눈썹/왁싱/피부/반영구 시술 프리셋 추가 ──
  const SERVICE_PRESETS = {
    '붙임머리': ['키크니 붙임머리', '큐티클 익스텐션', '페더 붙임머리', '뿌리 풍성', '볼륨 보강'],
    '네일아트': ['젤네일', '아트네일', '연장(스컬)', '페디', '케어'],
    '헤어샵':   ['커트', '드라이', '디지털 펌', '매직 스트레이트', '뿌리 염색', '전체 염색'],
    '헤어':     ['커트', '드라이', '디지털 펌', '매직 스트레이트', '뿌리 염색', '전체 염색'],
    '속눈썹':   ['속눈썹펌', '래쉬리프트', '클래식 래쉬', '러시안 볼륨', '메가 볼륨', '리터치'],
    '왁싱':     ['브라질리언', '하프 다리', '풀 다리', '겨드랑이', '얼굴 솜털', '눈썹'],
    '피부':     ['딥클렌징', '모공 관리', '수분 관리', '브라이트닝', '리프팅', '여드름 관리'],
    '반영구':   ['눈썹 자연눈썹', '눈썹 콤보', '아이라인', '입술 (립블러쉬)', '두피 SMP'],
    'beauty':   ['시술 1', '시술 2', '시술 3'],
  };

  // ── 스타일 1회 주입 ─────────────────────────────────────
  const PSV_CSS = `
.psv-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.7);
  z-index:9700; display:flex; align-items:flex-end;
  justify-content:center; animation:psv-bg-in .2s ease; }
@keyframes psv-bg-in { from{opacity:0} to{opacity:1} }
.psv-sheet { width:100%; max-width:480px; background:#fff; border-radius:24px 24px 0 0;
  padding:24px 20px 36px; box-sizing:border-box; max-height:92vh; overflow-y:auto;
  animation:psv-sheet-in .25s cubic-bezier(.32,1.1,.68,1); }
@keyframes psv-sheet-in { from{transform:translateY(40px);opacity:0} to{transform:none;opacity:1} }
.psv-handle { width:40px; height:4px; background:#e0e0e0; border-radius:2px; margin:0 auto 18px; }
.psv-title { font-size:20px; font-weight:800; color:var(--text); margin-bottom:6px; line-height:1.35; }
.psv-sub   { font-size:13px; color:var(--text3); margin-bottom:20px; line-height:1.55; }
.psv-card-row { display:flex; gap:10px; flex-wrap:wrap; }
.psv-card { flex:1 1 0; min-width:0; background:#fff;
  border:1.5px solid rgba(241,128,145,0.18); border-radius:14px;
  padding:18px 12px; cursor:pointer; transition:all .15s; text-align:center;
  display:flex; flex-direction:column; align-items:center; gap:6px; min-height:140px; }
.psv-card:hover { border-color:var(--accent2); transform:translateY(-2px);
  box-shadow:0 8px 22px rgba(241,128,145,0.18); }
.psv-card svg { width:30px; height:30px; color:var(--accent2); }
.psv-card strong { font-size:14px; font-weight:800; color:var(--text); }
.psv-card p { font-size:11px; color:var(--text3); line-height:1.4;
  word-break:keep-all; margin:0; }
.psv-back { background:none; border:none; color:var(--text3); font-size:13px;
  font-weight:600; cursor:pointer; padding:6px 0; margin-bottom:12px; }
.psv-label { display:block; font-size:13px; font-weight:700; color:var(--text);
  margin-bottom:8px; }
.psv-select, .psv-textarea, .psv-input {
  width:100%; padding:12px 14px; border:1.5px solid #e8e8e8; border-radius:14px;
  font-size:14px; box-sizing:border-box; font-family:inherit; background:#fff;
  color:var(--text); }
.psv-textarea { min-height:88px; resize:vertical; line-height:1.5; }
.psv-select:focus, .psv-textarea:focus, .psv-input:focus {
  outline:none; border-color:var(--accent2); }
.psv-primary { width:100%; padding:15px; border-radius:14px; border:none;
  background:linear-gradient(135deg, var(--accent), var(--accent2));
  color:#fff; font-size:15px; font-weight:800; cursor:pointer;
  margin-top:14px; transition:opacity .12s; }
.psv-primary:active { opacity:.85; }
.psv-primary:disabled { opacity:.5; cursor:not-allowed; }
.psv-result-box { background:#fafafa; border:1.5px solid #eee; border-radius:14px;
  padding:16px; font-size:14px; line-height:1.65; color:var(--text);
  white-space:pre-wrap; margin-bottom:14px; word-break:keep-all; min-height:120px; }
.psv-loading { text-align:center; padding:32px 0; color:var(--text3); font-size:14px; }
.psv-loading-dot { display:inline-block; width:8px; height:8px; border-radius:50%;
  background:var(--accent2); margin:0 3px; animation:psv-bounce 1.2s infinite; }
.psv-loading-dot:nth-child(2) { animation-delay:.15s; }
.psv-loading-dot:nth-child(3) { animation-delay:.3s; }
@keyframes psv-bounce { 0%,80%,100%{transform:scale(0.6);opacity:.4} 40%{transform:scale(1);opacity:1} }
.psv-action-row { display:flex; gap:8px; }
.psv-action-row .psv-primary { flex:1; margin-top:0; }
.psv-ghost { padding:13px 18px; border-radius:14px; border:1.5px solid #e8e8e8;
  background:#fff; font-size:13px; font-weight:700; cursor:pointer; color:var(--text); }
.psv-ghost:active { background:#f5f5f5; }
`;

  function _injectStyles() {
    if (document.getElementById('psv-styles')) return;
    const el = document.createElement('style');
    el.id = 'psv-styles';
    el.textContent = PSV_CSS;
    document.head.appendChild(el);
  }

  // ── 상태 ────────────────────────────────────────────────
  let _overlay = null;
  let _state = { step: 0, intent: null, service: null, customText: '', result: '' };

  // ── DOM 빌드 ────────────────────────────────────────────
  function _build() {
    if (_overlay) return;
    _injectStyles();
    _overlay = document.createElement('div');
    _overlay.className = 'psv-overlay';
    _overlay.id = 'personaSurveyModal';
    _overlay.addEventListener('click', (e) => {
      if (e.target === _overlay) close();
    });
    const sheet = document.createElement('div');
    sheet.className = 'psv-sheet';
    sheet.id = 'psv-sheet';
    sheet.innerHTML = '<div class="psv-handle"></div><div id="psv-body"></div>';
    _overlay.appendChild(sheet);
    document.body.appendChild(_overlay);
  }

  function close() {
    if (_overlay) { _overlay.remove(); _overlay = null; }
    _state = { step: 0, intent: null, service: null, customText: '', result: '' };
  }

  // ── 토스트 (showToast 가 있으면 활용) ──────────────────
  function _toast(msg, type) {
    if (typeof window.showToast === 'function') return window.showToast(msg, type);
  }

  // ── Step 0: 인스타 연동/분석 안 된 경우 ────────────────
  // [2026-04-26] 빈약하던 안내 화면을 액션 가능 화면으로 보강.
  //   - 인스타 미연동/분석 미완료 라도, 사용자가 직접 분석/연동/테스트 진입 가능.
  function _renderNoAnalysis(reason) {
    const body = document.getElementById('psv-body');
    const hasToken = !!(typeof window.getToken === 'function' ? window.getToken() : localStorage.getItem('itdasy_token::staging'));
    const hasInsta = !!localStorage.getItem('itdasy_latest_analysis');
    body.innerHTML = `
      <div class="psv-title">AI 페르소나</div>
      <div class="psv-sub">${reason || '아직 말투 분석 데이터가 없어요. 아래에서 시작해보세요.'}</div>
      <div style="display:flex; flex-direction:column; gap:10px; margin-top:8px;">
        <button class="psv-primary" id="psv-start-analyze">내 말투 분석 시작 (인스타 게시물 학습)</button>
        <button class="psv-ghost" id="psv-connect-insta" style="width:100%;">인스타 다시 연동하기</button>
        <button class="psv-ghost" id="psv-force-survey" style="width:100%;">분석 없이 테스트 메시지 만들기</button>
        <button class="psv-ghost" id="psv-close" style="width:100%;">닫기</button>
      </div>
    `;
    const $a = document.getElementById('psv-start-analyze');
    const $c = document.getElementById('psv-connect-insta');
    const $f = document.getElementById('psv-force-survey');
    const $x = document.getElementById('psv-close');
    if ($a) $a.addEventListener('click', () => {
      close();
      if (typeof window.runPersonaAnalyze === 'function') {
        try { window.runPersonaAnalyze(); } catch (_) { _toast('분석 시작 실패 — 잠시 후 다시 시도'); }
      } else {
        _toast('인스타 연동 후 다시 시도해주세요');
      }
    });
    if ($c) $c.addEventListener('click', () => {
      close();
      if (typeof window.connectInstagram === 'function') {
        try { window.connectInstagram(); } catch (_) { /* ignore */ }
      } else {
        _toast('인스타 연동 진입점을 찾을 수 없어요');
      }
    });
    if ($f) $f.addEventListener('click', _renderStep1);
    if ($x) $x.addEventListener('click', close);
    // 사용 안 하는 변수 lint 회피
    void hasToken; void hasInsta;
  }

  // ── Step 1: 3카드 ───────────────────────────────────────
  function _renderStep1() {
    _state.step = 1;
    const body = document.getElementById('psv-body');
    body.innerHTML = `
      <div class="psv-title">말투 테스트 작성</div>
      <div class="psv-sub">분석된 말투로 어떤 메시지를 만들어볼까요?</div>
      <div class="psv-card-row">
        <button class="psv-card" data-survey="new">
          <i class="ph-duotone ph-sparkle" aria-hidden="true"></i>
          <strong>신규 고객</strong>
          <p>처음 오신 분께<br/>보내는 환영 메시지</p>
        </button>
        <button class="psv-card" data-survey="regular">
          <i class="ph-duotone ph-star" aria-hidden="true"></i>
          <strong>단골 고객</strong>
          <p>오랜만에<br/>전하는 안부 인사</p>
        </button>
        <button class="psv-card" data-survey="custom">
          <i class="ph-duotone ph-pencil-simple" aria-hidden="true"></i>
          <strong>직접 작성</strong>
          <p>메시지 의도를<br/>직접 입력</p>
        </button>
      </div>
      <div style="margin-top:18px; display:flex; gap:8px; flex-wrap:wrap;">
        <button class="psv-ghost" id="psv-reanalyze" style="flex:1; min-width:0;">말투 새로 분석</button>
        <button class="psv-ghost" id="psv-view-report" style="flex:1; min-width:0;">분석 리포트 보기</button>
      </div>
    `;
    body.querySelectorAll('.psv-card').forEach((btn) => {
      btn.addEventListener('click', () => {
        _state.intent = btn.getAttribute('data-survey');
        if (_state.intent === 'custom') _renderStep2Custom();
        else _renderStep2Service();
      });
    });
    const $r = document.getElementById('psv-reanalyze');
    const $v = document.getElementById('psv-view-report');
    if ($r) $r.addEventListener('click', () => {
      close();
      if (typeof window.runPersonaAnalyze === 'function') window.runPersonaAnalyze(true);
      else _toast('인스타 연동 후 분석할 수 있어요');
    });
    if ($v) $v.addEventListener('click', () => {
      close();
      if (typeof window.showDetailedAnalysis === 'function') window.showDetailedAnalysis();
      else _toast('분석 리포트가 아직 없어요');
    });
  }

  // ── Step 2-A: 신규/단골 — 시술 종류 선택 ───────────────
  function _renderStep2Service() {
    _state.step = 2;
    const body = document.getElementById('psv-body');
    const shopType = (localStorage.getItem('shop_type') || '붙임머리');
    const services = SERVICE_PRESETS[shopType] || SERVICE_PRESETS['beauty'];
    const intentKr = _state.intent === 'new' ? '신규 고객' : '단골 고객';
    const optionsHtml = services.map((s) => `<option value="${s}">${s}</option>`).join('');
    body.innerHTML = `
      <button class="psv-back" id="psv-back-btn">‹ 뒤로</button>
      <div class="psv-title">${intentKr}께 보낼 메시지</div>
      <div class="psv-sub">어떤 시술을 받으셨는지 골라주세요.</div>
      <label class="psv-label">시술 종류</label>
      <select class="psv-select" id="psv-service">
        ${optionsHtml}
      </select>
      <button class="psv-primary" id="psv-go-btn">분석된 말투로 만들기</button>
    `;
    document.getElementById('psv-back-btn').addEventListener('click', _renderStep1);
    document.getElementById('psv-go-btn').addEventListener('click', () => {
      _state.service = document.getElementById('psv-service').value;
      _generateMessage();
    });
  }

  // ── Step 2-B: 직접작성 — 자유 입력 ─────────────────────
  function _renderStep2Custom() {
    _state.step = 2;
    const body = document.getElementById('psv-body');
    body.innerHTML = `
      <button class="psv-back" id="psv-back-btn">‹ 뒤로</button>
      <div class="psv-title">메시지 의도 입력</div>
      <div class="psv-sub">어떤 상황·내용으로 글을 쓸지 한두 줄로 적어주세요.</div>
      <label class="psv-label">예: "시술 후 후기 부탁 멘트", "재방문 감사 인사"</label>
      <textarea class="psv-textarea" id="psv-custom"
        placeholder="시술 마무리 후 손님께 보낼 짧은 메시지"></textarea>
      <button class="psv-primary" id="psv-go-btn">분석된 말투로 만들기</button>
    `;
    document.getElementById('psv-back-btn').addEventListener('click', _renderStep1);
    document.getElementById('psv-go-btn').addEventListener('click', () => {
      const txt = document.getElementById('psv-custom').value.trim();
      if (txt.length < 5) { _toast('조금만 더 자세히 적어주세요'); return; }
      _state.customText = txt;
      _generateMessage();
    });
  }

  // ── Step 3: 생성 결과 ──────────────────────────────────
  function _renderLoading() {
    _state.step = 3;
    const body = document.getElementById('psv-body');
    body.innerHTML = `
      <div class="psv-title">말투로 메시지 만드는 중</div>
      <div class="psv-sub">분석된 사장님 말투를 입혀 작성하고 있어요.</div>
      <div class="psv-loading">
        <span class="psv-loading-dot"></span>
        <span class="psv-loading-dot"></span>
        <span class="psv-loading-dot"></span>
      </div>
    `;
  }

  function _renderResult(text) {
    _state.step = 3;
    _state.result = text;
    const body = document.getElementById('psv-body');
    body.innerHTML = `
      <div class="psv-title">테스트 메시지 완성</div>
      <div class="psv-sub">분석된 말투로 작성된 결과입니다.</div>
      <div class="psv-result-box" id="psv-result">${_escape(text)}</div>
      <div class="psv-action-row">
        <button class="psv-ghost" id="psv-retry-btn">다시</button>
        <button class="psv-primary" id="psv-done-btn">맘에 들어요</button>
      </div>
    `;
    document.getElementById('psv-retry-btn').addEventListener('click', _generateMessage);
    document.getElementById('psv-done-btn').addEventListener('click', () => {
      try { localStorage.setItem('_first_caption_done', '1'); } catch (_e) { void _e; }
      _toast('좋아요! 캡션 탭에서 정식 글을 만들어보세요');
      close();
    });
  }

  function _escape(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
    }[c]));
  }

  // ── 백엔드 호출 ────────────────────────────────────────
  async function _generateMessage() {
    _renderLoading();
    const shopType = (localStorage.getItem('shop_type') || '붙임머리');
    const intent = _state.intent;
    let description, segment;
    if (intent === 'new') {
      segment = 'new';
      description = `${shopType} ${_state.service} 시술. 처음 오신 신규 손님. 만족스러운 결과.`;
    } else if (intent === 'regular') {
      segment = 'vip';
      description = `${shopType} ${_state.service} 시술. 자주 와주시는 단골 손님. 오랜만 안부 인사.`;
    } else {
      segment = null;
      description = _state.customText;
    }

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (typeof window.authHeader === 'function') {
        Object.assign(headers, window.authHeader());
      }
      const apiBase = window.API || '';
      const res = await fetch(apiBase + '/caption/generate', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          description,
          platform: 'instagram',
          customer_segment: segment,
        }),
      });
      if (!res.ok) {
        let detail = '';
        try { const j = await res.json(); detail = j.detail || ''; } catch (_e) { void _e; }
        _renderResult('생성에 실패했어요. 잠시 후 다시 시도해주세요.\n\n' + (detail || '서버 응답: ' + res.status));
        return;
      }
      const data = await res.json();
      const text = (data.caption || '').trim() || '메시지가 비어있어요. 다시 시도해주세요.';
      _renderResult(text);
    } catch (e) {
      _renderResult('네트워크 오류가 발생했어요. 잠시 후 다시 시도해주세요.');
    }
  }

  // ── public: 진입점 ─────────────────────────────────────
  /**
   * 인스타 분석 결과 유무를 검사하고 팝업을 연다.
   * - 분석 데이터 있음 → Step 1 (3카드)
   * - 분석 진행 중   → 안내 화면
   * @param {Object} opts { force: boolean } — true 면 분석 없어도 강제 오픈
   */
  function open(opts) {
    opts = opts || {};
    _build();
    let raw = {};
    try { raw = JSON.parse(localStorage.getItem('itdasy_latest_analysis') || '{}'); }
    catch (_e) { void _e; raw = {}; }

    const hasAnalysis = !!(raw && (raw.tone_summary || raw.style_summary));
    if (!hasAnalysis && !opts.force) {
      _renderNoAnalysis();
      return;
    }
    _renderStep1();
  }

  // 글로벌 노출
  window.openPersonaSurveyModal = open;
  window.closePersonaSurveyModal = close;
})();
