/* AI 잇비 — 추천 문구/입력 자동완성 처리
   기본 추천 버튼과 오늘 브리핑 추천 카드를 app-assistant.js에서 분리. */
(function () {
  'use strict';

  let _proactiveLoadedAt = 0;

  function _esc(s) { return window._esc(s); } /* [2026-06-11] 중복 제거 — app-core 정본 위임 */

  function _hideBox(box) {
    if (!box) return;
    box.style.display = 'none';
    box.innerHTML = '';
  }

  function renderSuggest(deps) {
    const el = document.getElementById('asstSuggest');
    if (!el) return;
    const suggestions = (deps && deps.suggestions) || [];
    // [연준님 2026-08-16] 탭 영역만 넓힌다 — **보이는 칩 크기는 그대로.**
    //   실측: 칩 높이 33px 로 iOS HIG 권장 44px 미달. 디자인을 키우면 채팅 하단이 답답해지므로
    //   ::after 로 위아래 6px 씩만 투명 확장해 45px 를 만든다(가로는 안 늘려서 옆 칩과 안 겹친다).
    //   가로 스크롤 컨테이너 안이라 세로 확장은 스크롤·터치와 충돌하지 않는다.
    el.innerHTML = suggestions.map(s => `
      <button data-suggest="${_esc(s)}" class="asst-chip-tap" style="position:relative;flex-shrink:0;padding:8px 16px;border:1px solid rgba(0,0,0,.07);border-radius:999px;font-size:12px;color:#191F28;background:#fff;cursor:pointer;white-space:nowrap;">${_esc(s)}</button>
    `).join('');
  }

  function renderTypeahead(text, deps) {
    const box = document.getElementById('asstTypeahead');
    if (!box) return;
    if (!text || text.length > 20) { _hideBox(box); return; }
    const firstToken = text.split(/\s+/)[0];
    if (!firstToken || firstToken.length < 2) { _hideBox(box); return; }
    const getCustomers = deps && deps.getCustomers;
    const customers = typeof getCustomers === 'function' ? getCustomers() : [];
    const match = customers.find(c => c.name.startsWith(firstToken) || c.name === firstToken);
    if (!match) { _hideBox(box); return; }
    const chips = [
      `${match.name} 5만원 기록`,
      `${match.name} 내일 2시 예약`,
      `${match.name} 정보 보기`,
    ];
    box.innerHTML = chips.map(c => `
      <button data-typeahead="${_esc(c)}" style="padding:6px 11px;border:1px solid hsl(340,78%,85%);border-radius:14px;background:hsl(340,100%,98%);cursor:pointer;font-size:11px;color:hsl(350,60%,40%);white-space:nowrap;font-weight:700;">${_esc(c)}</button>
    `).join('');
    box.style.display = 'flex';
  }

  function _readCachedToday() {
    try {
      const raw = sessionStorage.getItem('pv_cache::today');
      if (!raw) return null;
      const obj = JSON.parse(raw);
      return Date.now() - obj.t < 300000 ? obj.d : null;
    } catch (_e) {
      return null;
    }
  }

  function _writeCachedToday(d) {
    try {
      sessionStorage.setItem('pv_cache::today', JSON.stringify({ t: Date.now(), d }));
    } catch (_e) {
      void _e;
    }
  }

  function _refreshTodayInBackground() {
    apiFetch('/today/brief', { headers: window.authHeader() })
      .then(r => r.ok ? r.json() : null)
      .then(fresh => { if (fresh) _writeCachedToday(fresh); })
      .catch(() => {});
  }

  async function loadProactiveSuggestions() {
    try {
      if (Date.now() - _proactiveLoadedAt < 300000) return;
      if (!window.API || !window.authHeader) return;
      const cached = _readCachedToday();
      if (cached) {
        renderProactiveCarousel((cached.proactive_suggestions || []).slice(0, 3));
        _proactiveLoadedAt = Date.now();
        _refreshTodayInBackground();
        return;
      }
      const res = await apiFetch('/today/brief', { headers: window.authHeader() });
      if (!res.ok) return;
      const d = await res.json();
      _writeCachedToday(d);
      renderProactiveCarousel((d.proactive_suggestions || []).slice(0, 3));
      _proactiveLoadedAt = Date.now();
    } catch (_e) {
      void _e;
    }
  }

  function renderProactiveCarousel(suggestions) {
    const sheet = document.getElementById('assistantSheet');
    if (!sheet) return;
    let box = sheet.querySelector('#asstProactive');
    if (!box) {
      const target = sheet.querySelector('#asstSuggest');
      if (!target) return;
      box = document.createElement('div');
      box.id = 'asstProactive';
      box.style.cssText = 'display:flex;gap:8px;overflow-x:auto;margin-top:6px;padding:4px 0;';
      target.parentNode.insertBefore(box, target);
    }
    if (!suggestions || !suggestions.length) { _hideBox(box); return; }
    box.style.display = 'flex';
    // [연준님 2026-08-18 · 추천질문 전수감사] `chat_input` 이 빈 제안은 **정보 배너**다.
    //   예전엔 `s.chat_input || s.text` 로 폴백해서, 누르면 배너 문구 자체가
    //   입력창에 채워졌다 — "⏰ 30분 뒤 안원영 시작 — 준비 OK?" 를 그대로 잇비에게
    //   보내게 된다. 원장님이 무심코 엔터를 치면 뜻 모를 질문에 LLM 이 답하고 돈이 나간다.
    //   물어볼 게 있는 제안(chat_input 존재)만 버튼으로, 나머지는 누를 수 없는 배너로.
    const _BTN = 'flex:0 0 auto;max-width:260px;padding:10px 14px;border-radius:14px;'
      + 'font-size:12px;font-weight:600;text-align:left;line-height:1.35;white-space:normal;';
    box.innerHTML = suggestions.map(s => {
      const text = _esc((window.dedupeNim ? window.dedupeNim(s.text || '') : (s.text || '')));
      const chat = String(s.chat_input || '').trim();
      if (!chat) {
        // 정보 배너 — 버튼이 아니고 포커스도 안 받는다(눌러도 되는 것처럼 보이면 안 된다)
        return `<div role="note" style="${_BTN}border:1px dashed #E5E8EB;background:#FAFAFB;`
          + `color:#8B95A1;cursor:default;">${text}</div>`;
      }
      return `<button data-proactive-chat="${_esc(chat)}" style="${_BTN}border:1px solid #F0DADF;`
        + `background:linear-gradient(135deg,#F7EFF0,#FCE7EC);color:#BC6675;cursor:pointer;">${text}</button>`;
    }).join('');
  }

  function _fillInput(q, focusOnly) {
    const input = document.getElementById('asstInput');
    if (!input) return;
    input.value = q || '';
    if (focusOnly) input.focus();
  }

  function handleClick(e, deps) {
    const sheet = document.getElementById('assistantSheet');
    const send = deps && deps.send;
    const isSending = deps && deps.isSending;
    const sug = e.target.closest('[data-suggest]');
    if (sug && sheet && sheet.contains(sug)) {
      if (typeof isSending === 'function' && isSending()) return true;
      _fillInput(sug.getAttribute('data-suggest'), false);
      if (typeof send === 'function') send();
      return true;
    }
    const ta = e.target.closest('[data-typeahead]');
    if (ta && sheet && sheet.contains(ta)) {
      _fillInput(ta.getAttribute('data-typeahead'), true);
      _hideBox(document.getElementById('asstTypeahead'));
      return true;
    }
    const proactive = e.target.closest('[data-proactive-chat]');
    if (proactive && sheet && sheet.contains(proactive)) {
      _fillInput(proactive.dataset.proactiveChat || '', true);
      return true;
    }
    return false;
  }

  window.ItdasyAssistantSuggestionControls = {
    renderSuggest,
    renderTypeahead,
    loadProactiveSuggestions,
    renderProactiveCarousel,
    handleClick,
  };
})();
