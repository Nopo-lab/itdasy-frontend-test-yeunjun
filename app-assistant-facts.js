/* 챗봇 영구 메모 + 사장님 프로필 관리 UI (A1 + A4 · 2026-04-30)
   사용:
     window.openAssistantFactsSheet()  — 메모 list + 추가/삭제 모달
   동작:
     - GET /assistant/facts → 활성 메모 list
     - POST /assistant/facts → 새 메모 추가
     - DELETE /assistant/facts/{id} → archive
*/
(function () {
  'use strict';

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  async function _fetch(method, path, body) {
    const headers = window.authHeader ? window.authHeader() : {};
    if (body) headers['Content-Type'] = 'application/json';
    const res = await fetch(window.API + path, {
      method, headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || ('HTTP ' + res.status));
    }
    return res.json().catch(() => ({}));
  }

  function _kindLabel(kind) {
    return { permanent: '영구', preference: '선호', pattern: '자동 학습' }[kind] || '영구';
  }
  function _kindIcon(kind) {
    return { permanent: 'ic-bot', preference: 'ic-star', pattern: 'ic-sparkles' }[kind] || 'ic-bot';
  }
  function _kindColor(kind) {
    return { permanent: '#7C3AED', preference: 'var(--brand)', pattern: '#3B82F6' }[kind] || '#7C3AED';
  }

  function _ensureSheet() {
    let sheet = document.getElementById('assistantFactsSheet');
    if (sheet) return sheet;
    sheet = document.createElement('div');
    sheet.id = 'assistantFactsSheet';
    sheet.style.cssText = 'position:fixed;inset:0;z-index:9990;background:rgba(0,0,0,0.5);display:none;align-items:flex-end;justify-content:center;';
    const _ic = (id, size = 14) => `<svg width="${size}" height="${size}" aria-hidden="true"><use href="#${id}"/></svg>`;
    sheet.innerHTML = `
      <div id="afsCard" style="width:100%;max-width:520px;background:#fff;border-radius:20px 20px 0 0;max-height:88vh;display:flex;flex-direction:column;padding:18px 18px 0;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
          <span style="display:inline-flex;align-items:center;color:#7C3AED;">${_ic('ic-bot', 18)}</span>
          <strong style="font-size:17px;">챗봇 메모</strong>
          <span style="font-size:11px;background:#FAF5FF;color:#5B21B6;padding:2px 8px;border-radius:99px;font-weight:700;">사장님 머릿속</span>
          <button id="afsClose" aria-label="닫기" style="margin-left:auto;background:none;border:none;cursor:pointer;color:#888;display:inline-flex;align-items:center;">${_ic('ic-x', 18)}</button>
        </div>
        <div style="font-size:12px;color:#777;line-height:1.5;margin-bottom:12px;">
          여기 적은 메모는 챗봇이 매번 참고해요. <span style="color:#5B21B6;font-weight:600;">"화요일 오전 예약 안 받음"</span> / <span style="color:#5B21B6;font-weight:600;">"강연준은 글루 알러지"</span> 같은 거.
          <br>챗봇한테 <span style="background:#FAF5FF;padding:1px 6px;border-radius:6px;color:#5B21B6;font-weight:600;">"기억해"</span> 라고 말해도 자동 저장돼요.
        </div>
        <div id="afsAdd" style="display:flex;gap:6px;margin-bottom:10px;">
          <input id="afsInput" type="text" maxlength="500" placeholder="새 메모 (예: 일요일은 휴무)" style="flex:1;padding:11px;border:1px solid #ddd;border-radius:10px;font-size:13px;">
          <button id="afsAddBtn" style="padding:11px 16px;border:none;border-radius:10px;background:linear-gradient(135deg,#7C3AED,#A78BFA);color:#fff;font-weight:700;font-size:13px;cursor:pointer;">+ 추가</button>
        </div>
        <div id="afsList" style="flex:1;overflow-y:auto;padding-bottom:18px;">
          <div style="text-align:center;color:var(--text-subtle);padding:30px 0;font-size:13px;">불러오는 중…</div>
        </div>
      </div>
    `;
    document.body.appendChild(sheet);
    sheet.addEventListener('click', (e) => { if (e.target === sheet) close(); });
    sheet.querySelector('#afsClose').addEventListener('click', close);
    sheet.querySelector('#afsAddBtn').addEventListener('click', _add);
    sheet.querySelector('#afsInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') _add();
    });
    return sheet;
  }

  async function open() {
    const sheet = _ensureSheet();
    const card = sheet.querySelector('#afsCard');
    if (window.SheetAnim) window.SheetAnim.open(sheet, card);
    else sheet.style.display = 'flex';
    await _refresh();
  }
  function close() {
    const sheet = document.getElementById('assistantFactsSheet');
    if (!sheet) return;
    const card = sheet.querySelector('#afsCard');
    if (window.SheetAnim) window.SheetAnim.close(sheet, card);
    else sheet.style.display = 'none';
  }

  async function _refresh() {
    const list = document.getElementById('afsList');
    if (!list) return;
    try {
      const facts = await _fetch('GET', '/assistant/facts');
      if (!facts || !facts.length) {
        list.innerHTML = `<div style="text-align:center;color:var(--text-subtle);padding:30px 0;font-size:13px;line-height:1.6;">
          아직 메모가 없어요.<br>챗봇한테 "기억해" 라고 말하거나 위에 직접 적어주세요.
        </div>`;
        return;
      }
      list.innerHTML = facts.map(f => `
        <div style="display:flex;align-items:flex-start;gap:8px;padding:11px 12px;background:#FAFAFA;border-radius:12px;margin-bottom:8px;">
          <span style="flex-shrink:0;display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;color:${_kindColor(f.kind)};background:${_kindColor(f.kind)}15;padding:3px 8px;border-radius:99px;line-height:1.3;"><svg width="10" height="10" aria-hidden="true"><use href="#${_kindIcon(f.kind)}"/></svg>${_kindLabel(f.kind)}</span>
          <div style="flex:1;font-size:13px;line-height:1.45;color:#333;word-break:break-word;">${_esc(f.text)}</div>
          <button class="afs-del" data-id="${f.id}" style="flex-shrink:0;background:none;border:none;color:var(--text-subtle);cursor:pointer;font-size:14px;padding:0 4px;line-height:1;" title="삭제">✕</button>
        </div>
      `).join('');
      list.querySelectorAll('.afs-del').forEach(b => {
        b.addEventListener('click', async () => {
          if (!confirm('이 메모를 삭제할까요?')) return;
          try {
            await _fetch('DELETE', '/assistant/facts/' + b.dataset.id);
            await _refresh();
            if (window.showToast) window.showToast('삭제됨');
          } catch (e) {
            if (window.showToast) window.showToast('삭제 실패: ' + e.message);
          }
        });
      });
    } catch (e) {
      list.innerHTML = `<div style="text-align:center;color:#dc3545;padding:20px;font-size:12px;">불러오기 실패: ${_esc(e.message)}</div>`;
    }
  }

  async function _add() {
    const inp = document.getElementById('afsInput');
    if (!inp) return;
    const text = inp.value.trim();
    if (text.length < 3) {
      if (window.showToast) window.showToast('3자 이상 입력해 주세요');
      return;
    }
    try {
      await _fetch('POST', '/assistant/facts', { text, kind: 'permanent' });
      inp.value = '';
      await _refresh();
      if (window.showToast) window.showToast('🧠 기억했어요');
    } catch (e) {
      if (window.showToast) window.showToast('저장 실패: ' + e.message);
    }
  }

  window.openAssistantFactsSheet = open;
  window.closeAssistantFactsSheet = close;
})();
