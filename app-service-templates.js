/* 시술 프리셋 관리 (Step 4 · 2026-05-16 리디자인)
 *
 * 한 번 설정하면 예약·매출·재고가 자동으로 움직이는 "허브" 화면.
 *
 * 전역:
 *   window.openServiceTemplates()  → 관리 시트 열기
 *   window.loadServiceTemplates()  → 캐시 갱신 + 반환 Promise<Array>
 *   window._serviceTemplatesCache  → 마지막 로드 결과
 *   window.ServiceTemplates        → { open, edit, del, editConsumptions }
 */
(function () {
  'use strict';

  const API = window.API || window.PROD_API || '';
  let _cache = [];
  /* INVENTORY_HIDDEN */ let _inventoryCache = []; // dead — 유지 (다른 함수가 참조해도 빈 배열로 안전)
  let _monthUsage = {};  // service_name → count

  // ── 토큰/네트워크 ───────────────────────────────────────
  function _token() { return (typeof window.getToken === 'function') ? window.getToken() : ''; }
  async function _req(method, path, body) {
    const opts = { method, headers: { 'Authorization': `Bearer ${_token()}` } };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(`${API}${path}`, opts);
    if (!res.ok) throw new Error(await res.text().catch(() => 'HTTP ' + res.status));
    return res.status === 204 ? null : res.json();
  }

  async function loadServiceTemplates() {
    try {
      const data = await _req('GET', '/services');
      _cache = (data && data.items) || [];
      window._serviceTemplatesCache = _cache;
      try { localStorage.setItem('itdasy_service_templates_cache', JSON.stringify(_cache)); }
      catch (e) { console.warn('[services] 캐시 저장 실패', e); }
      return _cache;
    } catch (e) { console.warn('[services] 로드 실패', e); return []; }
  }
  async function createTemplate(body) { return _req('POST', '/services', body); }
  async function updateTemplate(id, body) { return _req('PATCH', `/services/${id}`, body); }
  async function deleteTemplate(id) { await _req('DELETE', `/services/${id}`); return true; }

  /* INVENTORY_HIDDEN — /inventory fetch 차단. 호출은 그대로 빈 배열 반환. */

  // ── 이번달 사용량 (매출에서 service_name 카운트) ─────────
  /* [2026-10-03 BE-G3-Z · 기존 결함] 이번 달 매출 목록을 **끝까지** 받아 센다.
     GET /revenue 목록은 기본 2,000행에서 자르고 has_more 로 알린다(합계만 전체 기준 — 2026-08-04 계약).
     예전엔 매출 엔진(app-revenue.js, 지연 그룹 'revenue')이 아직 안 떠 있으면 첫 페이지만 받아 셌다 →
     한 달 2,000건 넘는 매장은 사용량을 적게 셌고, 달 초에만 한 시술은 '0건' 이었다(잘렸다는 표시도 없음).
     이제 직전 수정의 '끝까지 이어 받기' 헬퍼(Revenue.fetchAllPages = app-revenue _fetchAllRevenuePages)를
     쓰고, 엔진이 없으면 AppLoader.ensure('revenue') 로 띄운다(유휴 선로딩이 어차피 띄우는 그룹).
     · URL 은 이번 달을 명시한다(/revenue?period=month, 서버 KST). Revenue.list('month') 는 인자와 무관하게
       매출 화면 상태 범위를 따르고 매출 화면 _items 를 덮어써서 쓰지 않는다.
     · 엔진을 못 띄우면 첫 페이지 + has_more 로 '일부' 를 안다. 끝까지 못 받았으면 'N건 이상'(_monthUsageState='partial').
     · 실패하면 '0건' 이라고 하지 않는다 — '사용량 못 불러옴'(='failed'). 모르는 걸 0 으로 그리지 않는다. */
  let _monthUsageState = 'ok';   // 'ok' | 'partial' | 'failed'
  const _MONTH_USAGE_URL = '/revenue?period=month';
  async function _revenuePager() {
    const pager = () => (window.Revenue && typeof window.Revenue.fetchAllPages === 'function') ? window.Revenue.fetchAllPages : null;
    if (pager()) return pager();
    try {
      if (window.AppLoader && typeof window.AppLoader.ensure === 'function') await window.AppLoader.ensure('revenue');
    } catch (_e) { /* 못 띄우면 아래 첫 페이지 폴백 — 'partial' 로 정직하게 */ }
    return pager();
  }
  async function _loadMonthUsage() {
    const counts = {};
    let state = 'ok';
    try {
      const get = (u) => _req('GET', u);
      const pager = await _revenuePager();
      let items, truncated;
      if (pager) {
        const res = await pager(_MONTH_USAGE_URL, null, get);
        items = (res && res.items) || [];
        truncated = !!(res && res.truncated);
      } else {
        const d = await get(_MONTH_USAGE_URL);
        items = (d && d.items) || [];
        truncated = !!(d && d.has_more);
      }
      items.forEach(r => {
        if (r && r.service_name) counts[r.service_name] = (counts[r.service_name] || 0) + 1;
      });
      if (truncated) state = 'partial';
    } catch (e) {
      state = 'failed';
      console.warn('[services] 이번달 사용량 로드 실패', e);
    }
    _monthUsage = counts;
    _monthUsageState = state;
  }
  function _usageLabel(name) {
    if (_monthUsageState === 'failed') return '이번달 사용량 못 불러옴';
    const n = _monthUsage[name] || 0;
    return _monthUsageState === 'partial' ? `${n}건 이상 이번달` : `${n}건 이번달`;
  }

  // ── 유틸 ───────────────────────────────────────────────
  function _esc(s) { return window._esc(s); } /* [2026-06-11] 중복 제거 — app-core 정본 위임 */
  function _catLabel(c) { return ({hair:'헤어', nail:'네일', eye:'속눈썹', skin:'피부', wax:'왁싱', etc:'기타'})[c] || c || '기타'; }
  function _formatPrice(n) { const v = Number(n) || 0; return v.toLocaleString('ko-KR') + '원'; }
  const STARTERS = {
    nail: [{ name:'젤네일 기본', p:60000, d:90, r:21 }, { name:'손 케어', p:30000, d:45, r:28 }, { name:'패디 기본', p:70000, d:90, r:28 }],
    hair: [{ name:'디자인컷', p:35000, d:60, r:42 }, { name:'뿌리염색', p:70000, d:90, r:42 }, { name:'다운펌', p:50000, d:60, r:28 }],
    // [2026-09-14 P3 첫원장] 붙임머리 샵이 hair 로 뭉개져 '디자인컷·뿌리염색·다운펌' 이 떴다 — 붙임머리 주문 단위로.
    ext: [{ name:'붙임머리 100모', p:200000, d:120, r:28, c:'hair' }, { name:'22인치 붙임머리', p:250000, d:150, r:28, c:'hair' }, { name:'붙임머리 리터치', p:80000, d:90, r:28, c:'hair' }, { name:'붙임머리 제거', p:30000, d:40, r:0, c:'hair' }],
    eye: [{ name:'속눈썹펌', p:55000, d:60, r:35 }, { name:'속눈썹 연장', p:80000, d:90, r:21 }, { name:'리터치', p:45000, d:45, r:21 }],
    skin: [{ name:'피부 기본관리', p:70000, d:60, r:28 }, { name:'진정관리', p:80000, d:70, r:21 }, { name:'윤곽관리', p:90000, d:80, r:14 }],
    wax: [{ name:'브로우 정리', p:35000, d:40, r:28 }, { name:'왁싱 기본', p:60000, d:60, r:35 }, { name:'메이크업', p:100000, d:90, r:0 }],
  };

  function _starterCat(fallback) {
    try {
      const raw = localStorage.getItem('shop_type') || '';
      const norm = window.itdasyNormalizeShopType ? window.itdasyNormalizeShopType(raw) : null;
      const cat = (norm && norm.cat) || raw;
      if (/붙임머리|extension/.test(raw) || /붙임머리/.test((norm && norm.label) || '')) return 'ext';   // hair 판정보다 먼저
      if (/lash|eye|속눈썹/.test(cat)) return 'eye';
      if (/nail|네일/.test(cat)) return 'nail';
      if (/hair|헤어|미용/.test(cat)) return 'hair';
      if (/skin|피부/.test(cat)) return 'skin';
      if (/wax|brow|makeup|왁싱|브로우|메이크업/.test(cat)) return 'wax';
    } catch (_e) { void 0; }
    return fallback || 'nail';
  }

  // select 에 있는 값으로(ext 는 hair). [2026-09-14 P3] 새 시술 폼 분류 기본값이 늘 '기타' 였다 → 샵 업종을 따른다.
  function _catForSelect() { const c = _starterCat('etc'); return c === 'ext' ? 'hair' : c; }   // 업종을 모르면 '기타' 그대로
  function _starterList() { return STARTERS[_starterCat()] || STARTERS.nail; }
  function _renderStarterChips() {
    const list = _starterList();
    return '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;">'
      + list.map((s, i) => '<button type="button" data-svc-starter="' + i + '" style="padding:7px 10px;border:1px solid rgba(188,102,117,.18);border-radius:999px;background:#fff;color:#BC6675;font-size:11px;font-weight:700;cursor:pointer;">' + _esc(s.name) + '</button>').join('')
      + '</div>';
  }

  // ── 헤더 ───────────────────────────────────────────────
  function _renderHeader() {
    return `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;gap:12px;">
        <div style="min-width:0;">
          <!-- [2026-09-14 P3] 시트 헤더에 이미 '시술 메뉴' 가 있다. 본문 큰 제목이 스크롤되며 반투명 헤더 밑으로
               지나가 '시술 메뉴' 가 두 번 겹쳐 보였다 → 본문 제목은 빼고 설명만(헤더는 불투명으로, generic-sheet). -->
          <p style="font-size:13px;color:#8B95A1;margin:0;line-height:1.5;">시술 이름·가격·걸리는 시간을 적어두면 예약·매출 넣을 때 바로 골라 쓸 수 있어요</p>
        </div>
        <button type="button" class="svc-add-btn" style="padding:10px 18px;border-radius:999px;background:#BC6675;color:#fff;border:none;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;flex-shrink:0;">+ 새 시술 추가</button>
      </div>`;
  }

  // ── 카드 ───────────────────────────────────────────────
  function _renderCard(svc) {
    const price = Number(svc.default_price) || 0;
    /* PROFIT_HIDDEN
    const matCost = Number(svc.material_cost) || 0;
    const margin = price - matCost;
    const marginPct = price > 0 ? ((margin / price) * 100).toFixed(1) : '0';
    */
    /* INVENTORY_HIDDEN const consCount = Array.isArray(svc._consumptions) ? svc._consumptions.length : 0; */
    const dur = Number(svc.default_duration_min) || 0;
    const usage = _usageLabel(svc.name);
    return `
      <div class="svc-card" data-svc-id="${_esc(svc.id)}" style="background:#fff;border-radius:16px;padding:20px;margin-bottom:12px;box-shadow:0 2px 8px rgba(0,0,0,0.04),0 1px 2px rgba(0,0,0,0.06);">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
          <div style="min-width:0;flex:1;">
            <div style="font-size:17px;font-weight:700;color:#191F28;">${_esc(svc.name)}</div>
            <div style="font-size:13px;color:#8B95A1;margin-top:4px;">${dur}분 · ${_esc(_catLabel(svc.category))}</div>
          </div>
          <div style="font-size:20px;font-weight:700;color:#BC6675;white-space:nowrap;">${_formatPrice(price)}</div>
        </div>
        <!-- PROFIT_HIDDEN
        <div style="margin-top:12px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
          <span style="font-size:14px;font-weight:600;color:${"$"}{margin >= 0 ? '#0F6E56' : '#BC6675'};">마진 ${"$"}{_formatPrice(margin)} (${"$"}{marginPct}%)</span>
          <span style="font-size:12px;color:#8B95A1;">재료원가 ${"$"}{_formatPrice(matCost)}</span>
        </div>
        -->
        <div style="margin-top:14px;padding-top:14px;border-top:1px solid #E5E8EB;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <!-- INVENTORY_HIDDEN
          <span style="font-size:11px;padding:4px 10px;border-radius:999px;background:#F7F8FA;color:#4E5968;">${"$"}{consCount > 0 ? '소모재료 ' + consCount + '종' : '소모재료 미설정'}</span>
          -->
          ${svc.retouch_period_days ? `<span style="font-size:11px;padding:4px 10px;border-radius:999px;background:#F7EFF0;color:#BC6675;">리터치 ${_esc(svc.retouch_period_days)}일</span>` : ''}
          <span style="margin-left:auto;font-size:11px;color:#8B95A1;">${_esc(usage)}</span>
          <a data-svc-edit="${_esc(svc.id)}" style="font-size:12px;color:#BC6675;font-weight:600;cursor:pointer;text-decoration:none;">수정</a>
        </div>
      </div>`;
  }

  function _renderCards() {
    if (!_cache.length) {
      if (window.emptyState) return window.emptyState({ icon: 'ic-scissors', title: '아직 시술이 없어요', desc: '자주 하는 시술을 미리 등록하면 예약·매출 입력이 한 번에 끝나요.', ctaText: '첫 시술 추가' });
      return '<div style="padding:40px;text-align:center;color:#8B95A1;">등록된 시술 없음</div>';
    }
    return _cache.map(_renderCard).join('');
  }

  // ── 자동 연동 흐름 다이어그램 ───────────────────────────
  function _renderFlowDiagram() {
    const steps = ['시술 메뉴 적기', '예약 추가', '예약 완료', '매출 기록', '리터치 알림'];
    const item = (s, i) => `
      <div style="display:flex;flex-direction:column;align-items:center;gap:6px;">
        <div style="width:32px;height:32px;border-radius:50%;background:#F7EFF0;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#BC6675;">${i + 1}</div>
        <div style="font-size:11px;color:#4E5968;white-space:nowrap;">${_esc(s)}</div>
      </div>`;
    return `
      <div style="margin-top:24px;padding:20px;background:#fff;border-radius:16px;box-shadow:0 2px 8px rgba(0,0,0,0.04);">
        <div style="font-size:14px;font-weight:700;color:#191F28;margin-bottom:16px;">자동 연동 흐름</div>
        <div style="display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;">
          ${steps.map((s, i) => item(s, i) + (i < steps.length - 1 ? '<div style="color:#E5E8EB;font-size:16px;">→</div>' : '')).join('')}
        </div>
      </div>`;
  }

  // ── 메인 진입 ───────────────────────────────────────────
  async function openServiceTemplates() {
    if (!window.openSheet) return;
    await Promise.all([loadServiceTemplates(), _loadMonthUsage()]);
    const html = _renderHeader() +
      `<div id="svc-add-panel" style="display:none;margin-bottom:14px;">${_addFormHTML()}</div>` +
      `<div id="svc-list">${_renderCards()}</div>` +
      _renderFlowDiagram();
    window.openSheet({ title: '시술 메뉴', body: html });
    setTimeout(_bindMainHandlers, 50);
  }

  function _addFormHTML(prefill) {
    const p = prefill || {};
    return `
      <div style="padding:16px;background:#F7F8FA;border-radius:14px;">
        <div style="font-size:13px;font-weight:700;color:#191F28;margin-bottom:10px;">새 시술 정보</div>
        ${p.id ? '' : _renderStarterChips()}
        <!-- [2026-09-14 첫원장] 2fr 1fr 80px 는 input 최소폭 때문에 줄어들지 못해 411px 폰에서 금액칸이 잘리고
             '분' 칸이 화면 밖(x=536)으로 밀려 걸리는 시간을 아예 못 넣었다 → minmax(0,…) + min-width:0.
             값이 들어가면 placeholder 가 사라져 '60' 이 뭔지 모르므로 칸 이름을 위에 적는다. -->
        <div style="display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1.3fr) minmax(0,1fr);gap:6px;margin-bottom:3px;font-size:11px;font-weight:600;color:#6B7684;">
          <span>시술 이름</span><span>금액(원)</span><span>시간(분)</span>
        </div>
        <div style="display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1.3fr) minmax(0,1fr);gap:6px;margin-bottom:6px;">
          <input id="svc-name" placeholder="시술 이름" value="${_esc(p.name || '')}" style="min-width:0;width:100%;box-sizing:border-box;padding:10px;border:1px solid #ddd;border-radius:8px;background:#fff;">
          <input id="svc-price" type="number" inputmode="numeric" placeholder="기본 금액" value="${_esc(p.default_price || '')}" style="min-width:0;width:100%;box-sizing:border-box;padding:10px;border:1px solid #ddd;border-radius:8px;background:#fff;">
          <input id="svc-dur" type="number" inputmode="numeric" placeholder="분" value="${_esc(p.default_duration_min || 60)}" style="min-width:0;width:100%;box-sizing:border-box;padding:10px;border:1px solid #ddd;border-radius:8px;background:#fff;">
        </div>
        <div style="font-size:11px;font-weight:600;color:#6B7684;margin:2px 0 3px;">재료비(원) · 선택</div>
        <input id="svc-material" type="number" inputmode="numeric" placeholder="재료비 (선택, 실마진 계산용)" value="${_esc(p.material_cost || '')}" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;margin-bottom:6px;background:#fff;">
        <div style="font-size:11px;font-weight:600;color:#6B7684;margin:2px 0 3px;">리터치 주기(일) · 선택</div>
        <input id="svc-retouch" type="number" inputmode="numeric" placeholder="리터치 주기 일수 (선택)" value="${_esc(p.retouch_period_days || '')}" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;margin-bottom:6px;background:#fff;">
        <div style="display:flex;gap:6px;align-items:center;">
          <select id="svc-cat" style="flex:1;padding:10px;border:1px solid #ddd;border-radius:8px;background:#fff;">
            ${['etc','hair','nail','eye','skin','wax'].map(c => `<option value="${c}" ${(p.category||(p.id ? 'etc' : _catForSelect()))===c?'selected':''}>${_catLabel(c)}</option>`).join('')}
          </select>
          <button id="svc-add" type="button" style="padding:10px 18px;background:#BC6675;color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer;">추가</button>
        </div>
      </div>`;
  }

  function _bindMainHandlers() {
    // 추가 패널 토글
    const _toggleAddPanel = (forceOpen) => {
      const panel = document.getElementById('svc-add-panel');
      if (!panel) return;
      const opening = forceOpen || panel.style.display === 'none';
      panel.style.display = opening ? '' : 'none';
      if (opening) {
        panel.scrollIntoView({ block: 'start', behavior: 'smooth' });
        setTimeout(() => document.getElementById('svc-name')?.focus(), 30); _bindAddHandlers();
      }
    };
    document.querySelector('.svc-add-btn')?.addEventListener('click', () => _toggleAddPanel(false));
    _bindAddHandlers();
    // 카드 "수정" 클릭
    document.getElementById('svc-list')?.addEventListener('click', (e) => {
      /* [2026-09-14 첫원장] 빈 화면 가운데 [첫 시술 추가] 가 아무 반응이 없었다(라이브) —
         emptyState 는 버튼만 그리고 바인딩은 호출부 몫인데 여기서 bindEmptyCta 를 안 불렀다.
         목록이 다시 그려져도(추가 후 삭제로 빈 화면 복귀) 살아 있게 위임으로 받는다. */
      if (e.target.closest && e.target.closest('[data-empty-cta]')) { e.preventDefault(); _toggleAddPanel(true); return; }
      const editId = e.target.getAttribute('data-svc-edit');
      if (editId) { e.preventDefault(); edit(editId); }
    });
  }

  function _bindAddHandlers() {
    const btn = document.getElementById('svc-add');
    document.querySelectorAll('[data-svc-starter]').forEach(el => {
      if (el._wired) return;
      el._wired = true;
      el.addEventListener('click', () => _applyStarter(el.getAttribute('data-svc-starter')));
    });
    if (!btn || btn._wired) return;
    btn._wired = true;
    btn.addEventListener('click', async () => {
      const name = document.getElementById('svc-name')?.value.trim();
      if (!name) { if (window.showToast) window.showToast('시술 이름을 입력해주세요.', 'warning'); return; }
      const body = {
        name,
        default_price: parseInt(document.getElementById('svc-price')?.value, 10) || 0,
        material_cost: parseInt(document.getElementById('svc-material')?.value, 10) || 0,
        default_duration_min: parseInt(document.getElementById('svc-dur')?.value, 10) || 60,
        retouch_period_days: parseInt(document.getElementById('svc-retouch')?.value, 10) || null,
        category: document.getElementById('svc-cat')?.value || 'etc',
      };
      try {
        await createTemplate(body);
        if (window.hapticLight) window.hapticLight();
        await Promise.all([loadServiceTemplates(), _loadMonthUsage()]);
        const list = document.getElementById('svc-list');
        if (list) list.innerHTML = _renderCards();
        const panel = document.getElementById('svc-add-panel');
        if (panel) panel.style.display = 'none';
        // [2026-09-14 P3] 추가 뒤 폼을 다시 열면 방금 값이 그대로라 [추가] 한 번에 같은 시술이 또 생겼다 → 비운다.
        ['svc-name', 'svc-price', 'svc-material', 'svc-retouch'].forEach((id) => { const el = document.getElementById(id); if (el) el.value = ''; });
        { const du = document.getElementById('svc-dur'); if (du) du.value = 60; }
        if (window.showToast) window.showToast(`'${body.name}' 시술을 메뉴에 넣었어요`);
      } catch (e) {
        if (window.showToast) window.showToast('추가 실패: ' + (window._humanError ? window._humanError(e) : e.message), 'error');
      }
    });
  }

  function _applyStarter(idx) {
    const s = _starterList()[Number(idx) || 0];
    if (!s) return;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
    set('svc-name', s.name); set('svc-price', s.p); set('svc-dur', s.d); set('svc-retouch', s.r || '');
    set('svc-cat', s.c || _catForSelect());
  }

  // ── 통합 편집 ──────────────────────────────────────────
  function edit(id) {
    const svc = _cache.find(x => String(x.id) === String(id));
    if (!svc || !window.openSheet) return;
    const body = `
      ${_addFormHTML(svc)}
      <div style="display:flex;gap:8px;margin-top:14px;">
        <button id="svc-edit-cons" type="button" style="flex:1;padding:11px;border:1px solid #E5E8EB;background:#fff;border-radius:10px;font-size:13px;font-weight:600;color:#4E5968;cursor:pointer;">소모재료 설정</button>
        <button id="svc-edit-del"  type="button" style="padding:11px 18px;border:1px solid #E5E8EB;background:#fff;border-radius:10px;font-size:13px;font-weight:600;color:#BC6675;cursor:pointer;">삭제</button>
      </div>`;
    window.openSheet({ title: `${svc.name} 수정`, body });
    setTimeout(() => {
      // 저장 버튼 동작 변경 — create 대신 update
      const saveBtn = document.getElementById('svc-add');
      if (saveBtn) {
        saveBtn.textContent = '저장';
        saveBtn._wired = true;  // _bindAddHandlers 자동 wire 차단
        saveBtn.addEventListener('click', async () => {
          const name = document.getElementById('svc-name')?.value.trim();
          if (!name) { if (window.showToast) window.showToast('시술 이름을 입력해주세요.', 'warning'); return; }
          const patch = {
            name,
            default_price: parseInt(document.getElementById('svc-price')?.value, 10) || 0,
            material_cost: parseInt(document.getElementById('svc-material')?.value, 10) || 0,
            default_duration_min: parseInt(document.getElementById('svc-dur')?.value, 10) || 60,
            retouch_period_days: parseInt(document.getElementById('svc-retouch')?.value, 10) || null,
            category: document.getElementById('svc-cat')?.value || 'etc',
          };
          try {
            await updateTemplate(svc.id, patch);
            await Promise.all([loadServiceTemplates(), _loadMonthUsage()]);
            if (window.showToast) window.showToast('저장됨');
            openServiceTemplates();  // 메인 시트로 복귀
          } catch (e) {
            if (window.showToast) window.showToast('저장 실패: ' + (e.message || ''), 'error');
          }
        });
      }
      document.getElementById('svc-edit-cons')?.addEventListener('click', () => editConsumptions(svc.id));
      document.getElementById('svc-edit-del')?.addEventListener('click', () => {
        // [2026-06-10] _confirm2 deprecated 스텁(항상 false) → 시술 삭제 무반응이던 버그 픽스
        const _doDelete = async () => {
          try {
            await deleteTemplate(svc.id);
            await Promise.all([loadServiceTemplates(), _loadMonthUsage()]);
            if (window.showToast) window.showToast('삭제됨');
            openServiceTemplates();
          } catch (_e) { if (window.showToast) window.showToast('삭제 실패', 'error'); }
        };
        if (window._inlineConfirm) window._inlineConfirm('이 시술을 삭제할까요?', _doDelete);
        else if (confirm('이 시술을 삭제할까요?')) _doDelete();
      });
    }, 50);
  }

  // ── 재료 소모 (INVENTORY_HIDDEN) — stub 만 유지 (외부 ServiceTemplates 객체 참조 보장) ──
  /* INVENTORY_HIDDEN */ async function editConsumptions(/* serviceId */) { return; }
  /* INVENTORY_HIDDEN
  async function editConsumptions(serviceId) {
    if (!window.openSheet) return;
    const svc = _cache.find(x => String(x.id) === String(serviceId));
    const [, rows] = await Promise.all([loadInventoryItems(), loadConsumptions(serviceId)]);
    window._svcConsRows = rows;
    const body = `
      <div style="padding:8px 0 14px;border-bottom:1px solid #E5E8EB;margin-bottom:14px;">
        <div style="font-weight:700;margin-bottom:8px;font-size:14px;color:#191F28;">${_esc(svc?.name || '시술')} 재료 소모</div>
        <div style="display:grid;grid-template-columns:1fr 88px;gap:6px;">
          <select id="cons-inv" style="padding:10px;border:1px solid #ddd;border-radius:8px;">
            ${_inventoryCache.map(i => `<option value="${i.id}">${_esc(i.name)} (${_esc(i.unit || '개')})</option>`).join('')}
          </select>
          <input id="cons-qty" type="number" step="0.1" placeholder="소모량" style="padding:10px;border:1px solid #ddd;border-radius:8px;">
        </div>
        <button id="cons-add" type="button" style="width:100%;margin-top:8px;padding:11px;border:none;border-radius:8px;background:#BC6675;color:#fff;font-weight:700;cursor:pointer;">추가</button>
      </div>
      <div id="cons-list">${_renderConsRows(serviceId, rows)}</div>`;
    window.openSheet({ title: '재료 소모', body });
    setTimeout(() => _bindConsumptionEvents(serviceId), 50);
  }

  function _renderConsRows(serviceId, rows) {
    if (!_inventoryCache.length) return '<div style="padding:20px;color:#8B95A1;text-align:center;font-size:13px;">먼저 재고를 추가해 주세요.</div>';
    if (!rows.length) return '<div style="padding:20px;color:#8B95A1;text-align:center;font-size:13px;">연결된 재료가 없어요.</div>';
    return rows.map(r => `
      <div style="display:flex;align-items:center;gap:8px;padding:10px;border:1px solid #E5E8EB;border-radius:10px;margin-bottom:8px;background:#fff;">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;">${_esc(r.inventory_name)}</div>
          <div style="font-size:12px;color:#8B95A1;">${Number(r.consumption_qty || 0).toLocaleString()}${_esc(r.inventory_unit || '')}</div>
        </div>
        <button data-cons-del="${r.id}" type="button" style="border:1px solid #E5E8EB;background:#fff;border-radius:8px;padding:7px 10px;font-size:12px;cursor:pointer;">삭제</button>
      </div>`).join('');
  }

  function _bindConsumptionEvents(serviceId) {
    document.getElementById('cons-add')?.addEventListener('click', async () => {
      const inventoryId = parseInt(document.getElementById('cons-inv')?.value, 10);
      const qty = parseFloat(document.getElementById('cons-qty')?.value);
      if (!inventoryId || !qty || qty <= 0) { if (window.showToast) window.showToast('재료와 소모량을 입력해 주세요.', 'warning'); return; }
      try {
        await createConsumption(serviceId, { inventory_id: inventoryId, consumption_qty: qty });
        const rows = await loadConsumptions(serviceId);
        const list = document.getElementById('cons-list');
        if (list) list.innerHTML = _renderConsRows(serviceId, rows);
        const qtyInput = document.getElementById('cons-qty');
        if (qtyInput) qtyInput.value = '';
        if (window.showToast) window.showToast('저장 완료');
      } catch (_e) { if (window.showToast) window.showToast('저장 실패', 'error'); }
    });
    document.getElementById('cons-list')?.addEventListener('click', async (e) => {
      const id = e.target.getAttribute('data-cons-del');
      if (!id) return;
      try {
        await deleteConsumption(serviceId, id);
        const rows = await loadConsumptions(serviceId);
        const list = document.getElementById('cons-list');
        if (list) list.innerHTML = _renderConsRows(serviceId, rows);
      } catch (_e) { if (window.showToast) window.showToast('삭제 실패', 'error'); }
    });
  }
  */

  // ── 외부 노출 ──────────────────────────────────────────
  window.openServiceTemplates = openServiceTemplates;
  window.loadServiceTemplates = loadServiceTemplates;
  window._serviceTemplatesCache = _cache;
  window.ServiceTemplates = { open: openServiceTemplates, edit, del: deleteTemplate, editConsumptions };
})();
