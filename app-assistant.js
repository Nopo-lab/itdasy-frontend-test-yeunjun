/* ─────────────────────────────────────────────────────────────
   AI 비서 챗봇 (2026-04-21)

   원장님 자연어 질문 → POST /assistant/ask → 답변.
   대화 UI + 추천 질문 3개.
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  // 2026-04-24 — Lucide SVG 아이콘 헬퍼 (이모지 대체용)
  // 기존 index.html 의 <symbol id="ic-XXX"> 스프라이트 참조.
  function _svg(id, size = 14) {
    return `<svg width="${size}" height="${size}" style="vertical-align:-2px;" aria-hidden="true"><use href="#${id}"/></svg>`;
  }

  const SUGGESTIONS = [
    '이번 주 매출 어때?',
    '김서연 2시 예약 추가',
    '오늘 속눈썹 5만원 카드 기록',
    '이탈 임박 고객 알려줘',
    '제일 잘 팔리는 시술 뭐야?',
  ];

  // 재고·지출 공용 카테고리 (드롭다운)
  const CATEGORIES = [
    { value: 'nail', label: '네일' },
    { value: 'lash', label: '속눈썹' },
    { value: 'hair', label: '헤어' },
    { value: 'skin', label: '피부' },
    { value: 'food', label: '식품/생수' },
    { value: 'office', label: '사무용품' },
    { value: 'rent', label: '임대료' },
    { value: 'utility', label: '공과금' },
    { value: 'etc', label: '기타' },
  ];
  function _categoryOptionsHtml(selected) {
    const sel = String(selected == null ? '' : selected).toLowerCase();
    const known = CATEGORIES.some(c => c.value === sel);
    const opts = CATEGORIES.map(c =>
      `<option value="${_esc(c.value)}"${c.value === sel ? ' selected' : ''}>${_esc(c.label)}</option>`
    ).join('');
    // 서버가 임의 문자열을 주는 경우도 허용 (기타 옵션으로 표시)
    const custom = (!known && sel) ? `<option value="${_esc(sel)}" selected>${_esc(sel)}</option>` : '';
    return custom + opts;
  }

  // 액션 카테고리 메타 (아이콘 · 라벨 · 색상)
  // 2026-04-24 — icon 필드는 Lucide sprite id. 렌더 시 _svg(icon, 18) 로 삽입.
  const CATEGORY = {
    create_customer:       { icon: 'ic-user',            label: '고객 추가', color: '#4ECDC4' },
    update_customer:       { icon: 'ic-edit-3',          label: '고객 수정', color: '#4ECDC4' },
    create_revenue:        { icon: 'ic-dollar-sign',     label: '매출 기록', color: '#388e3c' },
    create_booking:        { icon: 'ic-calendar',        label: '예약 추가', color: '#F18091' },
    update_booking:        { icon: 'ic-edit-3',          label: '예약 수정', color: '#A78BFA' },
    cancel_booking:        { icon: 'ic-x',               label: '예약 취소', color: '#DC3545' },
    reschedule_booking:    { icon: 'ic-refresh-cw',      label: '예약 변경', color: '#0288D1' },
    create_expense:        { icon: 'ic-credit-card',     label: '지출 기록', color: '#E07A5F' },
    upsert_inventory:      { icon: 'ic-package',         label: '재고 입고', color: '#2B8C7E' },
    create_nps:            { icon: 'ic-star',            label: '후기', color: '#FFD700' },
    generate_bulk_message: { icon: 'ic-message-square',  label: '메시지', color: '#FF8A5C' },
  };
  function _catMeta(kind) {
    return CATEGORY[kind] || { icon: 'ic-check', label: kind || '작업', color: '#666' };
  }
  // actions[] 을 kind 순서대로 그룹핑 (첫 등장 순서 유지)
  function _groupActions(actions) {
    // 2026-04-24 디버그 — actions 배열의 customer_name·service_name·amount 매핑이 행 인덱스와 일치하는지 추적
    try {
      if (window.__ASSISTANT_DEBUG__) {
        const dump = (actions || []).map((a, i) => ({
          i,
          kind: a && a.kind,
          customer_name: a && a.payload && (a.payload.customer_name || a.payload.name),
          service_name: a && a.payload && a.payload.service_name,
          amount: a && a.payload && a.payload.amount,
        }));
        console.log('[groupActions] input', JSON.stringify(dump));
      }
    } catch (_e) { void _e; }
    const order = [];
    const map = {};
    (actions || []).forEach((a, i) => {
      if (!a || !a.kind) return;
      if (!map[a.kind]) { map[a.kind] = []; order.push(a.kind); }
      map[a.kind].push({ action: a, skipped: false, status: 'pending', origIdx: i });
    });
    const groups = order.map(k => ({ kind: k, items: map[k], expanded: false, bulkProgress: null }));
    try {
      if (window.__ASSISTANT_DEBUG__) {
        const summary = groups.map(g => ({
          kind: g.kind,
          items: g.items.map(it => ({
            origIdx: it.origIdx,
            customer_name: it.action && it.action.payload && (it.action.payload.customer_name || it.action.payload.name),
            service_name: it.action && it.action.payload && it.action.payload.service_name,
            amount: it.action && it.action.payload && it.action.payload.amount,
          })),
        }));
        console.log('[groupActions] output', JSON.stringify(summary));
      }
    } catch (_e) { void _e; }
    return groups;
  }

  let _history = [];  // [{role, text}]
  // v1.1 Multi-turn — localStorage 에 session_id 유지 (앱 재시작해도 대화 기억)
  let _sessionId = null;
  try { _sessionId = parseInt(localStorage.getItem('assistant_session_id') || '', 10) || null; }
  catch (_e) { _sessionId = null; }

  // Wave B5 — 고객 이름 캐시 (keystroke 마다 localStorage 접근 방지)
  let _customerCache = null;
  let _customerCacheAt = 0;
  const _CUSTOMER_CACHE_TTL = 60 * 1000;  // 60초
  function _getCustomers() {
    const now = Date.now();
    if (_customerCache && (now - _customerCacheAt) < _CUSTOMER_CACHE_TTL) return _customerCache;
    try {
      const raw = (window.safeStorage ? window.safeStorage.get('pv_cache::customers') : null)
        || (() => { try { return JSON.parse(localStorage.getItem('pv_cache::customers') || 'null'); } catch (_) { return null; } })();
      const items = raw && Array.isArray(raw.d) ? raw.d
                   : Array.isArray(raw) ? raw
                   : (raw && Array.isArray(raw.items) ? raw.items : []);
      _customerCache = items.filter(c => c && c.name).map(c => ({ id: c.id, name: String(c.name), phone: c.phone || '' }));
    } catch (_e) { _customerCache = []; }
    _customerCacheAt = now;
    return _customerCache;
  }

  // Wave B4 — 휴리스틱 추출 (한글 이름, 전화, 금액, 시간)
  function _heuristicExtract(q) {
    const out = { name: '', phone: '', amount: '', time: '', raw: q };
    try {
      const mName = q.match(/[가-힣]{2,4}/);
      if (mName) out.name = mName[0];
      const mPhone = q.match(/0\d{1,2}[-\.\s]?\d{3,4}[-\.\s]?\d{4}/);
      if (mPhone) out.phone = mPhone[0].replace(/[\.\s]/g, '-');
      const mAmount = q.match(/(\d{1,3}(?:,\d{3})+|\d{4,})\s*(?:원|만원|천원)?/);
      const mUnit = q.match(/(\d+)\s*(만원|천원)/);
      if (mUnit) {
        const n = parseInt(mUnit[1], 10);
        out.amount = String(mUnit[2] === '만원' ? n * 10000 : n * 1000);
      } else if (mAmount) {
        out.amount = mAmount[1].replace(/,/g, '');
      }
      const mTime = q.match(/오늘|내일|모레|\d+월\s*\d+일|\d+시/);
      if (mTime) out.time = mTime[0];
    } catch (_e) { void _e; }
    return out;
  }

  // Wave B4 — 시간 힌트를 ISO 로 변환 (예약용, best-effort)
  function _timeToISO(hint) {
    if (!hint) return null;
    try {
      const base = new Date();
      base.setSeconds(0, 0);
      let day = new Date(base);
      if (/내일/.test(hint)) day.setDate(day.getDate() + 1);
      else if (/모레/.test(hint)) day.setDate(day.getDate() + 2);
      const m = hint.match(/(\d+)월\s*(\d+)일/);
      if (m) { day.setMonth(parseInt(m[1], 10) - 1); day.setDate(parseInt(m[2], 10)); }
      const mH = hint.match(/(\d+)시/);
      if (mH) day.setHours(parseInt(mH[1], 10), 0, 0, 0);
      else day.setHours(10, 0, 0, 0);
      return day.toISOString();
    } catch (_e) { return null; }
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
  }

  function _ensureSheet() {
    let sheet = document.getElementById('assistantSheet');
    if (sheet) return sheet;
    sheet = document.createElement('div');
    sheet.id = 'assistantSheet';
    // 2026-04-24 perf — opacity 트랜지션 추가 (display:none → opacity 페이드 0.10s)
    sheet.style.cssText = 'position:fixed;inset:0;z-index:9999;display:none;background:rgba(0,0,0,0.5);opacity:0;pointer-events:none;transition:opacity 0.10s ease-out;';
    sheet.innerHTML = `
      <div style="position:absolute;inset:auto 0 0 0;background:var(--bg,#fff);border-radius:20px 20px 0 0;height:88vh;display:flex;flex-direction:column;padding:16px;padding-bottom:max(12px,env(safe-area-inset-bottom));">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
          <span style="display:inline-flex;align-items:center;color:#7C3AED;">${_svg('ic-bot', 22)}</span>
          <strong style="font-size:17px;">AI 비서</strong>
          <span style="font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(139,92,246,0.15);color:#7C3AED;font-weight:700;">베타</span>
          <button onclick="closeAssistant()" aria-label="닫기" title="닫기" style="margin-left:auto;background:rgba(0,0,0,0.05);border:none;width:32px;height:32px;border-radius:50%;color:#555;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;">${_svg('ic-x', 16)}</button>
        </div>
        <div id="asstBody" style="flex:1;overflow-y:auto;padding:4px;"></div>
        <div id="asstSuggest" style="display:flex;gap:6px;overflow-x:auto;margin-top:8px;padding:4px 0;"></div>
        <div id="asstTypeahead" style="display:none;gap:6px;overflow-x:auto;margin-top:6px;padding:2px 0;"></div>
        <div style="display:flex;gap:8px;margin-top:8px;align-items:center;">
          <button id="asstPhoto" aria-label="사진 업로드" title="사진 업로드" style="flex-shrink:0;width:44px;height:44px;border:1px solid hsl(340,78%,85%);border-radius:14px;background:hsl(340,100%,98%);color:hsl(350,60%,40%);cursor:pointer;padding:0;display:inline-flex;align-items:center;justify-content:center;transition:background 0.15s;">${_svg('ic-camera', 20)}</button>
          <input id="asstInput" placeholder="샵 관련해서 물어보세요…" maxlength="300" style="flex:1;padding:12px;border:1px solid #ddd;border-radius:14px;font-size:14px;min-width:0;" />
          <button id="asstSend" style="flex-shrink:0;padding:12px 18px;border:none;border-radius:14px;background:linear-gradient(135deg,#F18091,#D95F70);color:#fff;cursor:pointer;font-weight:800;display:inline-flex;align-items:center;gap:6px;">${_svg('ic-send', 14)} 보내기</button>
        </div>
        <input id="asstCamera" type="file" accept="image/*" capture="environment" multiple style="display:none;" />
        <input id="asstGallery" type="file" accept="image/*" multiple style="display:none;" />
      </div>
    `;
    document.body.appendChild(sheet);
    sheet.addEventListener('click', (e) => { if (e.target === sheet) closeAssistant(); });
    sheet.querySelector('#asstSend').addEventListener('click', _send);
    // 📸 사진 업로드 버튼 → 하단 action sheet
    sheet.querySelector('#asstPhoto').addEventListener('click', _openPhotoSheet);
    // 숨겨진 file input 선택 시 업로드 실행
    sheet.querySelector('#asstCamera').addEventListener('change', (e) => {
      const fs = e.target.files ? Array.from(e.target.files) : [];
      e.target.value = '';  // 같은 파일 재선택 허용
      if (fs.length) _uploadPhotos(fs);
    });
    sheet.querySelector('#asstGallery').addEventListener('change', (e) => {
      const fs = e.target.files ? Array.from(e.target.files) : [];
      e.target.value = '';
      if (fs.length) _uploadPhotos(fs);
    });
    sheet.querySelector('#asstInput').addEventListener('keydown', (e) => {
      // 한글 IME 조합 중 Enter 무시 (마지막 글자 중복/누락 방지)
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _send(); }
    });
    // Wave B5 — 입력 디바운스 typeahead
    let _typeTimer = null;
    sheet.querySelector('#asstInput').addEventListener('input', (e) => {
      if (_typeTimer) clearTimeout(_typeTimer);
      const v = (e.target.value || '').trim();
      _typeTimer = setTimeout(() => _renderTypeahead(v), 200);
    });
    _renderSuggest();
    return sheet;
  }

  // Wave B5 — 의도 예측 chips 렌더
  function _renderTypeahead(text) {
    const box = document.getElementById('asstTypeahead');
    if (!box) return;
    if (!text || text.length > 20) { box.style.display = 'none'; box.innerHTML = ''; return; }
    const firstToken = text.split(/\s+/)[0];
    if (!firstToken || firstToken.length < 2) { box.style.display = 'none'; box.innerHTML = ''; return; }
    const customers = _getCustomers();
    const match = customers.find(c => c.name.startsWith(firstToken) || c.name === firstToken);
    if (!match) { box.style.display = 'none'; box.innerHTML = ''; return; }
    const chips = [
      `${match.name} 5만원 기록`,
      `${match.name} 내일 2시 예약`,
      `${match.name} 정보 보기`,
    ];
    box.innerHTML = chips.map(c => `
      <button data-typeahead="${_esc(c)}" style="padding:6px 11px;border:1px solid hsl(340,78%,85%);border-radius:14px;background:hsl(340,100%,98%);cursor:pointer;font-size:11px;color:hsl(350,60%,40%);white-space:nowrap;font-weight:700;">✨ ${_esc(c)}</button>
    `).join('');
    box.style.display = 'flex';
  }

  function _renderHistory() {
    const body = document.getElementById('asstBody');
    if (!body) return;
    if (!_history.length) {
      body.innerHTML = `
        <div style="padding:30px 20px;text-align:center;">
          <div style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:50%;background:rgba(139,92,246,0.12);color:#7C3AED;margin-bottom:10px;">${_svg('ic-bot', 32)}</div>
          <div style="font-size:14px;color:#555;line-height:1.6;">안녕하세요 원장님 👋<br>궁금한 건 물어보고, 할 일은 맡겨주세요.<br><span style="font-size:11px;color:#888;">예: "김서연 2시 예약 추가" · "매출 5만원 카드"</span></div>
        </div>
      `;
      return;
    }
    body.innerHTML = _history.map((m, idx) => {
      if (m.role === 'user') {
        // 2026-04-26 픽스 — N장 모두 썸네일 그리드로 표시 (클릭 시 라이트박스)
        // 구버전 호환: m.photos 없고 m.thumb 만 있으면 1장으로 간주
        const photoArr = (Array.isArray(m.photos) && m.photos.length)
          ? m.photos
          : (m.thumb ? [m.thumb] : []);
        let photosHtml = '';
        if (photoArr.length === 1) {
          // 1장이면 큰 썸네일 (기존 UX 유지)
          photosHtml = `<img data-asst-photo="${idx}:0" src="${_esc(photoArr[0])}" alt="업로드 사진" style="max-width:180px;max-height:180px;border-radius:12px;margin-bottom:6px;display:block;object-fit:cover;cursor:zoom-in;" />`;
        } else if (photoArr.length > 1) {
          // 2장 이상 — 80×80 그리드. 4장 넘으면 wrap (자동 줄바꿈)
          const cells = photoArr.map((u, i) => `
            <div style="position:relative;width:80px;height:80px;border-radius:10px;overflow:hidden;flex-shrink:0;cursor:zoom-in;background:rgba(255,255,255,0.1);"
              data-asst-photo="${idx}:${i}">
              <img src="${_esc(u)}" alt="업로드 사진 ${i + 1}" style="width:100%;height:100%;object-fit:cover;display:block;" />
            </div>`).join('');
          photosHtml = `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;max-width:280px;">${cells}</div>`;
        }
        return `<div style="display:flex;justify-content:flex-end;margin-bottom:8px;">
          <div style="max-width:85%;padding:10px 14px;background:linear-gradient(135deg,#F18091,#D95F70);color:#fff;border-radius:16px 16px 4px 16px;font-size:13px;line-height:1.5;">${photosHtml}${_esc(m.text)}</div>
        </div>`;
      }
      if (m.role === 'assistant') {
        const actionHtml = m.action ? _renderActionBubble(m.action, idx, m.action_status, m.edit_mode === true) : '';
        // 2026-04-24 — unified_mode 면 통합 확인 카드, 아니면 기존 그룹 카드
        const groupsHtml = (m.action_groups && m.action_groups.length)
          ? (m.unified_mode
              ? _renderUnifiedCard(m, idx)
              : _renderActionGroups(m.action_groups, idx, m.duplicate_warnings))
          : '';
        // 단일 액션일 때 — action_index 0 경고만. group 은 내부에서 렌더하므로 여기서는 제외.
        const dupHtml = (m.action && m.duplicate_warnings && m.duplicate_warnings.length)
          ? _renderDuplicateWarnings(idx, m.duplicate_warnings, 0)
          : '';
        const fallbackHtml = m.fallback ? _renderFallbackCard(m.fallback, idx, m.fallback_status) : '';
        const relatedHtml = (m.related && m.related.length) ? `
          <div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:5px;">
            ${m.related.map(q => `<button data-suggest="${_esc(q)}" style="padding:5px 10px;border:1px solid #E2D6F7;border-radius:100px;background:#F7F2FD;cursor:pointer;font-size:11px;color:#6B21A8;white-space:nowrap;font-weight:700;transition:all 0.12s;">💬 ${_esc(q)}</button>`).join('')}
          </div>` : '';
        return `<div style="display:flex;gap:8px;margin-bottom:8px;align-items:flex-start;">
          <div style="width:28px;height:28px;border-radius:50%;background:rgba(139,92,246,0.15);display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;color:#7C3AED;">${_svg('ic-bot', 16)}</div>
          <div style="max-width:85%;min-width:0;">
            <div style="padding:10px 14px;background:#fff;border:1px solid rgba(0,0,0,0.06);border-radius:16px 16px 16px 4px;font-size:13px;line-height:1.6;color:#222;white-space:pre-wrap;">${_esc(m.text)}</div>
            <div style="margin-top:3px;padding-left:4px;">
              <button data-report-ai="chat_answer" data-snippet="${_esc(m.text).replace(/"/g,'&quot;')}" data-source="/assistant/chat" aria-label="AI 답변 신고"
                style="background:transparent;border:none;cursor:pointer;font-size:10px;color:#bbb;padding:2px 4px;display:inline-flex;align-items:center;gap:3px;">${_svg('ic-flag', 11)} 신고</button>
            </div>
            ${dupHtml}
            ${actionHtml}
            ${groupsHtml}
            ${fallbackHtml}
            ${relatedHtml}
          </div>
        </div>`;
      }
      // loading
      return `<div style="display:flex;gap:8px;margin-bottom:8px;align-items:flex-start;">
        <div style="width:28px;height:28px;border-radius:50%;background:rgba(139,92,246,0.15);display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;color:#7C3AED;">${_svg('ic-bot', 16)}</div>
        <div style="padding:10px 14px;background:#fff;border:1px solid rgba(0,0,0,0.06);border-radius:16px;">
          <span style="display:inline-block;animation:asstDots 1.4s infinite;font-size:20px;color:#bbb;">···</span>
        </div>
      </div>
      <style>@keyframes asstDots { 0%,20% { opacity:0.2; } 50% { opacity:1; } 100% { opacity:0.2; } }</style>`;
    }).join('');
    body.scrollTop = body.scrollHeight;
    _bindActionButtons();
  }

  // 재고·지출 품목 리스트 편집 UI
  // fieldAttr: 'single-field' (단일 액션) 또는 'row-field' (그룹 행)
  // itemAddAttr / itemDelAttr: 추가·삭제 버튼에 붙일 data- 속성명
  // keyPrefix: 단일 액션은 historyIdx 숫자, 그룹 행은 "hi:gi:ii" 문자열
  // compact: 그룹 행용 축소 버전
  function _renderItemsEditor(keyPrefix, items, opts) {
    const o = opts || {};
    const fieldAttr = o.fieldAttr || 'row-field';
    const addAttr = o.addAttr || 'row-item-add';
    const delAttr = o.delAttr || 'row-item-delete';
    const compact = o.compact === true;
    const color = o.color || '#2B8C7E';
    const list = Array.isArray(items) ? items : [];
    const sz = compact
      ? { fs: '10px', pad: '5px 7px', gap: '5px', btn: '28px' }
      : { fs: '11px', pad: '7px 9px', gap: '6px', btn: '32px' };
    const rows = list.map((it, i) => {
      const name = (it && it.name) || '';
      const qty = (it && (it.quantity ?? it.qty)) != null ? (it.quantity ?? it.qty) : 1;
      const unit = (it && (it.unit_price ?? it.unitPrice));
      const cat = (it && it.category) || '';
      return `
        <div style="display:grid;grid-template-columns:2fr 0.9fr 1.1fr 1fr ${sz.btn};gap:${sz.gap};align-items:center;">
          <input data-${fieldAttr}="${keyPrefix}:items:${i}:name" value="${_esc(name)}" placeholder="품목명"
            style="padding:${sz.pad};border:1px solid hsl(220,15%,85%);border-radius:8px;font-size:${sz.fs};background:#fff;min-width:0;" />
          <input data-${fieldAttr}="${keyPrefix}:items:${i}:quantity" type="number" inputmode="numeric" min="0" value="${_esc(qty)}" placeholder="수량"
            style="padding:${sz.pad};border:1px solid hsl(220,15%,85%);border-radius:8px;font-size:${sz.fs};background:#fff;min-width:0;" />
          <input data-${fieldAttr}="${keyPrefix}:items:${i}:unit_price" type="number" inputmode="numeric" min="0" value="${_esc(unit == null ? '' : unit)}" placeholder="단가"
            style="padding:${sz.pad};border:1px solid hsl(220,15%,85%);border-radius:8px;font-size:${sz.fs};background:#fff;min-width:0;" />
          <select data-${fieldAttr}="${keyPrefix}:items:${i}:category"
            style="padding:${sz.pad};border:1px solid hsl(220,15%,85%);border-radius:8px;font-size:${sz.fs};background:#fff;min-width:0;">
            <option value=""${cat ? '' : ' selected'}>분류</option>
            ${_categoryOptionsHtml(cat)}
          </select>
          <button data-${delAttr}="${keyPrefix}:${i}" aria-label="품목 삭제" title="품목 삭제"
            style="padding:0;border:1px solid hsl(0,60%,85%);border-radius:8px;background:hsl(0,70%,98%);color:hsl(0,60%,45%);cursor:pointer;font-size:${sz.fs};height:100%;display:inline-flex;align-items:center;justify-content:center;">${_svg('ic-trash-2', compact ? 12 : 13)}</button>
        </div>`;
    }).join('');
    const emptyHint = list.length ? '' : `<div style="font-size:11px;color:#999;padding:6px 2px;">품목이 없어요. 아래 버튼으로 추가하세요.</div>`;
    return `
      <div style="display:flex;flex-direction:column;gap:${sz.gap};">${rows}${emptyHint}</div>
      <button data-${addAttr}="${keyPrefix}"
        style="margin-top:6px;padding:7px 10px;border:1px dashed ${color};border-radius:8px;background:#fff;color:${color};font-size:${sz.fs};font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:5px;">${_svg('ic-plus', 12)} 품목 추가</button>`;
  }

  // ─── 중복 의심 경고 카드 (영수증·주문내역 여러 장 업로드 시) ───
  // warnings: [{action_index, reason, prev, confidence, dismissed}]
  // 특정 action_index 에 해당하는 경고만 필터해서 렌더. 없으면 빈 문자열.
  function _renderDuplicateWarnings(historyIdx, warnings, filterActionIdx) {
    if (!Array.isArray(warnings) || !warnings.length) return '';
    const rendered = warnings.map((w, wi) => {
      if (w.dismissed) return '';
      if (filterActionIdx != null && w.action_index !== filterActionIdx) return '';
      const reason = w.reason || '비슷한 내용을 최근에 기록했어요';
      return `
        <div style="margin:6px 0;padding:10px 12px;background:#FFF7ED;border:1px solid #FDBA74;border-radius:12px;">
          <div style="font-size:12px;font-weight:700;color:#C2410C;margin-bottom:6px;display:inline-flex;align-items:center;gap:4px;">${_svg('ic-alert-triangle', 12)} 중복 의심</div>
          <div style="font-size:12px;color:#7C2D12;line-height:1.5;">${_esc(reason)}</div>
          <div style="display:flex;gap:6px;margin-top:8px;">
            <button data-dup-proceed="${historyIdx}:${wi}" style="flex:1;padding:7px;border:1px solid #C2410C;border-radius:8px;background:#fff;color:#C2410C;cursor:pointer;font-size:11px;">그래도 추가</button>
            <button data-dup-skip="${historyIdx}:${wi}" style="flex:1;padding:7px;border:none;border-radius:8px;background:#C2410C;color:#fff;cursor:pointer;font-size:11px;">건너뛰기</button>
          </div>
        </div>`;
    }).filter(Boolean).join('');
    return rendered;
  }

  function _renderActionBubble(action, historyIdx, status, editing) {
    if (!action || !action.kind) return '';
    // 2026-04-24 — icon 은 Lucide sprite id (문자열), 렌더 시 _svg() 로 변환
    const kindBadge = {
      create_booking:  { icon: 'ic-calendar',       label: '예약 추가',       color: '#F18091' },
      create_revenue:  { icon: 'ic-dollar-sign',    label: '매출 기록',       color: '#388e3c' },
      create_customer: { icon: 'ic-user',           label: '고객 등록',       color: '#4ECDC4' },
      create_nps:      { icon: 'ic-star',           label: '후기 기록',       color: '#FFD700' },
      update_booking:  { icon: 'ic-edit-3',         label: '예약 수정',       color: '#A78BFA' },
      cancel_booking:  { icon: 'ic-trash-2',        label: '예약 취소',       color: '#DC3545' },
      reschedule_booking: { icon: 'ic-refresh-cw',  label: '예약 시간 변경',  color: '#0288D1' },
      update_customer: { icon: 'ic-edit-3',         label: '고객 정보 수정',  color: '#4ECDC4' },
      create_expense:  { icon: 'ic-credit-card',    label: '지출 기록',       color: '#E07A5F' },
      upsert_inventory: { icon: 'ic-package',       label: '재고 추가',       color: '#2B8C7E' },
      generate_bulk_message: { icon: 'ic-message-square', label: '단체 메시지 초안', color: '#FF8A5C' },
    }[action.kind] || { icon: 'ic-check', label: action.kind, color: '#666' };

    if (status === 'done') {
      return `<div style="margin-top:6px;padding:10px 12px;background:linear-gradient(135deg,rgba(76,175,80,0.12),rgba(76,175,80,0.02));border-radius:12px;border-left:3px solid #388e3c;">
        <div style="font-size:11px;font-weight:700;color:#388e3c;display:inline-flex;align-items:center;gap:4px;">${_svg('ic-check', 12)} 완료</div>
      </div>`;
    }
    if (status === 'failed') {
      // 2026-04-26 버그B 픽스 — historyIdx 의 errorMsg 가 있으면 사유 노출
      let errLine = '';
      try {
        const _msg = (Array.isArray(_history) ? _history[historyIdx] : null);
        if (_msg && _msg.action_error) {
          errLine = `<div style="font-size:11px;color:hsl(0,60%,35%);margin-top:4px;line-height:1.4;">사유: ${_esc(_msg.action_error)}</div>`;
        }
      } catch (_e) { void _e; }
      return `<div style="margin-top:6px;padding:10px 12px;background:rgba(220,53,69,0.08);border-radius:12px;border-left:3px solid #dc3545;">
        <div style="font-size:11px;font-weight:700;color:#dc3545;">실패 — 다시 말씀해 주세요</div>
        ${errLine}
      </div>`;
    }
    if (status === 'running') {
      return `<div style="margin-top:6px;padding:12px;background:#fff;border:1px solid ${kindBadge.color};border-radius:12px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="display:inline-block;width:14px;height:14px;border:2px solid ${kindBadge.color};border-top-color:transparent;border-radius:50%;animation:asst-spin 0.8s linear infinite;"></span>
          <span style="font-size:12px;font-weight:700;color:${kindBadge.color};">저장 중…</span>
        </div>
      </div>
      <style>@keyframes asst-spin { to { transform: rotate(360deg); } }</style>`;
    }

    // 편집 모드 — 필드 인라인 수정
    if (editing) {
      const p = action.payload || {};
      const editFields = [];
      const addField = (field, label, val, extra) => {
        if (val === undefined) return;
        const ex = extra || {};
        const type = ex.type || 'text';
        if (ex.select) {
          editFields.push(`
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="width:52px;font-size:11px;color:hsl(220,10%,50%);font-weight:700;">${label}</span>
              <select data-single-field="${historyIdx}:${field}" style="flex:1;padding:7px 10px;border:1px solid hsl(220,15%,85%);border-radius:10px;font-size:12px;background:#fff;">
                <option value=""${val ? '' : ' selected'}>선택</option>
                ${_categoryOptionsHtml(val)}
              </select>
            </div>`);
        } else {
          editFields.push(`
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="width:52px;font-size:11px;color:hsl(220,10%,50%);font-weight:700;">${label}</span>
              <input data-single-field="${historyIdx}:${field}" type="${type}" value="${_esc(val == null ? '' : val)}" style="flex:1;padding:7px 10px;border:1px solid hsl(220,15%,85%);border-radius:10px;font-size:12px;background:#fff;" />
            </div>`);
        }
      };

      let itemsHtml = '';
      if (action.kind === 'upsert_inventory') {
        // 재고: items[] 만 편집
        if (!Array.isArray(p.items)) p.items = [];
        itemsHtml = `
          <div style="font-size:11px;font-weight:700;color:hsl(220,10%,50%);margin-bottom:4px;">품목</div>
          ${_renderItemsEditor(String(historyIdx), p.items, {
            fieldAttr: 'single-field',
            addAttr: 'single-item-add',
            delAttr: 'single-item-delete',
            color: kindBadge.color,
          })}`;
        if ('memo' in p) addField('memo', '메모', p.memo);
      } else if (action.kind === 'create_expense') {
        // 지출: vendor / amount / category / memo + items[]
        addField('vendor', '가게', p.vendor == null ? '' : p.vendor);
        addField('amount', '총액', p.amount == null ? '' : p.amount, { type: 'number' });
        addField('category', '분류', p.category == null ? '' : p.category, { select: true });
        addField('memo', '메모', p.memo == null ? '' : p.memo);
        if (!Array.isArray(p.items)) p.items = [];
        itemsHtml = `
          <div style="font-size:11px;font-weight:700;color:hsl(220,10%,50%);margin:10px 0 4px;">품목 (선택)</div>
          ${_renderItemsEditor(String(historyIdx), p.items, {
            fieldAttr: 'single-field',
            addAttr: 'single-item-add',
            delAttr: 'single-item-delete',
            color: kindBadge.color,
          })}`;
      } else {
        // 기존 고객/매출/예약 필드
        if ('customer_name' in p || 'name' in p) addField('customer_name', '이름', p.customer_name ?? p.name);
        if ('customer_phone' in p || 'phone' in p) addField('customer_phone', '전화', p.customer_phone ?? p.phone);
        if ('service_name' in p) addField('service_name', '시술', p.service_name);
        if ('amount' in p) addField('amount', '금액', p.amount);
        if ('starts_at' in p) addField('starts_at', '시작', p.starts_at);
        if ('memo' in p) addField('memo', '메모', p.memo);
        if (!editFields.length) {
          editFields.push(`
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="width:52px;font-size:11px;color:hsl(220,10%,50%);font-weight:700;">내용</span>
              <input data-single-field="${historyIdx}:confirmation_text" value="${_esc(action.confirmation_text || '')}" style="flex:1;padding:7px 10px;border:1px solid hsl(220,15%,85%);border-radius:10px;font-size:12px;" />
            </div>`);
        }
      }

      return `<div style="margin-top:6px;padding:12px;background:#fff;border:1px solid ${kindBadge.color};border-radius:12px;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
          <span style="display:inline-flex;align-items:center;color:${kindBadge.color};">${_svg(kindBadge.icon, 14)}</span>
          <span style="font-size:11px;font-weight:700;color:${kindBadge.color};">${kindBadge.label} · 편집 모드</span>
        </div>
        ${editFields.length ? `<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px;">${editFields.join('')}</div>` : ''}
        ${itemsHtml}
        <div style="display:flex;gap:6px;margin-top:10px;">
          <button data-action-save="${historyIdx}" style="flex:1;padding:9px;border:none;border-radius:8px;background:${kindBadge.color};color:#fff;font-weight:800;cursor:pointer;font-size:12px;display:inline-flex;align-items:center;justify-content:center;gap:5px;">${_svg('ic-save', 13)} 저장</button>
          <button data-action-editcancel="${historyIdx}" style="flex:1;padding:9px;border:1px solid #eee;border-radius:8px;background:#fff;color:#888;cursor:pointer;font-size:12px;">취소</button>
        </div>
      </div>`;
    }

    // pending (기본)
    return `<div style="margin-top:6px;padding:12px;background:#fff;border:1px solid ${kindBadge.color};border-radius:12px;">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
        <span style="display:inline-flex;align-items:center;color:${kindBadge.color};">${_svg(kindBadge.icon, 14)}</span>
        <span style="font-size:11px;font-weight:700;color:${kindBadge.color};">${kindBadge.label}</span>
      </div>
      <div style="font-size:13px;color:#222;font-weight:600;margin-bottom:10px;line-height:1.5;">${_esc(action.confirmation_text || '')}</div>
      <div style="display:flex;gap:6px;">
        <button data-action-edit="${historyIdx}" style="flex:1;padding:9px;border:1px solid ${kindBadge.color};border-radius:8px;background:#fff;color:${kindBadge.color};font-weight:700;cursor:pointer;font-size:12px;display:inline-flex;align-items:center;justify-content:center;gap:5px;">${_svg('ic-edit-3', 13)} 수정</button>
        <button data-action-run="${historyIdx}" style="flex:2;padding:9px;border:none;border-radius:8px;background:${kindBadge.color};color:#fff;font-weight:800;cursor:pointer;font-size:12px;display:inline-flex;align-items:center;justify-content:center;gap:5px;">추가하기 ${_svg('ic-check', 13)}</button>
        <button data-action-cancel="${historyIdx}" style="flex:1;padding:9px;border:1px solid #eee;border-radius:8px;background:#fff;color:#888;cursor:pointer;font-size:12px;">취소</button>
      </div>
    </div>`;
  }

  // 액션 그룹 내 한 행을 사람이 읽을 수 있게 1줄로 요약
  // 2026-04-26 버그A·C 픽스 — kind 별 핵심 식별자 우선 노출
  //   create_expense   → vendor + memo + amount   (가게명 누락 방지)
  //   upsert_inventory → items[0].name + 수량      (항목명 누락 방지)
  //   create_revenue   → customer_name + service + amount
  //   create_customer  → name + phone
  //   create_booking   → customer_name + service + 시작 시각
  function _summarizeItem(action) {
    const p = (action && action.payload) || {};
    const kind = (action && action.kind) || '';
    const parts = [];
    const _fmtAmt = (a) => (a == null ? '' : Number(a).toLocaleString() + '원');
    const _fmtDate = (s) => { try { const d = new Date(s); return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + d.getHours() + '시'; } catch (_e) { return ''; } };

    if (kind === 'create_expense') {
      // 가게명(vendor) 우선 — 없으면 "지출처 미상"
      const v = (p.vendor || '').trim();
      parts.push(v || '지출처 미상');
      const m = (p.memo || '').trim();
      if (m) parts.push(m.slice(0, 20));
      if (p.amount) parts.push(_fmtAmt(p.amount));
    } else if (kind === 'upsert_inventory') {
      const items = Array.isArray(p.items) ? p.items : [];
      if (items.length) {
        const it0 = items[0] || {};
        const nm = (it0.name || '').trim();
        if (nm) parts.push(nm);
        if (it0.quantity) parts.push(it0.quantity + '개');
        if (items.length > 1) parts.push('외 ' + (items.length - 1) + '건');
        const total = items.reduce((s, x) => s + (Number(x && x.total) || 0), 0);
        if (total > 0) parts.push(_fmtAmt(total));
      } else if (p.amount) {
        parts.push('재고 입고');
        parts.push(_fmtAmt(p.amount));
      } else {
        parts.push('재고 항목 미상');
      }
    } else if (kind === 'create_customer') {
      if (p.customer_name || p.name) parts.push(p.customer_name || p.name);
      if (p.customer_phone || p.phone) parts.push(p.customer_phone || p.phone);
      if (p.memo) parts.push(String(p.memo).slice(0, 20));
    } else if (kind === 'create_booking') {
      if (p.customer_name || p.name) parts.push(p.customer_name || p.name);
      if (p.service_name) parts.push(p.service_name);
      if (p.starts_at) { const t = _fmtDate(p.starts_at); if (t) parts.push(t); }
    } else if (kind === 'create_revenue') {
      if (p.customer_name || p.name) parts.push(p.customer_name || p.name);
      else parts.push('고객 미상');
      if (p.service_name) parts.push(p.service_name);
      if (p.amount) parts.push(_fmtAmt(p.amount));
      if (!p.amount && (p.customer_phone || p.phone)) parts.push(p.customer_phone || p.phone);
    } else {
      // 기본 — 이름·금액·시술 순
      if (p.customer_name || p.name) parts.push(p.customer_name || p.name);
      if (p.customer_phone || p.phone) parts.push(p.customer_phone || p.phone);
      if (p.service_name) parts.push(p.service_name);
      if (p.amount) parts.push(_fmtAmt(p.amount));
      if (p.starts_at) { const t = _fmtDate(p.starts_at); if (t) parts.push(t); }
      if (p.memo) parts.push(String(p.memo).slice(0, 20));
    }
    if (!parts.length && action && action.confirmation_text) return action.confirmation_text;
    return parts.join(' · ') || kind || '';
  }

  // 카테고리별로 묶인 액션 카드 렌더 (2건 이상일 때 사용)
  function _renderActionGroups(groups, historyIdx, duplicateWarnings) {
    if (!groups || !groups.length) return '';
    return groups.map((g, gIdx) => _renderActionGroup(g, historyIdx, gIdx, duplicateWarnings)).join('');
  }

  // 2026-04-24 — 통합 확인 카드 (unified preview)
  // 2~6건 · 서로 다른 kind 2종 이상 섞였을 때 노출.
  // 한 번의 [전체 추가] 로 순차 실행 (create_customer 먼저, 그 뒤 예약/매출).
  function _shouldUseUnifiedCard(groups) {
    if (!Array.isArray(groups) || groups.length < 2) return false;
    const total = groups.reduce((n, g) => n + (g.items ? g.items.length : 0), 0);
    if (total < 2 || total > 6) return false;
    const distinctKinds = new Set(groups.map(g => g.kind));
    return distinctKinds.size >= 2;
  }

  // create_customer 를 최상위로 정렬 — customer_id 참조 의존성 보호
  // (현재 백엔드 resolver 가 customer_name 으로 조회하지만, 방금 만든 고객은
  //  다음 액션 시점까지 DB 에 반영되어야 안전함)
  function _unifiedExecutionOrder(groups) {
    const priority = {
      create_customer: 0,
      update_customer: 1,
      create_booking: 2,
      update_booking: 3,
      reschedule_booking: 3,
      cancel_booking: 3,
      create_revenue: 4,
      create_expense: 5,
      upsert_inventory: 6,
      create_nps: 7,
      generate_bulk_message: 8,
    };
    const flat = [];
    (groups || []).forEach((g, gi) => {
      (g.items || []).forEach((it, ii) => {
        flat.push({ gi, ii, it, kind: g.kind, order: priority[g.kind] ?? 99 });
      });
    });
    flat.sort((a, b) => (a.order - b.order) || (a.gi - b.gi) || (a.ii - b.ii));
    return flat;
  }

  function _renderUnifiedCard(msg, historyIdx) {
    const groups = msg.action_groups || [];
    const flat = _unifiedExecutionOrder(groups);
    const total = flat.length;
    const progress = msg.unified_progress;
    const doneCount = flat.filter(f => f.it.status === 'done').length;
    const failedCount = flat.filter(f => f.it.status === 'failed').length;
    const skippedCount = flat.filter(f => f.it.skipped).length;
    const allTouched = (doneCount + failedCount + skippedCount) >= total && total > 0;

    // 완료 상태 — 축소된 성공 카드
    if (allTouched && !progress) {
      const label = failedCount
        ? `${doneCount}건 저장 · ${failedCount}건 실패`
        : (skippedCount ? `${doneCount}건 저장 · ${skippedCount}건 제외` : `${total}건 모두 저장 완료`);
      return `<div style="margin-top:6px;padding:12px;background:linear-gradient(135deg,hsl(145,45%,94%),hsl(145,45%,98%));border-radius:14px;border-left:3px solid hsl(145,50%,40%);">
        <div style="font-size:13px;font-weight:800;color:hsl(145,50%,30%);display:inline-flex;align-items:center;gap:6px;">${_svg('ic-check-circle', 14)} ${_esc(label)}</div>
      </div>`;
    }

    // 행 아이콘·요약
    const rowsHtml = flat.map((f) => {
      const meta = _catMeta(f.kind);
      const summary = _summarizeItem(f.it.action);
      let statusIcon = `<span style="width:16px;height:16px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;color:${meta.color};">${_svg(meta.icon, 14)}</span>`;
      let rowBg = 'transparent';
      let rowOpacity = 1;
      let statusRight = '';
      if (f.it.status === 'done') {
        statusIcon = `<span style="width:16px;height:16px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;color:hsl(145,50%,40%);">${_svg('ic-check-circle', 14)}</span>`;
        rowBg = 'hsl(145,45%,97%)';
        statusRight = `<span style="font-size:10px;color:hsl(145,50%,35%);font-weight:700;flex-shrink:0;">완료</span>`;
      } else if (f.it.status === 'failed') {
        statusIcon = `<span style="width:16px;height:16px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;color:hsl(0,70%,50%);">${_svg('ic-x', 14)}</span>`;
        rowBg = 'hsl(0,70%,97%)';
        statusRight = `<span style="font-size:10px;color:hsl(0,70%,45%);font-weight:700;flex-shrink:0;">실패</span>`;
      } else if (f.it.status === 'running') {
        statusIcon = `<span style="width:16px;height:16px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;"><span style="display:inline-block;width:12px;height:12px;border:2px solid ${meta.color};border-top-color:transparent;border-radius:50%;animation:asst-spin 0.8s linear infinite;"></span></span>`;
        statusRight = `<span style="font-size:10px;color:${meta.color};font-weight:700;flex-shrink:0;">저장 중…</span>`;
      } else if (f.it.skipped) {
        rowOpacity = 0.45;
        statusRight = `<span style="font-size:10px;color:#999;font-weight:700;flex-shrink:0;">제외</span>`;
      }
      // 2026-04-26 버그B 픽스 — 실패 행에 사유(it.errorMsg) 함께 노출
      const errorLine = (f.it.status === 'failed' && f.it.errorMsg)
        ? `<div style="font-size:10px;color:hsl(0,60%,40%);margin-top:2px;line-height:1.4;">사유: ${_esc(f.it.errorMsg)}</div>`
        : '';
      return `
        <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:${rowBg};border-radius:10px;opacity:${rowOpacity};">
          ${statusIcon}
          <div style="flex:1;min-width:0;font-size:12px;color:#333;line-height:1.4;">
            <span style="font-weight:700;color:${_catMeta(f.kind).color};">${_esc(_catMeta(f.kind).label)}</span>
            <span style="color:#555;">: ${_esc(summary)}</span>
            ${errorLine}
          </div>
          ${statusRight}
        </div>`;
    }).join('');

    // 진행 중 헤더
    const progressLine = progress
      ? `<div style="font-size:11px;color:hsl(350,60%,40%);font-weight:700;margin-top:2px;">${_esc(progress.label || '진행 중…')} · ${progress.current}/${progress.total}</div>`
      : (allTouched
          ? `<div style="font-size:11px;color:#888;margin-top:2px;">완료 ${doneCount} · 실패 ${failedCount} · 제외 ${skippedCount}</div>`
          : `<div style="font-size:11px;color:#888;margin-top:2px;">${total}건을 한 번에 추가할 수 있어요</div>`);

    // 헤더 (핑크 그라데이션)
    const header = `
      <div style="padding:12px 14px;background:linear-gradient(135deg,hsl(340,80%,95%),hsl(340,100%,98%));border-radius:14px 14px 0 0;border-bottom:1px solid hsl(340,30%,90%);">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:8px;background:hsl(340,80%,60%);color:#fff;">${_svg('ic-layers', 16)}</span>
          <div style="flex:1;min-width:0;">
            <div style="font-size:13px;font-weight:800;color:hsl(340,60%,35%);">한 번에 추가할 내용 <span style="color:hsl(340,80%,50%);">(${total}건)</span></div>
            ${progressLine}
          </div>
        </div>
      </div>`;

    // 액션 버튼 (진행 중 아니면 pulse 애니메이션)
    const running = !!progress;
    const hasRemaining = flat.some(f => !f.it.skipped && f.it.status !== 'done' && f.it.status !== 'running');
    const runLabel = running
      ? `진행 중 ${progress.current}/${progress.total}`
      : (doneCount + failedCount + skippedCount > 0 && hasRemaining
          ? `${_svg('ic-check', 13)} 남은 항목 추가하기`
          : `${_svg('ic-check', 13)} 전체 추가하기`);
    const pulseClass = (!running && hasRemaining) ? 'asst-unified-pulse' : '';

    const controls = `
      <div style="display:flex;gap:6px;padding:10px 12px;">
        <button data-unified-edit="${historyIdx}" ${running ? 'disabled' : ''} style="flex:1;padding:10px;border:1px solid hsl(340,60%,70%);border-radius:10px;background:#fff;color:hsl(340,60%,40%);font-weight:800;cursor:${running ? 'not-allowed' : 'pointer'};font-size:12px;opacity:${running ? 0.5 : 1};display:inline-flex;align-items:center;justify-content:center;gap:5px;">
          ${_svg('ic-edit-3', 13)} 수정
        </button>
        <button data-unified-runall="${historyIdx}" ${running || !hasRemaining ? 'disabled' : ''} class="${pulseClass}" style="flex:2;padding:10px;border:none;border-radius:10px;background:linear-gradient(135deg,#F18091,#D95F70);color:#fff;font-weight:800;cursor:${running || !hasRemaining ? 'not-allowed' : 'pointer'};font-size:13px;opacity:${running || !hasRemaining ? 0.6 : 1};display:inline-flex;align-items:center;justify-content:center;gap:5px;">
          ${runLabel}
        </button>
      </div>`;

    return `<div style="margin-top:6px;background:#fff;border:1px solid hsl(340,30%,88%);border-radius:14px;overflow:hidden;box-shadow:0 2px 8px rgba(241,128,145,0.08);">
      ${header}
      <div style="padding:10px 12px;display:flex;flex-direction:column;gap:6px;">${rowsHtml}</div>
      ${controls}
    </div>
    <style>
      @keyframes asst-unified-pulse {
        0%,100% { box-shadow: 0 0 0 0 rgba(241,128,145,0.55); }
        50%     { box-shadow: 0 0 0 6px rgba(241,128,145,0); }
      }
      .asst-unified-pulse { animation: asst-unified-pulse 1.8s ease-in-out infinite; }
      @keyframes asst-spin { to { transform: rotate(360deg); } }
    </style>`;
  }

  function _renderActionGroup(group, historyIdx, gIdx, duplicateWarnings) {
    const meta = _catMeta(group.kind);
    const total = group.items.length;
    const done = group.items.filter(it => it.status === 'done').length;
    const skipped = group.items.filter(it => it.skipped).length;
    const remaining = total - done - skipped;
    const allDone = total > 0 && (done + skipped) >= total && done > 0;

    // 전부 완료된 경우 — 축소된 성공 카드
    if (allDone) {
      const label = skipped
        ? `${meta.label} ${done}건 추가됨 (${skipped}건 제외)`
        : `${meta.label} ${done}건 모두 추가됨`;
      return `<div style="margin-top:6px;padding:12px;background:linear-gradient(135deg,hsl(145,45%,94%),hsl(145,45%,98%));border-radius:14px;border-left:3px solid hsl(145,50%,40%);">
        <div style="font-size:13px;font-weight:800;color:hsl(145,50%,30%);display:inline-flex;align-items:center;gap:6px;">${_svg('ic-check-circle', 14)} ${_esc(label)}</div>
      </div>`;
    }

    const headerLine = group.bulkProgress
      ? `<div style="font-size:11px;color:${meta.color};font-weight:700;margin-top:2px;">진행 중 · ${group.bulkProgress.current}/${group.bulkProgress.total} 완료</div>`
      : (done || skipped
          ? `<div style="font-size:11px;color:#888;margin-top:2px;">완료 ${done} · 제외 ${skipped} · 남음 ${remaining}</div>`
          : '');

    const header = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
        <span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:8px;background:${meta.color}22;color:${meta.color};">${_svg(meta.icon, 16)}</span>
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:800;color:#222;">${_esc(meta.label)} <span style="color:${meta.color};">(${total}건)</span></div>
          ${headerLine}
        </div>
      </div>`;

    const toggleIcon = group.expanded ? _svg('ic-chevron-down', 13) : _svg('ic-edit-3', 13);
    const runIcon = _svg('ic-check', 13);
    const controls = `
      <div style="display:flex;gap:6px;">
        <button data-group-toggle="${historyIdx}:${gIdx}" style="flex:1;padding:9px;border:1px solid ${meta.color};border-radius:10px;background:#fff;color:${meta.color};font-weight:800;cursor:pointer;font-size:12px;display:inline-flex;align-items:center;justify-content:center;gap:5px;">
          ${toggleIcon} ${group.expanded ? '접기' : '수정하기'}
        </button>
        <button data-group-runall="${historyIdx}:${gIdx}" ${group.bulkProgress ? 'disabled' : ''} style="flex:2;padding:9px;border:none;border-radius:10px;background:${meta.color};color:#fff;font-weight:800;cursor:${group.bulkProgress ? 'not-allowed' : 'pointer'};font-size:12px;opacity:${group.bulkProgress ? 0.6 : 1};display:inline-flex;align-items:center;justify-content:center;gap:5px;">
          ${group.bulkProgress ? `진행 중 ${group.bulkProgress.current}/${group.bulkProgress.total}` : (done + skipped > 0 ? `${runIcon} 남은 ${remaining}개 추가` : `${runIcon} 전체 추가`)}
        </button>
      </div>`;

    let listHtml = '';
    if (group.expanded) {
      const rows = group.items.map((it, iIdx) => {
        const rowHtml = _renderGroupRow(it, historyIdx, gIdx, iIdx, meta);
        // 이 아이템의 원래 action 인덱스 (it.origIdx) 에 해당하는 중복 경고만 앞에 붙임
        const warnHtml = (it.origIdx != null && !it.skipped && it.status !== 'done')
          ? _renderDuplicateWarnings(historyIdx, duplicateWarnings, it.origIdx)
          : '';
        return `${warnHtml}${rowHtml}`;
      }).join('');
      listHtml = `<div style="margin-top:10px;padding-top:10px;border-top:1px dashed hsl(220,15%,88%);display:flex;flex-direction:column;gap:8px;">${rows}</div>
        <div style="height:10px;"></div>`;
    }

    // 접힌 상태에서도 그룹 내 액션에 해당하는 중복 의심 개수 표시 (배너)
    let dupBannerHtml = '';
    if (!group.expanded && Array.isArray(duplicateWarnings) && duplicateWarnings.length) {
      const origIdxSet = new Set(group.items.map(it => it.origIdx));
      const hits = duplicateWarnings.filter(w => !w.dismissed && origIdxSet.has(w.action_index));
      if (hits.length) {
        dupBannerHtml = `<div style="margin-bottom:8px;padding:8px 10px;background:#FFF7ED;border:1px solid #FDBA74;border-radius:10px;font-size:11px;color:#C2410C;font-weight:700;display:inline-flex;align-items:center;gap:5px;">
          ${_svg('ic-alert-triangle', 12)} 중복 의심 ${hits.length}건 — '수정하기' 눌러서 확인하세요
        </div>`;
      }
    }

    return `<div style="margin-top:6px;padding:12px;background:#fff;border:1px solid ${meta.color};border-radius:14px;">
      ${header}
      ${dupBannerHtml}
      ${listHtml}
      ${controls}
    </div>`;
  }

  function _renderGroupRow(it, historyIdx, gIdx, iIdx, meta) {
    const key = `${historyIdx}:${gIdx}:${iIdx}`;
    const p = (it.action && it.action.payload) || {};

    if (it.status === 'done') {
      return `<div style="padding:9px 10px;border-radius:10px;background:hsl(145,45%,96%);border:1px solid hsl(145,45%,85%);font-size:12px;color:hsl(145,50%,30%);font-weight:700;display:inline-flex;align-items:center;gap:5px;width:100%;box-sizing:border-box;">
        ${_svg('ic-check', 12)} <span>${_esc(_summarizeItem(it.action))}</span>
      </div>`;
    }
    if (it.status === 'failed') {
      // 2026-04-26 버그B 픽스 — 실패 사유(it.errorMsg) 가 있으면 함께 노출
      const errLine = it.errorMsg
        ? `<div style="font-size:11px;color:hsl(0,60%,35%);background:hsl(0,70%,98%);padding:6px 8px;border-radius:8px;margin-bottom:6px;line-height:1.4;">사유: ${_esc(it.errorMsg)}</div>`
        : '';
      return `<div style="padding:9px 10px;border-radius:10px;background:hsl(0,70%,96%);border:1px solid hsl(0,70%,85%);">
        <div style="font-size:12px;color:hsl(0,70%,40%);font-weight:700;margin-bottom:6px;display:inline-flex;align-items:center;gap:5px;">${_svg('ic-x', 12)} <span>실패 — ${_esc(_summarizeItem(it.action))}</span></div>
        ${errLine}
        <button data-row-run="${key}" style="padding:6px 10px;border:1px solid ${meta.color};border-radius:8px;background:#fff;color:${meta.color};font-size:11px;font-weight:700;cursor:pointer;">다시 시도</button>
      </div>`;
    }
    if (it.skipped) {
      return `<div style="padding:9px 10px;border-radius:10px;background:#f5f5f5;border:1px dashed #ccc;opacity:0.55;display:flex;align-items:center;gap:8px;">
        <div style="flex:1;font-size:12px;color:#888;text-decoration:line-through;">${iIdx + 1}. ${_esc(_summarizeItem(it.action))}</div>
        <button data-row-unskip="${key}" style="padding:5px 9px;border:1px solid #ccc;border-radius:8px;background:#fff;color:#666;font-size:11px;font-weight:700;cursor:pointer;">되돌리기</button>
      </div>`;
    }

    // pending · editing
    const editing = it.editing === true;
    const summary = _summarizeItem(it.action);
    const rowHead = `<div style="font-size:12px;color:#222;font-weight:700;">${iIdx + 1}. ${_esc(summary)}</div>`;

    // 편집 가능 필드 (있는 것만 보여주기)
    const editFields = [];
    const addField = (field, label, val, extra) => {
      if (val === undefined) return;
      const ex = extra || {};
      const type = ex.type || 'text';
      if (ex.select) {
        editFields.push(`
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="width:50px;font-size:10px;color:#888;font-weight:700;">${label}</span>
            <select data-row-field="${key}:${field}" style="flex:1;padding:6px 8px;border:1px solid hsl(220,15%,85%);border-radius:8px;font-size:11px;background:#fff;">
              <option value=""${val ? '' : ' selected'}>선택</option>
              ${_categoryOptionsHtml(val)}
            </select>
          </div>`);
      } else {
        editFields.push(`
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="width:50px;font-size:10px;color:#888;font-weight:700;">${label}</span>
            <input data-row-field="${key}:${field}" type="${type}" value="${_esc(val == null ? '' : val)}" style="flex:1;padding:6px 8px;border:1px solid hsl(220,15%,85%);border-radius:8px;font-size:11px;background:#fff;" />
          </div>`);
      }
    };
    let itemsHtml = '';
    if (editing) {
      // 2026-04-24 디버그 — 편집 모드 진입 시 (key, it.action.payload) 가 일치하는지 확인
      try {
        if (window.__ASSISTANT_DEBUG__) {
          console.log('[renderGroupRow] edit', key, 'origIdx=', it.origIdx,
            'customer_name=', p.customer_name || p.name,
            'service_name=', p.service_name,
            'amount=', p.amount);
        }
      } catch (_e) { void _e; }
      const kind = it.action && it.action.kind;
      if (kind === 'upsert_inventory') {
        if (!Array.isArray(p.items)) p.items = [];
        itemsHtml = `
          <div style="font-size:10px;font-weight:700;color:#888;margin-bottom:2px;">품목</div>
          ${_renderItemsEditor(key, p.items, {
            fieldAttr: 'row-field',
            addAttr: 'row-item-add',
            delAttr: 'row-item-delete',
            color: meta.color,
            compact: true,
          })}`;
        if ('memo' in p) addField('memo', '메모', p.memo);
      } else if (kind === 'create_expense') {
        addField('vendor', '가게', p.vendor == null ? '' : p.vendor);
        addField('amount', '총액', p.amount == null ? '' : p.amount, { type: 'number' });
        addField('category', '분류', p.category == null ? '' : p.category, { select: true });
        addField('memo', '메모', p.memo == null ? '' : p.memo);
        if (!Array.isArray(p.items)) p.items = [];
        itemsHtml = `
          <div style="font-size:10px;font-weight:700;color:#888;margin:8px 0 2px;">품목 (선택)</div>
          ${_renderItemsEditor(key, p.items, {
            fieldAttr: 'row-field',
            addAttr: 'row-item-add',
            delAttr: 'row-item-delete',
            color: meta.color,
            compact: true,
          })}`;
      } else {
        if ('customer_name' in p || 'name' in p) addField('customer_name', '이름', p.customer_name ?? p.name);
        if ('customer_phone' in p || 'phone' in p) addField('customer_phone', '전화', p.customer_phone ?? p.phone);
        if ('service_name' in p) addField('service_name', '시술', p.service_name);
        if ('amount' in p) addField('amount', '금액', p.amount);
        if ('starts_at' in p) addField('starts_at', '시작', p.starts_at);
        if ('memo' in p) addField('memo', '메모', p.memo);
        if (!editFields.length) {
          // fallback: 확인 문구만 고치게
          editFields.push(`
            <div style="display:flex;align-items:center;gap:6px;">
              <span style="width:50px;font-size:10px;color:#888;font-weight:700;">내용</span>
              <input data-row-field="${key}:confirmation_text" value="${_esc(it.action.confirmation_text || '')}" style="flex:1;padding:6px 8px;border:1px solid hsl(220,15%,85%);border-radius:8px;font-size:11px;" />
            </div>`);
        }
      }
    }

    const buttons = editing
      ? `<div style="display:flex;gap:6px;margin-top:4px;">
          <button data-row-save="${key}" style="flex:1;padding:7px;border:none;border-radius:8px;background:${meta.color};color:#fff;font-weight:700;cursor:pointer;font-size:11px;display:inline-flex;align-items:center;justify-content:center;gap:4px;">${_svg('ic-save', 12)} 저장</button>
          <button data-row-editcancel="${key}" style="flex:1;padding:7px;border:1px solid #ddd;border-radius:8px;background:#fff;color:#666;font-weight:700;cursor:pointer;font-size:11px;">취소</button>
        </div>`
      : `<div style="display:flex;gap:6px;margin-top:4px;">
          <button data-row-run="${key}" style="flex:1;padding:7px;border:none;border-radius:8px;background:${meta.color};color:#fff;font-weight:700;cursor:pointer;font-size:11px;display:inline-flex;align-items:center;justify-content:center;gap:4px;">${_svg('ic-check', 12)} 추가</button>
          <button data-row-edit="${key}" style="flex:1;padding:7px;border:1px solid #ddd;border-radius:8px;background:#fff;color:#555;font-weight:700;cursor:pointer;font-size:11px;display:inline-flex;align-items:center;justify-content:center;gap:4px;">${_svg('ic-edit-3', 12)} 편집</button>
          <button data-row-skip="${key}" style="flex:1;padding:7px;border:1px solid #ddd;border-radius:8px;background:#fff;color:#888;font-weight:700;cursor:pointer;font-size:11px;display:inline-flex;align-items:center;justify-content:center;gap:4px;">${_svg('ic-trash-2', 12)} 제외</button>
        </div>`;

    const status = it.status === 'running'
      ? `<div style="font-size:10px;color:${meta.color};font-weight:700;margin-top:2px;">저장 중…</div>`
      : '';

    return `<div style="padding:9px 10px;border-radius:10px;background:hsl(340,100%,99%);border:1px solid hsl(340,30%,92%);display:flex;flex-direction:column;gap:6px;">
      ${rowHead}
      ${status}
      ${editing && editFields.length ? `<div style="display:flex;flex-direction:column;gap:4px;">${editFields.join('')}</div>` : ''}
      ${editing ? itemsHtml : ''}
      ${buttons}
    </div>`;
  }

  // Wave B4 — 휴리스틱 프리뷰 카드 (answer/actions 둘 다 비었을 때)
  function _renderFallbackCard(extract, historyIdx, status) {
    if (!extract) return '';
    if (status === 'done') {
      return `<div style="margin-top:6px;padding:10px 12px;background:linear-gradient(135deg,hsl(145,45%,94%),hsl(145,45%,98%));border-radius:14px;border-left:3px solid hsl(145,50%,40%);">
        <div style="font-size:11px;font-weight:700;color:hsl(145,50%,35%);">✓ 저장했어요</div>
      </div>`;
    }
    if (status === 'failed') {
      return `<div style="margin-top:6px;padding:10px 12px;background:hsl(0,70%,96%);border-radius:14px;border-left:3px solid hsl(0,70%,55%);">
        <div style="font-size:11px;font-weight:700;color:hsl(0,70%,45%);">실패 — 다시 시도해 주세요</div>
      </div>`;
    }
    const row = (label, field, val, placeholder) => `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        <span style="width:52px;font-size:11px;color:hsl(220,10%,50%);font-weight:700;">${label}</span>
        <input data-fallback-field="${field}" data-fallback-idx="${historyIdx}" value="${_esc(val || '')}" placeholder="${_esc(placeholder)}"
          style="flex:1;padding:7px 10px;border:1px solid hsl(220,15%,88%);border-radius:10px;font-size:12px;background:#fff;" />
      </div>`;
    return `<div style="margin-top:6px;padding:12px;background:#fff;border:1px solid hsl(270,40%,88%);border-radius:14px;">
      <div style="font-size:12px;font-weight:800;color:hsl(270,50%,45%);margin-bottom:8px;">💡 대충 이렇게 맞아요?</div>
      ${row('이름', 'name', extract.name, '김서연')}
      ${row('전화', 'phone', extract.phone, '010-0000-0000')}
      ${row('금액', 'amount', extract.amount, '50000')}
      ${row('시간', 'time', extract.time, '내일 2시')}
      <div style="display:flex;gap:6px;margin-top:10px;">
        <button data-fallback-intent="customer" data-fallback-idx="${historyIdx}" style="flex:1;padding:9px;border:none;border-radius:10px;background:hsl(175,55%,50%);color:#fff;font-weight:800;cursor:pointer;font-size:11px;display:inline-flex;align-items:center;justify-content:center;gap:4px;">${_svg('ic-user', 12)} 고객 추가</button>
        <button data-fallback-intent="revenue" data-fallback-idx="${historyIdx}" style="flex:1;padding:9px;border:none;border-radius:10px;background:hsl(145,50%,40%);color:#fff;font-weight:800;cursor:pointer;font-size:11px;display:inline-flex;align-items:center;justify-content:center;gap:4px;">${_svg('ic-dollar-sign', 12)} 매출 기록</button>
        <button data-fallback-intent="booking" data-fallback-idx="${historyIdx}" style="flex:1;padding:9px;border:none;border-radius:10px;background:hsl(350,75%,60%);color:#fff;font-weight:800;cursor:pointer;font-size:11px;display:inline-flex;align-items:center;justify-content:center;gap:4px;">${_svg('ic-calendar', 12)} 예약 추가</button>
      </div>
    </div>`;
  }

  // Wave B4 — 프리뷰 카드에서 골라 즉시 POST (현재 입력값 읽기)
  async function _submitFallback(idx, intent) {
    const msg = _history[idx];
    if (!msg || !msg.fallback) return;
    // 사용자가 수정한 값 읽기
    const body = document.getElementById('asstBody');
    const read = (f) => {
      const el = body ? body.querySelector(`[data-fallback-field="${f}"][data-fallback-idx="${idx}"]`) : null;
      return el ? el.value.trim() : (msg.fallback[f] || '');
    };
    const data = { name: read('name'), phone: read('phone'), amount: read('amount'), time: read('time') };
    msg.fallback_status = 'running';
    _renderHistory();
    try {
      let endpoint, payload, kindKey;
      if (intent === 'customer') {
        if (!data.name) throw new Error('이름이 필요해요');
        endpoint = '/customers';
        payload = { name: data.name, phone: data.phone || null, memo: null, tags: [], birthday: null };
        kindKey = 'create_customer';
      } else if (intent === 'revenue') {
        if (!data.amount || !(+data.amount > 0)) throw new Error('금액이 필요해요');
        endpoint = '/revenue';
        payload = {
          amount: Math.round(+data.amount),
          method: 'card',
          service_name: null,
          customer_name: data.name || null,
          memo: null,
          recorded_at: new Date().toISOString(),
        };
        kindKey = 'create_revenue';
      } else if (intent === 'booking') {
        if (!data.time) throw new Error('시간이 필요해요');
        const startISO = _timeToISO(data.time);
        if (!startISO) throw new Error('시간을 못 읽었어요');
        const endISO = new Date(new Date(startISO).getTime() + 60 * 60 * 1000).toISOString();
        endpoint = '/bookings';
        payload = {
          starts_at: startISO,
          ends_at: endISO,
          customer_id: null,
          customer_name: data.name || null,
          service_name: null,
          memo: null,
          status: 'confirmed',
        };
        kindKey = 'create_booking';
      } else {
        throw new Error('알 수 없는 요청');
      }
      const fetcher = window.safeFetch || fetch;
      const res = await fetcher(window.API + endpoint, {
        method: 'POST',
        headers: { ...window.authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'HTTP ' + res.status);
      }
      msg.fallback_status = 'done';
      _renderHistory();
      // SWR 캐시 무효화 + data-changed 이벤트 (단일 액션과 동일 로직 재사용)
      try { _invalidateCachesFor(kindKey); } catch (_e) { void _e; }
      _history.push({ role: 'assistant', text: '✓ 저장했어요' });
      _renderHistory();
      if (window.hapticSuccess) window.hapticSuccess();
      if (window.Dashboard?.refresh) window.Dashboard.refresh(true);
    } catch (e) {
      msg.fallback_status = 'failed';
      _renderHistory();
      _history.push({ role: 'assistant', text: '실패: ' + (window._humanError ? window._humanError(e) : e.message) });
      _renderHistory();
    }
  }

  // 숫자 필드 강제 변환
  const _NUM_FIELDS = new Set(['amount', 'unit_price', 'quantity', 'total']);
  function _coerceFieldValue(field, raw) {
    if (_NUM_FIELDS.has(field)) {
      if (raw === '' || raw == null) return null;
      const n = parseInt(String(raw).replace(/[^\d]/g, ''), 10);
      return isNaN(n) ? null : n;
    }
    return raw === '' ? null : raw;
  }
  // "foo" 또는 "items:i:bar" 형태의 field 를 payload 에 꽂기
  function _applyEditField(action, field, raw) {
    if (!action) return;
    if (field === 'confirmation_text') {
      action.confirmation_text = raw;
      return;
    }
    if (!action.payload) action.payload = {};
    if (field.indexOf('items:') === 0) {
      const [, idxStr, sub] = field.split(':');
      const i = parseInt(idxStr, 10);
      if (isNaN(i)) return;
      if (!Array.isArray(action.payload.items)) action.payload.items = [];
      if (!action.payload.items[i]) action.payload.items[i] = {};
      action.payload.items[i][sub] = _coerceFieldValue(sub, raw);
      return;
    }
    action.payload[field] = _coerceFieldValue(field, raw);
  }
  // 이름 비어있는 items 제거 (저장 시)
  function _stripEmptyItems(payload) {
    if (!payload || !Array.isArray(payload.items)) return;
    payload.items = payload.items.filter(it => it && (String(it.name || '').trim() !== ''));
  }
  // 품목 추가·삭제 전에 현재 입력값을 payload 로 먼저 회수 (재렌더 시 입력값 유실 방지)
  function _flushSingleInputs(idx) {
    const msg = _history[idx];
    if (!msg || !msg.action) return;
    const body = document.getElementById('asstBody');
    if (!body) return;
    if (!msg.action.payload) msg.action.payload = {};
    const inputs = body.querySelectorAll(`[data-single-field^="${idx}:"]`);
    inputs.forEach(inp => {
      const parts = inp.getAttribute('data-single-field').split(':');
      const field = parts.slice(1).join(':');
      _applyEditField(msg.action, field, inp.value);
    });
  }
  function _flushRowInputs(hi, gi, ii) {
    const it = _history[hi]?.action_groups?.[gi]?.items?.[ii];
    if (!it || !it.action) return;
    const body = document.getElementById('asstBody');
    if (!body) return;
    if (!it.action.payload) it.action.payload = {};
    const key = `${hi}:${gi}:${ii}`;
    const inputs = body.querySelectorAll(`[data-row-field^="${key}:"]`);
    inputs.forEach(inp => {
      const parts = inp.getAttribute('data-row-field').split(':');
      const field = parts.slice(3).join(':');
      _applyEditField(it.action, field, inp.value);
    });
  }

  // 단일 document-level 위임 (한 번만 등록)
  let _delegationBound = false;
  let _sendInFlight = false;
  function _bindActionButtons() {
    if (_delegationBound) return;
    _delegationBound = true;
    document.addEventListener('click', (e) => {
      // 2026-04-26 픽스 — 업로드 사진 썸네일 클릭 → 라이트박스
      const photoEl = e.target.closest('[data-asst-photo]');
      if (photoEl && document.getElementById('asstBody')?.contains(photoEl)) {
        const [hi, pi] = photoEl.dataset.asstPhoto.split(':').map(n => parseInt(n, 10));
        const msg = _history[hi];
        const photos = (msg && Array.isArray(msg.photos) && msg.photos.length)
          ? msg.photos
          : (msg && msg.thumb ? [msg.thumb] : []);
        if (photos.length) _openLightbox(photos, pi || 0);
        return;
      }
      const run = e.target.closest('[data-action-run]');
      if (run && document.getElementById('asstBody')?.contains(run)) {
        _runAction(parseInt(run.dataset.actionRun, 10));
        return;
      }
      const cancel = e.target.closest('[data-action-cancel]');
      if (cancel && document.getElementById('asstBody')?.contains(cancel)) {
        const idx = parseInt(cancel.dataset.actionCancel, 10);
        if (_history[idx]) { _history[idx].action_status = 'cancelled'; _history[idx].action = null; _history[idx].edit_mode = false; }
        _renderHistory();
        return;
      }
      // 단일 액션 — 편집 모드 진입
      const singleEdit = e.target.closest('[data-action-edit]');
      if (singleEdit && document.getElementById('asstBody')?.contains(singleEdit)) {
        const idx = parseInt(singleEdit.dataset.actionEdit, 10);
        const msg = _history[idx];
        if (msg && msg.action) {
          // 원본 payload 백업 (취소 시 복원용)
          if (!msg.action_orig_payload) {
            try { msg.action_orig_payload = JSON.parse(JSON.stringify(msg.action.payload || {})); }
            catch (_e) { msg.action_orig_payload = {}; }
          }
          msg.edit_mode = true;
          _renderHistory();
        }
        return;
      }
      // 단일 액션 — 편집 저장
      const singleSave = e.target.closest('[data-action-save]');
      if (singleSave && document.getElementById('asstBody')?.contains(singleSave)) {
        const idx = parseInt(singleSave.dataset.actionSave, 10);
        const msg = _history[idx];
        if (msg && msg.action) {
          const body = document.getElementById('asstBody');
          if (body) {
            if (!msg.action.payload) msg.action.payload = {};
            const inputs = body.querySelectorAll(`[data-single-field^="${idx}:"]`);
            inputs.forEach(inp => {
              const parts = inp.getAttribute('data-single-field').split(':');
              const field = parts.slice(1).join(':');
              _applyEditField(msg.action, field, inp.value);
            });
            _stripEmptyItems(msg.action.payload);
          }
          msg.edit_mode = false;
          _renderHistory();
        }
        return;
      }
      // 단일 액션 — 품목 추가
      const singleItemAdd = e.target.closest('[data-single-item-add]');
      if (singleItemAdd && document.getElementById('asstBody')?.contains(singleItemAdd)) {
        const idx = parseInt(singleItemAdd.dataset.singleItemAdd, 10);
        const msg = _history[idx];
        if (msg && msg.action) {
          _flushSingleInputs(idx);
          if (!msg.action.payload) msg.action.payload = {};
          if (!Array.isArray(msg.action.payload.items)) msg.action.payload.items = [];
          msg.action.payload.items.push({ name: '', quantity: 1 });
          _renderHistory();
        }
        return;
      }
      // 단일 액션 — 품목 삭제
      const singleItemDel = e.target.closest('[data-single-item-delete]');
      if (singleItemDel && document.getElementById('asstBody')?.contains(singleItemDel)) {
        const parts = singleItemDel.dataset.singleItemDelete.split(':');
        const idx = parseInt(parts[0], 10);
        const iItem = parseInt(parts[1], 10);
        const msg = _history[idx];
        if (msg && msg.action && msg.action.payload && Array.isArray(msg.action.payload.items)) {
          _flushSingleInputs(idx);
          msg.action.payload.items.splice(iItem, 1);
          _renderHistory();
        }
        return;
      }
      // 단일 액션 — 편집 취소 (원본 복원)
      const singleEditCancel = e.target.closest('[data-action-editcancel]');
      if (singleEditCancel && document.getElementById('asstBody')?.contains(singleEditCancel)) {
        const idx = parseInt(singleEditCancel.dataset.actionEditcancel, 10);
        const msg = _history[idx];
        if (msg && msg.action) {
          if (msg.action_orig_payload) {
            try { msg.action.payload = JSON.parse(JSON.stringify(msg.action_orig_payload)); }
            catch (_e) { void _e; }
          }
          msg.edit_mode = false;
          _renderHistory();
        }
        return;
      }
      const sug = e.target.closest('[data-suggest]');
      const sheet = document.getElementById('assistantSheet');
      if (sug && sheet && sheet.contains(sug)) {
        if (_sendInFlight) return;  // 중복 방지
        const q = sug.getAttribute('data-suggest');
        const input = document.getElementById('asstInput');
        if (input) { input.value = q; _send(); }
        return;
      }
      // Wave B5 — typeahead chip: 입력창에 채우기만 (자동 전송 X)
      const ta = e.target.closest('[data-typeahead]');
      if (ta && sheet && sheet.contains(ta)) {
        const q = ta.getAttribute('data-typeahead');
        const input = document.getElementById('asstInput');
        if (input) {
          input.value = q;
          input.focus();
          const box = document.getElementById('asstTypeahead');
          if (box) { box.style.display = 'none'; box.innerHTML = ''; }
        }
        return;
      }
      // Wave B4 — fallback 프리뷰 카드 액션
      const fb = e.target.closest('[data-fallback-intent]');
      if (fb && document.getElementById('asstBody')?.contains(fb)) {
        _submitFallback(parseInt(fb.dataset.fallbackIdx, 10), fb.dataset.fallbackIntent);
        return;
      }
      // 중복 의심 — "그래도 추가" (경고 카드 제거, action 은 그대로 실행 가능)
      const dupProceed = e.target.closest('[data-dup-proceed]');
      if (dupProceed && document.getElementById('asstBody')?.contains(dupProceed)) {
        const [hi, wi] = dupProceed.dataset.dupProceed.split(':').map(n => parseInt(n, 10));
        const msg = _history[hi];
        if (msg && Array.isArray(msg.duplicate_warnings) && msg.duplicate_warnings[wi]) {
          msg.duplicate_warnings[wi].dismissed = true;
          _renderHistory();
        }
        return;
      }
      // 중복 의심 — "건너뛰기" (해당 action_index 를 skipped 로 마크, 경고도 제거)
      const dupSkip = e.target.closest('[data-dup-skip]');
      if (dupSkip && document.getElementById('asstBody')?.contains(dupSkip)) {
        const [hi, wi] = dupSkip.dataset.dupSkip.split(':').map(n => parseInt(n, 10));
        const msg = _history[hi];
        if (msg && Array.isArray(msg.duplicate_warnings) && msg.duplicate_warnings[wi]) {
          const warn = msg.duplicate_warnings[wi];
          const targetIdx = warn.action_index;
          warn.dismissed = true;
          // 단일 액션: action 제거 + 상태 cancelled
          if (msg.action && targetIdx === 0) {
            msg.action_status = 'cancelled';
            msg.action = null;
            msg.edit_mode = false;
          }
          // 그룹 액션: origIdx 매칭되는 item 을 skipped 로 마크
          if (Array.isArray(msg.action_groups)) {
            msg.action_groups.forEach(g => {
              (g.items || []).forEach(it => {
                if (it && it.origIdx === targetIdx) {
                  it.skipped = true;
                  it.editing = false;
                }
              });
            });
          }
          _renderHistory();
        }
        return;
      }
      // 통합 확인 카드 — 전체 추가 (순차 실행)
      const uniRun = e.target.closest('[data-unified-runall]');
      if (uniRun && document.getElementById('asstBody')?.contains(uniRun)) {
        const hi = parseInt(uniRun.dataset.unifiedRunall, 10);
        _runUnifiedAll(hi);
        return;
      }
      // 통합 확인 카드 — 수정 (기존 그룹 카드로 전환)
      const uniEdit = e.target.closest('[data-unified-edit]');
      if (uniEdit && document.getElementById('asstBody')?.contains(uniEdit)) {
        const hi = parseInt(uniEdit.dataset.unifiedEdit, 10);
        const msg = _history[hi];
        if (msg && msg.action_groups) {
          msg.unified_mode = false;
          // 개별 수정 쉽게 — 모든 그룹 펼침
          msg.action_groups.forEach(g => { g.expanded = true; });
          _renderHistory();
        }
        return;
      }
      // 그룹 카드 — 접기·펴기
      const tgl = e.target.closest('[data-group-toggle]');
      if (tgl && document.getElementById('asstBody')?.contains(tgl)) {
        const [hi, gi] = tgl.dataset.groupToggle.split(':').map(n => parseInt(n, 10));
        const g = _history[hi] && _history[hi].action_groups && _history[hi].action_groups[gi];
        if (g) { g.expanded = !g.expanded; _renderHistory(); }
        return;
      }
      // 그룹 카드 — 전체(남은) 추가
      const runAll = e.target.closest('[data-group-runall]');
      if (runAll && document.getElementById('asstBody')?.contains(runAll)) {
        const [hi, gi] = runAll.dataset.groupRunall.split(':').map(n => parseInt(n, 10));
        _runGroupAll(hi, gi);
        return;
      }
      // 행 — 단일 실행
      const rowRun = e.target.closest('[data-row-run]');
      if (rowRun && document.getElementById('asstBody')?.contains(rowRun)) {
        const [hi, gi, ii] = rowRun.dataset.rowRun.split(':').map(n => parseInt(n, 10));
        _runGroupRow(hi, gi, ii);
        return;
      }
      // 행 — 편집 모드 진입
      const rowEdit = e.target.closest('[data-row-edit]');
      if (rowEdit && document.getElementById('asstBody')?.contains(rowEdit)) {
        const [hi, gi, ii] = rowEdit.dataset.rowEdit.split(':').map(n => parseInt(n, 10));
        const it = _history[hi]?.action_groups?.[gi]?.items?.[ii];
        if (it) { it.editing = true; _renderHistory(); }
        return;
      }
      // 행 — 편집 취소
      const rowCancel = e.target.closest('[data-row-editcancel]');
      if (rowCancel && document.getElementById('asstBody')?.contains(rowCancel)) {
        const [hi, gi, ii] = rowCancel.dataset.rowEditcancel.split(':').map(n => parseInt(n, 10));
        const it = _history[hi]?.action_groups?.[gi]?.items?.[ii];
        if (it) { it.editing = false; _renderHistory(); }
        return;
      }
      // 행 — 편집 저장
      const rowSave = e.target.closest('[data-row-save]');
      if (rowSave && document.getElementById('asstBody')?.contains(rowSave)) {
        const [hi, gi, ii] = rowSave.dataset.rowSave.split(':').map(n => parseInt(n, 10));
        const it = _history[hi]?.action_groups?.[gi]?.items?.[ii];
        if (it) {
          const key = `${hi}:${gi}:${ii}`;
          const body = document.getElementById('asstBody');
          if (body) {
            if (!it.action.payload) it.action.payload = {};
            const inputs = body.querySelectorAll(`[data-row-field^="${key}:"]`);
            inputs.forEach(inp => {
              const parts = inp.getAttribute('data-row-field').split(':');
              const field = parts.slice(3).join(':');
              _applyEditField(it.action, field, inp.value);
            });
            _stripEmptyItems(it.action.payload);
          }
          it.editing = false;
          _renderHistory();
        }
        return;
      }
      // 행 — 품목 추가
      const rowItemAdd = e.target.closest('[data-row-item-add]');
      if (rowItemAdd && document.getElementById('asstBody')?.contains(rowItemAdd)) {
        const [hi, gi, ii] = rowItemAdd.dataset.rowItemAdd.split(':').map(n => parseInt(n, 10));
        const it = _history[hi]?.action_groups?.[gi]?.items?.[ii];
        if (it) {
          _flushRowInputs(hi, gi, ii);
          if (!it.action.payload) it.action.payload = {};
          if (!Array.isArray(it.action.payload.items)) it.action.payload.items = [];
          it.action.payload.items.push({ name: '', quantity: 1 });
          _renderHistory();
        }
        return;
      }
      // 행 — 품목 삭제
      const rowItemDel = e.target.closest('[data-row-item-delete]');
      if (rowItemDel && document.getElementById('asstBody')?.contains(rowItemDel)) {
        const parts = rowItemDel.dataset.rowItemDelete.split(':');
        const hi = parseInt(parts[0], 10);
        const gi = parseInt(parts[1], 10);
        const ii = parseInt(parts[2], 10);
        const iItem = parseInt(parts[3], 10);
        const it = _history[hi]?.action_groups?.[gi]?.items?.[ii];
        if (it && it.action?.payload?.items) {
          _flushRowInputs(hi, gi, ii);
          it.action.payload.items.splice(iItem, 1);
          _renderHistory();
        }
        return;
      }
      // 행 — 제외 · 되돌리기
      const rowSkip = e.target.closest('[data-row-skip]');
      if (rowSkip && document.getElementById('asstBody')?.contains(rowSkip)) {
        const [hi, gi, ii] = rowSkip.dataset.rowSkip.split(':').map(n => parseInt(n, 10));
        const it = _history[hi]?.action_groups?.[gi]?.items?.[ii];
        if (it) { it.skipped = true; it.editing = false; _renderHistory(); }
        return;
      }
      const rowUnskip = e.target.closest('[data-row-unskip]');
      if (rowUnskip && document.getElementById('asstBody')?.contains(rowUnskip)) {
        const [hi, gi, ii] = rowUnskip.dataset.rowUnskip.split(':').map(n => parseInt(n, 10));
        const it = _history[hi]?.action_groups?.[gi]?.items?.[ii];
        if (it) { it.skipped = false; _renderHistory(); }
        return;
      }
    }, false);
  }

  // 캐시 무효화 + data-changed 이벤트 (단일 액션 실행 후 공통 로직)
  function _invalidateCachesFor(kind) {
    // 각 kind 가 건드리는 SWR 키 목록 (app-core.js 의 실제 키와 일치해야 함)
    // pv_cache::customers · pv_cache::bookings_all · pv_cache::revenue · pv_cache::inventory · pv_cache::today
    // Wave D3 (2026-04-24): 모든 kind 에 대해 누락 없이 캐시 무효화 + today 반영
    const _invalidateKinds = {
      create_customer: ['customer', 'customers', 'today'],
      create_booking: ['booking', 'bookings', 'bookings_all', 'customer', 'customers', 'today'],
      create_revenue: ['revenue', 'revenues', 'customer', 'customers', 'today', 'dashboard'],
      update_revenue: ['revenue', 'revenues', 'customer', 'customers', 'today', 'dashboard'],
      create_nps: ['nps', 'customer', 'customers'],
      update_customer: ['customer', 'customers', 'today'],
      update_booking: ['booking', 'bookings', 'bookings_all', 'customer', 'customers', 'today'],
      cancel_booking: ['booking', 'bookings', 'bookings_all', 'customer', 'customers', 'today'],
      reschedule_booking: ['booking', 'bookings', 'bookings_all', 'customer', 'customers', 'today'],
      upsert_inventory: ['inventory', 'inventories', 'today'],
      create_expense: ['expense', 'expenses', 'revenue', 'revenues', 'today', 'dashboard'],
      generate_bulk_message: [],
    }[kind] || [];
    _invalidateKinds.forEach(k => {
      try { sessionStorage.removeItem('pv_cache::' + k); } catch (_e) { void _e; }
      try { localStorage.removeItem('pv_cache::' + k); } catch (_e) { void _e; }
      // booking 은 날짜별 variants 도 싹쓸이
      if (k === 'bookings' || k === 'booking' || k === 'bookings_all') {
        try {
          for (let i = sessionStorage.length - 1; i >= 0; i--) {
            const key = sessionStorage.key(i);
            if (key && key.startsWith('pv_cache::booking')) sessionStorage.removeItem(key);
          }
          for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (key && key.startsWith('pv_cache::booking')) localStorage.removeItem(key);
          }
        } catch (_e) { void _e; }
      }
      // customer 는 id 별 variants 도 싹쓸이
      if (k === 'customer' || k === 'customers') {
        try {
          for (let i = sessionStorage.length - 1; i >= 0; i--) {
            const key = sessionStorage.key(i);
            if (key && key.startsWith('pv_cache::customer')) sessionStorage.removeItem(key);
          }
          for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (key && key.startsWith('pv_cache::customer')) localStorage.removeItem(key);
          }
        } catch (_e) { void _e; }
      }
      // expense 관련 키도 전부 제거
      if (k === 'expense' || k === 'expenses') {
        try {
          for (let i = sessionStorage.length - 1; i >= 0; i--) {
            const key = sessionStorage.key(i);
            if (key && key.startsWith('pv_cache::expense')) sessionStorage.removeItem(key);
          }
          for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (key && key.startsWith('pv_cache::expense')) localStorage.removeItem(key);
          }
        } catch (_e) { void _e; }
      }
      // inventory 관련 키 variants 도 싹쓸이
      if (k === 'inventory' || k === 'inventories') {
        try {
          for (let i = sessionStorage.length - 1; i >= 0; i--) {
            const key = sessionStorage.key(i);
            if (key && key.startsWith('pv_cache::inventor')) sessionStorage.removeItem(key);
          }
          for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (key && key.startsWith('pv_cache::inventor')) localStorage.removeItem(key);
          }
        } catch (_e) { void _e; }
      }
      // nps / revenue 관련 키도 전부 제거 (날짜·페이지 variants 방지)
      if (k === 'nps' || k === 'revenue' || k === 'revenues') {
        const prefix = 'pv_cache::' + (k === 'revenues' ? 'revenue' : k);
        try {
          for (let i = sessionStorage.length - 1; i >= 0; i--) {
            const key = sessionStorage.key(i);
            if (key && key.startsWith(prefix)) sessionStorage.removeItem(key);
          }
          for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (key && key.startsWith(prefix)) localStorage.removeItem(key);
          }
        } catch (_e) { void _e; }
      }
    });
    try {
      window.dispatchEvent(new CustomEvent('itdasy:data-changed', {
        detail: { kind, mutation_kind: kind },
      }));
    } catch (_e) { void _e; }
  }

  // 순수 실행기 — action 객체만 받아 POST, 결과 반환. UI 갱신은 호출자가.
  async function _executeAction(action) {
    const res = await fetch(window.API + '/assistant/execute', {
      method: 'POST',
      headers: { ...window.authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: action.kind, payload: action.payload || {} }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'HTTP ' + res.status);
    }
    const d = await res.json();
    _invalidateCachesFor(d.kind || action.kind);
    if (d.kind === 'generate_bulk_message' && d.message_draft) {
      try {
        if (navigator.clipboard) await navigator.clipboard.writeText(d.message_draft);
      } catch (_e) { void _e; }
    }
    return d;
  }

  async function _runAction(idx) {
    const msg = _history[idx];
    if (!msg || !msg.action) return;
    // 중복 클릭 방지 — 이미 running/done/failed 면 무시
    if (msg.action_status === 'running' || msg.action_status === 'done') return;
    msg.action_status = 'running';
    _renderHistory();
    try {
      const d = await _executeAction(msg.action);
      msg.action_status = 'done';
      _renderHistory();
      if (d.kind === 'generate_bulk_message' && d.message_draft) {
        _history.push({ role: 'assistant', text: '📋 초안을 클립보드에 복사했어요. 카톡·문자에 붙여넣으세요.\n\n---\n' + d.message_draft });
      } else {
        _history.push({ role: 'assistant', text: d.message || '✓ 완료했어요' });
      }
      _renderHistory();
      if (window.hapticSuccess) window.hapticSuccess();
      if (window.Dashboard?.refresh) window.Dashboard.refresh(true);
    } catch (e) {
      msg.action_status = 'failed';
      // 2026-04-26 버그B 픽스 — 실패 사유 저장 (UI 카드에 표시)
      msg.action_error = window._humanError ? window._humanError(e) : (e && e.message) || '알 수 없는 오류';
      _renderHistory();
      _history.push({ role: 'assistant', text: '실패: ' + msg.action_error });
      _renderHistory();
    }
  }

  // 그룹 카드 — 단일 행 실행
  async function _runGroupRow(historyIdx, gIdx, iIdx) {
    const msg = _history[historyIdx];
    const group = msg && msg.action_groups && msg.action_groups[gIdx];
    const it = group && group.items && group.items[iIdx];
    if (!it || it.status === 'done' || it.status === 'running' || it.skipped) return;
    it.status = 'running';
    _renderHistory();
    try {
      await _executeAction(it.action);
      it.status = 'done';
      _renderHistory();
      if (window.hapticSuccess) window.hapticSuccess();
      if (window.Dashboard?.refresh) window.Dashboard.refresh(true);
    } catch (e) {
      it.status = 'failed';
      it.errorMsg = window._humanError ? window._humanError(e) : e.message;
      _renderHistory();
    }
  }

  // 그룹 카드 — 전체(남은) 행 병렬 실행 (concurrency 5)
  // 순차 실행(이전): N건 × 2초 = 2N초 대기
  // 병렬 실행(현재): 5건 동시, N/5 × 2초 = 0.4N 초 — 약 5배 빠름
  async function _runGroupAll(historyIdx, gIdx) {
    const msg = _history[historyIdx];
    const group = msg && msg.action_groups && msg.action_groups[gIdx];
    if (!group || group.bulkProgress) return;
    const targets = group.items
      .map((it, i) => ({ it, i }))
      .filter(({ it }) => !it.skipped && it.status !== 'done' && it.status !== 'running');
    if (!targets.length) return;
    group.bulkProgress = { current: 0, total: targets.length };
    // 모두 running 상태로 한번에 표시 → 사용자가 '동시 진행' 체감
    targets.forEach(({ it }) => { it.status = 'running'; });
    _renderHistory();
    let okCount = 0;
    const CONCURRENCY = 5;  // Railway/DB 부담 방지 · 5건씩 묶어서
    for (let i = 0; i < targets.length; i += CONCURRENCY) {
      const batch = targets.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(async ({ it }) => {
        try {
          await _executeAction(it.action);
          it.status = 'done';
          okCount++;
        } catch (e) {
          it.status = 'failed';
          it.errorMsg = window._humanError ? window._humanError(e) : e.message;
        }
        group.bulkProgress.current++;
        _renderHistory();
      }));
    }
    group.bulkProgress = null;
    _renderHistory();
    if (okCount > 0) {
      if (window.hapticSuccess) window.hapticSuccess();
      if (window.Dashboard?.refresh) window.Dashboard.refresh(true);
    }
  }

  // 2026-04-24 — 통합 확인 카드: 전체 추가 (순차 실행)
  // create_customer → booking/revenue 순서 보장 (customer_id resolver 의존성 안전)
  // Promise.allSettled 패턴: 하나 실패해도 나머지 계속 진행.
  async function _runUnifiedAll(historyIdx) {
    const msg = _history[historyIdx];
    if (!msg || !msg.action_groups || msg.unified_progress) return;
    const flat = _unifiedExecutionOrder(msg.action_groups);
    const targets = flat.filter(f => !f.it.skipped && f.it.status !== 'done' && f.it.status !== 'running');
    if (!targets.length) return;

    msg.unified_progress = { current: 0, total: targets.length, label: '저장 중' };
    _renderHistory();

    let okCount = 0;
    let failCount = 0;
    for (let i = 0; i < targets.length; i++) {
      const f = targets[i];
      const meta = _catMeta(f.kind);
      f.it.status = 'running';
      msg.unified_progress.label = `${meta.label} 저장 중`;
      _renderHistory();
      try {
        await _executeAction(f.it.action);
        f.it.status = 'done';
        okCount++;
      } catch (e) {
        f.it.status = 'failed';
        f.it.errorMsg = window._humanError ? window._humanError(e) : e.message;
        failCount++;
      }
      msg.unified_progress.current = i + 1;
      _renderHistory();
    }

    msg.unified_progress = null;
    _renderHistory();

    // 완료 토스트 + 대시보드 갱신
    if (okCount > 0) {
      const summary = failCount
        ? `✓ ${okCount}건 저장 · ${failCount}건 실패`
        : `✓ ${okCount}건 모두 저장 완료`;
      _history.push({ role: 'assistant', text: summary });
      _renderHistory();
      if (window.hapticSuccess) window.hapticSuccess();
      if (window.Dashboard?.refresh) window.Dashboard.refresh(true);
    } else if (failCount > 0) {
      _history.push({ role: 'assistant', text: `실패 ${failCount}건 — '수정' 눌러서 다시 확인해 주세요` });
      _renderHistory();
    }
  }

  function _renderSuggest() {
    const el = document.getElementById('asstSuggest');
    if (!el) return;
    // data-suggest 만 두고 클릭은 document 위임 (중복 방지)
    el.innerHTML = SUGGESTIONS.map(s => `
      <button data-suggest="${_esc(s)}" style="padding:8px 12px;border:1px solid #ddd;border-radius:100px;background:#fff;cursor:pointer;font-size:11px;color:#555;white-space:nowrap;">${_esc(s)}</button>
    `).join('');
  }

  // ── 📸 사진 업로드 (챗봇 입력바 좌측 버튼) ─────────────────
  function _openPhotoSheet() {
    // 이미 떠 있으면 닫고 끝
    const existing = document.getElementById('asstPhotoSheet');
    if (existing) { existing.remove(); return; }
    const box = document.createElement('div');
    box.id = 'asstPhotoSheet';
    box.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.45);display:flex;align-items:flex-end;justify-content:center;';
    box.innerHTML = `
      <div style="width:100%;max-width:460px;background:#fff;border-radius:20px 20px 0 0;padding:12px 12px max(12px,env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:8px;">
        <button data-photo-choice="camera" style="padding:16px;border:none;border-radius:14px;background:hsl(340,100%,98%);color:hsl(350,60%,40%);font-size:15px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;">${_svg('ic-camera', 18)} 사진 찍기</button>
        <button data-photo-choice="gallery" style="padding:16px;border:none;border-radius:14px;background:hsl(340,100%,98%);color:hsl(350,60%,40%);font-size:15px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;">${_svg('ic-image-plus', 18)} 갤러리에서</button>
        <button data-photo-choice="cancel" style="padding:14px;border:none;border-radius:14px;background:#f2f2f2;color:#666;font-size:14px;font-weight:700;cursor:pointer;margin-top:4px;">취소</button>
      </div>
    `;
    const close = () => { try { box.remove(); } catch (_e) { void _e; } };
    box.addEventListener('click', (e) => {
      if (e.target === box) { close(); return; }
      const btn = e.target.closest('[data-photo-choice]');
      if (!btn) return;
      const c = btn.dataset.photoChoice;
      close();
      if (c === 'camera') document.getElementById('asstCamera')?.click();
      else if (c === 'gallery') document.getElementById('asstGallery')?.click();
    });
    document.body.appendChild(box);
  }

  // ─── 📷 라이트박스 (업로드한 사진 클릭 시 큰 화면) ────────────
  // 2026-04-26 추가 — N장 사진을 좌우 화살표로 둘러보기.
  // 배경 어둡게 + ESC/배경 클릭 닫기 + 화살표 키 네비.
  let _lightboxState = null;
  function _openLightbox(photos, startIdx) {
    if (!photos || !photos.length) return;
    // 이미 열려있으면 무시
    if (document.getElementById('asstLightbox')) return;

    _lightboxState = { photos, idx: Math.max(0, Math.min(startIdx || 0, photos.length - 1)) };

    const overlay = document.createElement('div');
    overlay.id = 'asstLightbox';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10500;background:rgba(0,0,0,0.92);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:env(safe-area-inset-top) 12px env(safe-area-inset-bottom);opacity:0;transition:opacity 0.15s ease-out;';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', '업로드 사진 보기');

    const renderInner = () => {
      const s = _lightboxState;
      if (!s) return;
      const cur = s.photos[s.idx] || '';
      const counter = `${s.idx + 1} / ${s.photos.length}`;
      const hasPrev = s.idx > 0;
      const hasNext = s.idx < s.photos.length - 1;
      overlay.innerHTML = `
        <button data-lightbox-close aria-label="닫기" title="닫기"
          style="position:absolute;top:max(12px,env(safe-area-inset-top));right:12px;width:40px;height:40px;border-radius:50%;border:none;background:rgba(255,255,255,0.15);color:#fff;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;">
          ${_svg('ic-x', 20)}
        </button>
        <div style="position:absolute;top:max(18px,env(safe-area-inset-top));left:50%;transform:translateX(-50%);color:rgba(255,255,255,0.85);font-size:13px;font-weight:700;background:rgba(0,0,0,0.4);padding:6px 12px;border-radius:14px;">${counter}</div>
        <div style="flex:1;display:flex;align-items:center;justify-content:center;width:100%;max-width:100%;overflow:hidden;">
          <img src="${_esc(cur)}" alt="업로드 사진 ${s.idx + 1}" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:6px;" />
        </div>
        ${hasPrev ? `<button data-lightbox-prev aria-label="이전 사진" title="이전 사진"
          style="position:absolute;left:12px;top:50%;transform:translateY(-50%);width:48px;height:48px;border-radius:50%;border:none;background:rgba(255,255,255,0.15);color:#fff;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;">${_svg('ic-chevron-left', 22)}</button>` : ''}
        ${hasNext ? `<button data-lightbox-next aria-label="다음 사진" title="다음 사진"
          style="position:absolute;right:12px;top:50%;transform:translateY(-50%);width:48px;height:48px;border-radius:50%;border:none;background:rgba(255,255,255,0.15);color:#fff;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;">${_svg('ic-chevron-right', 22)}</button>` : ''}
      `;
    };
    renderInner();

    document.body.appendChild(overlay);
    requestAnimationFrame(() => { overlay.style.opacity = '1'; });

    const close = () => {
      try { document.removeEventListener('keydown', onKey); } catch (_e) { void _e; }
      try { overlay.style.opacity = '0'; } catch (_e) { void _e; }
      setTimeout(() => { try { overlay.remove(); } catch (_e) { void _e; } }, 150);
      _lightboxState = null;
    };
    const next = () => {
      if (!_lightboxState) return;
      if (_lightboxState.idx < _lightboxState.photos.length - 1) {
        _lightboxState.idx += 1;
        renderInner();
      }
    };
    const prev = () => {
      if (!_lightboxState) return;
      if (_lightboxState.idx > 0) {
        _lightboxState.idx -= 1;
        renderInner();
      }
    };

    overlay.addEventListener('click', (e) => {
      if (e.target.closest('[data-lightbox-close]')) { close(); return; }
      if (e.target.closest('[data-lightbox-next]')) { next(); return; }
      if (e.target.closest('[data-lightbox-prev]')) { prev(); return; }
      // 배경(이미지·버튼 외) 클릭 시 닫기
      if (e.target === overlay) close();
    });

    // 키보드 네비
    const onKey = (ev) => {
      if (ev.key === 'Escape') close();
      else if (ev.key === 'ArrowRight') next();
      else if (ev.key === 'ArrowLeft') prev();
    };
    document.addEventListener('keydown', onKey);

    // 모바일 swipe (좌우)
    let touchStartX = null;
    overlay.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches.length === 1) touchStartX = e.touches[0].clientX;
    }, { passive: true });
    overlay.addEventListener('touchend', (e) => {
      if (touchStartX == null) return;
      const dx = (e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientX : touchStartX) - touchStartX;
      touchStartX = null;
      if (Math.abs(dx) < 40) return;
      if (dx < 0) next(); else prev();
    }, { passive: true });
  }

  // 단일 파일 호환 래퍼 (옛 호출자 대응)
  async function _uploadPhoto(file) {
    return _uploadPhotos(file);
  }

  async function _uploadPhotos(files) {
    if (_sendInFlight) return;
    // 단일 파일·FileList·배열 모두 허용
    if (!files) return;
    if (!Array.isArray(files)) {
      files = (files && typeof files.length === 'number') ? Array.from(files) : [files];
    }
    files = files.filter(Boolean).slice(0, 10);  // 최대 10장
    if (files.length === 0) return;

    _sendInFlight = true;
    const input = document.getElementById('asstInput');
    const question = (input && input.value.trim()) || '';
    if (input) input.value = '';
    const N = files.length;

    // 2026-04-26 픽스 — 보낸 사진 N장 모두 보관 (썸네일 그리드 + 라이트박스용)
    // 메모리 보호: 각 이미지 max 800px 로 dataURL 화 (미리보기 전용)
    let photoUrls = [];
    try {
      photoUrls = await Promise.all(files.map(async (f) => {
        try {
          if (typeof window.compressImageForUpload === 'function') {
            // 미리보기는 가벼운 800px·0.75 품질로 (10장 × ~80KB ≈ 800KB)
            const small = await window.compressImageForUpload(f, 800, 0.75);
            return await new Promise((resolve) => {
              const r = new FileReader();
              r.onload = () => resolve(r.result || '');
              r.onerror = () => resolve('');
              r.readAsDataURL(small);
            });
          }
        } catch (_e) { void _e; }
        // fallback: 원본 그대로 (helper 부재 시)
        return await new Promise((resolve) => {
          try {
            const r = new FileReader();
            r.onload = () => resolve(r.result || '');
            r.onerror = () => resolve('');
            r.readAsDataURL(f);
          } catch (_e) { resolve(''); }
        });
      }));
      photoUrls = photoUrls.filter(Boolean);
    } catch (_e) { photoUrls = []; }

    // 플레이스홀더 메시지
    const baseText = question || (N > 1 ? ('사진 ' + N + '장 업로드 중…') : '사진 업로드 중…');
    const placeholderText = (N > 1 && question) ? (question + ' (외 ' + (N - 1) + '장 함께)') : baseText;
    // thumb 은 호환성 위해 유지 (구버전 메시지 렌더용). photos 는 신규 그리드용.
    _history.push({ role: 'user', text: placeholderText, thumb: photoUrls[0] || '', photos: photoUrls });
    _history.push({ role: 'loading', text: '' });
    _renderHistory();

    try {
      // 각 파일 압축 (병렬). helper 없거나 실패하면 원본
      const compressed = await Promise.all(files.map(async (f) => {
        try {
          if (typeof window.compressImageForUpload === 'function') {
            return await window.compressImageForUpload(f, 1024, 0.85);
          }
        } catch (_e) { void _e; }
        return f;
      }));

      const fd = new FormData();
      compressed.forEach((blob, i) => {
        const actualType = (blob && blob.type) || 'image/jpeg';
        const ext = actualType.includes('png') ? '.png'
          : actualType.includes('webp') ? '.webp'
          : actualType.includes('heic') ? '.heic'
          : '.jpg';
        const safeName = (blob.name && /\.(jpg|jpeg|png|webp|heic|heif)$/i.test(blob.name))
          ? blob.name
          : ('photo' + (i + 1) + ext);
        fd.append('images', blob, safeName);
      });
      // 빈 question 도 항상 전송 (백엔드 Form 이 키 존재를 기대)
      fd.append('question', question || '');
      if (_sessionId) fd.append('session_id', String(_sessionId));

      const auth = (window.authHeader && window.authHeader()) || {};
      const ctrl = new AbortController();
      // 다중 이미지: 장당 60초 + 여유 버퍼. 최대 180초.
      const timeoutMs = Math.min(60000 + 30000 * Math.max(0, N - 1), 180000);
      const timeoutId = setTimeout(() => ctrl.abort(), timeoutMs);
      let res;
      try {
        res = await fetch(window.API + '/assistant/ask/images', {
          method: 'POST',
          headers: auth.Authorization ? { Authorization: auth.Authorization } : {},
          body: fd,
          signal: ctrl.signal,
        });
      } catch (fetchErr) {
        clearTimeout(timeoutId);
        if (fetchErr.name === 'AbortError') {
          throw new Error('분석이 너무 오래 걸려요. 사진 수를 줄이거나 더 작은 사진으로 시도해주세요');
        }
        throw new Error('서버 연결 실패 — 인터넷 확인 후 다시 시도해주세요');
      }
      clearTimeout(timeoutId);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || ('서버 오류 (HTTP ' + res.status + ')'));
      }
      const d = await res.json();
      _history = _history.filter(m => m.role !== 'loading');

      if (d.session_id) {
        _sessionId = d.session_id;
        try { localStorage.setItem('assistant_session_id', String(_sessionId)); } catch (_e) { void _e; }
      }

      const actionsList = (Array.isArray(d.actions) && d.actions.length)
        ? d.actions
        : (d.action && d.action.kind ? [d.action] : []);
      const msg = { role: 'assistant', text: d.answer || '사진을 확인했어요.' };
      if (Array.isArray(d.related_questions) && d.related_questions.length) {
        msg.related = d.related_questions.slice(0, 3);
      }
      // 중복 거래 경고 (영수증·주문내역 여러 장 업로드 대응)
      if (Array.isArray(d.duplicate_warnings) && d.duplicate_warnings.length) {
        msg.duplicate_warnings = d.duplicate_warnings.map(w => ({ ...w, dismissed: false }));
      }
      if (actionsList.length === 1) {
        msg.action = actionsList[0];
        msg.action_status = 'pending';
        _history.push(msg);
      } else if (actionsList.length > 1) {
        // 카테고리별 그룹 카드 (2건 이상)
        msg.action_groups = _groupActions(actionsList);
        // 2~6건 · kind 2종 이상 혼합 → 통합 확인 카드로 시작 (사용자가 '수정' 누르면 그룹 카드로 전환)
        if (_shouldUseUnifiedCard(msg.action_groups)) msg.unified_mode = true;
        _history.push(msg);
      } else {
        _history.push(msg);
      }
      _renderHistory();
      if (window.hapticLight) window.hapticLight();
    } catch (e) {
      _history = _history.filter(m => m.role !== 'loading');
      const human = window._humanError ? window._humanError(e) : (e && e.message) || '알 수 없는 오류';
      _history.push({ role: 'assistant', text: '사진을 못 읽었어요: ' + human });
      _renderHistory();
    } finally {
      _sendInFlight = false;
    }
  }

  async function _send() {
    if (_sendInFlight) return;  // 중복 송신 방지
    const input = document.getElementById('asstInput');
    const q = input.value.trim();
    if (!q) return;
    _sendInFlight = true;
    input.value = '';
    // Wave B5 — 전송 시 typeahead chips 숨김
    try {
      const tb = document.getElementById('asstTypeahead');
      if (tb) { tb.style.display = 'none'; tb.innerHTML = ''; }
    } catch (_e) { void _e; }
    _history.push({ role: 'user', text: q });
    _history.push({ role: 'loading', text: '' });
    _renderHistory();

    try {
      const res = await fetch(window.API + '/assistant/ask', {
        method: 'POST',
        headers: { ...window.authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, session_id: _sessionId || undefined }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const d = await res.json();
      _history = _history.filter(m => m.role !== 'loading');

      // v1.1 — session_id 저장 (서버가 최초 생성 or 기존 사용)
      if (d.session_id) {
        _sessionId = d.session_id;
        try { localStorage.setItem('assistant_session_id', String(_sessionId)); } catch (_e) { void _e; }
      }

      // 복수 액션 지원 — actions[] 우선, 없으면 단일 action 을 배열로
      const actionsList = (Array.isArray(d.actions) && d.actions.length)
        ? d.actions
        : (d.action && d.action.kind ? [d.action] : []);

      // Wave B4 — answer + actions 모두 빈값이면 휴리스틱 프리뷰 카드
      const answerText = (d.answer || '').trim();
      if (!answerText && actionsList.length === 0) {
        const extract = _heuristicExtract(q);
        _history.push({
          role: 'assistant',
          text: '정확히 못 알아들었어요. 아래처럼 정리해봤는데 맞나요?',
          fallback: extract,
        });
        _renderHistory();
        if (window.hapticLight) window.hapticLight();
        return;
      }

      const msg = { role: 'assistant', text: d.answer || '답을 만들지 못했어요.' };
      if (Array.isArray(d.related_questions) && d.related_questions.length) {
        msg.related = d.related_questions.slice(0, 3);
      }
      // 중복 거래 경고 (영수증·주문내역 여러 장 업로드 대응)
      if (Array.isArray(d.duplicate_warnings) && d.duplicate_warnings.length) {
        msg.duplicate_warnings = d.duplicate_warnings.map(w => ({ ...w, dismissed: false }));
      }

      if (actionsList.length === 1) {
        // 단일 액션: 답변 메시지에 '추가하기 ✓' 버튼 직접 붙임 (기존 UX)
        msg.action = actionsList[0];
        msg.action_status = 'pending';
        _history.push(msg);
      } else if (actionsList.length > 1) {
        // 복수 액션: 카테고리별 그룹 카드로 묶어서 표시
        msg.action_groups = _groupActions(actionsList);
        // 2~6건 · kind 2종 이상 혼합 → 통합 확인 카드로 시작 (같은 kind 다수면 기존 그룹 카드 유지)
        if (_shouldUseUnifiedCard(msg.action_groups)) msg.unified_mode = true;
        _history.push(msg);
      } else {
        _history.push(msg);
      }
      _renderHistory();
      if (window.hapticLight) window.hapticLight();
    } catch (e) {
      _history = _history.filter(m => m.role !== 'loading');
      _history.push({ role: 'assistant', text: '잠시 연결이 불안정해요. 다시 시도해 주세요. (' + (window._humanError ? window._humanError(e) : e.message) + ')' });
      _renderHistory();
    } finally {
      _sendInFlight = false;
    }
  }

  // [2026-04-26] 멀티 디바이스 동기화 — 서버에서 최근 세션 messages 로드.
  // 폰·컴 다른 디바이스에서 같은 user 로 들어왔을 때도 같은 대화방.
  let _historyLoadedFromServer = false;
  async function _loadServerHistory(force = false) {
    if (_historyLoadedFromServer && !force) return;
    try {
      const res = await fetch(window.API + '/assistant/session/current', {
        headers: { ...authHeader() },
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.session_id) {
        _sessionId = data.session_id;
        try { localStorage.setItem('assistant_session_id', String(_sessionId)); } catch (_) {}
      }
      // 서버 messages 가 비어있지 않으면 _history 덮어쓰기 (서버가 진실원천)
      if (Array.isArray(data?.messages) && data.messages.length) {
        _history = data.messages.map(m => ({
          role: m.role || 'assistant',
          text: m.text || '',
          // 서버는 photos 보관 안 함 — 디바이스 간 사진 미리보기는 보내는 디바이스에서만
        }));
      }
      _historyLoadedFromServer = true;
      _renderHistory();
    } catch (_e) { /* offline 등 — 기존 _history 유지 */ }
  }
  // "데이터 동기화" 버튼 / focus 복귀 시 강제 새로고침
  window.addEventListener('itdasy:data-changed', () => {
    _historyLoadedFromServer = false;
    _loadServerHistory(true);
  });

  window.openAssistant = function () {
    _ensureSheet();
    const sheet = document.getElementById('assistantSheet');
    // 2026-04-24 perf — DOM 미리 준비 + opacity 페이드 (display 토글 → opacity 토글)
    sheet.style.display = 'block';
    // 다음 프레임에 페이드 인
    requestAnimationFrame(() => requestAnimationFrame(() => {
      sheet.style.opacity = '1';
      sheet.style.pointerEvents = 'auto';
    }));
    document.body.style.overflow = 'hidden';
    _renderHistory();
    // 첫 오픈 시 서버 history 동기화 (백그라운드, 즉시 렌더에 영향 X)
    _loadServerHistory();
    setTimeout(() => document.getElementById('asstInput')?.focus(), 60);
  };
  window.closeAssistant = function () {
    const sheet = document.getElementById('assistantSheet');
    if (sheet) {
      sheet.style.opacity = '0';
      sheet.style.pointerEvents = 'none';
      setTimeout(() => { sheet.style.display = 'none'; }, 90);
    }
    document.body.style.overflow = '';
  };

  // 2026-04-24 perf — 앱 idle 시 시트 DOM 미리 생성. 첫 탭 latency 0.3s+ → ~0.05s
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => { try { _ensureSheet(); } catch (_e) { /* ignore */ } }, { timeout: 3000 });
  } else {
    setTimeout(() => { try { _ensureSheet(); } catch (_e) { /* ignore */ } }, 1500);
  }
})();
