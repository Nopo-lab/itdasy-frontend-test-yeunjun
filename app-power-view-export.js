/* ─────────────────────────────────────────────────────────────
   파워뷰 — CSV Export (Phase 2 · 2026-05-09)

   현재 탭의 list (검색·정렬·필터 후) 를 CSV Blob 다운로드.
   엑셀에서 그대로 열 수 있게 BOM (﻿) 포함, ; 구분 옵션 지원.

   ── 가드레일 ──
   1. 백엔드 신규 0 — 클라에서만 직렬화
   2. 모듈 미로드 시 빈 함수
   3. 파일 ≤200줄

   사용:
     window._PVExport.downloadCSV(tab, list)
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window._PVExport) return;

  function _toast(msg) { try { if (typeof window.showToast === 'function') window.showToast(msg); } catch (_e) { /* silent */ } }

  // 탭별 CSV 컬럼 정의 — schema.headers 와 일치
  const COLS = {
    customer:  [
      { h: '이름', f: (r) => r.name || '' },
      { h: '전화', f: (r) => r.phone || '' },
      { h: '메모', f: (r) => r.memo || '' },
      { h: '단골', f: (r) => r.is_regular ? 'Y' : '' },
      { h: '회원권', f: (r) => r.membership_active ? 'Y' : '' },
      { h: '잔액', f: (r) => Number(r.membership_balance || 0) },
      { h: '방문', f: (r) => Number(r.visit_count || 0) },
      { h: '매너점수', f: (r) => r.manner_score == null ? '' : Number(r.manner_score) },
      { h: '노쇼횟수', f: (r) => Number(r.no_show_count || 0) },
    ],
    booking: [
      { h: '고객', f: (r) => r.customer_name || '' },
      { h: '시술', f: (r) => r.service_name || '' },
      { h: '시작', f: (r) => (r.starts_at || '').replace('T', ' ').slice(0, 16) },
      { h: '소요(분)', f: (r) => Number(r.duration_min || 0) },
      { h: '상태', f: (r) => r.status || 'confirmed' },
      { h: '메모', f: (r) => r.memo || '' },
    ],
    revenue: [
      { h: '고객', f: (r) => r.customer_name || '' },
      { h: '시술', f: (r) => r.service_name || '' },
      { h: '금액', f: (r) => Number(r.amount || 0) },
      { h: '결제수단', f: (r) => ({ card: '카드', cash: '현금', transfer: '이체', membership: '회원권' }[r.method] || r.method || '') },
      { h: '실수령', f: (r) => Number(r.net_amount || 0) },
      { h: '결제일시', f: (r) => (r.recorded_at || '').replace('T', ' ').slice(0, 16) },
      { h: '메모', f: (r) => r.memo || '' },
    ],
    inventory: [
      { h: '품목', f: (r) => r.name || '' },
      { h: '수량', f: (r) => Number(r.quantity || 0) },
      { h: '단위', f: (r) => r.unit || '' },
      { h: '임계값', f: (r) => Number(r.threshold || 0) },
      { h: '카테고리', f: (r) => r.category || '' },
    ],
    nps: [
      { h: '평점', f: (r) => Number(r.rating || 0) },
      { h: '코멘트', f: (r) => r.comment || '' },
      { h: '출처', f: (r) => r.source || '' },
      { h: '응답일시', f: (r) => (r.responded_at || '').replace('T', ' ').slice(0, 16) },
      { h: '고객', f: (r) => r.customer_name || '' },
    ],
    service: [
      { h: '시술명', f: (r) => r.name || '' },
      { h: '기본금액', f: (r) => Number(r.default_price || 0) },
      { h: '소요분', f: (r) => Number(r.default_duration_min || 0) },
      { h: '카테고리', f: (r) => r.category || '' },
    ],
  };

  function _csvEscape(v) {
    if (v == null) return '';
    const s = String(v);
    if (/[",\n;]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function _toCSV(tab, list) {
    const cols = COLS[tab];
    if (!cols) return '';
    const header = cols.map((c) => _csvEscape(c.h)).join(',');
    const rows = (list || []).map((r) => cols.map((c) => {
      try { return _csvEscape(c.f(r)); } catch (_e) { return ''; }
    }).join(','));
    return [header, ...rows].join('\r\n');
  }

  function _filename(tab) {
    const t = new Date();
    const ymd = t.getFullYear() + String(t.getMonth() + 1).padStart(2, '0') + String(t.getDate()).padStart(2, '0');
    const hm = String(t.getHours()).padStart(2, '0') + String(t.getMinutes()).padStart(2, '0');
    const tabKor = ({ customer:'손님', booking:'예약', revenue:'매출', inventory:'재고', nps:'후기', service:'시술' }[tab] || tab);
    return `잇데이_${tabKor}_${ymd}_${hm}.csv`;
  }

  function downloadCSV(tab, list) {
    try {
      const csv = _toCSV(tab, list);
      if (!csv) { _toast('내보낼 항목이 없어요'); return; }
      // ﻿ BOM 으로 엑셀 한글 깨짐 방지
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = _filename(tab);
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        try { document.body.removeChild(a); } catch (_e) { /* silent */ }
        URL.revokeObjectURL(url);
      }, 100);
      _toast('CSV 내려받았어요');
    } catch (e) {
      console.warn('[PVExport] downloadCSV', e);
      _toast('내보내기 실패 — 다시 시도해주세요');
    }
  }

  window._PVExport = { downloadCSV };
})();
