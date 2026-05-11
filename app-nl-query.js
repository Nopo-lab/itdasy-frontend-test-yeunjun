/* v1.3 자연어 DB 조회 — "이번 달 VIP 네일 3회 이상" 같은 질문 → AI 가 SQL 생성 → 결과 테이블 */
(function () {
  'use strict';

  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch])); }

  async function _ask(question) {
    const res = await fetch(window.API + '/nl-query/ask', {
      method: 'POST',
      headers: { ...window.authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'HTTP ' + res.status);
    }
    return await res.json();
  }

  const SUGGESTIONS = [
    '이번 달 매출 8만원 넘는 건 몇 건?',
    '지난 주 완료 예약 고객 이름 목록',
    '방문 5회 이상 VIP 고객',
    '이번 달 제일 잘 나가는 시술 TOP 3',
    '안 옴 2회 이상인 고객',
  ];

  function _renderResult(body, d) {
    if (!d || !d.rows || !d.rows.length) {
      body.innerHTML = `
        <div style="padding:20px;text-align:center;color:#888;">
          <div style="font-size:30px;margin-bottom:8px;">🔍</div>
          <div style="font-size:13px;">해당하는 데이터 없음</div>
          <div style="margin-top:12px;background:#f5f5f5;padding:10px;border-radius:8px;text-align:left;font-family:monospace;font-size:11px;color:var(--text-muted);word-break:break-all;">${_esc(d.sql || '')}</div>
        </div>`;
      return;
    }
    const cols = d.columns || [];
    body.innerHTML = `
      <div style="padding:14px 16px;font-size:12px;color:var(--text-muted);">
        ${d.row_count}개 결과
      </div>
      <div style="padding:0 14px 20px;overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead>
            <tr style="background:#FAFAFA;">
              ${cols.map(c => `<th style="padding:8px;text-align:left;border:1px solid #eee;font-size:11px;color:var(--text-muted);">${_esc(c)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${d.rows.map(r => `
              <tr>${cols.map(c => `<td style="padding:8px;border:1px solid #eee;">${_esc(r[c] == null ? '' : String(r[c]))}</td>`).join('')}</tr>
            `).join('')}
          </tbody>
        </table>
        <details style="margin-top:14px;">
          <summary style="font-size:11px;color:#888;cursor:pointer;">사용된 SQL 보기</summary>
          <div style="margin-top:6px;background:#f5f5f5;padding:10px;border-radius:8px;font-family:monospace;font-size:11px;color:var(--text-muted);word-break:break-all;">${_esc(d.sql || '')}</div>
        </details>
      </div>`;
  }

  async function openNLQuery() {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9400;background:rgba(0,0,0,0.5);display:flex;align-items:flex-end;justify-content:center;';
    overlay.innerHTML = `
      <div style="width:100%;max-width:560px;background:#fafafa;border-radius:24px 24px 0 0;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;">
        <div style="padding:18px 20px 12px;background:#fff;border-bottom:1px solid #eee;">
          <div style="width:36px;height:4px;background:#e0e0e0;border-radius:2px;margin:0 auto 14px;"></div>
          <div style="display:flex;align-items:center;gap:8px;">
            <strong style="font-size:17px;">자연어 데이터 검색</strong>
            <button class="nl-close" style="margin-left:auto;background:none;border:none;font-size:18px;color:#888;cursor:pointer;">✕</button>
          </div>
          <div style="font-size:11px;color:#888;margin-top:6px;">말로 물어보세요 — AI 가 DB 조회해서 답해드려요</div>
        </div>
        <div style="padding:14px;display:flex;gap:8px;">
          <input class="nl-q" placeholder="예: 이번 달 매출 8만원 넘는 건 몇 건?" style="flex:1;padding:11px 14px;border:1px solid #ddd;border-radius:10px;font-size:14px;">
          <button class="nl-go" style="padding:11px 16px;border:none;background:linear-gradient(135deg,var(--brand),var(--brand-strong));color:#fff;border-radius:10px;font-weight:800;cursor:pointer;">🔍</button>
        </div>
        <div style="padding:0 14px;display:flex;flex-wrap:wrap;gap:6px;">
          ${SUGGESTIONS.map(s => `<button data-sug="${_esc(s)}" style="padding:6px 10px;font-size:11px;border:1px solid #ddd;background:#fff;border-radius:100px;cursor:pointer;color:var(--text-muted);">${_esc(s)}</button>`).join('')}
        </div>
        <div class="nl-body" style="flex:1;overflow-y:auto;padding:10px 0;"></div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('.nl-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    const input = overlay.querySelector('.nl-q');
    const goBtn = overlay.querySelector('.nl-go');
    const body = overlay.querySelector('.nl-body');

    async function run() {
      const q = input.value.trim();
      if (!q) return;
      body.innerHTML = `<div style="padding:40px;text-align:center;">
        <div style="font-size:30px;animation:nl-pulse 1.2s ease-in-out infinite;">🤖</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:8px;">AI 가 데이터 찾는 중…</div>
        <style>@keyframes nl-pulse{0%,100%{opacity:.4;}50%{opacity:1;}}</style>
      </div>`;
      try {
        const d = await _ask(q);
        _renderResult(body, d);
      } catch (e) {
        body.innerHTML = `<div style="padding:40px;text-align:center;color:#c00;">오류: ${_esc(e.message)}</div>`;
      }
    }

    goBtn.addEventListener('click', run);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
    overlay.querySelectorAll('[data-sug]').forEach(btn => {
      btn.addEventListener('click', () => { input.value = btn.dataset.sug; run(); });
    });
  }

  window.openNLQuery = openNLQuery;
})();
