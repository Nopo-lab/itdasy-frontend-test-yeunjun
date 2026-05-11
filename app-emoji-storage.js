// Itdasy Studio - 계정 이모지 창고

(function() {
  let _cache = { caption: [], dm: [] };
  let _activeTarget = null;

  function _scopeFromTarget(el) {
    if (!el) return 'caption';
    if (el.closest && el.closest('#dmAutoreplySheet, #dmConfirmQueueSheet, #dmManualSheet')) return 'dm';
    return 'caption';
  }

  function _emojiChars(raw) {
    return Array.from(String(raw || '')).filter(ch => /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(ch));
  }

  function _cleanList(list) {
    const seen = new Set();
    const out = [];
    (list || []).forEach(item => {
      const emoji = _emojiChars(item)[0];
      if (!emoji || seen.has(emoji)) return;
      seen.add(emoji);
      out.push(emoji);
    });
    return out.slice(0, 5);
  }

  async function _fetchEmojis() {
    if (!window.getToken || !getToken()) return _cache;
    const res = await fetch(API + '/persona/emojis', { headers: authHeader() });
    if (!res.ok) return _cache;
    const data = await res.json();
    _cache = {
      caption: _cleanList(data.caption),
      dm: _cleanList(data.dm),
    };
    return _cache;
  }

  async function _save(scope, list) {
    _cache[scope] = _cleanList(list);
    const body = {};
    body[scope] = _cache[scope];
    const res = await fetch(API + '/persona/emojis', {
      method: 'PATCH',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('이모지 저장 실패');
    const data = await res.json();
    _cache.caption = _cleanList(data.caption);
    _cache.dm = _cleanList(data.dm);
    _renderQuickRows();
  }

  function _insertAtTarget(emoji) {
    const el = _activeTarget || document.activeElement || document.getElementById('captionText');
    if (!el) return;
    if (el.isContentEditable) {
      el.focus();
      document.execCommand('insertText', false, emoji);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    if ('value' in el) {
      const start = el.selectionStart || el.value.length;
      const end = el.selectionEnd || start;
      el.value = el.value.slice(0, start) + emoji + el.value.slice(end);
      el.selectionStart = el.selectionEnd = start + emoji.length;
      el.focus();
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function _quickButton(emoji) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = emoji;
    btn.style.cssText = 'width:30px;height:30px;border-radius:50%;border:1px solid var(--border);background:var(--surface);font-size:16px;cursor:pointer;';
    btn.addEventListener('click', () => _insertAtTarget(emoji));
    return btn;
  }

  function _settingsButton(scope) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.innerHTML = '<i class="ph-duotone ph-sparkle" aria-hidden="true"></i>';
    btn.title = '이모지 창고';
    btn.style.cssText = 'width:30px;height:30px;border-radius:50%;border:1px solid var(--border);background:var(--bg2);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;color:var(--accent);';
    btn.addEventListener('click', () => openEmojiPanel(scope));
    return btn;
  }

  function _makeQuickRow(scope) {
    const row = document.createElement('div');
    row.className = 'emoji-quick-row';
    row.dataset.emojiScope = scope;
    row.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:8px 0;';
    (_cache[scope] || []).forEach(emoji => row.appendChild(_quickButton(emoji)));
    row.appendChild(_settingsButton(scope));
    return row;
  }

  function _mountCaptionRow() {
    const ta = document.getElementById('captionText');
    if (!ta || document.querySelector('[data-emoji-mount="caption"]')) return;
    const row = _makeQuickRow('caption');
    row.dataset.emojiMount = 'caption';
    ta.parentElement.insertBefore(row, ta);
  }

  function _mountDmRows() {
    document.querySelectorAll('.dm-bubble--sent.is-draft').forEach(el => {
      const host = el.parentElement;
      if (!host || host.querySelector('[data-emoji-mount="dm"]')) return;
      const row = _makeQuickRow('dm');
      row.dataset.emojiMount = 'dm';
      host.insertBefore(row, el);
    });
  }

  function _renderQuickRows() {
    document.querySelectorAll('[data-emoji-mount]').forEach(el => el.remove());
    _mountCaptionRow();
    _mountDmRows();
  }

  function _panelHtml() {
    return `
      <div style="width:min(420px,100%);background:var(--surface);border-radius:18px;padding:16px;box-shadow:0 18px 70px rgba(0,0,0,0.28);">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
          <div style="font-size:16px;font-weight:900;color:var(--text);">이모지 창고</div>
          <button data-close type="button" style="margin-left:auto;border:none;background:var(--bg2);border-radius:50%;width:32px;height:32px;cursor:pointer;">×</button>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:12px;">
          <button data-tab="caption" type="button" style="flex:1;padding:9px;border-radius:10px;border:1px solid var(--border);font-weight:800;cursor:pointer;">캡션</button>
          <button data-tab="dm" type="button" style="flex:1;padding:9px;border-radius:10px;border:1px solid var(--border);font-weight:800;cursor:pointer;">DM</button>
        </div>
        <div data-slots style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:12px;"></div>
        <div style="display:flex;gap:8px;">
          <input data-input maxlength="16" placeholder="이모지 입력" style="flex:1;min-width:0;padding:11px;border:1px solid var(--border);border-radius:10px;background:var(--bg);font-size:15px;">
          <button data-add type="button" style="width:72px;border:none;border-radius:10px;background:var(--accent);color:white;font-weight:900;cursor:pointer;">추가</button>
        </div>
      </div>
    `;
  }

  function _paintPanel(overlay, scope) {
    overlay.dataset.scope = scope;
    overlay.querySelectorAll('[data-tab]').forEach(btn => {
      const on = btn.dataset.tab === scope;
      btn.style.background = on ? 'var(--accent)' : 'var(--bg2)';
      btn.style.color = on ? '#fff' : 'var(--text)';
    });
    const slots = overlay.querySelector('[data-slots]');
    slots.innerHTML = '';
    for (let i = 0; i < 5; i++) {
      const emoji = (_cache[scope] || [])[i] || '+';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = emoji;
      btn.style.cssText = 'aspect-ratio:1/1;border-radius:12px;border:1px solid var(--border);background:var(--bg2);font-size:24px;cursor:pointer;';
      btn.addEventListener('click', () => {
        if ((_cache[scope] || [])[i]) _save(scope, _cache[scope].filter((_, idx) => idx !== i));
      });
      slots.appendChild(btn);
    }
  }

  async function openEmojiPanel(scope) {
    await _fetchEmojis();
    let current = scope || _scopeFromTarget(_activeTarget);
    const overlay = document.createElement('div');
    overlay.id = 'emojiPanelOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9600;background:rgba(0,0,0,0.35);display:flex;align-items:flex-end;justify-content:center;padding:16px;';
    overlay.innerHTML = _panelHtml();
    document.body.appendChild(overlay);
    _paintPanel(overlay, current);
    overlay.querySelector('[data-close]').addEventListener('click', () => overlay.remove());
    overlay.querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => { current = btn.dataset.tab; _paintPanel(overlay, current); });
    });
    overlay.querySelector('[data-add]').addEventListener('click', async () => {
      const input = overlay.querySelector('[data-input]');
      const emoji = _emojiChars(input.value)[0];
      if (!emoji) { showToast('이모지를 입력해주세요'); return; }
      await _save(current, [...(_cache[current] || []), emoji]);
      input.value = '';
      _paintPanel(overlay, current);
    });
  }

  document.addEventListener('focusin', event => {
    const el = event.target;
    if (el && (el.matches?.('textarea,input') || el.isContentEditable)) _activeTarget = el;
  });
  document.addEventListener('DOMContentLoaded', async () => {
    try { await _fetchEmojis(); } catch (e) { console.warn('이모지 불러오기 실패:', e); }
    _renderQuickRows();
    // [PerfFix] body 전체 subtree 감시 → DM 시트 영역만 감시.
    // DM 시트 자체가 lazy 마운트라 시작 시 없을 수 있어, 지연 시도(1s) + body fallback 1회만.
    const _attachDmObserver = () => {
      const target = document.getElementById('dmAutoreplySheet')
        || document.getElementById('dmInboxMount')
        || document.getElementById('dmRetentionSection');
      if (target) {
        new MutationObserver(_mountDmRows).observe(target, { childList: true, subtree: true });
        return true;
      }
      return false;
    };
    if (!_attachDmObserver()) {
      // DM 시트가 아직 마운트되지 않았을 수 있음 → body에 1회만 attach해두고
      // DM 시트가 생기면 그 안만 본다 (transient).
      const bodyObs = new MutationObserver(() => {
        if (_attachDmObserver()) bodyObs.disconnect();
      });
      bodyObs.observe(document.body, { childList: true, subtree: false });
    }
  });
})();
