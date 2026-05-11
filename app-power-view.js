/* ─────────────────────────────────────────────────────────────
   파워뷰(Power View) — API · 상태 · open/close (P2.5-rev1)
   렌더 레이어: app-power-view-render.js (window._PVRender)
   전역: window.openPowerView(tabKey) / window.closePowerView()
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const API = () => window.API || '';
  const AUTH = () => (window.authHeader ? window.authHeader() : {});
  const OVERLAY_ID = 'power-view-overlay';

  const _state = window._PVState = {
    currentTab: 'customer',
    data: { customer: [], booking: [], revenue: [], inventory: [], nps: [], service: [] },
    searchKW: '',
    pending: { customer: [], booking: [], revenue: [], inventory: [], nps: [], service: [] },
    editMode: false,
  };

  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch])); }
  function _krw(n) { return (n || 0).toLocaleString('ko-KR') + '원'; }

  // 2026-04-24 — icon 은 Lucide sprite id (렌더 시 <svg><use href="#..."/></svg> 로 변환)
  const TABS = [
    { key: 'customer',  icon: 'ic-users',       label: '고객',  hue: 350 },
    { key: 'booking',   icon: 'ic-calendar',    label: '예약',  hue: 260 },
    { key: 'revenue',   icon: 'ic-dollar-sign', label: '매출',  hue: 20  },
    { key: 'inventory', icon: 'ic-package',     label: '재고',  hue: 150 },
    { key: 'nps',       icon: 'ic-star',        label: '후기',  hue: 45  },
    { key: 'service',   icon: 'ic-scissors',    label: '시술',  hue: 320 },
  ];

  function _injectStyles() { /* CSS → css/screens/power-view.css */ }

  // ── 탭 스키마 ──────────────────────────────────────────
  const SCHEMAS = {
    customer: {
      headers: ['이름', '전화', '메모', '단골', '멤버십', '잔액', '방문'],
      row: (r) => [
        `<strong>${_esc(r.name)}</strong>`,
        r.phone || '—',
        (r.memo || '').slice(0, 30) || '—',
        r.is_regular
          ? `<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:999px;background:var(--brand);color:#fff;font-size:11px;font-weight:700;"><i class="ph-duotone ph-star" aria-hidden="true"></i>단골</span>`
          : '<span style="color:#bbb;font-size:11px;">—</span>',
        r.membership_active
          ? `<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:999px;background:#A78BFA;color:#fff;font-size:11px;font-weight:700;"><i class="ph-duotone ph-sparkle" aria-hidden="true"></i>가입</span>`
          : '<span style="color:#bbb;font-size:11px;">—</span>',
        r.membership_active
          ? `<span style="font-weight:700;color:${(+r.membership_balance || 0) < 30000 && (+r.membership_balance || 0) > 0 ? '#F97316' : '#6B21A8'};">${_krw(r.membership_balance)}</span>`
          : '<span style="color:#bbb;">—</span>',
        `${r.visit_count || 0}회`,
      ],
      editFields: [
        { key: 'name',  type: 'text' },
        { key: 'phone', type: 'tel' },
        { key: 'memo',  type: 'text' },
        { key: 'is_regular',         type: 'checkbox' },
        { key: 'membership_active',  type: 'checkbox' },
        { key: 'membership_balance', type: 'number' },
        { key: 'membership_expires_at', type: 'date',
          transform: (v) => (v ? String(v).slice(0, 10) : '') },
        { key: 'visit_count', type: 'text', readonly: true, format: (r) => `${r.visit_count || 0}회` },
      ],
      search: (r, kw) => (r.name + ' ' + (r.phone || '') + ' ' + (r.memo || '')).toLowerCase().includes(kw),
      empty: { icon: '👥', title: '아직 고객이 없어요', desc: '위 입력 행에 이름·전화만 적고 Enter 로 추가하세요.' },
      qadd: {
        fields: [
          { name: 'name',  placeholder: '이름', flex: 1.3, required: true, auto: 'customer_name' },
          { name: 'phone', placeholder: '전화 010-...', flex: 1.3 },
          { name: 'memo',  placeholder: '메모(선택)', flex: 2 },
        ],
        endpoint: '/customers?force=true',
        build: (v) => ({ name: v.name.trim(), phone: v.phone?.trim() || null, memo: v.memo?.trim() || '', tags: [] }),
      },
    },
    booking: {
      headers: ['고객', '시술', '시간', '상태'],
      row: (r) => [
        _esc(r.customer_name || '—'),
        _esc(r.service_name || '—'),
        `<span style="color:var(--text-muted);font-variant-numeric:tabular-nums;">${(r.starts_at || '').replace('T', ' ').slice(0, 16)}</span>`,
        `<span style="padding:3px 9px;border-radius:100px;background:#E8F4F1;color:#2B8C7E;font-size:11px;font-weight:700;">${_esc(({confirmed:'확정',completed:'완료',cancelled:'취소',no_show:'안 옴'}[r.status])||r.status||'확정')}</span>`,
      ],
      editFields: [
        { key: 'customer_name', type: 'text' },
        { key: 'service_name',  type: 'text' },
        { key: 'starts_at',     type: 'text', placeholder: 'YYYY-MM-DD HH:MM',
          transform: (v) => (v || '').replace('T', ' ').slice(0, 16) },
        { key: 'status',        type: 'text' },
      ],
      search: (r, kw) => ((r.customer_name || '') + ' ' + (r.service_name || '') + ' ' + (r.starts_at || '')).toLowerCase().includes(kw),
      empty: { icon: '📅', title: '예정된 예약이 없어요', desc: '시간 형식: 2026-04-22 14:00' },
      qadd: {
        fields: [
          { name: 'customer_name', placeholder: '고객', flex: 1, auto: 'customer_name' },
          { name: 'service_name',  placeholder: '시술', flex: 1, auto: 'service_name' },
          { name: 'starts_at',     placeholder: '2026-04-22 14:00', flex: 1.6, required: true },
          { name: 'minutes',       placeholder: '분', flex: 0.4, type: 'number', default: 60 },
        ],
        endpoint: '/bookings',
        build: (v) => {
          const s = v.starts_at.replace(' ', 'T');
          const start = new Date(s);
          const mins = parseInt(v.minutes) || 60;
          const end = new Date(start.getTime() + mins * 60 * 1000);
          return {
            customer_name: v.customer_name?.trim() || null,
            service_name:  v.service_name?.trim() || null,
            starts_at: start.toISOString(),
            ends_at:   end.toISOString(),
          };
        },
      },
    },
    revenue: {
      headers: ['고객', '시술', '금액', '수단', '실 수령'],
      row: (r) => [
        _esc(r.customer_name || '—'),
        _esc(r.service_name || '—'),
        `<span style="font-weight:800;color:#1a1a1a;">${_krw(r.amount)}</span>`,
        `<span style="padding:3px 9px;border-radius:100px;background:#FEF4F5;color:var(--brand-strong);font-size:11px;font-weight:700;">${_esc(({card:'카드',cash:'현금',transfer:'계좌이체',bank_transfer:'계좌이체',etc:'기타'}[r.method])||r.method||'—')}</span>`,
        `<span style="color:#2B8C7E;font-weight:700;">${r.net_amount != null ? _krw(r.net_amount) : _krw(r.amount)}</span>`,
      ],
      editFields: [
        { key: 'customer_name', type: 'text' },
        { key: 'service_name',  type: 'text' },
        { key: 'amount',        type: 'number' },
        { key: 'method',        type: 'text', placeholder: '카드|현금|계좌이체' },
        { key: 'net_amount',    type: 'text', readonly: true,
          format: (r) => _krw(r.net_amount != null ? r.net_amount : r.amount) },
      ],
      search: (r, kw) => ((r.customer_name || '') + ' ' + (r.service_name || '') + ' ' + (r.method || '')).toLowerCase().includes(kw),
      empty: { icon: '💰', title: '매출 기록이 없어요', desc: '카드는 3.4% 수수료가 자동 차감돼서 실 수령액이 바로 보여요.' },
      qadd: {
        fields: [
          { name: 'customer_name', placeholder: '고객', flex: 1, auto: 'customer_name' },
          { name: 'service_name',  placeholder: '시술', flex: 1, auto: 'service_name' },
          { name: 'amount',        placeholder: '금액', flex: 0.9, type: 'number', required: true },
          { name: 'method',        placeholder: '결제수단', flex: 1.1, default: 'card', type: 'select',
            options: [
              { value: 'card',     label: '카드' },
              { value: 'cash',     label: '현금' },
              { value: 'transfer', label: '계좌이체' },
            ],
          },
        ],
        endpoint: '/revenue',
        build: (v) => ({
          customer_name: v.customer_name?.trim() || null,
          service_name:  v.service_name?.trim() || null,
          amount: parseInt(v.amount),
          method: v.method || 'card',
        }),
      },
    },
    inventory: {
      headers: ['품목', '수량', '단위', '임계', '상태'],
      row: (r) => {
        const low = (r.quantity || 0) < (r.threshold || 0);
        return [
          _esc(r.name),
          `<span style="font-weight:700;font-variant-numeric:tabular-nums;">${r.quantity}</span>`,
          r.unit || '개',
          r.threshold || '—',
          low
            ? `<span style="padding:3px 9px;border-radius:100px;background:#FFEBEE;color:#C62828;font-size:11px;font-weight:700;">🔴 부족</span>`
            : `<span style="padding:3px 9px;border-radius:100px;background:#E8F5E9;color:#2E7D32;font-size:11px;font-weight:700;">🟢 정상</span>`,
        ];
      },
      editFields: [
        { key: 'name',      type: 'text' },
        { key: 'quantity',  type: 'number' },
        { key: 'unit',      type: 'text' },
        { key: 'threshold', type: 'number' },
        { key: '_status',   type: 'text', readonly: true,
          format: (r) => ((r.quantity || 0) < (r.threshold || 0)) ? '🔴 부족' : '🟢 정상' },
      ],
      search: (r, kw) => ((r.name || '') + ' ' + (r.category || '')).toLowerCase().includes(kw),
      empty: { icon: '📦', title: '재고가 비어있어요', desc: '임계보다 적어지면 자동 부족 경고 뜹니다.' },
      qadd: {
        fields: [
          { name: 'name',      placeholder: '품목 이름', flex: 1.8, required: true, auto: 'item_name' },
          { name: 'quantity',  placeholder: '수량',      flex: 0.6, type: 'number' },
          { name: 'threshold', placeholder: '임계',      flex: 0.6, type: 'number', default: 3 },
          { name: 'category',  placeholder: '분류', flex: 1.2, type: 'select',
            options: [
              { value: '',               label: '분류 선택' },
              { value: 'hair_extension', label: '붙임머리' },
              { value: 'nail',           label: '네일' },
              { value: 'lash',           label: '속눈썹' },
              { value: 'hair',           label: '헤어' },
              { value: 'wax',            label: '왁싱' },
              { value: 'skin',           label: '피부' },
              { value: 'tattoo',         label: '반영구' },
              { value: 'etc',            label: '기타' },
            ],
          },
        ],
        endpoint: '/inventory',
        build: (v) => ({
          name: v.name.trim(), unit: '개',
          quantity: parseInt(v.quantity) || 0,
          threshold: parseInt(v.threshold) || 3,
          category: v.category?.trim() || 'etc',
        }),
      },
    },
    nps: {
      headers: ['평점', '코멘트', '출처', '날짜'],
      row: (r) => [
        `<span style="color:#FFD54F;font-weight:800;">★${r.rating}</span>`,
        _esc((r.comment || '').slice(0, 48) || '—'),
        `<span style="color:#888;font-size:11px;">${_esc(r.source || 'manual')}</span>`,
        `<span style="color:#888;font-variant-numeric:tabular-nums;">${(r.responded_at || '').slice(0, 10) || '—'}</span>`,
      ],
      editFields: [
        { key: 'rating',  type: 'number' },
        { key: 'comment', type: 'text' },
        { key: 'source',  type: 'text' },
        { key: 'responded_at', type: 'text', readonly: true,
          format: (r) => (r.responded_at || '').slice(0, 10) || '—' },
      ],
      search: (r, kw) => ((r.comment || '') + ' ' + (r.source || '') + ' ' + r.rating).toLowerCase().includes(kw),
      empty: { icon: '⭐', title: '후기가 없어요', desc: '0~10점 만족도 질문의 답을 기록해요.' },
      qadd: {
        fields: [
          { name: 'rating',  placeholder: '평점(0~10)', flex: 0.5, type: 'number', required: true },
          { name: 'comment', placeholder: '후기 내용',  flex: 3.2 },
        ],
        endpoint: '/nps',
        build: (v) => ({ rating: parseInt(v.rating), comment: v.comment?.trim() || '', source: 'manual' }),
      },
    },
    service: {
      headers: ['시술명', '기본 금액', '소요', '분류'],
      row: (r) => [
        `<strong>${_esc(r.name)}</strong>`,
        `<span style="font-weight:700;">${_krw(r.default_price)}</span>`,
        `<span style="color:var(--text-muted);">${r.default_duration_min || 0}분</span>`,
        `<span style="padding:3px 9px;border-radius:100px;background:#F3E8FF;color:#6B21A8;font-size:11px;font-weight:700;">${_esc(({nail:'네일',hair:'헤어',lash:'속눈썹',skin:'피부',eye:'속눈썹',wax:'왁싱',hair_extension:'붙임머리',etc:'기타'}[r.category])||r.category||'기타')}</span>`,
      ],
      editFields: [
        { key: 'name',                 type: 'text' },
        { key: 'default_price',        type: 'number' },
        { key: 'default_duration_min', type: 'number' },
        { key: 'category',             type: 'text' },
      ],
      search: (r, kw) => ((r.name || '') + ' ' + (r.category || '')).toLowerCase().includes(kw),
      empty: { icon: '💅', title: '시술 프리셋이 없어요', desc: '자주 하는 시술 등록해두면 원탭 기록 가능.' },
      qadd: {
        fields: [
          { name: 'name',                 placeholder: '시술명',    flex: 1.3, required: true, auto: 'service_name' },
          { name: 'default_price',        placeholder: '기본 금액', flex: 0.8, type: 'number' },
          { name: 'default_duration_min', placeholder: '소요(분)', flex: 0.6, type: 'number', default: 60 },
          { name: 'category',             placeholder: '분류', flex: 1.2, type: 'select',
            options: [
              { value: '',               label: '분류 선택' },
              { value: 'hair_extension', label: '붙임머리' },
              { value: 'nail',           label: '네일' },
              { value: 'lash',           label: '속눈썹' },
              { value: 'hair',           label: '헤어' },
              { value: 'wax',            label: '왁싱' },
              { value: 'skin',           label: '피부' },
              { value: 'tattoo',         label: '반영구' },
              { value: 'etc',            label: '기타' },
            ],
          },
        ],
        endpoint: '/services',
        build: (v) => ({
          name: v.name.trim(),
          default_price: parseInt(v.default_price) || 0,
          default_duration_min: parseInt(v.default_duration_min) || 60,
          category: v.category?.trim() || 'etc',
        }),
      },
    },
  };

  // ── API 호출 + sessionStorage 캐시 (90초 TTL) ─────────
  const _CACHE_TTL_MS = 90 * 1000;
  function _cacheKey(tab) { return `pv_cache::${tab}`; }
  function _readCache(tab) {
    try {
      const raw = sessionStorage.getItem(_cacheKey(tab));
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (Date.now() - obj.t > _CACHE_TTL_MS) return null;
      return obj.d;
    } catch (_e) { return null; }
  }
  function _writeCache(tab, items) {
    try { sessionStorage.setItem(_cacheKey(tab), JSON.stringify({ t: Date.now(), d: items })); }
    catch (_e) { /* quota exceeded — 조용히 무시 */ }
  }

  async function _fetchTab(key, useCache = true) {
    if (useCache) {
      const cached = _readCache(key);
      if (cached) return cached;
    }
    const paths = {
      customer:  '/customers',
      booking:   '/bookings',
      revenue:   '/revenue?period=month',
      inventory: '/inventory',
      nps:       '/nps',
      service:   '/services',
    };
    try {
      const res = await fetch(API() + paths[key], { headers: AUTH() });
      if (!res.ok) return [];
      const d = await res.json();
      const items = d.items || [];
      _writeCache(key, items);
      return items;
    } catch (e) { console.warn('[power-view] fetch', key, e); return []; }
  }

  // ── 즉시 추가 ────────────────────────────────────────
  async function _submitQuickAdd() {
    const schema = SCHEMAS[_state.currentTab];
    const inputs = document.querySelectorAll('#power-view-overlay .pv-qadd [data-field]');
    const v = {}; let missing = null;
    inputs.forEach(i => { v[i.getAttribute('data-field')] = i.value; });
    schema.qadd.fields.forEach(f => { if (f.required && !v[f.name]?.trim()) missing = f.name; });
    if (missing) {
      if (window.showToast) window.showToast(`필수: ${missing}`);
      const el = document.querySelector(`#power-view-overlay .pv-qadd [data-field="${missing}"]`);
      if (el) { el.focus(); el.style.borderColor = '#dc3545'; setTimeout(() => { el.style.borderColor = ''; }, 1200); }
      return;
    }
    const btn = document.getElementById('pv-add-btn');
    if (btn) { btn.disabled = true; btn.style.opacity = '0.7'; btn.innerHTML = '저장중…'; }
    try {
      const body = schema.qadd.build(v);
      const res = await fetch(API() + schema.qadd.endpoint, {
        method: 'POST',
        headers: { ...AUTH(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = (typeof err.detail === 'string' ? err.detail : err.detail?.message) || res.statusText;
        throw new Error(msg);
      }
      const saved = await res.json();
      if (window.hapticSuccess) window.hapticSuccess();
      if (window.showToast) window.showToast('추가됨');
      inputs.forEach(i => {
        const f = schema.qadd.fields.find(x => x.name === i.getAttribute('data-field'));
        i.value = (f && f.default !== undefined) ? f.default : '';
      });
      _state.data[_state.currentTab] = await _fetchTab(_state.currentTab);
      await window._PVRender.renderTab(true);
      if (saved && saved.id) {
        const newRow = document.querySelector(`#pv-tbody tr[data-id="${saved.id}"]`);
        if (newRow) newRow.classList.add('pv-row-new');
      }
      if (window.Dashboard?.refresh) window.Dashboard.refresh(true);
    } catch (e) {
      if (window.showToast) window.showToast('실패: ' + (window._humanError ? window._humanError(e) : e.message));
    } finally {
      if (btn) { btn.disabled = false; btn.style.opacity = ''; btn.innerHTML = '즉시 추가 <span class="pv-kbd">↵</span>'; }
    }
  }

  // ── 배치 일괄 저장 ───────────────────────────────────
  async function _flushBatch() {
    const schema = SCHEMAS[_state.currentTab];
    const items = _state.pending[_state.currentTab] || [];
    if (!items.length) return;
    const btn = document.getElementById('pv-batch-save');
    if (btn) { btn.disabled = true; btn.textContent = '저장 중…'; }
    let ok = 0, fail = 0;
    await Promise.all(items.map(async body => {
      try {
        const res = await fetch(API() + schema.qadd.endpoint, {
          method: 'POST',
          headers: { ...AUTH(), 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(await res.text());
        ok++;
      } catch (_e) { fail++; /* ignore, counted in fail */ }
    }));
    _state.pending[_state.currentTab] = [];
    if (window.hapticSuccess) window.hapticSuccess();
    if (window.showToast) window.showToast(`${ok}건 저장${fail ? ` · 실패 ${fail}` : ''}`);
    _state.data[_state.currentTab] = await _fetchTab(_state.currentTab);
    await window._PVRender.renderTab(true);
    if (window.Dashboard?.refresh) window.Dashboard.refresh(true);
  }

  // ── 행 인라인 수정 ──────────────────────────────────
  async function _editRow(rowId) {
    const tab = _state.currentTab;
    const row = (_state.data[tab] || []).find(r => r.id == rowId);
    if (!row) return;
    const editableFields = {
      customer:  [['name','이름'],['phone','전화'],['memo','메모']],
      booking:   [['customer_name','고객'],['service_name','시술'],['starts_at','시작(YYYY-MM-DD HH:MM)'],['memo','메모'],['status','상태(confirmed|completed|cancelled)']],
      revenue:   [['customer_name','고객'],['service_name','시술'],['amount','금액'],['method','결제(card|cash|transfer)'],['memo','메모']],
      inventory: [['name','품목'],['quantity','수량'],['threshold','임계'],['category','분류']],
      nps:       [['rating','평점'],['comment','코멘트']],
      service:   [['name','시술명'],['default_price','기본 금액'],['default_duration_min','소요(분)'],['category','분류']],
    }[tab] || [];
    const patch = {};
    for (const [field, label] of editableFields) {
      const cur = row[field] ?? '';
      const v = prompt(`${label} — 수정 (그대로 두려면 Cancel)`, typeof cur === 'string' ? cur : String(cur));
      if (v == null) continue;
      if (String(v) !== String(cur)) patch[field] = v;
    }
    if (!Object.keys(patch).length) return;
    const paths = {
      customer:  `/customers/${row.id}`,
      booking:   `/bookings/${row.id}`,
      revenue:   `/revenue/${row.id}`,
      inventory: `/inventory/${row.id}`,
      nps:       `/nps/${row.id}`,
      service:   `/services/${row.id}`,
    };
    if ('amount' in patch) patch.amount = parseInt(patch.amount) || 0;
    if ('quantity' in patch) patch.quantity = parseInt(patch.quantity) || 0;
    if ('threshold' in patch) patch.threshold = parseInt(patch.threshold) || 0;
    if ('rating' in patch) patch.rating = parseInt(patch.rating) || 0;
    if ('default_price' in patch) patch.default_price = parseInt(patch.default_price) || 0;
    if ('default_duration_min' in patch) patch.default_duration_min = parseInt(patch.default_duration_min) || 60;
    if ('starts_at' in patch) {
      const s = String(patch.starts_at).replace(' ', 'T');
      const start = new Date(s);
      if (isNaN(start)) { if (window.showToast) window.showToast('시간 형식 오류'); return; }
      patch.starts_at = start.toISOString();
      if (tab === 'booking' && row.starts_at && row.ends_at) {
        const dur = new Date(row.ends_at) - new Date(row.starts_at);
        patch.ends_at = new Date(start.getTime() + dur).toISOString();
      }
    }
    try {
      const res = await fetch(API() + paths[tab], {
        method: 'PATCH',
        headers: { ...AUTH(), 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(await res.text());
      if (window.hapticSuccess) window.hapticSuccess();
      if (window.showToast) window.showToast('수정됨');
      _state.data[tab] = await _fetchTab(tab);
      await window._PVRender.renderTab(true);
    } catch (e) { if (window.showToast) window.showToast('실패: ' + (window._humanError ? window._humanError(e) : e.message)); }
  }

  // ── 엔드포인트 경로 (편집/삭제 공통) ────────────────
  const _ROW_PATHS = {
    customer:  (id) => `/customers/${id}`,
    booking:   (id) => `/bookings/${id}`,
    revenue:   (id) => `/revenue/${id}`,
    inventory: (id) => `/inventory/${id}`,
    nps:       (id) => `/nps/${id}`,
    service:   (id) => `/services/${id}`,
  };

  // ── 숫자/날짜 전처리 (PATCH 전 형변환) ──────────────
  function _coercePatch(tab, row, patch) {
    if ('amount' in patch) patch.amount = parseInt(patch.amount) || 0;
    if ('quantity' in patch) patch.quantity = parseInt(patch.quantity) || 0;
    if ('threshold' in patch) patch.threshold = parseInt(patch.threshold) || 0;
    if ('rating' in patch) patch.rating = parseInt(patch.rating) || 0;
    if ('default_price' in patch) patch.default_price = parseInt(patch.default_price) || 0;
    if ('default_duration_min' in patch) patch.default_duration_min = parseInt(patch.default_duration_min) || 60;
    // customer 단골/멤버십 필드
    if ('is_regular' in patch) patch.is_regular = (patch.is_regular === true || patch.is_regular === 'true' || patch.is_regular === 'on' || patch.is_regular === '1');
    if ('membership_active' in patch) patch.membership_active = (patch.membership_active === true || patch.membership_active === 'true' || patch.membership_active === 'on' || patch.membership_active === '1');
    if ('membership_balance' in patch) patch.membership_balance = parseInt(String(patch.membership_balance).replace(/[^\d-]/g, '')) || 0;
    if ('membership_expires_at' in patch) {
      const v = patch.membership_expires_at;
      if (!v) {
        patch.membership_expires_at = null;
      } else if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
        patch.membership_expires_at = new Date(v + 'T23:59:59').toISOString();
      }
      // 이미 ISO 면 그대로 둠
    }
    if ('starts_at' in patch && patch.starts_at) {
      const s = String(patch.starts_at).replace(' ', 'T');
      const start = new Date(s);
      if (isNaN(start)) throw new Error('시간 형식 오류 (예: 2026-04-22 14:00)');
      patch.starts_at = start.toISOString();
      if (tab === 'booking' && row.starts_at && row.ends_at) {
        const dur = new Date(row.ends_at) - new Date(row.starts_at);
        patch.ends_at = new Date(start.getTime() + dur).toISOString();
      }
    }
    return patch;
  }

  // ── 편집 모드: 행 저장 ──────────────────────────────
  async function _saveInlineRow(rowId) {
    const tab = _state.currentTab;
    const row = (_state.data[tab] || []).find(r => String(r.id) === String(rowId));
    if (!row) return;
    const schema = SCHEMAS[tab];
    const inputs = document.querySelectorAll(`#power-view-overlay [data-pv-edit^="${rowId}:"]`);
    const patch = {};
    inputs.forEach(el => {
      const key = el.getAttribute('data-pv-edit').split(':')[1];
      const f = (schema.editFields || []).find(x => x.key === key);
      if (!f || f.readonly) return;
      // 체크박스 — boolean 비교
      if (f.type === 'checkbox' || el.type === 'checkbox') {
        const newVal = !!el.checked;
        const curVal = !!row[key];
        if (newVal !== curVal) patch[key] = newVal;
        return;
      }
      const curVal = row[key] == null ? '' : String(row[key]);
      const newVal = el.value;
      if (newVal !== curVal && !(newVal === '' && row[key] == null)) {
        patch[key] = newVal;
      }
    });
    if (!Object.keys(patch).length) {
      if (window.showToast) window.showToast('변경 없음');
      return;
    }
    const btn = document.querySelector(`[data-pv-row-save="${rowId}"]`);
    if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; btn.innerHTML = '…'; }
    try {
      _coercePatch(tab, row, patch);
      const res = await fetch(API() + _ROW_PATHS[tab](row.id), {
        method: 'PATCH',
        headers: { ...AUTH(), 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = (typeof err.detail === 'string' ? err.detail : err.detail?.message) || res.statusText;
        throw new Error(msg);
      }
      if (window.hapticSuccess) window.hapticSuccess();
      const chip = document.getElementById('pv-save-chip');
      if (chip) {
        chip.textContent = '저장 완료';
        chip.classList.add('pv-save-chip--show');
        setTimeout(() => chip.classList.remove('pv-save-chip--show'), 1400);
      }
      _state.data[tab] = await _fetchTab(tab, false);
      await window._PVRender.renderTab(true);
      if (window.Dashboard?.refresh) window.Dashboard.refresh(true);
    } catch (e) {
      if (window.showToast) window.showToast('실패: ' + (window._humanError ? window._humanError(e) : e.message));
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.style.opacity = '';
        btn.innerHTML = `<i class="ph-duotone ph-floppy-disk" aria-hidden="true"></i>`;
      }
    }
  }

  // ── 편집 모드: 행 삭제 ──────────────────────────────
  async function _deleteInlineRow(rowId) {
    const tab = _state.currentTab;
    const row = (_state.data[tab] || []).find(r => String(r.id) === String(rowId));
    if (!row) return;
    const label = row.name || row.customer_name || row.service_name || `#${row.id}`;
    let confirmed = false;
    if (typeof window._confirm2 === 'function') {
      try { confirmed = await window._confirm2(`"${label}" 삭제할까요? 복구 불가.`); }
      catch (_e) { confirmed = false; }
    } else {
      confirmed = window.confirm(`"${label}" 삭제할까요?`);
    }
    if (!confirmed) return;
    try {
      const res = await fetch(API() + _ROW_PATHS[tab](row.id), {
        method: 'DELETE',
        headers: AUTH(),
      });
      if (!res.ok && res.status !== 204) {
        const err = await res.json().catch(() => ({}));
        const msg = (typeof err.detail === 'string' ? err.detail : err.detail?.message) || res.statusText;
        throw new Error(msg);
      }
      if (window.hapticSuccess) window.hapticSuccess();
      if (window.showToast) window.showToast('🗑 삭제됨');
      _state.data[tab] = (_state.data[tab] || []).filter(r => String(r.id) !== String(rowId));
      try { sessionStorage.removeItem(_cacheKey(tab)); } catch (_e) { /* ignore */ }
      await window._PVRender.renderTab(true);
      if (window.Dashboard?.refresh) window.Dashboard.refresh(true);
    } catch (e) {
      if (window.showToast) window.showToast('삭제 실패: ' + (window._humanError ? window._humanError(e) : e.message));
    }
  }

  // ── 편집 모드 토글 ──────────────────────────────────
  function _toggleEditMode(force) {
    const next = (typeof force === 'boolean') ? force : !_state.editMode;
    _state.editMode = next;
    const btn = document.getElementById('pv-edit-toggle');
    if (btn) {
      btn.innerHTML = next
        ? `<i class="ph-duotone ph-check" aria-hidden="true"></i> 완료`
        : `<i class="ph-duotone ph-pencil-simple" aria-hidden="true"></i> 편집`;
      btn.setAttribute('aria-pressed', String(next));
      btn.style.background = next
        ? 'linear-gradient(135deg, hsl(150, 55%, 55%), hsl(150, 60%, 45%))'
        : 'linear-gradient(135deg, hsl(350, 75%, 72%), hsl(350, 70%, 60%))';
      btn.style.color = '#fff';
    }
    if (!next) {
      const chip = document.getElementById('pv-save-chip');
      if (chip) {
        chip.textContent = '완료됨';
        chip.classList.add('pv-save-chip--show');
        setTimeout(() => chip.classList.remove('pv-save-chip--show'), 1200);
      }
    }
    if (window.hapticLight) window.hapticLight();
    if (window._PVRender) window._PVRender.renderTab(true);
  }

  // ── 크로스 파일 인터페이스 ───────────────────────────
  window._PVInt = {
    SCHEMAS, TABS,
    esc: _esc, krw: _krw,
    api: API, auth: AUTH,
    fetchTab: _fetchTab,
    submitQuickAdd: _submitQuickAdd,
    flushBatch: _flushBatch,
    editRow: _editRow,
    saveInlineRow: _saveInlineRow,
    deleteInlineRow: _deleteInlineRow,
    toggleEditMode: _toggleEditMode,
  };

  // ── 키보드 단축키 ────────────────────────────────────
  // 2026-05-08: Cmd/Ctrl+S, Cmd/Ctrl+Enter → 즉시 추가 (엑셀급 단축 저장)
  // Cmd/Ctrl+K → 검색, Cmd/Ctrl+/ → 단축키 안내 토스트
  function _escListener(e) {
    if (e.key === 'Escape') { closePowerView(); return; }
    const meta = e.metaKey || e.ctrlKey;
    if (!meta) return;
    const k = e.key.toLowerCase();
    if (k === 'k') {
      const s = document.getElementById('pv-search');
      if (s) { e.preventDefault(); s.focus(); s.select(); }
    } else if (k === 's' || (k === 'enter')) {
      // qadd input 안에 포커스가 있으면 그대로 저장 (Enter 는 input 의 keypress 가 이미 처리)
      const overlay = document.getElementById(OVERLAY_ID);
      if (!overlay) return;
      const focused = document.activeElement;
      const inQAdd = focused && focused.closest && focused.closest('.pv-qadd');
      const isInput = focused && (focused.tagName === 'INPUT' || focused.tagName === 'TEXTAREA' || focused.tagName === 'SELECT');
      // Cmd+S 는 어디서든, Cmd+Enter 는 input 안에서만
      if (k === 's' || (k === 'enter' && isInput)) {
        e.preventDefault();
        if (inQAdd || !isInput) {
          if (typeof _submitQuickAdd === 'function') _submitQuickAdd();
        }
      }
    } else if (k === '/') {
      e.preventDefault();
      if (window.showToast) {
        window.showToast('Cmd/Ctrl+S 저장 · Cmd/Ctrl+K 검색 · Esc 닫기');
      }
    }
  }

  // ── open / close ─────────────────────────────────────
  function openPowerView(tabKey) {
    if (typeof window._perfMark === 'function') window._perfMark('powerview:open:start');
    _injectStyles();
    if (tabKey && SCHEMAS[tabKey]) _state.currentTab = tabKey;
    _state.searchKW = '';
    let overlay = document.getElementById(OVERLAY_ID);
    if (overlay) overlay.remove();

    overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.style.cssText = [
      'position:fixed;inset:0;z-index:9999;background:rgba(20,8,16,0.78);',
      'display:flex;align-items:flex-end;justify-content:center;padding:20px;',
      'padding-bottom:calc(20px + env(safe-area-inset-bottom,0px));',
    ].join('');

    const chipHtml = TABS.map(t =>
      `<button class="chip ${t.key === _state.currentTab ? 'chip--active' : ''}" data-pv-tab="${t.key}"><svg width="13" height="13" style="vertical-align:-2px;margin-right:3px;" aria-hidden="true"><use href="#${t.icon}"/></svg>${t.label}<span class="pv-tab-badge" data-pv-tab-badge="${t.key}" style="display:none;"></span></button>`
    ).join('');

    overlay.innerHTML = `
      <div class="pv-dialog" style="align-self:center;">
        <div class="pv-header">
          <button class="pv-close" onclick="window.closePowerView()" aria-label="닫기" title="닫기" style="margin-right:4px;">
            <i class="ph-duotone ph-caret-left" style="font-size:16px" aria-hidden="true"></i>
          </button>
          <div class="pv-title" style="flex:1;">빠른 입력</div>
          <span class="pv-save-chip" id="pv-save-chip">저장 완료</span>
          <button class="pv-ai-pill" id="pv-ai-import-btn" title="AI로 엑셀 가져오기">
            <i class="ph-duotone ph-upload-simple" aria-hidden="true"></i>
            AI로 가져오기
          </button>
          <button id="pv-edit-toggle" class="pv-edit-toggle" aria-label="편집 모드 토글" aria-pressed="false" title="전체 행 편집 모드" style="margin-left:6px;padding:8px 12px;border:none;border-radius:14px;background:linear-gradient(135deg, hsl(350, 75%, 72%), hsl(350, 70%, 60%));color:#fff;font-weight:800;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:4px;white-space:nowrap;box-shadow:0 2px 6px rgba(241,128,145,0.28);transition:all 0.15s;"><i class="ph-duotone ph-pencil-simple" aria-hidden="true"></i> 편집</button>
        </div>
        <div class="pv-chip-bar">${chipHtml}</div>
        <div class="pv-body" id="pv-body"></div>
      </div>
    `;
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', _escListener);

    // 프리페치 — 동시 6개 호출 시 Railway 큐잉으로 느림 → 2개 동시만 유지 (idle 스로틀)
    (async () => {
      const others = TABS.filter(t => t.key !== _state.currentTab);
      const CONCURRENCY = 2;
      for (let i = 0; i < others.length; i += CONCURRENCY) {
        const batch = others.slice(i, i + CONCURRENCY);
        await Promise.all(batch.map(t => {
          if (_state.data[t.key] && _state.data[t.key].length) return null;
          return _fetchTab(t.key).then(r => {
            _state.data[t.key] = r;
            // 탭 숫자 뱃지 갱신
            const badge = document.querySelector(`[data-pv-tab-badge="${t.key}"]`);
            if (badge) {
              const n = (r || []).length;
              badge.textContent = n > 99 ? '99+' : n;
              badge.style.display = n > 0 ? '' : 'none';
            }
          }).catch(() => { /* ignore */ });
        }));
      }
    })();

    const pvRender = window._PVRender;
    if (pvRender) {
      pvRender.bindTabs();
      const editBtn = document.getElementById('pv-edit-toggle');
      if (editBtn) editBtn.addEventListener('click', () => _toggleEditMode());
      pvRender.renderTab();
    }
    if (typeof window._perfMark === 'function') window._perfMark('powerview:open:end');
  }

  function closePowerView() {
    const o = document.getElementById(OVERLAY_ID);
    if (!o) return;
    o.classList.add('closing');
    document.removeEventListener('keydown', _escListener);
    document.body.style.overflow = '';
    _state.editMode = false;
    setTimeout(() => { o.remove(); }, 200);
  }

  window.openPowerView = openPowerView;
  window.closePowerView = closePowerView;

  // [2026-04-26] 챗봇·외부 mutation → 현재 탭 캐시 비우고 시트 열려있으면 즉시 재로드
  if (typeof window !== 'undefined' && !window._powerViewDataListenerInit) {
    window._powerViewDataListenerInit = true;
    // mutation kind → 영향받는 탭 매핑
    const _kindToTabs = (kind) => {
      const k = String(kind || '');
      const tabs = [];
      if (/customer/.test(k)) tabs.push('customer');
      if (/booking/.test(k))  tabs.push('booking');
      if (/revenue/.test(k))  tabs.push('revenue');
      if (/inventor/.test(k)) tabs.push('inventory');
      if (/nps/.test(k))      tabs.push('nps');
      if (/service/.test(k))  tabs.push('service');
      if (!tabs.length) return ['customer', 'booking', 'revenue', 'inventory', 'nps', 'service'];
      return tabs;
    };
    window.addEventListener('itdasy:data-changed', async (e) => {
      const kind = e && e.detail && e.detail.kind;
      const affected = _kindToTabs(kind);
      // 모든 영향받는 탭의 SWR 캐시 클리어 (다음 진입 시 fresh)
      affected.forEach(t => {
        try { sessionStorage.removeItem(_cacheKey(t)); } catch (_e) { void _e; }
      });
      // 시트 열려있고 현재 탭이 영향받으면 즉시 재로드
      const overlay = document.getElementById(OVERLAY_ID);
      if (!overlay) return;
      if (!affected.includes(_state.currentTab)) return;
      try {
        _state.data[_state.currentTab] = await _fetchTab(_state.currentTab, false);
        if (window._PVRender && window._PVRender.renderTab) {
          window._PVRender.renderTab(true);
        }
      } catch (_e) { void _e; }
    });
  }

  // T-383 에서 실구현 예정. 현재는 기존 월간리포트로 연결.
  window.openRevenueReport = function() {
    if (typeof window.openReport === 'function') window.openReport();
  };

  // ── 전역 이벤트 위임 ─────────────────────────────────
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-pv-open]');
    if (!btn) return;
    e.preventDefault(); e.stopPropagation();
    const tab = btn.getAttribute('data-pv-open');
    if (window.hapticLight) window.hapticLight();
    openPowerView(tab);
  }, true);

  document.addEventListener('click', (e) => {
    if (e.target && e.target.id === OVERLAY_ID) closePowerView();
  }, false);
})();
