/* ─────────────────────────────────────────────────────────────
   파워뷰 — 간단 수식 평가 (Phase 3 · 2026-05-09)

   엑셀급 풀 수식 파서는 별도 PR — 현재는 자주 쓰는 미니 DSL 만:
   · SUM(amount), AVG(amount), COUNT(), MAX(amount), MIN(amount)
   · COUNT(method=card), SUM(amount where method=card)
   · 결과는 _PVTotals 또는 사용자 정의 KPI 칩에서 활용

   백엔드 수식 평가 X — 클라 list 위에서만.

   ── 가드레일 ──
   1. eval() 사용 X (안전)
   2. 잘못된 수식 → null 반환, 호출측에서 안전 처리
   3. 파일 ≤300줄

   사용:
     window._PVFormula.evaluate('SUM(amount)', list)
     window._PVFormula.evaluate('COUNT(method=card)', list)
     window._PVFormula.evaluate('SUM(amount where method=card)', list)
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window._PVFormula) return;

  // ── 토크나이저 ─────────────────────────────────────────
  // expr 형식: FUNC(field [where filter])
  // FUNC ∈ SUM, AVG, COUNT, MAX, MIN
  // field ∈ 컬럼명 (또는 '*' = COUNT 전용)
  // filter ∈ field=value [and field2=value2]
  const FUNC_RE = /^\s*(SUM|AVG|COUNT|MAX|MIN)\s*\(\s*(.*)\s*\)\s*$/i;
  const WHERE_RE = /^\s*(\*|[a-zA-Z_][a-zA-Z0-9_]*)\s*(?:\s+where\s+(.+))?\s*$/i;
  const COND_RE = /\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*(=|!=|>|<|>=|<=)\s*([^,]+?)\s*(?:,\s*|$)/g;

  function _parseConditions(s) {
    if (!s) return [];
    const conds = [];
    let m;
    COND_RE.lastIndex = 0;
    // .matchAll 대안
    while ((m = COND_RE.exec(s)) !== null) {
      conds.push({ field: m[1], op: m[2], value: m[3].replace(/^['"]|['"]$/g, '') });
    }
    return conds;
  }

  function _matchesAll(row, conds) {
    if (!conds.length) return true;
    return conds.every((c) => {
      const v = row[c.field];
      const cmp = c.value;
      const vNum = Number(v);
      const cNum = Number(cmp);
      const both = Number.isFinite(vNum) && Number.isFinite(cNum);
      const eq = both ? vNum === cNum : String(v) === cmp;
      switch (c.op) {
        case '=':  return eq;
        case '!=': return !eq;
        case '>':  return both ? vNum > cNum : String(v) > cmp;
        case '<':  return both ? vNum < cNum : String(v) < cmp;
        case '>=': return both ? vNum >= cNum : String(v) >= cmp;
        case '<=': return both ? vNum <= cNum : String(v) <= cmp;
        default:   return false;
      }
    });
  }

  function _agg(func, field, list) {
    if (!Array.isArray(list)) return null;
    if (func === 'COUNT') return list.length;
    if (!field || field === '*') return list.length;
    const nums = list
      .map((r) => Number(r[field]))
      .filter((n) => Number.isFinite(n));
    if (!nums.length) return 0;
    if (func === 'SUM') return nums.reduce((a, b) => a + b, 0);
    if (func === 'AVG') return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
    if (func === 'MAX') return Math.max(...nums);
    if (func === 'MIN') return Math.min(...nums);
    return null;
  }

  function evaluate(expr, list) {
    try {
      const trimmed = String(expr || '').trim().replace(/^=\s*/, ''); // = 접두 허용
      const m1 = trimmed.match(FUNC_RE);
      if (!m1) return null;
      const func = m1[1].toUpperCase();
      const inner = m1[2] || '';
      const m2 = inner.match(WHERE_RE);
      if (!m2) return null;
      const field = m2[1];
      const conds = _parseConditions(m2[2] || '');
      const filtered = (Array.isArray(list) ? list : []).filter((r) => _matchesAll(r, conds));
      return _agg(func, field, filtered);
    } catch (e) {
      console.warn('[PVFormula]', e);
      return null;
    }
  }

  // 자주 쓰는 KPI 미리 정의 (탭별)
  const PRESETS = {
    customer: [
      { label: '단골 인원', expr: 'COUNT(name where is_regular=true)' },
      { label: '회원권 보유', expr: 'COUNT(name where membership_active=true)' },
      { label: '평균 방문', expr: 'AVG(visit_count)' },
    ],
    booking: [
      { label: '확정', expr: 'COUNT(id where status=confirmed)' },
      { label: '노쇼', expr: 'COUNT(id where status=no_show)' },
    ],
    revenue: [
      { label: '카드 합계', expr: 'SUM(amount where method=card)' },
      { label: '현금 합계', expr: 'SUM(amount where method=cash)' },
      { label: '평균 객단가', expr: 'AVG(amount)' },
      { label: '최대 매출', expr: 'MAX(amount)' },
    ],
    inventory: [
      { label: '부족 항목', expr: 'COUNT(name where quantity<=3)' },
    ],
    nps: [
      { label: '평균 평점', expr: 'AVG(rating)' },
      { label: '프로모터', expr: 'COUNT(rating where rating>=9)' },
      { label: '이탈자', expr: 'COUNT(rating where rating<=6)' },
    ],
    service: [
      { label: '평균 가격', expr: 'AVG(default_price)' },
    ],
  };

  function getPresets(tab) { return PRESETS[tab] || []; }

  function evaluatePresets(tab, list) {
    try {
      return getPresets(tab).map((p) => ({ label: p.label, expr: p.expr, value: evaluate(p.expr, list) }));
    } catch (_e) { return []; }
  }

  function _formatValue(v) {
    if (v == null) return '—';
    if (typeof v === 'number') {
      if (Math.abs(v) >= 1000) return v.toLocaleString('ko-KR');
      return String(v);
    }
    return String(v);
  }

  // KPI 칩 행 HTML — 합계행 옆에 추가 가능
  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }

  function renderPresetChips(tab, list) {
    try {
      const arr = evaluatePresets(tab, list).filter((p) => p.value != null && p.value !== 0);
      if (!arr.length) return '';
      return `<div class="pv-formula-chips">${arr.map((p) => `
        <span class="pv-formula-chip" title="${_esc(p.expr)}">
          <span class="pv-formula-chip__label">${_esc(p.label)}</span>
          <strong class="pv-formula-chip__value">${_esc(_formatValue(p.value))}</strong>
        </span>
      `).join('')}</div>`;
    } catch (_e) { return ''; }
  }

  window._PVFormula = {
    evaluate,
    getPresets,
    evaluatePresets,
    renderPresetChips,
  };
})();
