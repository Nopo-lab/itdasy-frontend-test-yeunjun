/* 사진 편집기 — 스티커 라이브러리 (v205 2026-05-19)
   v204 다중 레이어 시스템 활용 — 스티커 = 미리 정의된 텍스트 + 스타일 + 배경 박스.
   진짜 SVG 스티커는 P3+ 에서 assets 작업 추가.

   카테고리 6종 × 5개 = 30 스티커:
     • 가격     (price)   — 가격·할인 표기
     • 화살표   (arrow)   — 방향·강조
     • 별점     (star)    — 평점 표시
     • 시술     (service) — 뷰티 도메인 키워드
     • 감정     (emotion) — 만족·하트
     • 이벤트   (event)   — 신상·세일

   기능:
     • 텍스트 탭에 '🎨 스티커' 버튼 — 클릭 시 모달
     • 카테고리 chip + 스티커 grid
     • 클릭 → 새 layer (prefilled) 추가 + 모달 닫힘

   외부 의존:
     • window.PhotoEditor (메인 모듈)
     • window.PhotoEditor._internal.helpers (esc, toast, redraw, ...)
   주의: 메인의 _addLayer 같은 internal API 는 window 노출 안 됨.
   대안: 메인의 _state.layers 에 직접 push 가능한 외부 helper 노출 필요.
   → PhotoEditor.addStickerLayer(preset) 신규 API.
*/
(function () {
  'use strict';

  // 스티커 프리셋 — value/color/font/size/bg/stroke
  const PRESETS = {
    price: [
      { value: '50,000원',  color: '#FFC83D', size: 7, bg: true,  stroke: false, font: 'sans' },
      { value: '₩100,000',  color: '#ffffff', size: 8, bg: true,  stroke: false, font: 'sans' },
      { value: '50% OFF',   color: '#ffffff', size: 9, bg: true,  stroke: false, font: 'sans' },
      { value: '특가',      color: '#1a1a20', size: 7, bg: true,  stroke: false, font: 'serif' },
      { value: '신규 할인',  color: '#F18091', size: 6, bg: false, stroke: true,  font: 'sans' },
    ],
    arrow: [
      { value: '↗',         color: '#ffffff', size: 11, bg: false, stroke: true,  font: 'sans' },
      { value: '→',         color: '#FFC83D', size: 10, bg: false, stroke: true,  font: 'sans' },
      { value: '⬇',         color: '#ffffff', size: 10, bg: false, stroke: true,  font: 'sans' },
      { value: '↺ 재방문',   color: '#1a1a20', size: 6,  bg: true,  stroke: false, font: 'sans' },
      { value: '➜ 예약',     color: '#F18091', size: 7,  bg: false, stroke: true,  font: 'sans' },
    ],
    star: [
      { value: '★★★★★',     color: '#FFC83D', size: 8, bg: false, stroke: true,  font: 'sans' },
      { value: '★★★★★ 5.0', color: '#FFC83D', size: 6, bg: true,  stroke: false, font: 'sans' },
      { value: 'BEST',      color: '#ffffff', size: 8, bg: true,  stroke: false, font: 'sans' },
      { value: '인기',      color: '#F18091', size: 7, bg: false, stroke: true,  font: 'serif' },
      { value: '추천 ★',    color: '#FFC83D', size: 7, bg: true,  stroke: false, font: 'sans' },
    ],
    service: [
      { value: 'BEFORE',    color: '#ffffff', size: 8, bg: true,  stroke: false, font: 'sans' },
      { value: 'AFTER',     color: '#FFC83D', size: 8, bg: true,  stroke: false, font: 'sans' },
      { value: 'NEW',       color: '#F18091', size: 9, bg: false, stroke: true,  font: 'sans' },
      { value: '시술 결과',  color: '#1a1a20', size: 6, bg: true,  stroke: false, font: 'serif' },
      { value: '오늘의 손님', color: '#ffffff', size: 6, bg: true,  stroke: false, font: 'hand' },
    ],
    emotion: [
      { value: '♥',         color: '#F18091', size: 11, bg: false, stroke: true,  font: 'sans' },
      { value: '♥♥♥',       color: '#F18091', size: 8,  bg: false, stroke: true,  font: 'sans' },
      { value: '만족 ♥',     color: '#F18091', size: 6,  bg: true,  stroke: false, font: 'hand' },
      { value: '✓ 완성',     color: '#ffffff', size: 7,  bg: true,  stroke: false, font: 'sans' },
      { value: '예뻐요!',    color: '#F18091', size: 7,  bg: false, stroke: true,  font: 'hand' },
    ],
    event: [
      { value: 'EVENT',     color: '#FFC83D', size: 10, bg: true,  stroke: false, font: 'sans' },
      { value: '오픈 기념',  color: '#ffffff', size: 7,  bg: true,  stroke: false, font: 'serif' },
      { value: '한정',      color: '#F18091', size: 9,  bg: false, stroke: true,  font: 'sans' },
      { value: '회원 전용',  color: '#1a1a20', size: 6,  bg: true,  stroke: false, font: 'sans' },
      { value: 'SALE',      color: '#ffffff', size: 11, bg: true,  stroke: false, font: 'sans' },
    ],
  };
  const CATEGORIES = [
    { id: 'price',   label: '가격' },
    { id: 'arrow',   label: '화살표' },
    { id: 'star',    label: '별점' },
    { id: 'service', label: '시술' },
    { id: 'emotion', label: '감정' },
    { id: 'event',   label: '이벤트' },
  ];

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
  }

  let _modal = null;
  let _activeCat = 'price';

  function _renderGrid() {
    const list = PRESETS[_activeCat] || [];
    return list.map((s, i) => {
      const bgStyle = s.bg
        ? (s.color === '#ffffff' || s.color === '#FFC83D'
           ? 'background:rgba(0,0,0,0.7);color:' + s.color + ';'
           : 'background:#fff;color:' + s.color + ';')
        : 'background:transparent;color:' + s.color + ';';
      return `<button type="button" class="pe-sticker-card" data-pe-sticker-i="${i}"
        style="padding:14px 8px;border:1.5px solid rgba(255,255,255,0.08);border-radius:12px;cursor:pointer;${bgStyle};font-size:14px;font-weight:800;display:flex;align-items:center;justify-content:center;min-height:50px;text-align:center;">${_esc(s.value)}</button>`;
    }).join('');
  }

  function _openModal() {
    if (_modal) _modal.remove();
    _modal = document.createElement('div');
    _modal.id = 'peStickerModal';
    _modal.className = 'pe-modal';
    _modal.innerHTML = `
      <div class="pe-modal-backdrop" data-pe-sticker-close></div>
      <div class="pe-modal-card" style="max-width:480px;width:100%;background:#1a1a20;color:#f7f7f9;padding:20px;border-radius:18px 18px 0 0;max-height:80vh;overflow-y:auto;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
          <strong style="font-size:16px;">🎨 스티커 라이브러리</strong>
          <button type="button" class="pe-iconbtn" data-pe-sticker-close aria-label="닫기" style="background:rgba(255,255,255,0.06);border:none;border-radius:50%;width:32px;height:32px;color:#f7f7f9;cursor:pointer;">×</button>
        </div>
        <div class="pe-field-label" style="margin-bottom:8px;">카테고리</div>
        <div class="pe-panel-row" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;">
          ${CATEGORIES.map(c => `<button type="button" class="pe-chip-btn${c.id === _activeCat ? ' on' : ''}" data-pe-sticker-cat="${c.id}">${_esc(c.label)}</button>`).join('')}
        </div>
        <div id="peStickerGrid" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          ${_renderGrid()}
        </div>
        <div class="pe-hint" style="margin-top:14px;">스티커 누르면 새 텍스트 레이어로 추가됩니다. 추가 후 텍스트 탭에서 색·크기·위치 수정 가능.</div>
      </div>
    `;
    document.body.appendChild(_modal);

    _modal.addEventListener('click', (e) => {
      if (e.target.closest('[data-pe-sticker-close]')) { _modal.remove(); _modal = null; return; }
      const catBtn = e.target.closest('[data-pe-sticker-cat]');
      if (catBtn) {
        _activeCat = catBtn.dataset.peStickerCat;
        // chip 활성 + grid 갱신
        _modal.querySelectorAll('[data-pe-sticker-cat]').forEach(b => b.classList.toggle('on', b === catBtn));
        const grid = _modal.querySelector('#peStickerGrid');
        if (grid) grid.innerHTML = _renderGrid();
        return;
      }
      const stickerBtn = e.target.closest('[data-pe-sticker-i]');
      if (stickerBtn) {
        const i = +stickerBtn.dataset.peStickerI;
        const preset = (PRESETS[_activeCat] || [])[i];
        if (preset && window.PhotoEditor && typeof window.PhotoEditor.addStickerLayer === 'function') {
          window.PhotoEditor.addStickerLayer(preset);
        }
        _modal.remove(); _modal = null;
        return;
      }
    });
  }

  // 외부 API
  window.PhotoEditor = window.PhotoEditor || {};
  window.PhotoEditor.openStickerLibrary = _openModal;
})();
