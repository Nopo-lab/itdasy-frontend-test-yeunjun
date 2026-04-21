/* ─────────────────────────────────────────────────────────────
   파워뷰(Power View) — 엑셀식 풀스크린 멀티탭 (Phase 6 C11 v2 · 2026-04-21)

   개선:
   - 모달 slide-up + fade 애니메이션
   - 탭 전환 crossfade + underline 애니메이션
   - 행 추가 시 highlight flash
   - 스켈레톤 로더
   - 인라인 검색
   - 입력 필드 focus glow
   - hover · active 트랜지션
   - ESC/Enter/Tab/⌘K 단축키
   - 모바일 safe-area

   전역:
     window.openPowerView(tabKey)
     window.closePowerView()
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const API = () => window.API || '';
  const AUTH = () => (window.authHeader ? window.authHeader() : {});
  const OVERLAY_ID = 'power-view-overlay';
  const STYLE_ID = 'power-view-styles';
  let currentTab = 'customer';
  let data = { customer: [], booking: [], revenue: [], inventory: [], nps: [], service: [] };
  let searchKW = '';

  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch])); }
  function _krw(n) { return (n || 0).toLocaleString('ko-KR') + '원'; }

  const TABS = [
    { key: 'customer',  icon: '👥', label: '고객',     hue: 350 },
    { key: 'booking',   icon: '📅', label: '예약',     hue: 260 },
    { key: 'revenue',   icon: '💰', label: '매출',     hue: 20  },
    { key: 'inventory', icon: '📦', label: '재고',     hue: 150 },
    { key: 'nps',       icon: '⭐', label: 'NPS',      hue: 45  },
    { key: 'service',   icon: '💅', label: '시술',     hue: 320 },
  ];

  // ── 스타일 주입 (한 번만) ──────────────────────────────
  function _injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
      @keyframes pvFadeIn{from{opacity:0}to{opacity:1}}
      @keyframes pvSlideUp{from{opacity:0;transform:translateY(30px) scale(0.98)}to{opacity:1;transform:translateY(0) scale(1)}}
      @keyframes pvFadeOut{from{opacity:1}to{opacity:0}}
      @keyframes pvSlideDown{from{opacity:1;transform:translateY(0) scale(1)}to{opacity:0;transform:translateY(20px) scale(0.98)}}
      @keyframes pvRowFlash{0%{background:#FEF4F5}50%{background:#FBEAED}100%{background:transparent}}
      @keyframes pvSkeleton{0%{background-position:-200px 0}100%{background-position:calc(200px + 100%) 0}}
      @keyframes pvTabSlide{from{opacity:0;transform:translateX(8px)}to{opacity:1;transform:translateX(0)}}
      @keyframes pvSpin{from{transform:rotate(0)}to{transform:rotate(360deg)}}

      #power-view-overlay{animation:pvFadeIn 0.25s cubic-bezier(0.2, 0.9, 0.3, 1)}
      #power-view-overlay.closing{animation:pvFadeOut 0.2s ease}
      #power-view-overlay .pv-dialog{animation:pvSlideUp 0.32s cubic-bezier(0.22, 1, 0.36, 1)}
      #power-view-overlay.closing .pv-dialog{animation:pvSlideDown 0.2s ease}

      .pv-dialog{background:#fff;border-radius:24px;overflow:hidden;display:flex;flex-direction:column;
        width:100%;max-width:1100px;max-height:92vh;
        box-shadow:0 24px 80px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.08);}

      .pv-header{display:flex;align-items:center;gap:10px;padding:16px 20px;border-bottom:1px solid rgba(0,0,0,0.06);
        background:linear-gradient(180deg,#fff 0%,#fafafa 100%);flex-shrink:0;}
      .pv-title{font-size:17px;font-weight:900;color:#1a1a1a;letter-spacing:-0.3px;flex:1;display:flex;align-items:center;gap:8px;}
      .pv-title-icon{font-size:20px;filter:drop-shadow(0 2px 4px rgba(241,128,145,0.3));}
      .pv-close{width:36px;height:36px;border:none;border-radius:12px;background:#f2f2f2;cursor:pointer;font-size:15px;color:#888;
        transition:all 0.18s ease;display:flex;align-items:center;justify-content:center;}
      .pv-close:hover{background:#eaeaea;color:#333;transform:rotate(90deg);}

      .pv-tabs{display:flex;padding:0 12px;background:#fff;border-bottom:1px solid rgba(0,0,0,0.06);
        overflow-x:auto;-webkit-overflow-scrolling:touch;flex-shrink:0;scrollbar-width:none;}
      .pv-tabs::-webkit-scrollbar{display:none;}
      .pv-tab{position:relative;padding:14px 18px;border:none;background:transparent;
        font-weight:700;font-size:13.5px;cursor:pointer;white-space:nowrap;
        color:#888;transition:all 0.2s cubic-bezier(0.4,0,0.2,1);display:flex;align-items:center;gap:6px;}
      .pv-tab:hover{color:#444;}
      .pv-tab.active{color:#D95F70;}
      .pv-tab .pv-tab-underline{position:absolute;bottom:0;left:12px;right:12px;height:3px;border-radius:3px 3px 0 0;
        background:linear-gradient(90deg,#F18091,#D95F70);transform:scaleX(0);transform-origin:center;
        transition:transform 0.3s cubic-bezier(0.4,0,0.2,1);}
      .pv-tab.active .pv-tab-underline{transform:scaleX(1);}
      .pv-tab-badge{font-size:10px;padding:2px 7px;border-radius:100px;background:rgba(0,0,0,0.06);color:#666;font-weight:800;min-width:22px;text-align:center;}
      .pv-tab.active .pv-tab-badge{background:linear-gradient(135deg,#F18091,#D95F70);color:#fff;}

      .pv-body{flex:1;display:flex;flex-direction:column;overflow:hidden;animation:pvTabSlide 0.3s ease;}

      .pv-qadd{display:flex;gap:8px;padding:14px 18px;
        background:linear-gradient(135deg,rgba(241,128,145,0.06),rgba(241,128,145,0.01));
        border-bottom:1px solid rgba(241,128,145,0.1);align-items:center;flex-wrap:nowrap;overflow-x:auto;}
      .pv-qadd::-webkit-scrollbar{display:none;}
      .pv-input{min-width:0;padding:11px 13px;border:1.5px solid #e5e5e5;border-radius:10px;
        font-size:13.5px;background:#fff;color:#222;
        transition:all 0.18s cubic-bezier(0.4,0,0.2,1);
        font-family:inherit;outline:none;}
      .pv-input::placeholder{color:#aaa;}
      .pv-input:focus{border-color:#F18091;box-shadow:0 0 0 3px rgba(241,128,145,0.15);background:#FFFBFC;}
      .pv-input:hover:not(:focus){border-color:#d0d0d0;}
      .pv-btn-add{padding:11px 18px;background:linear-gradient(135deg,#F18091,#D95F70);color:#fff;border:none;border-radius:10px;
        font-weight:800;font-size:13px;cursor:pointer;white-space:nowrap;flex-shrink:0;
        box-shadow:0 3px 10px rgba(241,128,145,0.3);letter-spacing:-0.3px;
        transition:all 0.15s cubic-bezier(0.4,0,0.2,1);display:flex;align-items:center;gap:5px;}
      .pv-btn-add:hover{transform:translateY(-1px);box-shadow:0 5px 14px rgba(241,128,145,0.4);}
      .pv-btn-add:active{transform:translateY(0);box-shadow:0 2px 6px rgba(241,128,145,0.25);}
      .pv-btn-add .pv-kbd{font-size:10px;padding:2px 5px;background:rgba(255,255,255,0.22);border-radius:4px;font-weight:700;}

      .pv-toolbar{display:flex;gap:10px;padding:10px 18px;background:#fafafa;border-bottom:1px solid #f0f0f0;align-items:center;flex-shrink:0;}
      .pv-search{flex:1;max-width:280px;padding:8px 12px 8px 32px;border:1px solid #e5e5e5;border-radius:9px;font-size:12.5px;
        background:#fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2.4' stroke-linecap='round'%3E%3Ccircle cx='11' cy='11' r='7'/%3E%3Cpath d='M21 21l-4.3-4.3'/%3E%3C/svg%3E") no-repeat 10px center;
        transition:all 0.15s;outline:none;}
      .pv-search:focus{border-color:#F18091;box-shadow:0 0 0 2px rgba(241,128,145,0.12);}
      .pv-excel{padding:7px 12px;background:#fff;border:1px solid #e5e5e5;border-radius:9px;cursor:pointer;
        font-size:12px;font-weight:700;color:#555;transition:all 0.15s;display:flex;align-items:center;gap:5px;}
      .pv-excel:hover{border-color:#4ECDC4;color:#2B8C7E;background:#F0FBF9;}

      .pv-list{flex:1;overflow:auto;background:#fff;-webkit-overflow-scrolling:touch;}
      .pv-table{width:100%;border-collapse:separate;border-spacing:0;}
      .pv-table thead th{padding:11px 14px;text-align:left;font-size:11.5px;color:#666;font-weight:800;
        border-bottom:2px solid #eaeaea;background:#fafafa;position:sticky;top:0;z-index:1;
        letter-spacing:-0.2px;text-transform:uppercase;}
      .pv-table tbody td{padding:13px 14px;font-size:13px;color:#2a2a2a;border-bottom:1px solid #f2f2f2;
        line-height:1.4;transition:background 0.15s;}
      .pv-table tbody tr{transition:background 0.15s ease;}
      .pv-table tbody tr:hover{background:#fafafa;}
      .pv-table tbody tr.pv-row-new{animation:pvRowFlash 1.8s ease-out;}

      .pv-skeleton-row td{padding:16px 14px;border-bottom:1px solid #f2f2f2;}
      .pv-sk{display:block;height:14px;border-radius:4px;background:linear-gradient(90deg,#f0f0f0 0%,#f6f6f6 20%,#f0f0f0 40%);
        background-size:200px 100%;animation:pvSkeleton 1.4s infinite linear;}

      .pv-empty{padding:60px 20px;text-align:center;color:#bbb;font-size:13.5px;line-height:1.8;}
      .pv-empty-icon{font-size:48px;margin-bottom:12px;filter:grayscale(0.3);}

      .pv-footer{padding:10px 18px;border-top:1px solid #f0f0f0;background:#fafafa;font-size:11.5px;color:#888;
        display:flex;justify-content:space-between;align-items:center;flex-shrink:0;gap:10px;flex-wrap:wrap;}
      .pv-footer kbd{background:#fff;padding:2px 6px;border-radius:4px;border:1px solid #ddd;
        font-family:ui-monospace,monospace;font-size:10.5px;color:#555;font-weight:600;}
      .pv-count{font-weight:800;color:#333;}

      /* 엑셀 임포트 드롭존 */
      .pv-drop{display:none;position:absolute;inset:0;background:rgba(241,128,145,0.92);z-index:10;
        align-items:center;justify-content:center;border-radius:24px;}
      .pv-drop.active{display:flex;animation:pvFadeIn 0.2s ease;}
      .pv-drop-inner{color:#fff;text-align:center;font-size:18px;font-weight:800;padding:30px;
        border:3px dashed rgba(255,255,255,0.5);border-radius:20px;}

      /* 모바일 */
      @media (max-width:720px){
        #power-view-overlay{padding:8px !important;}
        .pv-dialog{border-radius:20px;max-height:96vh;}
        .pv-header{padding:12px 14px;}
        .pv-title{font-size:15px;}
        .pv-tab{padding:12px 12px;font-size:12.5px;}
        .pv-qadd{padding:12px 14px;}
        .pv-table thead th{padding:9px 12px;font-size:10.5px;}
        .pv-table tbody td{padding:10px 12px;font-size:12.5px;}
        .pv-footer{font-size:10.5px;padding:8px 14px;}
        .pv-footer .pv-hotkeys{display:none;}
      }
    `;
    document.head.appendChild(s);
  }

  // ── 탭 스키마 ──────────────────────────────────────────
  const SCHEMAS = {
    customer: {
      headers: ['이름', '전화', '메모', '방문'],
      row: (r) => [
        `<strong>${_esc(r.name)}</strong>`,
        r.phone || '—',
        (r.memo || '').slice(0, 30) || '—',
        `${r.visit_count || 0}회`,
      ],
      search: (r, kw) => (r.name + ' ' + (r.phone || '') + ' ' + (r.memo || '')).toLowerCase().includes(kw),
      empty: { icon: '👥', title: '아직 고객이 없어요', desc: '위 입력 행에 이름·전화만 적고 Enter 로 추가하세요.' },
      qadd: {
        fields: [
          { name: 'name',  placeholder: '이름', flex: 1.3, required: true },
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
        `<span style="color:#666;font-variant-numeric:tabular-nums;">${(r.starts_at || '').replace('T', ' ').slice(0, 16)}</span>`,
        `<span style="padding:3px 9px;border-radius:100px;background:#E8F4F1;color:#2B8C7E;font-size:11px;font-weight:700;">${_esc(r.status || 'confirmed')}</span>`,
      ],
      search: (r, kw) => ((r.customer_name || '') + ' ' + (r.service_name || '') + ' ' + (r.starts_at || '')).toLowerCase().includes(kw),
      empty: { icon: '📅', title: '예정된 예약이 없어요', desc: '시간 형식: 2026-04-22 14:00' },
      qadd: {
        fields: [
          { name: 'customer_name', placeholder: '고객', flex: 1 },
          { name: 'service_name',  placeholder: '시술', flex: 1 },
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
        `<span style="padding:3px 9px;border-radius:100px;background:#FEF4F5;color:#D95F70;font-size:11px;font-weight:700;">${_esc(r.method || '—')}</span>`,
        `<span style="color:#2B8C7E;font-weight:700;">${r.net_amount != null ? _krw(r.net_amount) : _krw(r.amount)}</span>`,
      ],
      search: (r, kw) => ((r.customer_name || '') + ' ' + (r.service_name || '') + ' ' + (r.method || '')).toLowerCase().includes(kw),
      empty: { icon: '💰', title: '매출 기록이 없어요', desc: '카드는 3.4% 수수료가 자동 차감돼서 실 수령액이 바로 보여요.' },
      qadd: {
        fields: [
          { name: 'customer_name', placeholder: '고객', flex: 1 },
          { name: 'service_name',  placeholder: '시술', flex: 1 },
          { name: 'amount',        placeholder: '금액', flex: 0.9, type: 'number', required: true },
          { name: 'method',        placeholder: 'card/cash/transfer', flex: 1.1, default: 'card' },
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
      search: (r, kw) => ((r.name || '') + ' ' + (r.category || '')).toLowerCase().includes(kw),
      empty: { icon: '📦', title: '재고가 비어있어요', desc: '임계보다 적어지면 자동 부족 경고 뜹니다.' },
      qadd: {
        fields: [
          { name: 'name',      placeholder: '품목 이름',   flex: 1.8, required: true },
          { name: 'quantity',  placeholder: '수량',        flex: 0.6, type: 'number' },
          { name: 'threshold', placeholder: '임계',        flex: 0.6, type: 'number', default: 3 },
          { name: 'category',  placeholder: 'nail|hair|lash|skin|etc', flex: 1.2 },
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
      search: (r, kw) => ((r.comment || '') + ' ' + (r.source || '') + ' ' + r.rating).toLowerCase().includes(kw),
      empty: { icon: '⭐', title: 'NPS 후기가 없어요', desc: '0~10점 만족도 질문의 답을 기록해요.' },
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
        `<span style="color:#666;">${r.default_duration_min || 0}분</span>`,
        `<span style="padding:3px 9px;border-radius:100px;background:#F3E8FF;color:#6B21A8;font-size:11px;font-weight:700;">${_esc(r.category || 'etc')}</span>`,
      ],
      search: (r, kw) => ((r.name || '') + ' ' + (r.category || '')).toLowerCase().includes(kw),
      empty: { icon: '💅', title: '시술 프리셋이 없어요', desc: '자주 하는 시술 등록해두면 원탭 기록 가능.' },
      qadd: {
        fields: [
          { name: 'name',              placeholder: '시술명',       flex: 1.3, required: true },
          { name: 'default_price',     placeholder: '기본 금액',    flex: 0.8, type: 'number' },
          { name: 'default_duration_min', placeholder: '소요(분)', flex: 0.6, type: 'number', default: 60 },
          { name: 'category',          placeholder: 'hair|nail|eye|skin|etc', flex: 1.2 },
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

  // ── API ────────────────────────────────────────────────
  async function _fetchTab(key) {
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
      return d.items || [];
    } catch (e) { console.warn('[power-view] fetch', key, e); return []; }
  }

  // ── 렌더링 ──────────────────────────────────────────────
  function _skeletonRows(cols, n = 6) {
    return Array.from({ length: n }).map(() => `
      <tr class="pv-skeleton-row">
        ${Array.from({ length: cols }).map((_,i) => `<td><span class="pv-sk" style="width:${[70,90,60,80,75][i%5]}%"></span></td>`).join('')}
      </tr>`).join('');
  }

  function _applySearch(list, schema) {
    if (!searchKW) return list;
    const kw = searchKW.toLowerCase();
    return list.filter(r => schema.search(r, kw));
  }

  async function _renderTab(skipFetch) {
    const body = document.getElementById('pv-body');
    if (!body) return;
    const schema = SCHEMAS[currentTab];

    // 즉시 스켈레톤 표시 (부드러운 로딩)
    if (!skipFetch) {
      body.innerHTML = `
        <div class="pv-qadd">${schema.qadd.fields.map(() => `<span class="pv-sk" style="height:42px;width:120px;border-radius:10px;"></span>`).join('')}</div>
        <div class="pv-list"><table class="pv-table"><thead><tr>${schema.headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
          <tbody>${_skeletonRows(schema.headers.length)}</tbody></table></div>
      `;
      data[currentTab] = await _fetchTab(currentTab);
    }

    const list = _applySearch(data[currentTab] || [], schema);
    const qadd = schema.qadd;
    const fieldsHtml = qadd.fields.map(f => `
      <input class="pv-input"
        data-field="${f.name}"
        type="${f.type || 'text'}"
        placeholder="${_esc(f.placeholder)}"
        ${f.default !== undefined ? `value="${f.default}"` : ''}
        style="flex:${f.flex};"
      />
    `).join('');

    const headers = schema.headers.map(h => `<th>${_esc(h)}</th>`).join('');
    const rowsHtml = list.map(r => {
      const cells = schema.row(r).map(c => `<td>${c}</td>`).join('');
      return `<tr data-id="${r.id}">${cells}</tr>`;
    }).join('');

    const emptyHtml = !rowsHtml ? `
      <tr><td colspan="${schema.headers.length}">
        <div class="pv-empty">
          <div class="pv-empty-icon">${schema.empty.icon}</div>
          <div style="font-weight:800;color:#555;margin-bottom:6px;">${searchKW ? '검색 결과가 없어요' : schema.empty.title}</div>
          <div style="font-size:12px;color:#aaa;">${searchKW ? `"${_esc(searchKW)}" 에 해당하는 ${schema.empty.title.replace(' 없어요','').replace('아직 ','')} 없음` : schema.empty.desc}</div>
        </div>
      </td></tr>` : '';

    body.innerHTML = `
      <div class="pv-qadd">
        ${fieldsHtml}
        <button class="pv-btn-add" id="pv-add-btn">추가 <span class="pv-kbd">↵</span></button>
      </div>
      <div class="pv-toolbar">
        <input class="pv-search" id="pv-search" placeholder="검색 (⌘K)" value="${_esc(searchKW)}" />
        <label class="pv-excel" for="pv-excel-file" title="엑셀/CSV AI 임포트">
          📥 엑셀 불러오기
          <input type="file" id="pv-excel-file" accept=".csv,.xlsx,.xls" style="display:none;" />
        </label>
      </div>
      <div class="pv-list">
        <table class="pv-table">
          <thead><tr>${headers}</tr></thead>
          <tbody id="pv-tbody">${rowsHtml}${emptyHtml}</tbody>
        </table>
      </div>
      <div class="pv-footer">
        <div><span class="pv-count">${list.length}</span><span style="color:#999"> / 총 ${(data[currentTab] || []).length}건</span></div>
        <div class="pv-hotkeys">단축: <kbd>Enter</kbd> 저장 · <kbd>Tab</kbd> 다음칸 · <kbd>⌘K</kbd> 검색 · <kbd>Esc</kbd> 닫기</div>
      </div>
    `;
    _bindBody();
    _focusFirstInput();
  }

  function _focusFirstInput() {
    requestAnimationFrame(() => {
      const first = document.querySelector('#power-view-overlay .pv-qadd input[data-field]');
      if (first) first.focus();
    });
  }

  // ── 추가 ────────────────────────────────────────────────
  async function _submitQuickAdd() {
    const schema = SCHEMAS[currentTab];
    const inputs = document.querySelectorAll('#power-view-overlay .pv-qadd input[data-field]');
    const v = {};
    let missing = null;
    inputs.forEach(i => { v[i.getAttribute('data-field')] = i.value; });
    schema.qadd.fields.forEach(f => { if (f.required && !v[f.name]?.trim()) missing = f.name; });
    if (missing) {
      if (window.showToast) window.showToast(`⚠️ 필수: ${missing}`);
      const el = document.querySelector(`#power-view-overlay .pv-qadd input[data-field="${missing}"]`);
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
      if (window.showToast) window.showToast('✅ 추가됨');
      // 입력 필드 초기화 + 첫 필드에 포커스
      inputs.forEach(i => {
        const f = schema.qadd.fields.find(x => x.name === i.getAttribute('data-field'));
        i.value = (f && f.default !== undefined) ? f.default : '';
      });
      // 데이터 재로드 + 새 행 highlight
      data[currentTab] = await _fetchTab(currentTab);
      await _renderTab(true);
      if (saved && saved.id) {
        const newRow = document.querySelector(`#pv-tbody tr[data-id="${saved.id}"]`);
        if (newRow) newRow.classList.add('pv-row-new');
      }
      if (window.Dashboard?.refresh) window.Dashboard.refresh(true);
    } catch (e) {
      if (window.showToast) window.showToast('실패: ' + e.message);
    } finally {
      if (btn) { btn.disabled = false; btn.style.opacity = ''; btn.innerHTML = '추가 <span class="pv-kbd">↵</span>'; }
    }
  }

  // ── 엑셀 AI 임포트 v2 — 위저드 모달 ───────────────────
  async function _handleExcelFile(file) {
    if (!file) return;
    const kindMap = { customer: 'customer', booking: 'booking', revenue: 'revenue' };
    const kind = kindMap[currentTab];
    if (!kind) {
      if (window.showToast) window.showToast('이 탭은 엑셀 임포트 미지원 (고객/예약/매출만 가능)');
      return;
    }
    if (window.ImportWizard && typeof window.ImportWizard.open === 'function') {
      window.ImportWizard.open({
        file, kind,
        onDone: async () => {
          data[currentTab] = await _fetchTab(currentTab);
          await _renderTab(true);
          if (window.Dashboard?.refresh) window.Dashboard.refresh(true);
        },
      });
    } else {
      if (window.showToast) window.showToast('임포트 위저드 스크립트 미로드');
    }
  }

  // ── 이벤트 바인딩 ───────────────────────────────────────
  function _bindBody() {
    const addBtn = document.getElementById('pv-add-btn');
    if (addBtn) addBtn.addEventListener('click', _submitQuickAdd);
    document.querySelectorAll('#power-view-overlay .pv-qadd input').forEach(el => {
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); _submitQuickAdd(); }
      });
    });
    const search = document.getElementById('pv-search');
    if (search) {
      let t;
      search.addEventListener('input', (e) => {
        clearTimeout(t);
        t = setTimeout(() => {
          searchKW = e.target.value.trim();
          _renderTab(true);
          setTimeout(() => {
            const s2 = document.getElementById('pv-search');
            if (s2) { s2.focus(); s2.setSelectionRange(s2.value.length, s2.value.length); }
          }, 0);
        }, 180);
      });
    }
    const fileInput = document.getElementById('pv-excel-file');
    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        const f = e.target.files && e.target.files[0];
        if (f) _handleExcelFile(f);
      });
    }
    // 탭별 badge 업데이트
    TABS.forEach(t => {
      const badge = document.querySelector(`[data-pv-tab-badge="${t.key}"]`);
      if (badge) {
        const n = (data[t.key] || []).length;
        badge.textContent = n > 99 ? '99+' : n;
        badge.style.display = n > 0 ? '' : 'none';
      }
    });
  }

  function _bindTabs() {
    document.querySelectorAll('[data-pv-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-pv-tab');
        if (key === currentTab) return;
        currentTab = key;
        searchKW = '';
        document.querySelectorAll('[data-pv-tab]').forEach(b => {
          b.classList.toggle('active', b.getAttribute('data-pv-tab') === key);
        });
        if (window.hapticLight) window.hapticLight();
        _renderTab();
      });
    });
  }

  function _escListener(e) {
    if (e.key === 'Escape') { closePowerView(); return; }
    // ⌘K / Ctrl+K → 검색
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      const s = document.getElementById('pv-search');
      if (s) { e.preventDefault(); s.focus(); s.select(); }
    }
  }

  // ── open / close ───────────────────────────────────────
  function openPowerView(tabKey) {
    _injectStyles();
    if (tabKey && SCHEMAS[tabKey]) currentTab = tabKey;
    searchKW = '';
    let overlay = document.getElementById(OVERLAY_ID);
    if (overlay) overlay.remove();

    overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.style.cssText = `
      position:fixed;inset:0;z-index:9999;background:rgba(20,8,16,0.62);
      backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);
      display:flex;align-items:flex-end;justify-content:center;padding:20px;
      padding-bottom:calc(20px + env(safe-area-inset-bottom,0px));
    `;

    const tabHtml = TABS.map(t => `
      <button class="pv-tab ${t.key === currentTab ? 'active' : ''}" data-pv-tab="${t.key}">
        <span>${t.icon}</span>
        <span>${t.label}</span>
        <span class="pv-tab-badge" data-pv-tab-badge="${t.key}" style="display:none;">0</span>
        <span class="pv-tab-underline"></span>
      </button>
    `).join('');

    overlay.innerHTML = `
      <div class="pv-dialog" style="align-self:center;">
        <div class="pv-header">
          <div class="pv-title">
            <span class="pv-title-icon">⛶</span>
            <span>파워뷰 — 빠른 입력</span>
          </div>
          <button class="pv-close" onclick="window.closePowerView()" aria-label="닫기">✕</button>
        </div>
        <div class="pv-tabs">${tabHtml}</div>
        <div class="pv-body" id="pv-body"></div>
      </div>
    `;
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', _escListener);

    // 모든 탭의 count 를 병렬 프리페치
    TABS.forEach(t => {
      if (t.key !== currentTab && (!data[t.key] || !data[t.key].length)) {
        _fetchTab(t.key).then(r => { data[t.key] = r; _bindBody(); }).catch(() => {});
      }
    });

    _bindTabs();
    _renderTab();
  }

  function closePowerView() {
    const o = document.getElementById(OVERLAY_ID);
    if (!o) return;
    o.classList.add('closing');
    document.removeEventListener('keydown', _escListener);
    document.body.style.overflow = '';
    setTimeout(() => { o.remove(); }, 200);
  }

  window.openPowerView = openPowerView;
  window.closePowerView = closePowerView;

  // 전역 이벤트 위임
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-pv-open]');
    if (!btn) return;
    e.preventDefault(); e.stopPropagation();
    const tab = btn.getAttribute('data-pv-open');
    if (window.hapticLight) window.hapticLight();
    openPowerView(tab);
  }, true);

  // 백드롭 클릭으로 닫기
  document.addEventListener('click', (e) => {
    if (e.target && e.target.id === OVERLAY_ID) closePowerView();
  }, false);
})();
