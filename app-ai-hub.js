/* AI 자동화 허브 v3 — 리스트 + 토글 시트 (2026-04-30)
   사용:
     window.openAiHub()   — 시트 열기
     window.closeAiHub()  — 시트 닫기

   디자인: mockups/03-myshop.html "AI · 자동화" 시트
   CSS:    css/screens/myshop-v3.css (.ms-sheet*, .ms-aih*, .ms-toggle*)
   라우트:  7개 항목 → 기존 진입 함수 (변경 X)
*/
(function () {
  'use strict';

  // ── 토글 상태 키 (UI 빠른 ON/OFF — 백엔드 동기화는 상세 시트에서) ─
  const KEY_DM = 'itdasy:aih:dm_enabled';
  const KEY_KAKAO = 'itdasy:aih:kakao_enabled';

  function _getToggle(key) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? true : v === 'true';
    } catch (_e) { return true; }
  }
  function _setToggle(key, on) {
    try { localStorage.setItem(key, on ? 'true' : 'false'); } catch (_e) { void _e; }
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  // ── 행 정의 (7개) ──────────────────────────────────────────────
  // type: 'toggle' | 'tag' | 'badge' | 'plain'
  function _rows() {
    return [
      { act: 'dm', icon: 'ph-chat-circle-dots', boxColor: 'blue',
        name: 'DM 자동응답', meta: '인스타 DM → AI 자동 답장',
        type: 'toggle', toggleKey: KEY_DM },
      { act: 'kakao', icon: 'ph-bell-ringing', boxColor: 'amber',
        name: '카카오 알림톡', meta: '예약확정 · 리마인드 · 생일',
        type: 'toggle', toggleKey: KEY_KAKAO },
      { act: 'persona', icon: 'ph-user-circle-gear', boxColor: 'purple',
        name: 'AI 페르소나', meta: '원장님 말투 학습 · 캡션 일관성',
        type: 'tag', tagText: '학습됨' },
      { act: 'caption', icon: 'ph-pencil-line', boxColor: 'pink',
        name: 'SNS 캡션', meta: '시나리오 · 1초 · 음성 3가지',
        type: 'plain' },
      { act: 'posts', icon: 'ph-squares-four', boxColor: 'teal',
        name: '게시물 관리', meta: '완료 슬롯 · 마무리 탭',
        type: 'plain' },
      { act: 'memo', icon: 'ic-bot', boxColor: 'violet',
        name: '챗봇 메모', meta: '영구 메모 + 자동 학습 패턴',
        type: 'plain' },
      { act: 'capture', icon: 'ph-scan', boxColor: 'violet',
        name: '스마트 캡처', meta: '카톡 · 명함 · 가격표 OCR',
        type: 'badge' },
    ];
  }

  // ── 켜진 개수 (DM ON + 카카오 ON + 페르소나 학습됨 1 고정) ──
  function _onCount() {
    let n = 0;
    if (_getToggle(KEY_DM)) n++;
    if (_getToggle(KEY_KAKAO)) n++;
    n += 1; // 페르소나 학습됨
    return n;
  }

  // ── 행 우측 영역 마크업 ────────────────────────────────────────
  function _rightHtml(row) {
    const chev = `<i class="ph-duotone ph-caret-right" aria-hidden="true"></i>`;
    if (row.type === 'toggle') {
      const on = _getToggle(row.toggleKey);
      return `
        <div class="ms-aih__right">
          <button type="button" class="ms-toggle ${on ? 'is-on' : ''}" data-toggle="${_esc(row.act)}" aria-label="${_esc(row.name)} ${on ? '끄기' : '켜기'}" aria-pressed="${on ? 'true' : 'false'}">
            <span class="ms-toggle__track"></span>
            <span class="ms-toggle__knob"></span>
          </button>
          ${chev}
        </div>`;
    }
    if (row.type === 'tag') {
      return `<div class="ms-aih__right"><span class="ms-aih__tag is-ok">${_esc(row.tagText)}</span>${chev}</div>`;
    }
    if (row.type === 'badge') {
      return `<div class="ms-aih__right">${chev}</div>`;
    }
    return `<div class="ms-aih__right">${chev}</div>`;
  }

  // ── 행 마크업 (NEW 배지는 이름 옆) ─────────────────────────────
  // <button> 안에 <button>(토글) 중첩 invalid HTML — Safari가 분리시킴
  // 그래서 row 자체는 <div role="button"> 으로 래핑
  function _rowHtml(row) {
    const newBadge = row.type === 'badge'
      ? `<span class="ms-aih__badge-new">NEW</span>` : '';
    // Phase1: Phosphor vs 레거시 SVG
    const isPhosphor = row.icon.startsWith('ph-');
    const iconInner = isPhosphor
      ? `<i class="ph-duotone ${_esc(row.icon)}" aria-hidden="true"></i>`
      : `<svg width="16" height="16" aria-hidden="true"><use href="#${_esc(row.icon)}"/></svg>`;
    const boxCls = row.boxColor ? `ic-box ic-box--sm ic-box--${_esc(row.boxColor)}` : '';
    const iconHtml = boxCls
      ? `<span class="${boxCls}">${iconInner}</span>`
      : iconInner;
    return `
      <div class="ms-aih__row" role="button" tabindex="0" data-act="${_esc(row.act)}">
        <span class="ms-aih__icon">${iconHtml}</span>
        <span class="ms-aih__info">
          <span class="ms-aih__name">${_esc(row.name)}${newBadge}</span>
          <span class="ms-aih__meta">${_esc(row.meta)}</span>
        </span>
        ${_rightHtml(row)}
      </div>`;
  }

  // ── 시트 마크업 빌드 ──────────────────────────────────────────
  function _buildSheet() {
    const rows = _rows().map(_rowHtml).join('');
    const sub = `7가지 · ${_onCount()}개 켜짐`;
    return `
      <div class="ms-sheet__overlay" data-close="1"></div>
      <div id="aihCard" class="ms-sheet" role="dialog" aria-modal="true" aria-labelledby="aihTitle">
        <div class="ms-sheet__handle"></div>
        <div class="ms-sheet__head">
          <div class="ms-sheet__head-left">
            <div id="aihTitle" class="ms-sheet__title">AI · 자동화</div>
            <div class="ms-sheet__sub" id="aihSub">${_esc(sub)}</div>
          </div>
          <button type="button" class="ms-sheet__close" data-close="1">닫기</button>
        </div>
        <div class="ms-sheet__body">
          <div class="ms-aih">${rows}</div>
          <div style="margin-top:12px;padding:10px 12px;background:var(--surface-2);border-radius:var(--r-sm);font-size:11px;color:var(--text-subtle);line-height:1.5;">
            토글 있는 항목은 즉시 켜고 끄기 · 행을 누르면 상세 설정으로
          </div>
        </div>
      </div>`;
  }

  // ── 시트 DOM 보장 + 핸들러 바인딩 ──────────────────────────────
  function _ensureSheet() {
    let sheet = document.getElementById('aiHubSheet');
    if (sheet) {
      sheet.innerHTML = _buildSheet();
      // 핸들러는 sheet 엘리먼트에 1회만 attach (innerHTML 교체해도 부모 리스너는 살아남음)
      // 이전엔 매번 attach 해서 N번 open 후 N번 fire → 토글 / route 다중 발생 버그
      return sheet;
    }
    sheet = document.createElement('div');
    sheet.id = 'aiHubSheet';
    sheet.style.cssText = 'position:fixed;inset:0;z-index:9985;display:none;';
    sheet.innerHTML = _buildSheet();
    document.body.appendChild(sheet);
    _bindHandlers(sheet);
    return sheet;
  }

  // ── 핸들러: 닫기 / 토글 / 행 클릭 + 키보드(div role=button 접근성) ──
  function _bindHandlers(sheet) {
    sheet.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) { close(); return; }

      const tgl = e.target.closest('[data-toggle]');
      if (tgl) {
        e.stopPropagation();
        e.stopImmediatePropagation();
        e.preventDefault();
        _onToggleClick(tgl, sheet);
        return;
      }

      const row = e.target.closest('.ms-aih__row');
      if (row) {
        const act = row.dataset.act;
        // [2026-05-12 QA #7] 진입점 함수가 없을 때 sheet 만 닫혀서 사용자가
        // "다른 이상한 페이지로 이동한" 인상 받던 문제. 함수 존재 선검증.
        if (!_canRoute(act)) {
          if (window.showToast) window.showToast('아직 준비 중이에요. 잠시 후 다시 시도해주세요.');
          return; // sheet 유지
        }
        close();
        setTimeout(() => _route(act), 200);
      }
    });
    sheet.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const row = e.target.closest('.ms-aih__row');
      if (!row) return;
      e.preventDefault();
      const act = row.dataset.act;
      if (!_canRoute(act)) {
        if (window.showToast) window.showToast('아직 준비 중이에요.');
        return;
      }
      close();
      setTimeout(() => _route(act), 200);
    });
  }

  // ── 토글 클릭 처리 ────────────────────────────────────────────
  function _onToggleClick(btn, sheet) {
    const act = btn.dataset.toggle;
    const key = act === 'dm' ? KEY_DM : (act === 'kakao' ? KEY_KAKAO : null);
    if (!key) return;
    const next = !_getToggle(key);
    _setToggle(key, next);
    btn.classList.toggle('is-on', next);
    btn.setAttribute('aria-pressed', next ? 'true' : 'false');
    const sub = sheet.querySelector('#aihSub');
    if (sub) sub.textContent = `7가지 · ${_onCount()}개 켜짐`;
    try { window.hapticLight && window.hapticLight(); } catch (_e) { void _e; }
    try {
      window.dispatchEvent(new CustomEvent('itdasy:data-changed', {
        detail: { kind: 'aih_toggle', act, on: next },
      }));
    } catch (_e) { void _e; }
  }

  // ── 7개 항목 라우터 (동작 변경 X) ─────────────────────────────
  const _ROUTE_MAP = {
    dm:      'openDMAutoreplySettings',
    kakao:   'openKakaoHub',
    persona: 'openPersonaSurveyModal',
    caption: 'openCaptionScenarioPopup',
    posts:   null,
    memo:    'openAssistantFactsSheet',
    capture: 'openSmartCapture',
  };

  function _canRoute(act) {
    if (act === 'posts') return typeof window.showTab === 'function';
    const fn = _ROUTE_MAP[act];
    return !!(fn && typeof window[fn] === 'function');
  }

  function _route(act) {
    const map = _ROUTE_MAP;
    if (act === 'posts') {
      try {
        if (typeof window.showTab === 'function') {
          const finishBtn = document.querySelector('.tab-bar__btn[data-tab="finish"]');
          window.showTab('finish', finishBtn || null);
          if (window.showToast) window.showToast('마무리 탭으로 이동했어요');
        } else if (window.showToast) {
          window.showToast('게시물 관리 화면을 찾을 수 없어요');
        }
        if (typeof window.initFinishTab === 'function') window.initFinishTab();
      } catch (e) {
        if (window.showToast) window.showToast('게시물 관리 진입 실패 — ' + (e && e.message || ''));
      }
      return;
    }
    const fnName = map[act];
    if (fnName && typeof window[fnName] === 'function') {
      try { window[fnName](); }
      catch (_e) { if (window.showToast) window.showToast('화면을 여는 중 문제가 생겼어요'); }
    } else if (window.showToast) {
      window.showToast('아직 준비 중이에요');
    }
  }

  // ── 열기/닫기 (시그니처 유지) ─────────────────────────────────
  function open() {
    const sheet = _ensureSheet();
    const card = sheet.querySelector('#aihCard');
    if (window.SheetAnim) window.SheetAnim.open(sheet, card);
    else sheet.style.display = 'block';
  }
  function close() {
    const sheet = document.getElementById('aiHubSheet');
    if (!sheet) return;
    const card = sheet.querySelector('#aihCard');
    if (window.SheetAnim) window.SheetAnim.close(sheet, card);
    else sheet.style.display = 'none';
  }

  window.openAiHub = open;
  window.closeAiHub = close;
  // 2026-05-01 ── 다른 모듈(myshop)에서 ai-hub 와 동일한 카운트 쓸 수 있게 export.
  // 이전엔 myshop 이 자체 키로 0 만 표시했지만 aihub 는 7개 중 3개 ON 으로 표시 → 불일치.
  window.aihGetOnCount = _onCount;
})();
