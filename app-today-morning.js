/* ─────────────────────────────────────────────────────────────
   통합 모닝 브리핑 (Task §16 · 2026-05-17)
   설계: ~/.claude/plans/zesty-snacking-clarke.md §16

   홈 상단 — 운영 / 고객 케어 / 콘텐츠 / 마케팅 4섹션 한 카드.
   GET /today/morning 시도 → 실패 시 클라이언트 합성 폴백.

   폴백 소스:
     운영(예약) : window.Booking.list(from, to)  또는 GET /bookings/today
     고객 케어  : window.CustomerCache.get() + CustomerChips.pickAll (urgency≥0.7, 최대 3명)
     콘텐츠     : localStorage 'itdasy_recent_gallery' 마지막 슬롯 1장
     마케팅    : 활동 없으면 정적 안내 1줄

   chip 탭: openCalendarView / openCustomerHub / openAssistant / openCaptionScenarioPopup
   이벤트  : itdasy:data-changed → 자동 새로고침
   공개 API: window.TodayMorning.render(id) / refresh()
   아이콘은 인라인 SVG (Lucide 스타일). UI 이모지 금지.
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const STYLE_ID = '__tm_style__';
  const SWR_KEY  = 'pv_cache::today_morning';
  const SWR_TTL  = 60 * 1000;

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
  }
  function _greet() {
    const h = new Date().getHours();
    if (h < 6)  return '새벽까지 수고가 많아요';
    if (h < 12) return '좋은 아침이에요. 오늘도 화이팅';
    if (h < 18) return '오후도 잘 부탁드려요';
    return '하루 마무리 잘 하세요';
  }
  function _readSWR(){
    try{ const o=JSON.parse(localStorage.getItem(SWR_KEY)||'null'); if(!o) return null;
      return { d:o.d, fresh: Date.now()-o.t < SWR_TTL }; }catch(_e){ return null; }
  }
  function _writeSWR(d){ try{ localStorage.setItem(SWR_KEY, JSON.stringify({ t:Date.now(), d })); }catch (_e) { void _e; } }

  function _injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const el = document.createElement('style'); el.id = STYLE_ID;
    el.textContent = ''
      + ".tm-card{position:relative;margin:12px 0 14px;padding:16px 16px 14px;border-radius:18px;"
      + "background:linear-gradient(135deg,#fff1f4 0%,#fde8f1 45%,#eee2ff 100%);"
      + "box-shadow:0 8px 24px rgba(166,103,142,.10),0 1px 0 rgba(255,255,255,.6) inset;"
      + "font-family:'Pretendard',-apple-system,BlinkMacSystemFont,system-ui,sans-serif;color:#3a2330;-webkit-tap-highlight-color:transparent;}"
      + ".tm-head{display:flex;align-items:center;gap:8px;margin-bottom:10px;}"
      + ".tm-head svg{width:16px;height:16px;color:#a6678e;}"
      + ".tm-head-title{font-size:14px;font-weight:700;color:#4a2940;}"
      + ".tm-head-greet{font-size:11px;color:#7a5670;margin-left:auto;font-weight:500;}"
      + ".tm-grid{display:flex;flex-direction:column;gap:10px;}"
      + ".tm-sec{background:rgba(255,255,255,.72);border-radius:14px;padding:10px 12px;border:1px solid rgba(255,255,255,.6);}"
      + ".tm-sec-title{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:#5a3550;margin-bottom:6px;}"
      + ".tm-sec-title svg{width:14px;height:14px;flex-shrink:0;color:#a6678e;}"
      + ".tm-chips{display:flex;flex-wrap:wrap;gap:6px;}"
      + ".tm-chip{display:inline-flex;align-items:center;gap:5px;padding:7px 10px;min-height:32px;border-radius:999px;"
      + "background:rgba(255,255,255,.95);border:1px solid rgba(166,103,142,.18);color:#4a2940;"
      + "font-size:12px;font-weight:600;line-height:1.2;cursor:pointer;touch-action:manipulation;"
      + "-webkit-tap-highlight-color:transparent;user-select:none;transition:transform .08s ease,box-shadow .12s ease;}"
      + ".tm-chip:active{transform:scale(.97);box-shadow:0 2px 6px rgba(166,103,142,.18);}"
      + ".tm-chip.tm-chip-flat{background:transparent;border:none;color:#7a5670;font-weight:500;cursor:default;}"
      + ".tm-chip svg{width:13px;height:13px;flex-shrink:0;color:#a6678e;}"
      + ".tm-thumb{width:28px;height:28px;border-radius:8px;object-fit:cover;border:1px solid rgba(166,103,142,.2);}"
      + "@media (prefers-color-scheme:dark){"
      + ".tm-card{background:linear-gradient(135deg,#2a1820 0%,#3a1f30 45%,#2a1f3a 100%);color:#f6e5ee;box-shadow:0 8px 24px rgba(0,0,0,.32);}"
      + ".tm-head-title{color:#f6e5ee;} .tm-head-greet{color:rgba(246,229,238,.6);}"
      + ".tm-sec{background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.08);}"
      + ".tm-sec-title{color:rgba(246,229,238,.85);}"
      + ".tm-chip{background:rgba(255,255,255,.10);border-color:rgba(255,255,255,.12);color:#f6e5ee;}"
      + ".tm-chip.tm-chip-flat{color:rgba(246,229,238,.6);}}";
    document.head.appendChild(el);
  }

  // Lucide-style inline SVG
  const ICONS = {
    calendar:  '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    heart:     '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z"/>',
    image:     '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.5-3.5-7 7"/>',
    megaphone: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
    sparkle:   '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>',
    arrow:     '<path d="M5 12h14M13 6l6 6-6 6"/>',
  };
  function _icon(n){ const p=ICONS[n]; return p?`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`:''; }

  // ── 백엔드 시도 ──────────────────────────────────────────
  async function _fetchMorning() {
    if (!window.API || !window.authHeader) return null;
    try {
      const ctrl = new AbortController();
      const to = setTimeout(()=>ctrl.abort(), 8000);
      const res = await fetch(window.API + '/today/morning', { headers: window.authHeader(), signal: ctrl.signal });
      clearTimeout(to);
      if (!res.ok) return null;
      const d = await res.json(); _writeSWR(d); return d;
    } catch (_e) { return null; }
  }

  // ── 폴백 합성 ────────────────────────────────────────────
  async function _fallbackBookings() {
    try {
      if (window.Booking && typeof window.Booking.list === 'function') {
        const s=new Date(); s.setHours(0,0,0,0);
        const e=new Date(); e.setHours(23,59,59,999);
        const list = await window.Booking.list(s.toISOString(), e.toISOString());
        return Array.isArray(list) ? list : [];
      }
    } catch (_e) { void _e; }
    try {
      if (window.API && window.authHeader) {
        const res = await fetch(window.API + '/bookings/today', { headers: window.authHeader() });
        if (res.ok) { const d = await res.json(); return Array.isArray(d)? d : (d.items||[]); }
      }
    } catch (_e) { void _e; }
    return [];
  }

  function _fallbackCare() {
    try {
      if (!window.CustomerCache || !window.CustomerChips) return [];
      const list = window.CustomerCache.get() || [];
      const out = [];
      for (const c of list) {
        if (!c || !c.id) continue;
        const chips = (window.CustomerChips.pickAll || function(){return[];})(c);
        if (!chips.length) continue;
        const top = chips[0];
        if (top.urgency < 0.7) continue;
        out.push({ id:c.id, name:c.name||'고객', label:top.label });
        if (out.length >= 3) break;
      }
      return out;
    } catch (_e) { return []; }
  }

  function _fallbackContent() {
    try {
      const raw = localStorage.getItem('itdasy_recent_gallery'); if(!raw) return null;
      const arr = JSON.parse(raw); if(!Array.isArray(arr)||!arr.length) return null;
      const last = arr[arr.length-1]; if(!last) return null;
      if (typeof last === 'string') return { thumb:last };
      return { thumb: last.thumb || last.url || last.dataURL || '', title: last.title || '' };
    } catch (_e) { return null; }
  }

  function _composeFallback(bookings, care, content) {
    const operating = [];
    if (Array.isArray(bookings) && bookings.length) {
      const sorted = bookings.slice().sort((a,b)=>
        new Date(a.starts_at||a.start||0) - new Date(b.starts_at||b.start||0));
      const now = new Date();
      const next = sorted.find(b => new Date(b.starts_at||b.start||0) >= now) || sorted[0];
      const t = new Date(next.starts_at || next.start || 0);
      const hhmm = `${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`;
      operating.push({ label:`${hhmm} ${next.customer_name||next.name||'예약'}`, action:'openCalendarView' });
      if (sorted.length > 1) operating.push({ label:`오늘 총 ${sorted.length}건`, action:'openCalendarView' });
    }
    const careChips = (care||[]).map(c => ({
      label: `${c.name} · ${c.label}`, action: 'openCustomerHub', customerId: c.id,
    }));
    const contentChips = [];
    if (content && content.thumb) {
      contentChips.push({ label: content.title || '최근 갤러리', thumb: content.thumb, action: 'openCaptionScenarioPopup' });
    }
    const marketingChips = [{ label:'캡션 한 줄 만들기', action:'openCaptionScenarioPopup' }];
    if (!contentChips.length && !operating.length) {
      marketingChips.unshift({ label:'오늘 게시물 한 장 올려보세요', action:'openCaptionScenarioPopup' });
    }
    return { operating, care:careChips, content:contentChips, marketing:marketingChips };
  }

  function _normalizeServer(d) {
    if (!d || typeof d !== 'object') return null;
    const o = {
      operating:  Array.isArray(d.operating) ? d.operating : [],
      care:       Array.isArray(d.care)      ? d.care      : [],
      content:    Array.isArray(d.content)   ? d.content   : [],
      marketing:  Array.isArray(d.marketing) ? d.marketing : [],
    };
    if (!o.operating.length && !o.care.length && !o.content.length && !o.marketing.length) return null;
    return o;
  }

  // ── 렌더 ────────────────────────────────────────────────
  function _renderSection(title, iconName, chips, emptyText) {
    const inner = (chips && chips.length)
      ? chips.map(c => {
          if (c.flat) return `<span class="tm-chip tm-chip-flat">${_esc(c.label)}</span>`;
          const data = []
            .concat(c.action     ? [`data-tm-act="${_esc(c.action)}"`] : [])
            .concat(c.customerId ? [`data-tm-customer="${_esc(c.customerId)}"`] : [])
            .join(' ');
          const lead = c.thumb ? `<img class="tm-thumb" src="${_esc(c.thumb)}" alt=""/>` : _icon('arrow');
          return `<button type="button" class="tm-chip" ${data} data-haptic="light">${lead}<span>${_esc(c.label)}</span></button>`;
        }).join('')
      : `<span class="tm-chip tm-chip-flat">${_esc(emptyText)}</span>`;
    return `<div class="tm-sec"><div class="tm-sec-title">${_icon(iconName)}<span>${_esc(title)}</span></div><div class="tm-chips">${inner}</div></div>`;
  }

  function _renderHTML(m) {
    return ''
      + `<div class="tm-card" role="region" aria-label="모닝 브리핑">`
      + `<div class="tm-head">${_icon('sparkle')}<span class="tm-head-title">모닝 브리핑</span><span class="tm-head-greet">${_esc(_greet())}</span></div>`
      + `<div class="tm-grid">`
      +   _renderSection('운영',     'calendar',  m.operating, '오늘 예약이 없어요. 캘린더 확인하기')
      +   _renderSection('고객 케어','heart',     m.care,      '오늘은 챙길 고객이 없어요')
      +   _renderSection('콘텐츠',   'image',     m.content,   '최근 갤러리 작업이 없어요')
      +   _renderSection('마케팅',   'megaphone', m.marketing, '오늘 게시물 한 장 올려보세요')
      + `</div></div>`;
  }

  // ── 이벤트 위임 (document 레벨 — iPhone Safari 터치 fix) ──
  let _delBound = false;
  function _bindDelegation() {
    if (_delBound) return; _delBound = true;
    document.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-tm-act]'); if (!chip) return;
      e.preventDefault(); e.stopPropagation();
      try { if (typeof window.hapticLight === 'function') window.hapticLight(); } catch (_e) { void _e; }
      const act = chip.getAttribute('data-tm-act');
      const cid = chip.getAttribute('data-tm-customer');
      try {
        if (act === 'openCustomerHub' && cid && typeof window.openCustomerHub === 'function') {
          window.openCustomerHub(cid); return;
        }
        if (act && typeof window[act] === 'function') { window[act](); return; }
        if (typeof window.openAssistant === 'function') window.openAssistant();
      } catch (_e) { void _e; }
    }, false);
  }

  // ── 메인 ─────────────────────────────────────────────────
  let _lastContainerId = null;
  let _inflight = false;

  async function _doRender(containerId) {
    const container = document.getElementById(containerId); if (!container) return;
    _lastContainerId = containerId; _injectStyle(); _bindDelegation();

    const swr = _readSWR();
    if (swr && swr.d) {
      try { container.innerHTML = _renderHTML(swr.d); } catch (_e) { void _e; }
      if (swr.fresh) return;
    } else {
      container.innerHTML = _renderHTML({ operating:[], care:[], content:[], marketing:[{ label:'잇비가 오늘을 살펴보고 있어요', flat:true }] });
    }

    if (_inflight) return; _inflight = true;
    try {
      const server = _normalizeServer(await _fetchMorning());
      let model = server;
      if (!model) {
        const [bookings, content] = await Promise.all([
          _fallbackBookings(), Promise.resolve(_fallbackContent()),
        ]);
        const care = _fallbackCare();
        model = _composeFallback(bookings, care, content);
        _writeSWR(model);
      }
      try { container.innerHTML = _renderHTML(model); } catch (_e) { void _e; }
    } finally { _inflight = false; }
  }

  async function _refresh(){ if (_lastContainerId) return _doRender(_lastContainerId); }

  if (typeof window !== 'undefined' && !window._todayMorningListenerInit) {
    window._todayMorningListenerInit = true;
    window.addEventListener('itdasy:data-changed', () => {
      if (!_lastContainerId) return;
      const homeTab = document.getElementById('tab-home');
      if (homeTab && !homeTab.classList.contains('active')) return;
      _doRender(_lastContainerId).catch(() => { /* idempotent */ });
    });
  }

  window.TodayMorning = {
    render:  function (containerId) { return _doRender(containerId); },
    refresh: _refresh,
  };
})();
