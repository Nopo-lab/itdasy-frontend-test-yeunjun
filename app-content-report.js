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
  const CATEGORY_LABELS = {
    offensive: '욕설/비방/혐오 표현',
    sexual: '선정적/성적 표현',
    violence: '폭력/위협',
    misinformation: '거짓/허위 정보',
    privacy: '개인정보 노출',
    copyright: '저작권 침해',
    spam: '스팸/광고',
    other: '기타',
  };

  let _pending = null;
  let _inFlight = false;

  function ensureModal() {
    if (document.getElementById('aiContentReportModal')) return;
    const html = `
      <div id="aiContentReportModal" style="display:none;position:fixed;inset:0;z-index:9700;background:rgba(0,0,0,0.55);align-items:center;justify-content:center;padding:20px;">
        <div style="background:#fff;border-radius:16px;max-width:440px;width:100%;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.25);">
          <div style="padding:18px 20px 12px;background:linear-gradient(135deg,#fff7ed,#fed7aa);border-bottom:1px solid #fde68a;">
            <div style="font-size:18px;font-weight:800;color:#9a3412;letter-spacing:-0.3px;">🚩 AI 콘텐츠 신고</div>
            <div style="font-size:12px;color:#78350f;margin-top:4px;line-height:1.5;">24시간 내 검토 후 처리해 드립니다.</div>
          </div>
          <div style="padding:16px 20px;max-height:60vh;overflow-y:auto;">
            <div style="font-size:12px;color:#666;margin-bottom:4px;">신고 대상</div>
            <div id="aiReportSnippet" style="background:#f7f7f9;padding:10px 12px;border-radius:8px;font-size:12px;color:#333;line-height:1.6;margin-bottom:14px;max-height:80px;overflow:hidden;text-overflow:ellipsis;"></div>

            <label style="display:block;font-size:12px;color:#666;margin-bottom:6px;">분류 *</label>
            <select id="aiReportCategory" style="width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;margin-bottom:14px;box-sizing:border-box;">
              ${Object.entries(CATEGORY_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
            </select>

            <label style="display:block;font-size:12px;color:#666;margin-bottom:6px;">상세 설명 (선택)</label>
            <textarea id="aiReportDetail" maxlength="1000" rows="3" placeholder="구체적인 문제점을 적어주시면 처리가 빨라져요." style="width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:13px;resize:vertical;box-sizing:border-box;font-family:inherit;"></textarea>

            <div id="aiReportError" style="display:none;margin-top:8px;font-size:12px;color:#b00020;"></div>
          </div>
          <div style="display:flex;gap:8px;padding:0 20px 20px;">
            <button type="button" onclick="closeContentReport()" style="flex:1;padding:12px;border-radius:10px;border:1px solid #ddd;background:#fff;color:#555;font-size:14px;font-weight:600;cursor:pointer;">취소</button>
            <button type="button" id="aiReportSubmitBtn" onclick="submitContentReport()" style="flex:1;padding:12px;border-radius:10px;border:none;background:linear-gradient(135deg,#f97316,#ea580c);color:#fff;font-size:14px;font-weight:700;cursor:pointer;">신고 제출</button>
          </div>
        </div>
      </div>`;
    const wrap = document.createElement('div');
    wrap.innerHTML = html;
    document.body.appendChild(wrap.firstElementChild);
  }

  window.openContentReport = function (opts) {
    ensureModal();
    _pending = {
      content_type: (opts && opts.contentType) || 'other',
      content_snippet: String((opts && opts.snippet) || '').slice(0, 2000) || '(내용 없음)',
      source_endpoint: (opts && opts.source) || '',
    };
    document.getElementById('aiReportSnippet').textContent = _pending.content_snippet;
    document.getElementById('aiReportCategory').value = 'other';
    document.getElementById('aiReportDetail').value = '';
    const err = document.getElementById('aiReportError'); if (err) err.style.display = 'none';
    const btn = document.getElementById('aiReportSubmitBtn'); if (btn) { btn.disabled = false; btn.textContent = '신고 제출'; }
    document.getElementById('aiContentReportModal').style.display = 'flex';
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
      const token = (typeof getToken === 'function') ? getToken() : localStorage.getItem('itdasy_token::staging');
      const base = (typeof API_BASE !== 'undefined') ? API_BASE : '';
      const res = await fetch(`${base}/moderation/report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({ ..._pending, category, detail }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || `신고 접수 실패 (${res.status})`);
      }
      const data = await res.json();
      closeContentReport();
      alert(`신고가 접수되었어요.\n티켓: ${data.ticket_id}\n24시간 내에 검토해드릴게요.`);
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
    window.openContentReport({ contentType, snippet, source: btn.dataset.source || '' });
  }, true);
})();
