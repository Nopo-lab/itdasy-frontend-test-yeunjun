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
  let pending = { customer: [], booking: [], revenue: [], inventory: [], nps: [], service: [] };

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

  // 햄버거 메뉴 항목 (파워뷰 탭이 아닌 별도 모듈 진입)
  const MENU_ITEMS = [
    { icon: '📅', label: '예약 캘린더',  hint: '월/주/일 + 드래그',    fn: 'openCalendarView' },
    { icon: '🤖', label: 'AI 비서',      hint: '말 한 줄로 실행',      fn: 'openAssistant' },
    { icon: '🎤', label: '음성 기록',    hint: '말하면 자동 저장',     fn: 'openVoice' },
    { icon: '🎀', label: '스토리 만들기', hint: 'AI 1080×1920',        fn: 'openStory' },
    { icon: '🎬', label: '영상 만들기',  hint: '비포/애프터 릴스',     fn: 'openVideo' },
    { icon: '⭐', label: '네이버 리뷰',  hint: '수동 기록·분석',       fn: 'openNaverReviews' },
    { icon: '📥', label: '이전 도우미',  hint: '엑셀·사진·카톡',       fn: 'openMigration' },
    { icon: '📑', label: '월간 리포트',  hint: '한 달 요약',           fn: 'openReport' },
    { icon: '🔔', label: '알림',         hint: '오늘 브리핑·위험',     fn: 'openNotifications' },
    { icon: '⚙️', label: '설정',         hint: '샵·인스타·사업자',     fn: 'openSettings' },
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

      /* §5.4 Chip 탭 */
      .pv-chip-bar{display:flex;padding:8px 12px;gap:6px;overflow-x:auto;scrollbar-width:none;border-bottom:1px solid var(--border,#eee);background:var(--surface,#fff);flex-shrink:0;}
      .pv-chip-bar::-webkit-scrollbar{display:none;}
      .pv-chip{padding:6px 14px;border:1.5px solid var(--border-strong,#d0d0d0);border-radius:100px;background:transparent;font-size:12.5px;font-weight:700;color:var(--text-subtle,#888);cursor:pointer;white-space:nowrap;transition:all 0.15s;font-family:Pretendard,sans-serif;}
      .pv-chip.active{background:var(--brand,#F18091);border-color:var(--brand,#F18091);color:#fff;}
      .pv-chip:hover:not(.active){border-color:var(--brand,#F18091);color:var(--brand,#F18091);}
      /* AI 가져오기 pill */
      .pv-ai-pill{display:inline-flex;align-items:center;gap:5px;padding:6px 12px;background:var(--brand,#F18091);color:#fff;border:none;border-radius:100px;font-size:12px;font-weight:700;cursor:pointer;font-family:Pretendard,sans-serif;transition:opacity 0.15s;flex-shrink:0;}
      .pv-ai-pill:hover{opacity:0.88;}
      /* 저장상태 칩 */
      .pv-save-chip{padding:4px 10px;border-radius:100px;font-size:11px;font-weight:700;background:var(--surface-raised,#f2f2f2);color:var(--text-subtle,#888);display:none;}
      .pv-save-chip.saved{background:#E8F5E9;color:#2E7D32;display:inline-block;}
      /* 셀 선택/편집 */
      .pv-table tbody td{border-right:1px solid var(--border,#f2f2f2);}
      .pv-table tbody td:last-child{border-right:none;}
      .pv-cell-sel{border:1.5px solid var(--brand,#F18091) !important;background:rgba(241,128,145,0.08) !important;}
      /* §5.8 Bottom sheet */
      @keyframes pvSheetUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
      .pv-sheet{position:fixed;inset:0;z-index:10002;background:rgba(20,8,16,0.55);backdrop-filter:blur(6px);display:flex;align-items:flex-end;animation:pvFadeIn 0.2s ease;}
      .pv-sheet-inner{width:100%;max-height:80vh;background:var(--surface,#fff);border-radius:24px 24px 0 0;overflow:hidden;display:flex;flex-direction:column;animation:pvSheetUp 0.3s cubic-bezier(0.22,1,0.36,1);padding-bottom:env(safe-area-inset-bottom,0px);}
      /* Dark mode 대응 */
      [data-theme="dark"] .pv-dialog{background:var(--surface,#1c1c1e);color:var(--text,#f5f5f7);}
      [data-theme="dark"] .pv-header,[data-theme="dark"] .pv-chip-bar,[data-theme="dark"] .pv-sheet-inner{background:var(--surface,#1c1c1e);}
      [data-theme="dark"] .pv-table tbody tr:hover{background:var(--surface-raised,#2c2c2e);}
      /* 모바일 */
      @media (max-width:720px){
        #power-view-overlay{padding:8px !important;}
        .pv-dialog{border-radius:20px;max-height:96vh;}
        .pv-header{padding:12px 14px;}
        .pv-title{font-size:15px;}
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
        `<span style="color:#666;font-variant-numeric:tabular-nums;">${(r.starts_at || '').replace('T', ' ').slice(0, 16)}</span>`,
        `<span style="padding:3px 9px;border-radius:100px;background:#E8F4F1;color:#2B8C7E;font-size:11px;font-weight:700;">${_esc(r.status || 'confirmed')}</span>`,
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
        `<span style="padding:3px 9px;border-radius:100px;background:#FEF4F5;color:#D95F70;font-size:11px;font-weight:700;">${_esc(r.method || '—')}</span>`,
        `<span style="color:#2B8C7E;font-weight:700;">${r.net_amount != null ? _krw(r.net_amount) : _krw(r.amount)}</span>`,
      ],
      search: (r, kw) => ((r.customer_name || '') + ' ' + (r.service_name || '') + ' ' + (r.method || '')).toLowerCase().includes(kw),
      empty: { icon: '💰', title: '매출 기록이 없어요', desc: '카드는 3.4% 수수료가 자동 차감돼서 실 수령액이 바로 보여요.' },
      qadd: {
        fields: [
          { name: 'customer_name', placeholder: '고객', flex: 1, auto: 'customer_name' },
          { name: 'service_name',  placeholder: '시술', flex: 1, auto: 'service_name' },
          { name: 'amount',        placeholder: '금액', flex: 0.9, type: 'number', required: true },
          { name: 'method',        placeholder: 'card/cash/transfer', flex: 1.1, default: 'card', auto: 'method' },
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
          { name: 'name',      placeholder: '품목 이름',   flex: 1.8, required: true, auto: 'item_name' },
          { name: 'quantity',  placeholder: '수량',        flex: 0.6, type: 'number' },
          { name: 'threshold', placeholder: '임계',        flex: 0.6, type: 'number', default: 3 },
          { name: 'category',  placeholder: 'nail|hair|lash|skin|etc', flex: 1.2, auto: 'inv_category' },
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
          { name: 'name',              placeholder: '시술명',       flex: 1.3, required: true, auto: 'service_name' },
          { name: 'default_price',     placeholder: '기본 금액',    flex: 0.8, type: 'number' },
          { name: 'default_duration_min', placeholder: '소요(분)', flex: 0.6, type: 'number', default: 60 },
          { name: 'category',          placeholder: 'hair|nail|eye|skin|etc', flex: 1.2, auto: 'svc_category' },
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

  // ── 쌓아둔 행 사람-친화 포맷 ────────────────────────────
  function _formatPendingRow(p) {
    if (!p) return '';
    const esc = _esc;
    switch (currentTab) {
      case 'customer':
        return `<strong>${esc(p.name || '')}</strong>` +
          (p.phone ? ` · <span style="color:#666;">${esc(p.phone)}</span>` : '') +
          (p.memo ? ` · <span style="color:#888;">${esc(String(p.memo).slice(0, 30))}</span>` : '');
      case 'booking': {
        const t = (p.starts_at || '').replace('T', ' ').slice(0, 16);
        return `<strong>${esc(p.customer_name || '고객 없음')}</strong>` +
          (p.service_name ? ` · ${esc(p.service_name)}` : '') +
          (t ? ` · <span style="color:#666;">${esc(t)}</span>` : '');
      }
      case 'revenue':
        return `<strong>${_krw(p.amount)}</strong>` +
          (p.method ? ` · <span style="padding:1px 7px;border-radius:100px;background:#FEF4F5;color:#D95F70;font-size:10.5px;font-weight:700;">${esc(p.method)}</span>` : '') +
          (p.service_name ? ` · ${esc(p.service_name)}` : '') +
          (p.customer_name ? ` · <span style="color:#888;">${esc(p.customer_name)}</span>` : '');
      case 'inventory':
        return `<strong>${esc(p.name)}</strong> · <span style="color:#666;">${p.quantity}${esc(p.unit || '개')}</span>` +
          (p.category ? ` · <span style="color:#888;font-size:11px;">${esc(p.category)}</span>` : '');
      case 'nps':
        return `<strong style="color:#E6A100;">★${p.rating}</strong>` +
          (p.comment ? ` · <span style="color:#666;">${esc(String(p.comment).slice(0, 40))}</span>` : '');
      case 'service':
        return `<strong>${esc(p.name)}</strong>` +
          (p.default_price ? ` · ${_krw(p.default_price)}` : '') +
          (p.default_duration_min ? ` · ${p.default_duration_min}분` : '') +
          (p.category ? ` · <span style="color:#888;font-size:11px;">${esc(p.category)}</span>` : '');
      default:
        return esc(JSON.stringify(p).slice(0, 80));
    }
  }

  // ── 자동완성 소스 ─────────────────────────────────────
  function _buildAutoSources() {
    const out = { customer_name: [], service_name: [], method: ['card','cash','transfer','etc'],
                  item_name: [], inv_category: ['nail','hair','lash','skin','etc'],
                  svc_category: ['hair','nail','eye','skin','wax','etc'] };
    const seen = { customer_name: new Set(), service_name: new Set(), item_name: new Set() };
    (data.customer || []).forEach(c => {
      if (c.name && !seen.customer_name.has(c.name)) { seen.customer_name.add(c.name); out.customer_name.push(c.name); }
    });
    (data.revenue || []).forEach(r => {
      if (r.customer_name && !seen.customer_name.has(r.customer_name)) { seen.customer_name.add(r.customer_name); out.customer_name.push(r.customer_name); }
      if (r.service_name && !seen.service_name.has(r.service_name)) { seen.service_name.add(r.service_name); out.service_name.push(r.service_name); }
    });
    (data.booking || []).forEach(b => {
      if (b.customer_name && !seen.customer_name.has(b.customer_name)) { seen.customer_name.add(b.customer_name); out.customer_name.push(b.customer_name); }
      if (b.service_name && !seen.service_name.has(b.service_name)) { seen.service_name.add(b.service_name); out.service_name.push(b.service_name); }
    });
    (data.service || []).forEach(s => {
      if (s.name && !seen.service_name.has(s.name)) { seen.service_name.add(s.name); out.service_name.push(s.name); }
    });
    (data.inventory || []).forEach(i => {
      if (i.name && !seen.item_name.has(i.name)) { seen.item_name.add(i.name); out.item_name.push(i.name); }
    });
    // 상한
    Object.keys(out).forEach(k => { if (out[k].length > 100) out[k] = out[k].slice(0, 100); });
    return out;
  }

  function _openMenuDrawer() {
    const o = document.createElement('div');
    o.id = 'pv-menu-drawer';
    o.className = 'pv-sheet';
    o.innerHTML = `
      <div class="pv-sheet-inner">
        <div style="display:flex;align-items:center;padding:16px 20px;border-bottom:1px solid var(--border,#eee);">
          <div style="font-size:15px;font-weight:900;flex:1;color:var(--text,#222);">메뉴</div>
          <button id="pv-menu-close" style="width:32px;height:32px;border:none;border-radius:10px;background:var(--surface-raised,#eee);cursor:pointer;font-size:14px;color:var(--text,#555);">✕</button>
        </div>
        <div class="list-menu" style="flex:1;overflow:auto;">
          ${MENU_ITEMS.map(e => `
            <button class="list-menu__item" data-pv-menu-fn="${e.fn}">
              <div class="list-menu__icon-box" style="font-size:20px;background:var(--brand-bg,#FEF4F5);">${e.icon}</div>
              <div class="list-menu__body">
                <div class="list-menu__title">${e.label}</div>
                <div class="list-menu__sub">${e.hint}</div>
              </div>
              <div class="list-menu__right"><svg class="ic" aria-hidden="true"><use href="#ic-chevron-right"/></svg></div>
            </button>
          `).join('')}
        </div>
        <div style="padding:12px 20px;border-top:1px solid var(--border,#eee);font-size:11px;color:var(--text-subtle,#aaa);text-align:center;">잇데이 · 와이투두(Y2do)</div>
      </div>
    `;
    document.body.appendChild(o);
    const close = () => o.remove();
    o.addEventListener('click', (e) => { if (e.target === o) close(); });
    o.querySelector('#pv-menu-close').addEventListener('click', close);
    o.querySelectorAll('[data-pv-menu-fn]').forEach(b => {
      b.addEventListener('click', () => {
        const fn = b.getAttribute('data-pv-menu-fn');
        close();
        if (typeof window[fn] === 'function') {
          if (window.hapticLight) window.hapticLight();
          closePowerView();
          setTimeout(() => window[fn](), 140);
        }
      });
    });
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

    // 자동완성 소스 계산
    const autoSource = _buildAutoSources();
    const fieldsHtml = qadd.fields.map(f => {
      const listId = f.auto ? `pv-dl-${f.auto}` : '';
      return `
      <input class="pv-input"
        data-field="${f.name}"
        type="${f.type || 'text'}"
        placeholder="${_esc(f.placeholder)}"
        ${f.default !== undefined ? `value="${f.default}"` : ''}
        ${listId ? `list="${listId}"` : ''}
        style="flex:${f.flex};"
      />`;
    }).join('');
    const datalistHtml = Object.entries(autoSource).map(([key, items]) => `
      <datalist id="pv-dl-${key}">${items.map(v => `<option value="${_esc(v)}"></option>`).join('')}</datalist>
    `).join('');

    const headers = schema.headers.map(h => `<th>${_esc(h)}</th>`).join('') + `<th style="width:56px;"></th>`;
    const rowsHtml = list.map(r => {
      const cells = schema.row(r).map(c => `<td>${c}</td>`).join('');
      return `<tr data-id="${r.id}">${cells}<td style="text-align:right;"><button class="pv-row-edit" data-edit-id="${r.id}" title="수정" style="border:none;background:transparent;cursor:pointer;font-size:13px;color:#888;padding:4px 8px;border-radius:6px;transition:all 0.12s;">✎</button></td></tr>`;
    }).join('');

    // 배치 pending 행 영역
    const pendingList = pending[currentTab] || [];
    const pendingHtml = pendingList.length ? `
      <div style="padding:12px 16px;background:#FFFBEB;border-bottom:1px solid #FFE58F;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <div style="font-size:12px;font-weight:800;color:#B45309;">⏳ 쌓아둔 행 ${pendingList.length}개</div>
          <div style="display:flex;gap:6px;">
            <button id="pv-batch-clear" style="padding:6px 10px;font-size:11px;border:1px solid #EAB308;background:#fff;color:#B45309;border-radius:7px;cursor:pointer;font-weight:700;">비우기</button>
            <button id="pv-batch-save" style="padding:6px 12px;font-size:11.5px;border:none;background:linear-gradient(135deg,#F18091,#D95F70);color:#fff;border-radius:7px;cursor:pointer;font-weight:800;box-shadow:0 2px 6px rgba(241,128,145,0.3);">⚡ ${pendingList.length}개 한 번에 저장</button>
          </div>
        </div>
        <div style="font-size:12px;color:#333;line-height:1.65;max-height:120px;overflow:auto;display:flex;flex-direction:column;gap:4px;">
          ${pendingList.map((p, i) => `
            <div style="display:flex;gap:8px;padding:5px 8px;background:#fff;border:1px solid #FDE68A;border-radius:8px;align-items:center;">
              <span style="color:#B45309;font-weight:800;min-width:18px;">${i+1}.</span>
              <span style="flex:1;min-width:0;">${_formatPendingRow(p)}</span>
              <button data-pv-pend-del="${i}" title="제거" style="border:none;background:transparent;color:#C62828;cursor:pointer;font-size:13px;padding:2px 6px;border-radius:4px;">✕</button>
            </div>
          `).join('')}
        </div>
      </div>` : '';

    const emptyHtml = !rowsHtml ? `
      <tr><td colspan="${schema.headers.length}">
        <div class="pv-empty">
          <div class="pv-empty-icon">${schema.empty.icon}</div>
          <div style="font-weight:800;color:#555;margin-bottom:6px;">${searchKW ? '검색 결과가 없어요' : schema.empty.title}</div>
          <div style="font-size:12px;color:#aaa;">${searchKW ? `"${_esc(searchKW)}" 에 해당하는 ${schema.empty.title.replace(' 없어요','').replace('아직 ','')} 없음` : schema.empty.desc}</div>
        </div>
      </td></tr>` : '';

    body.innerHTML = `
      ${datalistHtml}
      <div class="pv-qadd" data-voice-root>
        ${fieldsHtml}
        <button class="pv-btn-stack" id="pv-stack-btn" title="목록에 쌓아두고 나중에 일괄 저장" style="padding:11px 12px;background:#fff;border:1.5px solid #F18091;color:#D95F70;border-radius:10px;font-weight:800;font-size:12.5px;cursor:pointer;white-space:nowrap;flex-shrink:0;transition:all 0.15s;">⊕ 쌓기</button>
        <button class="pv-btn-add" id="pv-add-btn">즉시 추가 <span class="pv-kbd">↵</span></button>
      </div>
      ${pendingHtml}
      <div class="pv-toolbar">
        <div style="position:relative;flex:1;max-width:280px;">
          <svg class="ic" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);pointer-events:none;color:#999;" aria-hidden="true"><use href="#ic-search"/></svg>
          <input class="pv-search" id="pv-search" data-no-voice placeholder="검색 (⌘K)" value="${_esc(searchKW)}" style="padding-left:32px;padding-right:${searchKW ? '32px' : '12px'};" />
          ${searchKW ? `<button id="pv-search-clear" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);border:none;background:transparent;cursor:pointer;padding:2px;color:#aaa;" aria-label="검색 지우기"><svg class="ic" aria-hidden="true"><use href="#ic-x"/></svg></button>` : ''}
        </div>
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
        <div class="pv-hotkeys">단축: <kbd>Enter</kbd> 즉시 · <kbd>Shift+Enter</kbd> 쌓기 · <kbd>⌘K</kbd> 검색 · <kbd>Esc</kbd> 닫기</div>
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

  // ── 배치 쌓기 ───────────────────────────────────────────
  function _collectQaddValues() {
    const schema = SCHEMAS[currentTab];
    const inputs = document.querySelectorAll('#power-view-overlay .pv-qadd input[data-field]');
    const v = {}; let missing = null;
    inputs.forEach(i => { v[i.getAttribute('data-field')] = i.value; });
    schema.qadd.fields.forEach(f => { if (f.required && !v[f.name]?.trim()) missing = f.name; });
    return { values: v, missing, schema, inputs };
  }

  function _resetInputs(inputs, schema) {
    inputs.forEach(i => {
      const f = schema.qadd.fields.find(x => x.name === i.getAttribute('data-field'));
      i.value = (f && f.default !== undefined) ? f.default : '';
    });
    const first = inputs[0];
    if (first) first.focus();
  }

  function _stackRow() {
    const { values, missing, schema, inputs } = _collectQaddValues();
    if (missing) {
      if (window.showToast) window.showToast(`⚠️ 필수: ${missing}`);
      const el = document.querySelector(`#power-view-overlay .pv-qadd input[data-field="${missing}"]`);
      if (el) el.focus();
      return;
    }
    let body;
    try { body = schema.qadd.build(values); } catch (e) {
      if (window.showToast) window.showToast('형식 오류: ' + e.message); return;
    }
    pending[currentTab].push(body);
    if (window.hapticLight) window.hapticLight();
    _resetInputs(inputs, schema);
    _renderTab(true);
  }

  async function _flushBatch() {
    const schema = SCHEMAS[currentTab];
    const items = pending[currentTab] || [];
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
      } catch (e) { fail++; }
    }));
    pending[currentTab] = [];
    if (window.hapticSuccess) window.hapticSuccess();
    if (window.showToast) window.showToast(`✅ ${ok}건 저장${fail ? ` · 실패 ${fail}` : ''}`);
    data[currentTab] = await _fetchTab(currentTab);
    await _renderTab(true);
    if (window.Dashboard?.refresh) window.Dashboard.refresh(true);
  }

  // ── 행 인라인 수정 (간이 prompt 기반 — 향후 고도화 예정) ──
  async function _editRow(rowId) {
    const row = (data[currentTab] || []).find(r => r.id == rowId);
    if (!row) return;
    const schema = SCHEMAS[currentTab];
    // 편집 가능 필드: qadd.fields 의 name 들 + 기본 추가 필드
    const editableFields = {
      customer: [['name','이름'],['phone','전화'],['memo','메모']],
      booking: [['customer_name','고객'],['service_name','시술'],['starts_at','시작(YYYY-MM-DD HH:MM)'],['memo','메모'],['status','상태(confirmed|completed|cancelled)']],
      revenue: [['customer_name','고객'],['service_name','시술'],['amount','금액'],['method','결제(card|cash|transfer)'],['memo','메모']],
      inventory: [['name','품목'],['quantity','수량'],['threshold','임계'],['category','분류']],
      nps: [['rating','평점'],['comment','코멘트']],
      service: [['name','시술명'],['default_price','기본 금액'],['default_duration_min','소요(분)'],['category','분류']],
    }[currentTab] || [];
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
    // 타입 변환
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
      // booking 은 ends_at 도 맞춰야. 기존 기간 유지
      if (currentTab === 'booking' && row.starts_at && row.ends_at) {
        const dur = new Date(row.ends_at) - new Date(row.starts_at);
        patch.ends_at = new Date(start.getTime() + dur).toISOString();
      }
    }
    try {
      const res = await fetch(API() + paths[currentTab], {
        method: 'PATCH',
        headers: { ...AUTH(), 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(await res.text());
      if (window.hapticSuccess) window.hapticSuccess();
      if (window.showToast) window.showToast('✅ 수정됨');
      data[currentTab] = await _fetchTab(currentTab);
      await _renderTab(true);
    } catch (e) { if (window.showToast) window.showToast('실패: ' + e.message); }
  }

  // ── 이벤트 바인딩 ───────────────────────────────────────
  function _bindBody() {
    const addBtn = document.getElementById('pv-add-btn');
    if (addBtn) addBtn.addEventListener('click', _submitQuickAdd);
    const stackBtn = document.getElementById('pv-stack-btn');
    if (stackBtn) stackBtn.addEventListener('click', _stackRow);
    const batchSave = document.getElementById('pv-batch-save');
    if (batchSave) batchSave.addEventListener('click', _flushBatch);
    const batchClear = document.getElementById('pv-batch-clear');
    if (batchClear) batchClear.addEventListener('click', () => { pending[currentTab] = []; _renderTab(true); });
    // 개별 쌓은 행 삭제
    document.querySelectorAll('[data-pv-pend-del]').forEach(b => {
      b.addEventListener('click', () => {
        const idx = parseInt(b.getAttribute('data-pv-pend-del'), 10);
        if (!isNaN(idx)) { pending[currentTab].splice(idx, 1); _renderTab(true); }
      });
    });
    document.querySelectorAll('.pv-row-edit').forEach(b => {
      b.addEventListener('click', (e) => { e.stopPropagation(); _editRow(b.getAttribute('data-edit-id')); });
    });
    document.querySelectorAll('#power-view-overlay .pv-qadd input').forEach(el => {
      el.addEventListener('keydown', (e) => {
        // 한글 IME 조합 중이면 무시 (마지막 글자 중복 진입 방지)
        if (e.isComposing || e.keyCode === 229) return;
        if (e.key === 'Enter') {
          e.preventDefault();
          if (e.shiftKey) _stackRow(); else _submitQuickAdd();
        }
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
    const clearBtn = document.getElementById('pv-search-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => { searchKW = ''; _renderTab(true); });
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
    // AI import pill in header
    const aiBtn = document.getElementById('pv-ai-import-btn');
    if (aiBtn) {
      aiBtn.addEventListener('click', () => {
        const fi = document.createElement('input');
        fi.type = 'file'; fi.accept = '.csv,.xlsx,.xls'; fi.style.display = 'none';
        fi.addEventListener('change', (e) => { const f = e.target.files[0]; if (f) _handleExcelFile(f); fi.remove(); });
        document.body.appendChild(fi); fi.click();
      });
    }
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

    const chipHtml = TABS.map(t => `
      <button class="pv-chip ${t.key === currentTab ? 'active' : ''}" data-pv-tab="${t.key}">${t.icon} ${t.label}</button>
    `).join('');

    overlay.innerHTML = `
      <div class="pv-dialog" style="align-self:center;">
        <div class="pv-header">
          <button class="pv-close" onclick="window.closePowerView()" aria-label="닫기" title="닫기" style="margin-right:4px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div class="pv-title" style="flex:1;">빠른 입력</div>
          <span class="pv-save-chip" id="pv-save-chip">저장 완료</span>
          <button class="pv-ai-pill" id="pv-ai-import-btn" title="AI로 엑셀 가져오기">
            <svg class="ic" width="14" height="14" aria-hidden="true"><use href="#ic-upload"/></svg>
            AI로 가져오기
          </button>
          <button id="pv-menu-btn" class="pv-close" aria-label="전체 메뉴" title="전체 메뉴" style="margin-left:6px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>
          </button>
        </div>
        <div class="pv-chip-bar">${chipHtml}</div>
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
    const menuBtn = document.getElementById('pv-menu-btn');
    if (menuBtn) menuBtn.addEventListener('click', _openMenuDrawer);
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

  // ── 홈 히어로 카드 렌더링 (P1) ────────────────────────
  function renderHomeHeroCard(brief) {
    if (!brief) return;

    const rev = document.getElementById('heroMonthRevenue');
    const mom = document.getElementById('heroMomPct');
    const bookings = document.getElementById('heroTodayBookings');
    const risk = document.getElementById('heroRiskCount');

    if (rev) {
      const amount = brief.this_month_total || 0;
      rev.textContent = amount > 0
        ? (amount >= 10000
          ? Math.round(amount / 10000) + '만원'
          : amount.toLocaleString('ko-KR') + '원')
        : '—';
    }
    if (mom) {
      const pct = brief.mom_delta_pct;
      mom.textContent = pct != null ? (pct >= 0 ? '+' + pct : String(pct)) + '%' : '—';
    }
    if (bookings) {
      const cnt = (brief.today_bookings || []).length;
      bookings.textContent = cnt + '건';
    }
    if (risk) {
      const cnt = (brief.at_risk || []).length;
      risk.textContent = cnt > 0 ? cnt + '명' : '없음';
    }

    // 내일 예약 §5.5 List Menu (today_bookings 데이터로 축약 표시)
    const schedEl = document.getElementById('homeTomorrowSched');
    const upcoming = brief.today_bookings || [];
    if (schedEl && upcoming.length > 0) {
      schedEl.style.display = '';
      schedEl.innerHTML = `
        <div class="sec-head" style="padding:0 2px;margin-bottom:10px;">
          <h2 class="home-sec-title">오늘 예약<span style="font-weight:500;font-size:12px;color:var(--text-subtle);margin-left:6px;">${upcoming.length}건</span></h2>
        </div>
        <div class="list-menu">
          ${upcoming.slice(0, 3).map(b => `
            <div class="list-menu__item">
              <div class="list-menu__icon-box list-menu__icon-box--neutral">
                <svg class="ic" aria-hidden="true"><use href="#ic-calendar"/></svg>
              </div>
              <div class="list-menu__body">
                <div class="list-menu__title">${_esc(b.customer_name || '예약')}</div>
                <div class="list-menu__sub">${_esc(b.service_name || '')}${b.time ? ' · ' + _esc(b.time) : ''}</div>
              </div>
              <div class="list-menu__right">
                <svg class="ic ic--xs" aria-hidden="true"><use href="#ic-chevron-right"/></svg>
              </div>
            </div>`).join('')}
        </div>`;
    } else if (schedEl) {
      schedEl.style.display = 'none';
    }
  }

  window.renderHomeHeroCard = renderHomeHeroCard;

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
