/* ─────────────────────────────────────────────────────────────
   파워뷰 — 그룹화 (Phase 3 · 2026-05-09)

   매출 탭: 월별 / 시술별 / 결제수단별 접기 가능.
   예약 탭: 날짜별 / 상태별 / 시술자별.
   고객 탭: 등급별 (VIP/단골/신규/휴면).

   합계 chip + 펼치기/접기. localStorage `pv:group:${tab}` 보존.

   ── 가드레일 ──
   1. 백엔드 신규 0
   2. 모듈 미로드 시 빈 string fall-through (행 그대로)
   3. 파일 ≤300줄
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window._PVGroup) return;

  const LS = 'pv:group:';

  const GROUPS = {
    revenue: [
      { key: 'month', label: '월별', extract: (r) => (r.recorded_at || '').slice(0, 7) || '미지정' },
      { key: 'service', label: '시술별', extract: (r) => r.service_name || '미지정' },
      { key: 'method', label: '결제수단', extract: (r) => ({ card: '카드', cash: '현금', transfer: '이체', membership: '회원권' }[r.method] || r.method || '미지정') },
    ],
    booking: [
      { key: 'date', label: '날짜별', extract: (r) => (r.starts_at || '').slice(0, 10) || '미지정' },
      { key: 'status', label: '상태별', extract: (r) => ({ confirmed: '확정', completed: '완료', cancelled: '취소', no_show: '노쇼' }[r.status] || r.status || '확정') },
    ],
    customer: [
      { key: 'segment', label: '등급별', extract: (r) => ({ vip: 'VIP', regular: '단골', new: '신규', absent: '휴면' }[r.segment] || '미분류') },
    ],
    inventory: [
      { key: 'category', label: '카테고리', extract: (r) => r.category || '기타' },
    ],
    nps: [
      { key: 'rating_band', label: '평점대', extract: (r) => {
        const n = Number(r.rating || 0);
        if (n >= 9) return '프로모터 (9-10)';
        if (n >= 7) return '중립 (7-8)';
        return '이탈자 (0-6)';
      }},
    ],
    service: [],
  };

  function _read(tab) {
    try { return localStorage.getItem(LS + tab) || ''; }
    catch (_e) { return ''; }
  }
  function _write(tab, key) {
    try {
      if (key) localStorage.setItem(LS + tab, key);
      else localStorage.removeItem(LS + tab);
    } catch (_e) { /* silent */ }
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }

  function getGroups(tab) { return GROUPS[tab] || []; }
  function getCurrent(tab) { return _read(tab); }
  function set(tab, key) {
    _write(tab, key);
    if (window._PVRender && typeof window._PVRender.renderTab === 'function') {
      window._PVRender.renderTab(true);
    }
  }
  function clear(tab) { set(tab, ''); }

  // 그룹 칩 메뉴
  function renderToggle(tab) {
    try {
      const groups = getGroups(tab);
      if (!groups.length) return '';
      const cur = _read(tab);
      const chips = groups.map((g) => {
        const on = cur === g.key;
        return `<button type="button" class="pv-group-chip${on ? ' is-on' : ''}" data-pv-group="${g.key}">${_esc(g.label)}</button>`;
      }).join('');
      const reset = cur ? `<button type="button" class="pv-group-reset" data-pv-group-reset>해제</button>` : '';
      return `<div class="pv-group-row" data-pv-group-row><span class="pv-group-label">그룹:</span>${chips}${reset}</div>`;
    } catch (_e) { return ''; }
  }

  // 행 데이터를 그룹 헤더로 분리한 평면 list 로 변환 → render 가 그대로 row 처럼 출력
  // 그룹 활성 시 list 의 항목들 사이에 { __group: true, label, items } 헤더 객체 삽입
  // (render.js 가 __group 행을 별도로 그리려면 추가 코드 필요 — 본 모듈은 schema.row 호환 list 만 반환)
  function applyGrouping(list, tab) {
    try {
      const cur = _read(tab);
      if (!cur) return list;
      const groups = getGroups(tab);
      const def = groups.find((g) => g.key === cur);
      if (!def) return list;
      const buckets = new Map();
      list.forEach((r) => {
        const k = def.extract(r) || '미지정';
        if (!buckets.has(k)) buckets.set(k, []);
        buckets.get(k).push(r);
      });
      // 키 정렬 — 날짜/숫자 형식이면 내림차순, 아니면 사전순
      const keys = Array.from(buckets.keys()).sort((a, b) => {
        if (/^\d{4}-\d{2}/.test(a) && /^\d{4}-\d{2}/.test(b)) return b.localeCompare(a);
        return String(a).localeCompare(String(b), 'ko');
      });
      const out = [];
      keys.forEach((k) => {
        const items = buckets.get(k);
        out.push({ __group: true, label: k, count: items.length, _bucket_key: k });
        items.forEach((r) => out.push(r));
      });
      return out;
    } catch (_e) { return list; }
  }

  // 그룹 헤더 행 HTML — render.js 에서 __group 인 항목 만나면 별도 렌더 (선택적)
  function groupHeaderRow(item, colspan) {
    try {
      if (!item || !item.__group) return '';
      return `<tr class="pv-group-header"><td colspan="${colspan}">
        <span class="pv-group-header__label">${_esc(item.label)}</span>
        <span class="pv-group-header__count">${item.count}건</span>
      </td></tr>`;
    } catch (_e) { return ''; }
  }

  function bind(root) {
    if (!root) return;
    try {
      root.querySelectorAll('[data-pv-group]').forEach((el) => {
        el.addEventListener('click', () => {
          const k = el.getAttribute('data-pv-group');
          const tab = window._PVState && window._PVState.currentTab;
          if (!tab) return;
          const cur = _read(tab);
          set(tab, cur === k ? '' : k);
        });
      });
      const reset = root.querySelector('[data-pv-group-reset]');
      if (reset) {
        reset.addEventListener('click', () => {
          const tab = window._PVState && window._PVState.currentTab;
          if (tab) clear(tab);
        });
      }
    } catch (e) {
      console.warn('[PVGroup] bind', e);
    }
  }

  window._PVGroup = {
    getGroups, getCurrent, set, clear,
    applyGrouping, renderToggle, groupHeaderRow, bind,
  };
})();
