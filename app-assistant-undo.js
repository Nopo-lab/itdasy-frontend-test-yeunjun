/* 챗봇 액션 되돌리기 + Chain 모드 (2026-04-30)
   사용:
     window.openUndoHistory()                 — 최근 액션 list (되돌리기 가능)
     window.undoAction(logId)                 — 단일 되돌리기 + 토스트
     window.undoChain(chainId)                — chain 묶음 일괄 되돌리기
     window.toggleChainMode()                 — Chain 자동 실행 ON/OFF
     window.isChainModeOn()                   — 현재 상태 확인
     window.executeActionsAsChain(actions, q) — N개 액션 한 번 confirm 으로 chain 실행
*/
(function () {
  'use strict';

  const CHAIN_MODE_KEY = 'itdasy_chain_mode';

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
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.detail || ('HTTP ' + res.status));
    return d;
  }

  // ── Chain mode 토글 ─────────────────────────────────────
  function isChainModeOn() {
    try { return localStorage.getItem(CHAIN_MODE_KEY) === 'on'; }
    catch (_e) { return false; }
  }
  function setChainMode(on) {
    try { localStorage.setItem(CHAIN_MODE_KEY, on ? 'on' : 'off'); }
    catch (_e) { void _e; }
  }
  function toggleChainMode() {
    const next = !isChainModeOn();
    setChainMode(next);
    if (window.showToast) window.showToast(next ? '🔗 묶음 처리 모드 ON' : '🔗 묶음 처리 모드 OFF');
    return next;
  }

  // ── 단일 액션 되돌리기 ──────────────────────────────────
  async function undoAction(logId) {
    if (!logId) return;
    if (!confirm('방금 처리한 내용 되돌릴까요?')) return;
    try {
      const r = await _fetch('POST', `/assistant/undo/${logId}`);
      if (window.showToast) window.showToast(r.message || '되돌렸어요');
      // 모든 데이터 캐시 무효화 (어떤 종류였는지 모르니 전부)
      try {
        ['customer','booking','revenue','inventory','nps','service'].forEach(k => sessionStorage.removeItem('pv_cache::' + k));
        window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'undo' } }));
      } catch (_e) { void _e; }
    } catch (e) {
      if (window.showToast) window.showToast('되돌리기 실패: ' + e.message);
    }
  }
  async function undoChain(chainId) {
    if (!chainId) return;
    if (!confirm('이 Chain 실행 전체를 되돌릴까요? (전부 취소됩니다)')) return;
    try {
      const r = await _fetch('POST', `/assistant/undo/chain/${chainId}`);
      if (window.showToast) window.showToast(r.message || '되돌렸어요');
      try {
        ['customer','booking','revenue','inventory','nps','service'].forEach(k => sessionStorage.removeItem('pv_cache::' + k));
        window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'undo' } }));
      } catch (_e) { void _e; }
    } catch (e) {
      if (window.showToast) window.showToast('되돌리기 실패: ' + e.message);
    }
  }

  // ── '되돌리기' 버튼 포함된 토스트 ────────────────────────
  function showUndoToast(message, logId) {
    // showToast 가 onClick 받으면 사용, 아니면 일반 토스트만
    if (window.showToast && logId) {
      try {
        window.showToast(message + ' · 되돌리기 →', {
          onClick: () => undoAction(logId),
        });
        return;
      } catch (_e) { /* fallback */ }
    }
    // 폴백: 자체 토스트
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:50%;bottom:80px;transform:translateX(-50%);z-index:10001;background:#222;color:#fff;padding:14px 20px;border-radius:14px;font-size:13px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,0.2);display:flex;align-items:center;gap:10px;';
    el.innerHTML = `<span>${_esc(message)}</span>` + (logId ? `<button data-undo style="background:#7C3AED;border:none;color:#fff;padding:5px 10px;border-radius:8px;font-weight:700;cursor:pointer;font-size:12px;">되돌리기</button>` : '');
    document.body.appendChild(el);
    if (logId) {
      el.querySelector('[data-undo]').addEventListener('click', () => {
        undoAction(logId);
        el.remove();
      });
    }
    setTimeout(() => { try { el.remove(); } catch (_e) { void _e; } }, 8000);
  }

  // ── 되돌리기 history 시트 ───────────────────────────────
  function _ensureSheet() {
    let sheet = document.getElementById('undoHistorySheet');
    if (sheet) return sheet;
    sheet = document.createElement('div');
    sheet.id = 'undoHistorySheet';
    sheet.style.cssText = 'position:fixed;inset:0;z-index:9985;background:rgba(0,0,0,0.5);display:none;align-items:flex-end;justify-content:center;';
    const _ic = (id, size = 14) => `<svg width="${size}" height="${size}" aria-hidden="true"><use href="#${id}"/></svg>`;
    sheet.innerHTML = `
      <div id="uhsCard" style="width:100%;max-width:540px;background:#fff;border-radius:20px 20px 0 0;max-height:88vh;display:flex;flex-direction:column;padding:18px 18px max(18px,env(safe-area-inset-bottom));">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
          <span style="display:inline-flex;align-items:center;color:#7C3AED;">${_ic('ic-rotate-ccw', 18)}</span>
          <strong style="font-size:17px;">되돌리기 (최근 30일)</strong>
          <button id="uhsClose" aria-label="닫기" style="margin-left:auto;background:none;border:none;cursor:pointer;color:#888;display:inline-flex;align-items:center;">${_ic('ic-x', 18)}</button>
        </div>
        <div style="font-size:11px;color:#888;margin-bottom:10px;">챗봇이 추가/변경한 항목들. 클릭하면 되돌려요.</div>
        <div id="uhsList" style="flex:1;overflow-y:auto;">
          <div style="text-align:center;color:var(--text-subtle);padding:30px 0;font-size:13px;">불러오는 중…</div>
        </div>
        <div style="margin-top:10px;padding:12px;background:#FAF5FF;border-radius:10px;font-size:11px;line-height:1.5;color:#5B21B6;">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
            <input type="checkbox" id="uhsChainToggle">
            <span style="display:inline-flex;align-items:center;gap:5px;"><i class="ph-duotone ph-link" aria-hidden="true"></i><strong>묶음 처리 모드</strong> — 여러 작업을 한 번에 확인해요</span>
          </label>
          <div style="margin-top:6px;font-size:10px;color:#5B21B680;">민감한 작업(삭제·취소·메시지 발송)은 묶음 처리 모드여도 따로 확인. 실패 시 자동 되돌림.</div>
        </div>
      </div>
    `;
    document.body.appendChild(sheet);
    sheet.addEventListener('click', (e) => { if (e.target === sheet) close(); });
    sheet.querySelector('#uhsClose').addEventListener('click', close);
    sheet.querySelector('#uhsChainToggle').addEventListener('change', (e) => {
      setChainMode(e.target.checked);
      if (window.showToast) window.showToast(e.target.checked ? '🔗 묶음 처리 모드 ON' : '🔗 묶음 처리 모드 OFF');
    });
    return sheet;
  }

  async function open() {
    const sheet = _ensureSheet();
    const card = sheet.querySelector('#uhsCard');
    if (window.SheetAnim) window.SheetAnim.open(sheet, card);
    else sheet.style.display = 'flex';
    sheet.querySelector('#uhsChainToggle').checked = isChainModeOn();
    await _refresh();
  }
  function close() {
    const sheet = document.getElementById('undoHistorySheet');
    if (!sheet) return;
    const card = sheet.querySelector('#uhsCard');
    if (window.SheetAnim) window.SheetAnim.close(sheet, card);
    else sheet.style.display = 'none';
  }

  async function _refresh() {
    const list = document.getElementById('uhsList');
    if (!list) return;
    try {
      const items = await _fetch('GET', '/assistant/undo');
      if (!items || !items.length) {
        list.innerHTML = `<div style="text-align:center;color:var(--text-subtle);padding:30px 0;font-size:13px;">되돌릴 작업이 없어요.</div>`;
        return;
      }
      // chain_id 별 묶음 표시
      const grouped = {};
      items.forEach(it => {
        const key = it.chain_id || `single:${it.id}`;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(it);
      });
      list.innerHTML = Object.entries(grouped).map(([key, group]) => {
        const isChain = key.startsWith('chain') || group.length > 1;
        if (isChain && group.length > 1) {
          const cid = group[0].chain_id;
          const dt = new Date(group[0].executed_at);
          return `
            <div style="padding:10px 12px;background:#FAF5FF;border:1px solid #DDD6FE;border-radius:12px;margin-bottom:8px;">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
                <span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;color:#5B21B6;background:#fff;padding:3px 8px;border-radius:99px;"><i class="ph-duotone ph-link" aria-hidden="true"></i>Chain ${group.length}건</span>
                <span style="font-size:10px;color:var(--text-subtle);">${dt.toLocaleString('ko-KR', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}</span>
                <button class="uhs-undo-chain" data-chain="${cid}" style="margin-left:auto;background:#7C3AED;border:none;color:#fff;padding:5px 10px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;">전체 되돌리기</button>
              </div>
              ${group.map(g => `<div style="font-size:12px;color:#333;padding:4px 0 4px 20px;">${_esc(g.summary)}</div>`).join('')}
            </div>
          `;
        }
        const it = group[0];
        const dt = new Date(it.executed_at);
        return `
          <div style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:#FAFAFA;border-radius:12px;margin-bottom:6px;">
            <div style="flex:1;font-size:13px;color:#333;">
              <div>${_esc(it.summary)}</div>
              <div style="font-size:10px;color:var(--text-subtle);margin-top:2px;">${dt.toLocaleString('ko-KR', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}</div>
            </div>
            <button class="uhs-undo" data-id="${it.id}" style="display:inline-flex;align-items:center;gap:4px;background:#fff;border:1px solid #ddd;color:#555;padding:5px 10px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;flex-shrink:0;"><i class="ph-duotone ph-arrow-counter-clockwise" aria-hidden="true"></i>되돌리기</button>
          </div>
        `;
      }).join('');
      list.querySelectorAll('.uhs-undo').forEach(b => {
        b.addEventListener('click', async () => {
          await undoAction(parseInt(b.dataset.id, 10));
          await _refresh();
        });
      });
      list.querySelectorAll('.uhs-undo-chain').forEach(b => {
        b.addEventListener('click', async () => {
          await undoChain(b.dataset.chain);
          await _refresh();
        });
      });
    } catch (e) {
      list.innerHTML = `<div style="text-align:center;color:#dc3545;padding:20px;font-size:12px;">불러오기 실패: ${_esc(e.message)}</div>`;
    }
  }

  // ── Chain 실행 — 한 confirm 으로 N개 액션 순차 ────────────
  async function executeActionsAsChain(actions, sourceQuestion) {
    if (!actions || !actions.length) return;
    try {
      const body = {
        actions: actions.map(a => ({ kind: a.kind, payload: a.payload || {} })),
        source_question: sourceQuestion || '',
        confirm_high_risk: false,
      };
      const r = await _fetch('POST', '/assistant/execute_chain', body);
      if (r.ok) {
        if (window.showToast) {
          window.showToast(r.message + ' · 전체 되돌리기 →', {
            onClick: () => undoChain(r.chain_id),
          });
        }
        try {
          ['customer','booking','revenue','inventory','nps','service'].forEach(k => sessionStorage.removeItem('pv_cache::' + k));
          window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'chain', chain_id: r.chain_id } }));
        } catch (_e) { void _e; }
      } else {
        if (window.showToast) window.showToast(r.message || 'Chain 실패');
      }
      return r;
    } catch (e) {
      if (window.showToast) window.showToast('Chain 실행 실패: ' + e.message);
      return { ok: false, message: e.message };
    }
  }

  window.openUndoHistory = open;
  window.closeUndoHistory = close;
  window.undoAction = undoAction;
  window.undoChain = undoChain;
  window.toggleChainMode = toggleChainMode;
  window.isChainModeOn = isChainModeOn;
  window.setChainMode = setChainMode;
  window.executeActionsAsChain = executeActionsAsChain;
  window.showUndoToast = showUndoToast;
})();
