/**
 * AI 생성 콘텐츠 신고 (Apple Guideline 1.5)
 *
 * 사용:
 *   window.openContentReport({
 *     contentType: 'caption' | 'image' | 'chat_answer' | 'other',
 *     snippet: '신고 대상 텍스트/URL',
 *     source: '/caption/generate',  // optional
 *   });
 *
 * 자동 연결: data-report-ai 속성 가진 버튼 클릭 시 가장 가까운 data-ai-snippet 요소 스니펫으로 오픈.
 */
(function () {
  /* [잇비 전수QA 2026-09-11] **원장님이 실제로 겪는 문제를 담을 칸이 없었다.**
     기존 분류는 전부 '안전' 축(Apple 1.5)이다. "답이 틀렸어요"·"엉뚱해요"·"못 알아들어요"
     는 전부 '기타' 로 들어왔고, 들어와도 **어느 대화의 어느 턴인지** 를 안 담아서
     개발자가 재현할 수가 없었다. 품질 5종을 앞에 두고(원장님이 제일 먼저 고를 것들),
     신고에 재현 좌표(conversation/turn/intent/build)를 같이 보낸다.
     이름은 백엔드 `REPORT_CATEGORIES`·`itbi_telemetry.QUALITY_LABELS` 와 같은 말을 쓴다. */
  const CATEGORY_LABELS = {
    wrong_answer: '답이 틀렸어요',
    not_understood: '질문을 이해하지 못했어요',
    irrelevant: '엉뚱한 답이에요',
    outdated: '정보가 오래됐어요',
    bad_recommendation: '추천질문이 이상해요',
    offensive: '욕설/비방/혐오 표현',
    sexual: '선정적/성적 표현',
    violence: '폭력/위협',
    misinformation: '거짓/허위 정보',
    privacy: '개인정보 노출',
    copyright: '저작권 침해',
    spam: '스팸/광고',
    other: '기타',
  };
  // 캡션·이미지 신고엔 대화 품질 분류가 의미 없다 — 화면마다 보이는 목록을 가른다.
  const QUALITY_KEYS = ['wrong_answer', 'not_understood', 'irrelevant', 'outdated', 'bad_recommendation'];

  let _pending = null;
  let _inFlight = false;

  function ensureModal() {
    if (document.getElementById('aiContentReportModal')) return;
    const html = `
      <div id="aiContentReportModal" style="display:none;position:fixed;inset:0;z-index:10050;background:rgba(0,0,0,0.55);align-items:center;justify-content:center;padding:20px;">
        <div style="background:#fff;border-radius:16px;max-width:440px;width:100%;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.25);">
          <div style="padding:18px 20px 12px;background:linear-gradient(135deg,#fff7ed,#fed7aa);border-bottom:1px solid #fde68a;">
            <div style="font-size:18px;font-weight:800;color:#9a3412;letter-spacing:-0.3px;">🚩 AI 콘텐츠 신고</div>
            <div style="font-size:12px;color:#78350f;margin-top:4px;line-height:1.5;">24시간 내 검토 후 처리해 드립니다.</div>
          </div>
          <div style="padding:16px 20px;max-height:60vh;overflow-y:auto;">
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px;">신고 대상</div>
            <div id="aiReportSnippet" style="background:#f7f7f9;padding:10px 12px;border-radius:8px;font-size:12px;color:#333;line-height:1.6;margin-bottom:14px;max-height:80px;overflow:hidden;text-overflow:ellipsis;"></div>

            <label style="display:block;font-size:12px;color:var(--text-muted);margin-bottom:6px;">분류 *</label>
            <select id="aiReportCategory" style="width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;margin-bottom:14px;box-sizing:border-box;"></select>

            <label style="display:block;font-size:12px;color:var(--text-muted);margin-bottom:6px;">상세 설명 (선택)</label>
            <textarea id="aiReportDetail" maxlength="1000" rows="3" placeholder="구체적인 문제점을 적어주시면 처리가 빨라져요." style="width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:13px;resize:vertical;box-sizing:border-box;font-family:inherit;"></textarea>

            <div id="aiReportError" style="display:none;margin-top:8px;font-size:12px;color:#b00020;"></div>
          </div>
          <div style="display:flex;gap:8px;padding:0 20px 20px;">
            <button type="button" data-content-report-close style="flex:1;padding:12px;border-radius:10px;border:1px solid #ddd;background:#fff;color:#555;font-size:14px;font-weight:600;cursor:pointer;">취소</button>
            <button type="button" id="aiReportSubmitBtn" data-content-report-submit style="flex:1;padding:12px;border-radius:10px;border:none;background:linear-gradient(135deg,#f97316,#ea580c);color:#fff;font-size:14px;font-weight:700;cursor:pointer;">신고 제출</button>
          </div>
        </div>
      </div>`;
    const wrap = document.createElement('div');
    wrap.innerHTML = html;
    document.body.appendChild(wrap.firstElementChild);
    document.querySelector('[data-content-report-close]')?.addEventListener('click', () => closeContentReport());
    document.querySelector('[data-content-report-submit]')?.addEventListener('click', () => submitContentReport());
  }

  window.openContentReport = function (opts) {
    ensureModal();
    const type = (opts && opts.contentType) || 'other';
    const trace = (opts && opts.trace) || {};
    _pending = {
      content_type: type,
      content_snippet: String((opts && opts.snippet) || '').slice(0, 2000) || '(내용 없음)',
      source_endpoint: (opts && opts.source) || '',
      // 재현 좌표 — 값이 없으면 키 자체를 안 보낸다(옛 백엔드와도 호환).
      ...(trace.conversation_id ? { conversation_id: trace.conversation_id } : {}),
      ...(trace.turn_id != null ? { turn_id: trace.turn_id } : {}),
      ...(trace.intent ? { intent: String(trace.intent).slice(0, 64) } : {}),
      ...(trace.user_question ? { user_question: String(trace.user_question).slice(0, 500) } : {}),
      ...(trace.app_build ? { app_build: String(trace.app_build).slice(0, 64) } : {}),
    };
    document.getElementById('aiReportSnippet').textContent = _pending.content_snippet;
    const sel = document.getElementById('aiReportCategory');
    const keys = Object.keys(CATEGORY_LABELS)
      .filter((k) => type === 'chat_answer' || !QUALITY_KEYS.includes(k));
    sel.innerHTML = keys.map((k) => `<option value="${k}">${CATEGORY_LABELS[k]}</option>`).join('');
    sel.value = type === 'chat_answer' ? 'wrong_answer' : 'other';
    document.getElementById('aiReportDetail').value = '';
    const err = document.getElementById('aiReportError'); if (err) err.style.display = 'none';
    const btn = document.getElementById('aiReportSubmitBtn'); if (btn) { btn.disabled = false; btn.textContent = '신고 제출'; }
    document.getElementById('aiContentReportModal').style.display = 'flex';
    /* [2026-09-09] 뒤로가기 등록 — 전체화면 오버레이는 back 으로 자기가 닫혀야 한다.
       안 하면 back 이 이 창 대신 뒤 화면을 닫아 작성 중이던 내용이 날아간다. */
    try { window._bindSheetBack && window._bindSheetBack('aiContentReport', document.getElementById('aiContentReportModal'), () => { document.getElementById('aiContentReportModal').style.display = 'none'; }); } catch (_bsb) { void _bsb; }
  };

  window.closeContentReport = function () {
    const m = document.getElementById('aiContentReportModal');
    if (m) m.style.display = 'none';
    _pending = null;
  };

  window.submitContentReport = async function () {
    if (_inFlight || !_pending) return;
    const category = document.getElementById('aiReportCategory').value;
    const detail = (document.getElementById('aiReportDetail').value || '').slice(0, 1000);
    const err = document.getElementById('aiReportError');
    const btn = document.getElementById('aiReportSubmitBtn');
    _inFlight = true;
    if (btn) { btn.disabled = true; btn.textContent = '제출 중...'; }
    try {
      const token = (window.getToken && window.getToken()) || '';
      const base = (window.API || (typeof API_BASE !== 'undefined' ? API_BASE : ''));
      const authHeaders = (window.authHeader && window.authHeader()) || (token ? { Authorization: `Bearer ${token}` } : {});
      const res = await fetch(`${base}/moderation/report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({ ..._pending, category, detail }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || `신고 접수 실패 (${res.status})`);
      }
      const data = await res.json();
      closeContentReport();
      showToast(`신고 접수 완료 · 티켓 ${data.ticket_id} · 24h 내 검토`, { type: 'success', duration: 3600 });
    } catch (e) {
      if (err) { err.textContent = e.message || '신고 제출 중 오류. 잠시 후 다시 시도해주세요.'; err.style.display = 'block'; }
      if (btn) { btn.disabled = false; btn.textContent = '신고 제출'; }
    } finally {
      _inFlight = false;
    }
  };

  // data-report-ai 버튼 자동 연결
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-report-ai]');
    if (!btn) return;
    e.preventDefault();
    const contentType = btn.dataset.reportAi || 'other';
    let snippet = btn.dataset.snippet || '';
    if (!snippet) {
      const root = btn.closest('[data-ai-snippet]');
      if (root) snippet = root.dataset.aiSnippet || root.textContent || '';
    }
    let trace = {};
    try { trace = JSON.parse(btn.dataset.trace || '{}') || {}; } catch (_te) { trace = {}; }
    window.openContentReport({ contentType, snippet, source: btn.dataset.source || '', trace });
  }, true);
})();
