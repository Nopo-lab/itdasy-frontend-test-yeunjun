/* 매출 관리 v5 — 메인 컨트롤러 + period 디스패처 (Step 3A · 2026-05-16 분할)
   - today/week 뷰: window.RevenueToday  (app-revenue-today.js)
   - month 뷰:     window.RevenueMonth   (app-revenue-month.js · BE /revenue/summary)
   - 본 파일: 데이터·시트·이벤트·CRUD·빠른추가·자세히 입력 모달·도넛·인센티브 등 공용 액션.

   외부: openRevenue / closeRevenue / window.Revenue / window._revenueBack
   mockup: ../mockup-revenue-v4.html · styles: css/screens/revenue-v5.css */
(function () {
  'use strict';

  const OFFLINE_KEY = 'itdasy_revenue_offline_v1';
  // [v221] 기간 UX 재설계 — 일/주/월 단위 토글 + 단일 앵커 날짜 (← → 로 이동).
  //   * 기존 6칩 (오늘/이번주/이번달/지난주/지난달/직접지정) 제거.
  //   * 앵커 날짜 기준으로 from~to 자동 계산 → BE 는 항상 period=custom + from/to.
  //   * 월 단위는 RevenueMonth 의 자체 nav 와 연동 (이전 로직 호환).
  const PERIODS = ['day', 'week', 'month'];
  const PERIOD_LABEL = { day: '일', week: '주', month: '월' };
  let _customRange = { from: null, to: null };
  const PC_BREAKPOINT = 1100;

  // ── 날짜 helper (ISO YYYY-MM-DD 기준) ────────────────────
  function _pad2(n) { return String(n).padStart(2, '0'); }
  function _todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${_pad2(d.getMonth()+1)}-${_pad2(d.getDate())}`;
  }
  function _isoFromDate(d) {
    return `${d.getFullYear()}-${_pad2(d.getMonth()+1)}-${_pad2(d.getDate())}`;
  }
  function _addDaysISO(iso, n) {
    const d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return _isoFromDate(d);
  }
  function _addMonthsISO(iso, n) {
    const d = new Date(iso + 'T00:00:00');
    d.setMonth(d.getMonth() + n);
    return _isoFromDate(d);
  }
  function _weekStartISO(iso) {
    // 월요일을 주 시작으로
    const d = new Date(iso + 'T00:00:00');
    const dow = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - dow);
    return _isoFromDate(d);
  }
  let _anchorDate = _todayISO();
  function _computeRange() {
    if (_currentPeriod === 'day') return { from: _anchorDate, to: _anchorDate };
    if (_currentPeriod === 'week') {
      const start = _weekStartISO(_anchorDate);
      return { from: start, to: _addDaysISO(start, 6) };
    }
    // month — anchor 의 달 1일 ~ 말일
    const d = new Date(_anchorDate + 'T00:00:00');
    const from = `${d.getFullYear()}-${_pad2(d.getMonth()+1)}-01`;
    const last = new Date(d.getFullYear(), d.getMonth()+1, 0);
    const to = _isoFromDate(last);
    return { from, to };
  }
  function _shiftAnchor(delta) {
    if (_currentPeriod === 'day') _anchorDate = _addDaysISO(_anchorDate, delta);
    else if (_currentPeriod === 'week') _anchorDate = _addDaysISO(_anchorDate, delta * 7);
    else _anchorDate = _addMonthsISO(_anchorDate, delta);
  }
  function _periodDisplayLabel() {
    const r = _computeRange();
    if (_currentPeriod === 'day') {
      const today = _todayISO();
      if (_anchorDate === today) return '오늘';
      if (_anchorDate === _addDaysISO(today, -1)) return '어제';
      return r.from.replace(/-/g, '/');
    }
    if (_currentPeriod === 'week') {
      const f = r.from.slice(5).replace('-', '/');
      const t = r.to.slice(5).replace('-', '/');
      return `${f} ~ ${t}`;
    }
    const d = new Date(_anchorDate + 'T00:00:00');
    return `${d.getFullYear()}년 ${d.getMonth()+1}월`;
  }

  const TAG_CLS = {
    card: 'rv-tag--card', cash: 'rv-tag--cash',
    transfer: 'rv-tag--transfer', bank_transfer: 'rv-tag--transfer',
    membership: 'rv-tag--membership',
  };
  const TAG_LABEL = {
    card: '카드', cash: '현금', transfer: '계좌',
    bank_transfer: '계좌', membership: '회원권', etc: '기타',
  };

  // shop_type 별 시술명 예시 (빠른 입력 placeholder)
  const _RV_EXAMPLE_BY_SHOP = {
    '붙임머리': '24인치', '네일': '젤네일', '네일아트': '젤네일',
    '속눈썹': '클래식 연장', '피부': '기본 관리', '헤어': '커트', '헤어샵': '커트',
    '왁싱': '브라질리언', '반영구': '눈썹 콤보',
  };
  function _rvShopExample() {
    try {
      const t = localStorage.getItem('shop_type') || '붙임머리';
      return _RV_EXAMPLE_BY_SHOP[t] || _RV_EXAMPLE_BY_SHOP['붙임머리'];
    } catch (_) { return '24인치'; }
  }
  const DONUT_COLORS = ['#BC6675', '#F4A6B8', '#FBE0E7', '#C4C9D1', '#E5E7EB'];

  let _currentPeriod = 'month';  // [2026-05-21] 기본 탭 일 → 월
  let _items = [];
  let _revWindow = 50;
  let _isOffline = false;
  let _cachedIsPC = false;
  const _periodInflight = {};

  // ── 유틸 ────────────────────────────────────────────────
  const _now = () => new Date().toISOString();
  const _uuid = () => (crypto?.randomUUID ? crypto.randomUUID() : 'r_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10));
  const _esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
  const _isPC = () => window.innerWidth >= PC_BREAKPOINT;
  const _formatMan = (n) => {
    const v = +n || 0;
    if (v >= 10000) return (v / 10000).toLocaleString('ko-KR', { maximumFractionDigits: 1 }) + '만원';
    return v.toLocaleString('ko-KR') + '원';
  };
  const _tagHTML = (m) => `<span class="rv-tag ${TAG_CLS[m] || ''}">${TAG_LABEL[m] || _esc(m || '카드')}</span>`;

  // ── 오프라인 폴백용 기간 변환 ────────────────────────────
  // [v221] 앵커 기반 _computeRange() 와 별도로, 오프라인 필터링용 Date 범위 반환.
  function _periodRange() {
    const r = _computeRange();
    const start = new Date(r.from + 'T00:00:00');
    const end = new Date(r.to + 'T23:59:59');
    return { start, end };
  }

  // ── 오프라인 ────────────────────────────────────────────
  const _loadOffline = () => { try { return JSON.parse(localStorage.getItem(OFFLINE_KEY) || '[]'); } catch (_) { return []; } };
  const _saveOffline = (list) => { try { localStorage.setItem(OFFLINE_KEY, JSON.stringify(list)); } catch (_) { /* silent */ } };

  // ── 네트워크 ────────────────────────────────────────────
  async function _api(method, path, body) {
    if (!window.API || !window.authHeader) throw new Error('no-auth');
    const auth = window.authHeader();
    if (!auth?.Authorization) throw new Error('no-token');
    const opts = { method, headers: { ...auth, 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const res = await apiFetch(path, opts);
    if (res.status === 404 || res.status === 501) throw new Error('endpoint-missing');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.status === 204 ? null : await res.json();
  }

  // ── SWR ────────────────────────────────────────────────
  // [v221] 캐시 키는 단위 + from~to. 앵커 옮길 때마다 새 키.
  const _SWR_TTL = 60 * 1000;
  const _swrKey = (p) => {
    const r = _computeRange();
    return `pv_cache::revenue::${p}::${r.from}::${r.to}`;
  };
  // [2026-05-20] generic SWR — 외부 (예: revenue-month) 재활용 가능하게 분리.
  function _swrReadKey(key, ttl) {
    try {
      const raw = localStorage.getItem(key) || sessionStorage.getItem(key);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      return { items: obj.d, age: Date.now() - obj.t, fresh: Date.now() - obj.t < ttl };
    } catch (_) { return null; }
  }
  function _swrWriteKey(key, items) {
    try {
      const payload = JSON.stringify({ t: Date.now(), d: items });
      try { localStorage.setItem(key, payload); }
      catch (_) { try { sessionStorage.setItem(key, payload); } catch (_e) { void _e; } }
    } catch (_) { /* silent */ }
  }
  function _readSWRPeriod(p) { return _swrReadKey(_swrKey(p), _SWR_TTL); }
  function _writeSWRPeriod(p, items) { _swrWriteKey(_swrKey(p), items); }
  function _clearSWRRevenue() {
    // [v221] revenue 관련 캐시 prefix 일괄 삭제
    try {
      const PREFIX = 'pv_cache::revenue::';
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.indexOf(PREFIX) === 0) localStorage.removeItem(k);
      }
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const k = sessionStorage.key(i);
        if (k && k.indexOf(PREFIX) === 0) sessionStorage.removeItem(k);
      }
    } catch (_) { /* silent */ }
  }
  async function _fetchPeriodData(p) {
    if (_periodInflight[p]) return _periodInflight[p];
    // [v221] 항상 custom + 계산된 from/to 로 호출
    const r = _computeRange();
    const url = `/revenue?period=custom&from=${r.from}&to=${r.to}`;
    _periodInflight[p] = _api('GET', url)
      .then(d => { const items = d.items || []; _writeSWRPeriod(p, items); return items; })
      .finally(() => { _periodInflight[p] = null; });
    return _periodInflight[p];
  }
  async function _fetchPeriod(p) {
    const items = await _fetchPeriodData(p);
    _isOffline = false; _items = items; return _items;
  }
  // [매출감사 2026-08-04] `_prefetchAllPeriods` 제거.
  //   매출 화면을 열 때마다 day·week 를 미리 받아뒀는데(요청 2회),
  //   **그 데이터를 그릴 경로가 없다.** period 전환 UI(data-rv-act="period")가
  //   저장소 어디에도 렌더되지 않아 _currentPeriod 는 'month' 로 고정돼 있다.
  //   쓰지 않을 응답을 매번 받느라 모바일 데이터와 서버 시간만 썼다.

  // ── CRUD ───────────────────────────────────────────────
  async function list(period) {
    const p = PERIODS.includes(period) ? period : 'day';
    const swr = _readSWRPeriod(p);
    if (swr) {
      _items = swr.items;
      if (!swr.fresh) {
        _fetchPeriod(p).then(fresh => {
          if (fresh.length !== _items.length || (fresh[0] && _items[0] && fresh[0].id !== _items[0].id)) {
            _items = fresh;
            try { _rerender && _rerender(); } catch (_e) { void _e; }
          }
        }).catch(() => {});
      }
      return _items;
    }
    try { return await _fetchPeriod(p); }
    catch (e) {
      if (e.message === 'endpoint-missing' || e.message === 'no-token') {
        _isOffline = true;
        const { start, end } = _periodRange();
        const all = _loadOffline();
        _items = all.filter(r => {
          const t = new Date(r.recorded_at || r.created_at).getTime();
          if (!t || isNaN(t)) return true;
          return t >= start.getTime() && t <= end.getTime();
        });
        return _items;
      }
      throw e;
    }
  }
  async function create(payload) {
    if (!payload || !(+payload.amount > 0)) throw new Error('amount-required');
    const data = {
      amount: Math.round(+payload.amount),
      method: payload.method || 'card',
      service_name: payload.service_name ? String(payload.service_name).slice(0, 50) : null,
      customer_id: payload.customer_id || null,
      customer_name: payload.customer_name || null,
      memo: payload.memo ? String(payload.memo).slice(0, 200) : null,
      recorded_at: payload.recorded_at || _now(),
      // [출시감사 2026-08-01 P0] 이 화이트리스트에 use_membership 이 빠져 있어서
      //   호출부(:789)가 넘긴 플래그가 **여기서 통째로 버려졌다.** 그 결과:
      //     · 백엔드 revenue.py:165 의 잔액 차감 블록이 통째로 스킵 → 회원권 잔액이 1원도 안 빠짐
      //     · revenue.py:216 `_mem_use=False` → 전액이 매출로 또 기록 (충전 때 이미 잡혔는데 이중계상)
      //   화면엔 "💳 회원권 차감 50,000원" 폭죽까지 떠서 원장님은 차감된 줄 안다.
      //   손님은 선불금을 무한정 다시 쓸 수 있고 매출은 부풀려진다 — 방문마다 누적된다.
      //   백엔드는 atomic UPDATE(잔액≥금액 조건)로 제대로 구현돼 있었다. 프론트만 안 보냈다.
      use_membership: !!payload.use_membership,
      // [출시감사 2026-08-01] 멱등키 — 저장 시도마다 새 uuid.
      //   20초 타임아웃으로 끊기면 서버는 이미 저장했는데 프론트엔 '저장 실패' 가 뜬다.
      //   원장님이 다시 누르면 매출이 2건이 되고 회원권 결제면 잔액도 두 번 빠졌다.
      //   같은 키로 다시 오면 서버가 기존 레코드를 그대로 돌려준다(revenue.py 멱등 검사).
      client_txn_id: payload.client_txn_id || _uuid(),
    };
    if (_isOffline) {
      const record = { id: _uuid(), shop_id: localStorage.getItem('shop_id') || 'offline', ...data, created_at: _now() };
      const all = _loadOffline(); all.unshift(record); _saveOffline(all);
      try { window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'create_revenue', optimistic: false } })); } catch (_e) { void _e; }
      return record;
    }
    const optimistic = { id: '__opt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8), shop_id: localStorage.getItem('shop_id') || '', ...data, created_at: _now(), _optimistic: true };
    _items.unshift(optimistic);
    try { window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'create_revenue', optimistic: true } })); } catch (_e) { void _e; }
    try {
      const created = await _api('POST', '/revenue', data);
      const idx = _items.findIndex(r => r.id === optimistic.id);
      if (idx >= 0) _items[idx] = created;
      else _items.unshift(created);
      _clearSWRRevenue();
      try { window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'create_revenue', optimistic: false } })); } catch (_e) { void _e; }
      return created;
    } catch (err) {
      _items = _items.filter(r => r.id !== optimistic.id);
      try { window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'create_revenue', optimistic: false, rollback: true } })); } catch (_e) { void _e; }
      // [출시감사 2026-08-01] 예전 문구는 '다시 시도해주세요' 였는데, 타임아웃이면 서버엔
      //   이미 저장돼 있을 수 있어 그 안내가 곧 중복 저장을 유도했다. 이제 멱등키(client_txn_id)가
      //   중복을 막지만, 문구도 사실대로 — 결과를 모른다고 말한다.
      if (window.showToast) {
        window.showToast('저장 결과를 확인하지 못했어요. 목록을 새로고침해 확인해 주세요');
      }
      throw err;
    }
  }
  async function remove(id) {
    if (_isOffline) {
      const all = _loadOffline().filter(r => r.id !== id);
      _saveOffline(all);
      try { window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'delete_revenue', optimistic: false } })); } catch (_e) { void _e; }
      return { ok: true };
    }
    await _api('DELETE', '/revenue/' + id);
    _items = _items.filter(r => r.id !== id);
    _clearSWRRevenue();
    try { window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'delete_revenue', optimistic: false } })); } catch (_e) { void _e; }
    return { ok: true };
  }

  // [v206] 매출 한 건 편집 — BE PATCH /revenue/{id}
  async function update(id, patch) {
    if (_isOffline) {
      const all = _loadOffline();
      const i = all.findIndex(r => r.id === id);
      if (i < 0) throw new Error('not-found');
      all[i] = { ...all[i], ...patch };
      _saveOffline(all);
      const j = _items.findIndex(r => r.id === id);
      if (j >= 0) _items[j] = all[i];
      try { window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'update_revenue', optimistic: false } })); } catch (_e) { void _e; }
      return all[i];
    }
    const updated = await _api('PATCH', '/revenue/' + id, patch);
    const j = _items.findIndex(r => r.id === id);
    if (j >= 0) _items[j] = updated;
    _clearSWRRevenue();
    try { window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'update_revenue', optimistic: false } })); } catch (_e) { void _e; }
    return updated;
  }

  // ── 인센티브 / 비용 설정 ─────────────────────────────────
  const INCENTIVE_KEY = 'itdasy_incentive_settings_v1';
  function _incentiveSettings() {
    try { const raw = localStorage.getItem(INCENTIVE_KEY); if (raw) return JSON.parse(raw); } catch (_) { /* silent */ }
    return { material_pct: 15, fixed_monthly: 0, card_fee_pct: 3.5 };
  }
  function _calcIncentive(totalKRW) {
    const s = _incentiveSettings();
    const material = Math.round(totalKRW * (s.material_pct / 100));
    return { gross: totalKRW, material, fixed: s.fixed_monthly || 0, net: totalKRW - material - (s.fixed_monthly || 0), settings: s };
  }
  // [v196 · PROFIT_HIDDEN] 비용 설정 모달 비활성 (재료비/고정비/카드수수료 입력 UI 차단).
  // 옛 본문은 git history 에 있음. 인라인 /* silent */ 가 outer block 주석을 깨서 syntax error
  // 났던 v195 이전 상태 복구 — 본문을 통째로 삭제하고 stub 만 남김.
  function _openIncentiveSettings() { return; }

  // ── 도넛 (today 뷰가 사용) ───────────────────────────────
  function _renderDonut(breakdown, opts) {
    const total = breakdown && breakdown.total ? breakdown.total : 0;
    if (!total) {
      return `<div class="rv-chart__body"><div class="rv-donut" style="background:var(--surface-2);"><div class="rv-donut__center"><div class="rv-donut__total">—</div><div class="rv-donut__label">데이터 없음</div></div></div><div class="rv-legend"><div class="rv-legend__row"><span class="rv-legend__name">기록을 추가하면 표시돼요</span></div></div></div>`;
    }
    const order = ['card', 'cash', 'transfer', 'bank_transfer', 'membership', 'etc'];
    const rowsAll = order
      .filter(k => breakdown.by_method && breakdown.by_method[k])
      .map(k => ({ k, label: TAG_LABEL[k] || k, total: (breakdown.by_method[k] || {}).total || 0, count: (breakdown.by_method[k] || {}).count || 0 }))
      .filter(x => x.total > 0)
      .sort((a, b) => b.total - a.total);
    if (!rowsAll.length) {
      return `<div class="rv-chart__body"><div class="rv-donut" style="background:var(--surface-2);"></div><div class="rv-legend"><div class="rv-legend__row"><span class="rv-legend__name">데이터 없음</span></div></div></div>`;
    }
    let acc = 0;
    const slices = rowsAll.map((m, i) => {
      const start = acc; acc += m.total / total;
      m.color = DONUT_COLORS[Math.min(i, DONUT_COLORS.length - 1)];
      return `${m.color} ${(start * 360).toFixed(2)}deg ${(acc * 360).toFixed(2)}deg`;
    }).join(', ');
    const centerLbl = (opts && opts.centerLabel) || '합계';
    const legend = rowsAll.map(m =>
      `<div class="rv-legend__row"><span class="rv-legend__dot" style="background:${m.color};"></span><span class="rv-legend__name">${_esc(m.label)}</span><span class="rv-legend__value">${_formatMan(m.total)}</span><span class="rv-legend__pct">${Math.round(m.total * 100 / total)}%</span></div>`
    ).join('');
    return `<div class="rv-chart__body"><div class="rv-donut" style="background:conic-gradient(${slices});"><div class="rv-donut__center"><div class="rv-donut__total">${_formatMan(total)}</div><div class="rv-donut__label">${_esc(centerLbl)}</div></div></div><div class="rv-legend">${legend}</div></div>`;
  }

  // ── 인센티브 카드 (PROFIT_HIDDEN) — 빈 문자열 반환 stub ──
  function _renderIncentiveCardHTML(/* totalKRW, extraStyle */) { return ''; }
  /* PROFIT_HIDDEN
  function _renderIncentiveCardHTML(totalKRW, extraStyle) {
    const c = _calcIncentive(totalKRW);
    return `
      <div class="rv-incentive" ${extraStyle ? `style="${extraStyle}"` : ''}>
        <div class="rv-incentive__head">
          <div class="rv-incentive__title">이번달 순수익</div>
          <button type="button" class="rv-incentive__config" data-rv-act="incentive-cfg">⚙ 설정</button>
        </div>
        <div class="rv-incentive__net">${_formatMan(c.net)}</div>
        <div class="rv-incentive__formula">
          <div class="rv-incentive__formula-item">매출 <b>${_formatMan(c.gross)}</b></div>
          <div class="rv-incentive__formula-item">- 재료비(${c.settings.material_pct}%) <b>${_formatMan(c.material)}</b></div>
          ${c.fixed > 0 ? `<div class="rv-incentive__formula-item">- 고정비 <b>${_formatMan(c.fixed)}</b></div>` : ''}
        </div>
      </div>`;
  }
  */

  // ── 도넛 비동기 로딩 (today 뷰가 호출) ───────────────────
  async function _loadDonutAsync(chartEl) {
    if (!chartEl) return;
    const bodyEl = chartEl.querySelector('.rv-chart__body');
    const subEl = chartEl.querySelector('.rv-chart__sub');
    try {
      const r = await _api('GET', '/memberships/revenue-breakdown?period=' + _currentPeriod);
      if (!r) {
        if (bodyEl) bodyEl.outerHTML = _renderDonut({ total: 0 }, { centerLabel: '데이터 없음' });
        if (subEl) subEl.textContent = '데이터 없음';
        return;
      }
      const html = _renderDonut(r, { centerLabel: _periodDisplayLabel() + ' 합계' });
      if (bodyEl) bodyEl.outerHTML = html;
      if (subEl) {
        const cnt = r.by_method ? Object.keys(r.by_method).filter(k => (r.by_method[k] || {}).total > 0).length : 0;
        subEl.textContent = `${_periodDisplayLabel()} · ${cnt}가지`;
      }
    } catch (_e) {
      const total = _items.reduce((s, r) => s + (r.amount || 0), 0);
      if (!total) {
        if (bodyEl) bodyEl.outerHTML = _renderDonut({ total: 0 }, { centerLabel: '데이터 없음' });
        if (subEl) subEl.textContent = '데이터 없음';
        return;
      }
      const by = {};
      _items.forEach(r => {
        const m = r.method || 'card';
        if (!by[m]) by[m] = { total: 0, count: 0 };
        by[m].total += r.amount || 0;
        by[m].count += 1;
      });
      const html = _renderDonut({ total, by_method: by }, { centerLabel: _periodDisplayLabel() + ' 합계' });
      if (bodyEl) bodyEl.outerHTML = html;
      if (subEl) subEl.textContent = `${_periodDisplayLabel()} · 로컬 집계`;
    }
  }

  // ── 시트 ────────────────────────────────────────────────
  function _ensureSheet() {
    let sheet = document.getElementById('revenueSheet');
    if (sheet) return sheet;
    sheet = document.createElement('div');
    sheet.id = 'revenueSheet';
    sheet.className = 'rv-screen';
    sheet.style.cssText = 'position:fixed;inset:0;z-index:9000;display:none;background:var(--bg);flex-direction:column;';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    document.body.appendChild(sheet);
    sheet.addEventListener('click', _onRootClick);
    sheet.addEventListener('keydown', _onRootKeydown);
    // [v221] 앵커 날짜 input 변경 핸들러
    sheet.addEventListener('change', (e) => {
      const t = e.target;
      if (t && t.matches && t.matches('[data-rv-anchor]')) {
        const v = t.value;
        if (v) {
          _anchorDate = v;
          _customRange = _computeRange();
          _revWindow = 50;
          _loadAndRender();
        }
      }
    });
    return sheet;
  }
  function _onRootKeydown(e) {
    if (e.key === 'Escape') { e.preventDefault(); window.closeRevenue(); }
  }
  function _onRootClick(e) {
    const btn = e.target.closest('[data-rv-act]');
    if (!btn) return;
    const act = btn.dataset.rvAct;
    if (act === 'close') return window.closeRevenue();
    // [v221] 단위(일/주/월) 토글
    if (act === 'period') {
      const p = btn.dataset.period;
      if (!PERIODS.includes(p) || p === _currentPeriod) return;
      _currentPeriod = p; _revWindow = 50;
      _customRange = _computeRange();
      _loadAndRender();
      return;
    }
    // [v221] 앵커 날짜 ← / → 이동
    if (act === 'anchor-shift') {
      const delta = Number(btn.dataset.delta) || 0;
      if (!delta) return;
      _shiftAnchor(delta);
      _customRange = _computeRange();
      _revWindow = 50;
      _loadAndRender();
      return;
    }
    // [v221] "오늘" 버튼 — 앵커를 오늘로 리셋
    if (act === 'anchor-today') {
      _anchorDate = _todayISO();
      _customRange = _computeRange();
      _revWindow = 50;
      _loadAndRender();
      return;
    }
    /* PROFIT_HIDDEN */ // if (act === 'incentive-cfg') return _openIncentiveSettings();
    if (act === 'qa-add') return _submitQuickAdd();
    if (act === 'add-form') return _openAddForm();
    if (act === 'load-more') { _revWindow += 50; _rerender(); return; }
    if (act === 'delete') { const id = btn.dataset.id; if (id) _deleteEntry(id); return; }
    if (act === 'side-go') {
      const target = btn.dataset.go;
      window.closeRevenue();
      try {
        if (target === 'goHome' && typeof window.goHome === 'function') window.goHome();
        else if (target === 'goMyshop' && typeof window.goMyshop === 'function') window.goMyshop();
        else if (target === 'booking' && typeof window.openCalendarView === 'function') window.openCalendarView();
        else if (target === 'customer' && typeof window.openCustomerHub === 'function') window.openCustomerHub();
        /* INVENTORY_HIDDEN */ // else if (target === 'inventory' && typeof window.openInventoryHub === 'function') window.openInventoryHub();
        else if (target === 'aiHub' && typeof window.openAIHub === 'function') window.openAIHub();
        else if (target === 'settings' && typeof window.openSettingsHub === 'function') window.openSettingsHub();
      } catch (_e) { void _e; }
      return;
    }
  }

  // ── 모바일 셸 ────────────────────────────────────────────
  function _mobileLayoutHTML() {
    return `
      <div class="rv-header">
        <button type="button" class="rv-header__back" data-rv-act="close" aria-label="뒤로가기">
          <svg width="14" height="14" aria-hidden="true"><use href="#ic-chevron-left"/></svg>
        </button>
        <div class="rv-header__title-wrap">
          <div class="rv-header__title">매출관리</div>
          <div class="rv-header__sub" id="rvOfflineBadge" style="display:none;color:var(--danger);">오프라인</div>
        </div>
        <button type="button" class="rv-header__action" data-rv-act="add-form">+ 입력</button>
      </div>
      <!-- [2026-06-05] 일/주/월 토글·구 날짜네비 제거 — 월 캘린더 단일. 월 네비는 RevenueMonth(캘린더) 가 담당. -->
      <div class="rv-body" id="rvBody"></div>
      <datalist id="rvDataCustomer"></datalist>
      <datalist id="rvDataService"></datalist>`;
  }

  // ── PC 셸 ────────────────────────────────────────────────
  function _pcSidebarHTML() {
    const item = (act, iconId, label, active) => `
      <button type="button" class="ms-side__item${active ? ' is-active' : ''}" data-rv-act="side-go" data-go="${act}"${active ? ' aria-current="page"' : ''}>
        <span class="ms-side__icon"><svg width="18" height="18" aria-hidden="true"><use href="#${iconId}"/></svg></span>
        <span class="ms-side__label">${_esc(label)}</span>
      </button>`;
    return `
      <aside class="ms-side" aria-label="매출관리 사이드바">
        <div class="ms-side__logo">잇데이</div>
        ${item('goHome', 'ic-home', '홈', false)}
        ${item('goMyshop', 'ic-store', '내샵관리', false)}
        <div class="ms-side__section">운영</div>
        ${item('booking', 'ic-calendar', '예약관리', false)}
        ${item('customer', 'ic-users', '고객관리', false)}
        ${item('revenue', 'ic-dollar-sign', '매출관리', true)}
        ${ /* INVENTORY_HIDDEN — 재고관리 메뉴 숨김 (Phase 6 cleanup)
        ${item('inventory', 'ic-package', '재고관리', false)}
        */ '' }
        <div class="ms-side__section">통합 허브</div>
        ${item('aiHub', 'ic-sparkles', '잇비 · 자동화', false)}
        ${item('settings', 'ic-settings', '연동관리', false)}
      </aside>`;
  }
  function _pcLayoutHTML() {
    return `
      <div class="ms-root" style="flex-direction:row;min-height:100vh;">
        ${_pcSidebarHTML()}
        <div class="rv-pc" id="rvPCMain" style="display:block;flex:1;"></div>
      </div>
      <datalist id="rvDataCustomer"></datalist>
      <datalist id="rvDataService"></datalist>`;
  }
  // [2026-06-05] 매출관리 월 캘린더 단일 — 일/주 토글·구 날짜네비 제거. 월 네비는 RevenueMonth 가 담당.
  function _renderPCHeaderHTML() {
    return `<div class="rv-pc__header">
      <div class="rv-pc__title">매출관리</div>
      <div class="rv-pc__spacer"></div>
      <button type="button" class="rv-pc__add" data-rv-act="add-form">+ 매출 입력</button>
    </div>`;
  }
  function _renderPCChartShellHTML() {
    return `<div class="rv-pc-chart" id="rvPCChart">
      <div class="rv-chart__head"><div><div class="rv-chart__title">결제 방식별 분포</div><div class="rv-chart__sub">불러오는 중…</div></div></div>
      <div class="rv-chart__body"><div class="rv-donut" style="background:var(--surface-2);"></div><div class="rv-legend"></div></div>
    </div>`;
  }
  async function _renderRoot() {
    const sheet = _ensureSheet();
    _cachedIsPC = _isPC();
    if (_cachedIsPC) {
      sheet.classList.add('rv-screen--pc');
      sheet.style.flexDirection = 'row';
      sheet.innerHTML = _pcLayoutHTML();
    } else {
      sheet.classList.remove('rv-screen--pc');
      sheet.style.flexDirection = 'column';
      sheet.innerHTML = _mobileLayoutHTML();
    }
  }

  // ── 빠른추가 ────────────────────────────────────────────
  function _qaContainer() {
    const sheet = document.getElementById('revenueSheet');
    if (!sheet) return null;
    return sheet.querySelector('[data-rv-qa]');
  }
  function _readQA() {
    const c = _qaContainer();
    if (!c) return null;
    const v = {};
    c.querySelectorAll('[data-rv-field]').forEach(el => { v[el.dataset.rvField] = el.value.trim(); });
    return v;
  }
  function _resetQA() {
    const c = _qaContainer();
    if (!c) return;
    c.querySelectorAll('[data-rv-field]').forEach(el => {
      el.value = el.dataset.rvField === 'method' ? (el.dataset.rvMethodDefault || 'card') : '';
    });
    const focusEl = c.querySelector('[data-rv-field="amount"]');
    if (focusEl) focusEl.focus();
  }
  let _qaBusy = false; // [2026-07-14 QA] 빠른추가 연타 중복 저장 방지
  async function _submitQuickAdd() {
    if (_qaBusy) return;
    const v = _readQA();
    if (!v) return;
    const amount = parseInt(v.amount, 10);
    if (!amount || amount <= 0) {
      const c = _qaContainer();
      const amtEl = c && c.querySelector('[data-rv-field="amount"]');
      if (amtEl) amtEl.focus();
      if (window.showToast) window.showToast('금액을 입력해 주세요');
      return;
    }
    _qaBusy = true;
    try {
      await create({
        amount, method: v.method || 'card',
        customer_name: v.customer_name || null, service_name: v.service_name || null,
      });
      if (window.Fun && typeof window.Fun.confetti === 'function') {
        try { const btn = _qaContainer()?.querySelector('[data-rv-act="qa-add"]'); if (btn) window.Fun.confetti(btn); } catch (_e) { void _e; }
      }
      if (window.showToast) window.showToast(`매출 +${amount.toLocaleString()}원`);
      _resetQA(); await _loadAndRender();
    } catch (e) {
      console.warn('[revenue] qa-add 실패:', e);
      if (window.showToast) window.showToast('저장 실패 — 다시 시도해 주세요');
    } finally {
      _qaBusy = false;
    }
  }

  // ── 자세히 입력 모달 ────────────────────────────────────
  function _openAddForm(prefill) {
    let modal = document.getElementById('rvAddModal');
    if (modal) {
      if (prefill) modal.remove();
      else { modal.style.display = 'flex'; return; }
    }
    modal = document.createElement('div');
    modal.id = 'rvAddModal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:9001;background:rgba(0,0,0,0.4);display:flex;align-items:flex-end;justify-content:center;';
    const _isEdit = !!(prefill && prefill._edit_id);
    const _title = _isEdit ? '매출 편집'
      : (prefill?.recorded_date ? prefill.recorded_date.slice(5).replace('-', '/') + ' 매출 입력' : '매출 입력');
    // 결제수단 4칩 (etc 제거 — 기존 etc 데이터 표시는 _tagHTML 에서 그대로 유지)
    const _methods = [['card', '카드'], ['cash', '현금'], ['transfer', '계좌'], ['membership', '회원권']];
    modal.innerHTML = `
      <div style="background:#fff;border-radius:20px 20px 0 0;width:100%;max-width:480px;padding:18px 16px;padding-bottom:max(18px,var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)));max-height:92vh;overflow-y:auto;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;">
          <strong style="font-size:17px;color:#191F28;letter-spacing:-0.3px;">${_title}</strong>
          <button type="button" data-rv-modal-close style="margin-left:auto;background:none;border:none;font-size:20px;cursor:pointer;color:#8B95A1;" aria-label="닫기">✕</button>
        </div>

        <!-- 금액: 화면 중앙 큰 표시 -->
        <div style="display:flex;align-items:baseline;justify-content:center;gap:4px;padding:10px 0 12px;">
          <input id="rfAmount" type="text" inputmode="numeric" autocomplete="off" placeholder="0"
            style="width:auto;max-width:74%;border:none;outline:none;text-align:right;font-size:32px;font-weight:600;color:#191F28;background:transparent;padding:0;letter-spacing:-0.5px;" />
          <span style="font-size:18px;color:#8B95A1;font-weight:600;">원</span>
        </div>
        <div style="display:flex;gap:6px;justify-content:center;margin-bottom:18px;">
          ${[10000, 50000, 100000].map(v => `
            <button type="button" data-rf-add="${v}" style="padding:7px 14px;border:0.5px solid #E5E8EB;border-radius:999px;background:#fff;cursor:pointer;font-size:12px;color:#4E5968;font-weight:500;">+${v / 10000}만</button>
          `).join('')}
        </div>

        <!-- 결제수단 -->
        <label style="display:block;font-size:11px;color:#8B95A1;margin-bottom:6px;">결제수단</label>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:18px;">
          ${_methods.map(([m, label]) => `
            <button type="button" data-rf-method="${m}" style="padding:11px 0;border:0.5px solid #E5E8EB;border-radius:12px;background:#fff;cursor:pointer;font-size:13px;color:#4E5968;font-weight:500;">${label}</button>
          `).join('')}
        </div>

        <!-- 시술 (선택) -->
        <label style="display:block;font-size:11px;color:#8B95A1;margin-bottom:6px;">시술 (선택)</label>
        <div id="rfServiceChips" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;"></div>
        <input id="rfServiceCustom" type="text" maxlength="50" placeholder="시술명 직접 입력"
          style="display:none;width:100%;padding:10px 12px;border:0.5px solid #E5E8EB;border-radius:12px;margin-bottom:8px;font-size:14px;color:#191F28;background:#fff;box-sizing:border-box;" />
        <div style="height:10px;"></div>

        <!-- 고객 (선택) — 예약 폼과 동일 카드 패턴 -->
        <label style="display:block;font-size:11px;color:#8B95A1;margin-bottom:6px;">고객 (선택)</label>
        <div style="border:0.5px solid #E5E8EB;border-radius:12px;padding:12px;margin-bottom:18px;">
          <button type="button" class="bf-cust-card empty" id="rfCustCard">
            <div class="bf-cust-bar empty"></div>
            <div class="bf-cust-info"><div class="bf-cust-empty-text">고객 골라주세요</div></div>
            <span class="bf-cust-chev" aria-hidden="true">›</span>
          </button>
        </div>

        <!-- 메모 (선택) -->
        <label style="display:block;font-size:11px;color:#8B95A1;margin-bottom:6px;">메모 (선택)</label>
        <textarea id="rfMemo" rows="2" maxlength="200" placeholder="예) 디자인 변경, 재방문 손님 등"
          style="width:100%;padding:10px 12px;border:0.5px solid #E5E8EB;border-radius:12px;margin-bottom:18px;font-family:inherit;font-size:14px;resize:vertical;color:#191F28;background:#fff;box-sizing:border-box;"></textarea>

        <!-- 저장 (금액 연동 라벨) -->
        <button type="button" id="rfSave" disabled
          style="width:100%;padding:14px;border:none;border-radius:12px;background:#C8CCD2;color:#fff;font-weight:600;cursor:not-allowed;font-size:15px;">금액을 입력해주세요</button>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) _closeAddModal(); });
    modal.querySelector('[data-rv-modal-close]').addEventListener('click', _closeAddModal);
    _wireAddForm(modal, prefill);
  }
  function _closeAddModal() {
    const m = document.getElementById('rvAddModal');
    if (m) m.remove();
  }
  // 고객 카드 채우기 (예약 폼 bf-cust 패턴) — name 없으면 빈 상태로 복원
  function _renderCustomerCard(modal, ctx) {
    const card = modal.querySelector('#rfCustCard');
    if (!card) return;
    if (ctx.customer_name) {
      const bal = ctx._memBalance > 0 ? `회원권 잔액 ${ctx._memBalance.toLocaleString('ko-KR')}원` : '';
      card.classList.remove('empty');
      card.innerHTML = `
        <div class="bf-cust-bar"></div>
        <div class="bf-cust-info"><div class="bf-cust-name">${_esc(ctx.customer_name)}</div>${bal ? `<div class="bf-cust-meta">${bal}</div>` : ''}</div>
        <span class="bf-cust-clear" id="rfCustClear" role="button" aria-label="고객 해제" style="width:22px;height:22px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;color:#8B95A1;cursor:pointer;flex-shrink:0;">×</span>`;
      const clr = card.querySelector('#rfCustClear');
      if (clr) clr.addEventListener('click', (e) => {
        e.stopPropagation();
        ctx.customer_id = null; ctx.customer_name = null; ctx._memBalance = 0;
        _renderCustomerCard(modal, ctx);
        if (ctx._refreshMem) ctx._refreshMem();
      });
    } else {
      card.classList.add('empty');
      card.innerHTML = `
        <div class="bf-cust-bar empty"></div>
        <div class="bf-cust-info"><div class="bf-cust-empty-text">고객 골라주세요</div></div>
        <span class="bf-cust-chev" aria-hidden="true">›</span>`;
    }
  }
  function _onPickCustomer(modal, ctx) {
    return async (e) => {
      // 해제(×) 클릭은 카드 자체 핸들러가 처리 — 피커 재오픈 방지
      if (e && e.target && e.target.id === 'rfCustClear') return;
      if (!window.Customer || !window.Customer.pick) {
        if (window.showToast) window.showToast('고객 모듈 로드 중…'); return;
      }
      const picked = await window.Customer.pick();
      if (picked === null) return;
      ctx.customer_id = picked.id;
      ctx.customer_name = picked.name || '';
      ctx._memBalance = (picked.membership_active && (picked.membership_balance || 0) > 0)
        ? (picked.membership_balance || 0) : 0;
      _renderCustomerCard(modal, ctx);
      if (ctx._refreshMem) ctx._refreshMem();
    };
  }
  function _onSaveAddForm(modal, ctx) {
    return async (ev) => {
      // [2026-06-10] 더블탭 중복 제출 방지 — 느린 네트워크에서 두 번 눌러 매출 2건 기록되던 위험
      if (modal._rfSaving) return;
      const amount = parseInt(String(modal.querySelector('#rfAmount').value).replace(/[^0-9]/g, ''), 10);
      if (!amount || amount <= 0) {
        if (window.showToast) window.showToast('금액을 입력해 주세요'); return;
      }
      modal._rfSaving = true;
      const _saveBtn = ev && ev.currentTarget && ev.currentTarget.tagName === 'BUTTON' ? ev.currentTarget : null;
      if (_saveBtn) _saveBtn.disabled = true;
      const useMem = ctx.method === 'membership';
      const payload = {
        amount, method: ctx.method,
        service_name: ctx.service_name || null,
        customer_id: ctx.customer_id,
        customer_name: ctx.customer_name || null,
        memo: modal.querySelector('#rfMemo').value.trim() || null,
      };
      // [2026-06-10 QA] 캘린더에서 고른 날짜로 기록 (정오 KST — 날짜 경계 안전)
      if (ctx.recorded_date && !ctx._edit_id) payload.recorded_at = ctx.recorded_date + 'T12:00:00+09:00';
      try {
        // [v206] _edit_id 있으면 PATCH, 없으면 create
        if (ctx._edit_id) {
          await update(ctx._edit_id, payload);
          if (window.showToast) window.showToast('매출 기록 수정됨');
        } else {
          await create({ ...payload, use_membership: useMem });
          if (window.Fun && typeof window.Fun.celebrate === 'function') {
            window.Fun.celebrate(
              useMem ? `💳 회원권 차감 ${amount.toLocaleString()}원` : `매출 +${amount.toLocaleString()}원`,
              { emojis: useMem ? ['💳', '✨', '🌷'] : ['💰', '💵', '🎉', '✨'], count: 16 }
            );
          } else {
            if (window.hapticLight) window.hapticLight();
            if (window.showToast) window.showToast(useMem ? '회원권 차감 완료' : '매출 기록 완료');
          }
        }
        _closeAddModal();
        await _loadAndRender();
      } catch (e) {
        console.warn('[revenue] save 실패:', e);
        if (window.showToast) window.showToast('저장 실패: ' + (window._humanError ? window._humanError(e) : (e?.message || '')), { error: true });
      } finally {
        modal._rfSaving = false;
        if (_saveBtn) _saveBtn.disabled = false;
      }
    };
  }
  function _wireAddForm(modal, prefill) {
    const _isEdit = !!(prefill && prefill._edit_id);
    const ctx = {
      method: prefill?.method || 'card',
      customer_id: prefill?.customer_id || null,
      customer_name: prefill?.customer_name || null,
      service_name: prefill?.service_name || null,
      _edit_id: prefill?._edit_id || null,
      // [2026-06-10 QA] 매출 캘린더 "이 날 매출 입력" — 과거 날짜로 기록 (YYYY-MM-DD)
      recorded_date: prefill?.recorded_date || null,
      _memBalance: 0,
      // 편집 모드에서 기존 method 가 membership 이면 잔액 미확인이어도 유지
      _editMem: _isEdit && prefill?.method === 'membership',
    };
    const amtInput = modal.querySelector('#rfAmount');
    const saveBtn = modal.querySelector('#rfSave');

    // ── 금액: 콤마 자동 포맷 + 저장 버튼 라벨 연동 ──
    const _getAmt = () => parseInt(String(amtInput.value).replace(/[^0-9]/g, ''), 10) || 0;
    const _syncSave = () => {
      const a = _getAmt();
      saveBtn.disabled = a <= 0;
      saveBtn.textContent = a > 0 ? `${a.toLocaleString('ko-KR')}원 ${_isEdit ? '수정 저장' : '기록하기'}` : '금액을 입력해주세요';
      saveBtn.style.background = a > 0 ? '#191F28' : '#C8CCD2';
      saveBtn.style.cursor = a > 0 ? 'pointer' : 'not-allowed';
    };
    const _setAmt = (n) => { amtInput.value = n > 0 ? n.toLocaleString('ko-KR') : ''; _syncSave(); };
    amtInput.addEventListener('input', () => { _setAmt(_getAmt()); });
    modal.querySelectorAll('[data-rf-add]').forEach(b => b.addEventListener('click', () => {
      _setAmt(_getAmt() + (parseInt(b.dataset.rfAdd, 10) || 0));
    }));

    // ── 결제수단 칩 (회원권은 잔액 보유 고객 선택 시에만 활성) ──
    const _setMethod = (m, opts) => {
      if (m === 'membership' && ctx._memBalance <= 0 && !ctx._editMem && !(opts && opts.force)) {
        if (window.showToast) window.showToast('회원권 보유 고객을 먼저 선택해주세요');
        return;
      }
      ctx.method = m;
      modal.querySelectorAll('[data-rf-method]').forEach(b => {
        const on = b.dataset.rfMethod === m;
        b.style.background = on ? '#191F28' : '#fff';
        b.style.color = on ? '#fff' : '#4E5968';
        b.style.borderColor = on ? '#191F28' : '#E5E8EB';
      });
    };
    const _refreshMem = () => {
      const chip = modal.querySelector('[data-rf-method="membership"]');
      if (!chip) return;
      chip.style.opacity = (ctx._memBalance > 0 || ctx._editMem) ? '1' : '0.4';
      if (ctx._memBalance <= 0 && !ctx._editMem && ctx.method === 'membership') _setMethod('card', { force: true });
    };
    ctx._refreshMem = _refreshMem;
    modal.querySelectorAll('[data-rf-method]').forEach(b => b.addEventListener('click', () => _setMethod(b.dataset.rfMethod)));

    // ── 고객 카드 (예약 폼 패턴 재사용) ──
    modal.querySelector('#rfCustCard').addEventListener('click', _onPickCustomer(modal, ctx));

    // ── 시술 칩 ──
    _renderServiceChips(modal, ctx, { getAmt: _getAmt, setAmt: _setAmt });

    // ── 저장 ──
    saveBtn.addEventListener('click', _onSaveAddForm(modal, ctx));

    // ── prefill 반영 ──
    if (ctx.customer_name) _renderCustomerCard(modal, ctx);
    if (_isEdit) {
      if (prefill.amount) _setAmt(Number(prefill.amount) || 0);
      if (prefill.memo) modal.querySelector('#rfMemo').value = prefill.memo;
    }
    _setMethod(ctx.method, { force: true });
    _refreshMem();
    _syncSave();
  }

  // 등록된 시술 프리셋 상위 6개 칩 + "+직접". 칩 선택 시 금액 비어있으면 프리셋 가격 자동 채움.
  function _renderServiceChips(modal, ctx, hooks) {
    const host = modal.querySelector('#rfServiceChips');
    const customInput = modal.querySelector('#rfServiceCustom');
    if (!host || !customInput) return;
    const list = Array.isArray(window._serviceTemplatesCache) ? window._serviceTemplatesCache.slice(0, 6) : [];
    const _chipStyle = (on) => `padding:7px 12px;border:0.5px solid ${on ? '#191F28' : '#E5E8EB'};border-radius:999px;background:${on ? '#191F28' : '#fff'};color:${on ? '#fff' : '#4E5968'};cursor:pointer;font-size:12px;font-weight:500;`;
    host.innerHTML = list.map(t => {
      const nm = String(t.name || '').trim();
      const price = Number(t.default_price) || 0;
      const on = !!ctx.service_name && ctx.service_name === nm;
      return `<button type="button" data-rf-svc="${_esc(nm)}" data-rf-price="${price}" style="${_chipStyle(on)}">${_esc(nm)}</button>`;
    }).join('') + `<button type="button" id="rfSvcCustomBtn" style="${_chipStyle(false)}">+ 직접</button>`;
    const _selectChip = (activeEl) => {
      host.querySelectorAll('[data-rf-svc]').forEach(c => c.setAttribute('style', _chipStyle(c === activeEl)));
      const cb = modal.querySelector('#rfSvcCustomBtn');
      if (cb) cb.setAttribute('style', _chipStyle(activeEl === null && customInput.style.display !== 'none'));
    };
    host.querySelectorAll('[data-rf-svc]').forEach(chip => chip.addEventListener('click', () => {
      ctx.service_name = chip.dataset.rfSvc;
      customInput.style.display = 'none';
      customInput.value = '';
      _selectChip(chip);
      const price = parseInt(chip.dataset.rfPrice, 10) || 0;
      if (price > 0 && hooks.getAmt() <= 0) hooks.setAmt(price);
    }));
    modal.querySelector('#rfSvcCustomBtn').addEventListener('click', () => {
      customInput.style.display = 'block';
      customInput.focus();
      ctx.service_name = customInput.value.trim() || null;
      _selectChip(null);
    });
    customInput.addEventListener('input', () => { ctx.service_name = customInput.value.trim() || null; });
    // prefill: 칩에 없는 시술명이면 직접 입력에 노출
    if (ctx.service_name) {
      const match = Array.from(host.querySelectorAll('[data-rf-svc]')).find(c => c.dataset.rfSvc === ctx.service_name);
      if (match) _selectChip(match);
      else { customInput.style.display = 'block'; customInput.value = ctx.service_name; _selectChip(null); }
    }
    // 캐시 비었으면 비동기 로드 후 재렌더
    if (!list.length && typeof window.loadServiceTemplates === 'function') {
      window.loadServiceTemplates().then(() => _renderServiceChips(modal, ctx, hooks)).catch(() => {});
    }
  }

  // ── 삭제 ────────────────────────────────────────────────
  async function _deleteEntry(id) {
    window._inlineConfirm('이 매출 기록을 삭제할까요?', async () => {
      try { await remove(id); if (window.hapticLight) window.hapticLight(); await _loadAndRender(); }
      catch (_e) { if (window.showToast) window.showToast('삭제 실패'); }
    });
  }

  // ── 자동완성 ────────────────────────────────────────────
  function _refreshDatalists() {
    const sheet = document.getElementById('revenueSheet');
    if (!sheet) return;
    const cust = sheet.querySelector('#rvDataCustomer');
    const svc = sheet.querySelector('#rvDataService');
    if (!cust && !svc) return;
    if (window.AppAutocomplete && typeof window.AppAutocomplete.rebuild === 'function') {
      try { window.AppAutocomplete.rebuild({ revenue: _items }); } catch (_e) { void _e; }
    }
    const custSet = new Set(), svcSet = new Set();
    _items.forEach(r => {
      if (r.customer_name) custSet.add(r.customer_name);
      if (r.service_name) svcSet.add(r.service_name);
    });
    if (cust) cust.innerHTML = Array.from(custSet).slice(0, 200).map(v => `<option value="${_esc(v)}"></option>`).join('');
    if (svc) svc.innerHTML = Array.from(svcSet).slice(0, 200).map(v => `<option value="${_esc(v)}"></option>`).join('');
  }

  // ── 디스패처 ────────────────────────────────────────────
  let _rerenderSeq = 0; // [카오스] 월 네비 연타 시 요청 순서 토큰 — 늦게 온 응답이 최신 달을 덮는 것 방지
  async function _rerender() {
    const sheet = document.getElementById('revenueSheet');
    if (!sheet) return;
    const _seq = ++_rerenderSeq;
    _refreshDatalists();
    // 모바일 period 버튼 상태 + 오프라인 배지
    sheet.querySelectorAll('.rv-periods__btn').forEach(b => b.classList.toggle('is-on', b.dataset.period === _currentPeriod));
    sheet.querySelectorAll('.rv-pc__period-btn').forEach(b => b.classList.toggle('is-on', b.dataset.period === _currentPeriod));
    // [v221] 앵커 input + 라벨 동기화
    sheet.querySelectorAll('input[data-rv-anchor]').forEach(el => { if (el.value !== _anchorDate) el.value = _anchorDate; });
    sheet.querySelectorAll('.rv-anchor span, .rv-pc__anchor span').forEach(el => { el.textContent = _periodDisplayLabel(); });
    const offlineBadge = sheet.querySelector('#rvOfflineBadge');
    if (offlineBadge) offlineBadge.style.display = _isOffline ? 'block' : 'none';

    const target = _cachedIsPC ? sheet.querySelector('#rvPCMain') : sheet.querySelector('#rvBody');
    if (!target) return;

    // [v221] 월 단위 → RevenueMonth (요일별 그래프 + 목표). 일/주 → RevenueToday.
    if (_currentPeriod === 'month' && window.RevenueMonth) {
      let summary;
      try { summary = await window.RevenueMonth.fetchSummary(); }
      catch (_e) {
        console.warn('[revenue] summary fetch 실패 — 클라이언트 폴백:', _e);
        summary = window.RevenueMonth.fallbackSummary(_items);
      }
      // [카오스] 이 await 사이 더 최근 네비/재렌더가 있었으면 폐기 — 라벨·수치 불일치(예: '5월' 라벨에 6월 매출) 방지
      if (_seq !== _rerenderSeq) return;
      // 과거 월은 RevenueMonth 가 자체 fetch 한 _viewItems 사용. 이번달은 SWR _items.
      const view = window.RevenueMonth.getView ? window.RevenueMonth.getView() : null;
      const viewItems = window.RevenueMonth.getViewItems ? window.RevenueMonth.getViewItems() : null;
      let itemsToRender = (view && !view.isCurrent && Array.isArray(viewItems)) ? viewItems : _items;
      // [핫픽스E #2] 이번달 한정 — 예약금을 매출 캘린더에 예약일 기준 주입(총매출 카드=예약금 포함과 날짜별 합계 일치).
      //   concat 으로 새 배열 생성 → _items 원본 불변(재렌더 누적 방지). 과거월은 예약금 거의 완료/0 이라 미주입.
      if ((!view || view.isCurrent) && window.BookingRevenueOverlay
          && typeof window.BookingRevenueOverlay.depositEntries === 'function' && window.Booking) {
        try {
          const deps = window.BookingRevenueOverlay.depositEntries(window.Booking._items || [], {});
          if (deps.length) itemsToRender = (itemsToRender || []).concat(deps);
        } catch (_e) { void _e; }
      }
      if (_cachedIsPC) window.RevenueMonth.renderPC(target, summary, itemsToRender);
      else window.RevenueMonth.renderMobile(target, summary, itemsToRender);
      return;
    }

    if (window.RevenueToday) {
      // [v221] RevenueToday 는 'today' / 'week' 코드를 기대 → day → today 매핑.
      const renderPeriod = _currentPeriod === 'day' ? 'today' : _currentPeriod;
      const displayLabel = _periodDisplayLabel();
      if (_cachedIsPC) window.RevenueToday.renderPC(target, _items, renderPeriod, displayLabel);
      else window.RevenueToday.renderMobile(target, _items, renderPeriod, displayLabel);
    }
  }
  window._revenueBack = _rerender;

  // ── 로드 + 렌더 ─────────────────────────────────────────
  async function _loadAndRender() {
    const sheet = document.getElementById('revenueSheet');
    if (!sheet) return;
    const swr = _readSWRPeriod(_currentPeriod);
    if (swr) {
      _items = swr.items; _rerender();
      if (!swr.fresh) { list(_currentPeriod).then(() => _rerender()).catch(() => {}); }
      return;
    }
    try { await list(_currentPeriod); _rerender(); }
    catch (_e) {
      console.warn('[revenue] load 실패:', _e);
      const target = sheet.querySelector(_cachedIsPC ? '#rvPCMain' : '#rvBody');
      if (target) target.innerHTML = '<div style="padding:30px;text-align:center;color:var(--danger);">불러오기 실패</div>';
    }
  }

  // ── open / close ────────────────────────────────────────
  window.openRevenue = async function () {
    const sheet = _ensureSheet();
    _cachedIsPC = _isPC();
    await _renderRoot();
    try { _rerender(); } catch (_e) { void _e; }
    sheet.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    document.body.classList.add('rv-mode');
    _loadAndRender().catch(() => {});
    try {
      if (typeof window._registerSheet === 'function') window._registerSheet('revenue', window.closeRevenue);
      if (typeof window._markSheetOpen === 'function') window._markSheetOpen('revenue');
    } catch (_e) { void _e; }
    // [2026-06-10 QA] 매출 캘린더 "이 날 매출 입력" — 화면만 다시 열리고 아무 동작 없던 버그 픽스:
    //   stash 된 날짜가 있으면 해당 날짜로 입력 폼 자동 오픈.
    try {
      const _pf = window._revenueHubPrefillDate;
      if (_pf) {
        window._revenueHubPrefillDate = '';
        setTimeout(() => _openAddForm({ recorded_date: _pf }), 120);
      }
    } catch (_e) { void _e; }
  };
  window._openRevenueAddFor = async function (customerId, customerName) {
    try { if (typeof window.openRevenue === 'function') await window.openRevenue(); }
    catch (_e) { /* openRevenue 실패해도 모달은 띄움 */ }
    _openAddForm({ customer_id: customerId || null, customer_name: customerName || '' });
  };
  window.closeRevenue = function () {
    const sheet = document.getElementById('revenueSheet');
    if (sheet) sheet.style.display = 'none';
    document.body.style.overflow = '';
    document.body.classList.remove('rv-mode');
    _closeAddModal();
    try { if (typeof window._markSheetClosed === 'function') window._markSheetClosed('revenue'); } catch (_e) { void _e; }
  };

  // [v200] 매출 한 건 액션 시트 — 매출 내역 row 클릭 시 호출되는 글로벌 진입점.
  // [v201] 두 번째 인자 fallbackData — _items 미스매치 시 row 의 data-* 그대로 사용.
  window._openRevenueEdit = function (revId, fallbackData) {
    if (!revId) return;
    let item = (_items || []).find(r => String(r.id) === String(revId));
    if (!item && fallbackData) item = fallbackData;  // row 의 data 속성 그대로
    if (!item) {
      if (window.showToast) window.showToast('이 매출 기록을 찾을 수 없어요');
      return;
    }
    const existing = document.getElementById('rvRowSheet');
    if (existing) existing.remove();
    const svc = item.service_name ? _esc(item.service_name) : '시술';
    const amt = Number(item.amount) || 0;
    const dateStr = String(item.recorded_at || '').slice(0, 10);
    const methodLbl = TAG_LABEL[item.method] || item.method || '';
    const sheet = document.createElement('div');
    sheet.id = 'rvRowSheet';
    sheet.style.cssText = 'position:fixed;inset:0;z-index:9050;background:rgba(0,0,0,0.4);display:flex;align-items:flex-end;justify-content:center;';
    sheet.innerHTML = `
      <div style="background:var(--surface,#fff);border-radius:20px 20px 0 0;width:100%;max-width:440px;padding:20px;padding-bottom:max(20px,var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)));">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
          <strong style="font-size:17px;color:var(--text);">이 매출 기록</strong>
          <button type="button" data-rv-close style="background:none;border:none;font-size:20px;cursor:pointer;color:#8B95A1;" aria-label="닫기">✕</button>
        </div>
        <div style="background:var(--surface-2,#F7F8FA);border-radius:12px;padding:14px;margin-bottom:14px;">
          <div style="font-weight:700;font-size:15px;margin-bottom:4px;">${svc}</div>
          <div style="font-size:13px;color:#6B7684;">${dateStr} · ${_esc(methodLbl)} · <b>${amt.toLocaleString('ko-KR')}원</b></div>
        </div>
        <div style="display:flex;gap:8px;">
          <button type="button" data-rv-close style="flex:1;padding:13px;border:1px solid #E5E8EB;border-radius:12px;background:#fff;cursor:pointer;color:#4E5968;font-weight:700;font-size:13px;">닫기</button>
          <button type="button" data-rv-edit style="flex:1;padding:13px;border:none;border-radius:12px;background:var(--brand-strong,#BC6675);color:#fff;cursor:pointer;font-weight:800;font-size:14px;">편집</button>
          <button type="button" data-rv-del style="flex:1;padding:13px;border:1px solid #EF4444;border-radius:12px;background:#fff;cursor:pointer;color:#EF4444;font-weight:700;font-size:13px;">삭제</button>
        </div>
      </div>`;
    document.body.appendChild(sheet);
    const close = () => sheet.remove();
    sheet.addEventListener('click', (e) => { if (e.target === sheet) close(); });
    sheet.querySelectorAll('[data-rv-close]').forEach(b => b.addEventListener('click', close));
    sheet.querySelector('[data-rv-edit]').addEventListener('click', () => {
      close();
      // [v206] 편집 — _openAddForm 을 edit 모드로 호출
      _openAddForm({
        _edit_id: item.id,
        amount: item.amount,
        method: item.method,
        service_name: item.service_name,
        customer_id: item.customer_id,
        customer_name: item.customer_name,
        memo: item.memo,
      });
    });
    sheet.querySelector('[data-rv-del]').addEventListener('click', () => {
      window._inlineConfirm('이 매출을 삭제할까요?', async () => {
        try {
          await remove(item.id);
          if (window.showToast) window.showToast('삭제됐어요');
          close();
          try { await _loadAndRender(); } catch (_e) { void _e; }
        } catch (e) {
          if (window.showToast) window.showToast('삭제 실패: ' + (e?.message || ''));
        }
      });
    });
  };

  // ── public 객체 + 내부 API export (today/month 가 참조) ─
  window.Revenue = {
    list, create, update, remove,
    // 내부 헬퍼·유틸 (분할 파일이 참조)
    _esc, _formatMan, _isPC, _tagHTML, _rvShopExample,
    PERIODS, PERIOD_LABEL, TAG_LABEL,
    get _items() { return _items; },
    get _currentPeriod() { return _currentPeriod; },
    get _revWindow() { return _revWindow; },
    set _revWindow(n) { _revWindow = +n || 0; },
    get isOffline() { return _isOffline; },
    _calcIncentive, _renderIncentiveCardHTML,
    _renderDonut, _loadDonutAsync,
    _renderPCHeaderHTML, _renderPCChartShellHTML,
    _submitQuickAdd, _rerender,
    // [2026-05-20] generic SWR — revenue-month 등 분할 파일이 동일 캐싱 패턴 재활용.
    _swrReadKey, _swrWriteKey,
  };

  // ── resize ──────────────────────────────────────────────
  let _resizeTimer = null;
  window.addEventListener('resize', () => {
    const sheet = document.getElementById('revenueSheet');
    if (!sheet || sheet.style.display === 'none') return;
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(async () => {
      const newIsPC = _isPC();
      if (newIsPC !== _cachedIsPC) {
        _cachedIsPC = newIsPC;
        await _renderRoot();
        await _loadAndRender();
      }
    }, 200);
  });

  // ── 외부 mutation 이벤트 ────────────────────────────────
  if (typeof window !== 'undefined' && !window._revenueDataListenerInit) {
    window._revenueDataListenerInit = true;
    window.addEventListener('itdasy:data-changed', async (e) => {
      const k = (e && e.detail && e.detail.kind) || '';
      if (!k) return;
      if (k === 'create_revenue' || k === 'update_revenue' || k === 'delete_revenue' || k === 'create_expense' ||
          k.indexOf('revenue') !== -1 || k.indexOf('expense') !== -1 ||
          // [qa-G #1] 예약금(deposit)·예약 상태 변경도 확정매출(예약금)·예정매출 요약에 영향 → 캐시 무효화 후 재조회.
          //   예약 상세에서 예약금 저장 시 update_booking/create_booking 이 발생하므로 매출 요약을 갱신해야 반영됨.
          k.indexOf('booking') !== -1) {
        _clearSWRRevenue();
        const sheet = document.getElementById('revenueSheet');
        if (sheet && sheet.style.display !== 'none') {
          try { await _loadAndRender(); } catch (_err) { void _err; }
        }
      }
    });

    // [매출감사 2026-08-04] **다른 탭**에서 매출이 바뀐 걸 이 탭이 몰랐다.
    //
    //   위 'itdasy:data-changed' 는 **같은 탭 안에서만** 도는 CustomEvent 다.
    //   탭 A 에서 매출을 저장하면 A 는 캐시를 지우고 다시 그리지만,
    //   탭 B 는 자기 메모리에 든 옛 요약을 계속 보여준다.
    //
    //   실측(스테이징, 2026-08-04): PC 에서 탭 두 개를 띄우고
    //     탭A 에서 5만원 저장 → 서버 125,000
    //     탭B 는 홈↔매출을 오가도 **75,000원** 을 계속 표시
    //   캐시(localStorage)는 탭A 가 지워서 비어 있는데도 그랬다 —
    //   탭B 가 메모리 상태로 다시 그리기 때문이다.
    //
    //   원장님이 PC 와 태블릿, 또는 창 두 개를 놓고 쓰면 한쪽 숫자가 계속 틀리다.
    //   돈 화면에서 이건 그냥 두면 안 된다.
    //
    //   localStorage 의 'storage' 이벤트는 **다른 탭에서 바뀔 때만** 온다(자기 탭엔 안 옴).
    //   그래서 캐시가 지워진 걸 감지해 이 탭도 같이 비우고, 매출 화면이 떠 있으면 다시 그린다.
    window.addEventListener('storage', async (e) => {
      if (!e || !e.key || e.key.indexOf('pv_cache::revenue::') !== 0) return;
      if (e.newValue !== null) return;   // 삭제(무효화)된 경우만 — 갱신은 각 탭이 알아서 읽는다
      _clearSWRRevenue();
      const sheet = document.getElementById('revenueSheet');
      if (sheet && sheet.style.display !== 'none') {
        try { await _loadAndRender(); } catch (_err) { void _err; }
      }
    });
  }
})();
