/* 사진 편집기 — 템플릿 문구 편집 하단 시트 (PR-S2 2026-06-06)

   PR-S1 의 slot 기반 구조를 사용해, 선택된 템플릿의 문구를 직접 수정한다.
   - 진입 전 갤러리가 템플릿을 먼저 적용(apply-first) → state.tplV2.slotValues 존재.
   - 입력 즉시 state.tplV2.slotValues 갱신 → scheduleRedraw(실제 캔버스) + onChange(갤러리 프리뷰).
   - S3b-1: main_photo 대표 사진 교체 지원. before_photo 는 기존 S3a 흐름 유지.

   외부 노출: window.PhotoEditorTemplateEditSheet = { open, close, isOpen }
*/
(function () {
  'use strict';
  if (window.PhotoEditorTemplateEditSheet) return;

  const MAX_SERVICES = 6;
  let _el = null;
  let _ctx = null;   // { templateId, state, helpers, onChange, slots, values }
  let _raf = 0;
  let _undoTimer = 0;
  const MAIN_MAX_EDGE = 1600;
  const MAIN_JPEG_QUALITY = 0.86;

  function _esc(s) { return window._esc(s); } /* [2026-06-11] 중복 제거 — app-core 정본 위임 */
  function _toast(msg) { if (window.toast) window.toast(msg); else if (window.showToast) window.showToast(msg); }
  const _CLOSE_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  function isOpen() { return !!(_el && _el.style.display !== 'none'); }

  function close() {
    if (_raf) { cancelAnimationFrame(_raf); _raf = 0; }
    _clearUndo();
    if (_el) _el.style.display = 'none';
  }

  function open(opts) {
    const TS = window.PhotoEditorTemplateSlots;
    if (!TS || !opts || !opts.state || !opts.state.tplV2) return;
    const slots = TS.getSlots(opts.templateId, opts.templateData);
    if (!opts.state.tplV2.slotValues) opts.state.tplV2.slotValues = {};
    if (!opts.state.tplV2.imageSlots) opts.state.tplV2.imageSlots = {};
    _ctx = { templateId: opts.templateId, state: opts.state, helpers: opts.helpers, onChange: opts.onChange, slots: slots, values: opts.state.tplV2.slotValues };
    _ensureEl();
    _syncFooter();
    _el.querySelector('[data-edit-body]').innerHTML = slots.map(s => _fieldHTML(s, _ctx.values)).join('');
    _bindFields();
    _el.style.display = 'flex';
    _el.querySelector('[data-edit-body]').scrollTop = 0;
  }

  function _ensureEl() {
    if (_el) return;
    _el = document.createElement('div');
    _el.className = 'pe-tpl-edit';
    _el.style.display = 'none';
    _el.innerHTML = `
      <div class="pe-tpl-edit-scrim" data-edit-close></div>
      <div class="pe-tpl-edit-sheet" role="dialog" aria-label="문구 편집">
        <div class="pe-tpl-edit-head">
          <span class="pe-tpl-edit-handle" aria-hidden="true"></span>
          <strong>문구 편집</strong>
          <button type="button" class="pe-tpl-edit-x" data-edit-close aria-label="닫기">${_CLOSE_SVG}</button>
        </div>
        <div class="pe-tpl-edit-body" data-edit-body></div>
        <div class="pe-tpl-edit-foot">
          <div class="pe-tpl-edit-savehint" data-edit-savehint></div>
          <div class="pe-tpl-edit-actions">
            <button type="button" class="pe-tpl-edit-cancel" data-edit-close>닫기</button>
            <button type="button" class="pe-tpl-edit-save" data-edit-save>저장 화면으로 이동</button>
            <button type="button" class="pe-tpl-edit-apply" data-edit-apply>적용하고 닫기</button>
          </div>
        </div>
      </div>`;
    const host = document.getElementById('photoEditorSheet') || document.body;
    host.appendChild(_el);
    _el.querySelectorAll('[data-edit-close]').forEach(b => b.addEventListener('click', close));
    _el.querySelector('[data-edit-apply]').addEventListener('click', () => { close(); _toast('문구를 적용했어요'); });
    _el.querySelector('[data-edit-save]').addEventListener('click', _handleSaveAction);
  }

  function _syncFooter() {
    if (!_el) return;
    const embedded = _isEmbedded();
    const save = _el.querySelector('[data-edit-save]');
    const hint = _el.querySelector('[data-edit-savehint]');
    if (save) save.textContent = embedded ? '작업실에 저장' : '저장 화면으로 이동';
    if (hint) hint.textContent = embedded
      ? '문구는 미리보기에 바로 반영돼요. 저장하면 작업실 사진에 적용돼요.'
      : '문구는 미리보기에 바로 반영돼요. 최종 저장은 저장 화면에서 해요.';
  }

  function _isEmbedded() {
    const st = _ctx && _ctx.state;
    return !!(st && (st.onSave || st.photoSet));
  }

  async function _handleSaveAction() {
    if (!_ctx || !_ctx.helpers) return;
    if (_isEmbedded() && typeof _ctx.helpers.save === 'function') {
      await _ctx.helpers.save();
      close();
      return;
    }
    close();
    // [2026-07-22] 옛 편집기 EntryV6.goto('export') 폴백 제거 — 편집기가 사라져 도달 불가.
    //   현재 호출부(잇비 headless)는 항상 state.onSave 를 주므로 위 임베드 분기로만 간다.
    if (typeof _ctx.helpers.applyStatePatch === 'function') _ctx.helpers.applyStatePatch({ activeTab: 'export' });
    _toast('저장 화면을 열었어요');
  }

  // ── 필드 HTML ──
  function _fieldHTML(slot, values) {
    if (slot.type === 'image') {
      // [S3b] main/after 슬롯은 사진 교체 노출. before 는 기존 S3a 정책 유지.
      if (slot.role === 'main') return _mainSlotHTML(slot);
      if (slot.role === 'before') return _beforeSlotHTML(slot);
      if (slot.role === 'after') return _afterSlotHTML(slot);
      const note = '현재 편집 사진을 사용 중이에요.<br>사진 교체는 다음 단계에서 지원돼요.';
      return `<div class="pe-tpl-edit-field"><label>${_esc(slot.label)}</label>
        <div class="pe-tpl-edit-imgnote">${note}</div></div>`;
    }
    if (slot.type === 'list') {
      return _servicesHTML(slot, Array.isArray(values[slot.key]) ? values[slot.key] : []);
    }
    // [ARCH-1] choice — 칩 선택(예: 색상 테마). 옵션 중 현재값 활성 표시.
    if (slot.type === 'choice') {
      const opts = Array.isArray(slot.options) ? slot.options : [];
      const cur = values[slot.key] != null ? values[slot.key] : (opts[0] && opts[0].value);
      const chips = opts.map(o => `<button type="button" class="pe-tpl-edit-choice${o.value === cur ? ' is-on' : ''}" data-choice-key="${_esc(slot.key)}" data-choice-val="${_esc(o.value)}">${_esc(o.label)}</button>`).join('');
      return `<div class="pe-tpl-edit-field"><label>${_esc(slot.label)}</label>
        <div class="pe-tpl-edit-choices" style="display:flex;gap:8px;flex-wrap:wrap;">${chips}</div></div>`;
    }
    const v = values[slot.key];
    if (slot.type === 'textarea') {
      const max = slot.max || 120;
      return `<div class="pe-tpl-edit-field"><label>${_esc(slot.label)}<span class="pe-tpl-edit-count" data-count-for="${slot.key}">${String(v || '').length}/${max}</span></label>
        <textarea data-edit-key="${slot.key}" maxlength="${max}" rows="3">${_esc(v || '')}</textarea></div>`;
    }
    return `<div class="pe-tpl-edit-field"><label>${_esc(slot.label)}</label>
      <input type="text" data-edit-key="${slot.key}" maxlength="${slot.max || 40}" value="${_esc(v || '')}" /></div>`;
  }

  function _mainSlot() {
    const slots = _ctx && _ctx.state && _ctx.state.tplV2 && _ctx.state.tplV2.imageSlots;
    if (!slots.main_photo) slots.main_photo = { src: '', fit: 'cover', focal: { x: 0.5, y: 0.5 } };
    return slots.main_photo;
  }

  function _afterSlot() {
    const slots = _ctx && _ctx.state && _ctx.state.tplV2 && _ctx.state.tplV2.imageSlots;
    if (!slots.after_photo) slots.after_photo = { src: '', fit: 'cover', focal: { x: 0.5, y: 0.5 } };
    return slots.after_photo;
  }

  // [S4-2] 슬롯 객체(focal/zoom 보장) — main_photo/after_photo/before_photo 공통 조정용.
  function _imgSlot(key) {
    const slots = _ctx && _ctx.state && _ctx.state.tplV2 && _ctx.state.tplV2.imageSlots;
    if (!slots) return null;
    if (!slots[key]) slots[key] = { src: '', fit: 'cover', focal: { x: 0.5, y: 0.5 }, zoom: 1 };
    if (!slots[key].focal) slots[key].focal = { x: 0.5, y: 0.5 };
    if (slots[key].zoom == null) slots[key].zoom = 1;
    return slots[key];
  }

  // [S4-2] 위치/확대 조정 블록 HTML — 미니 프리뷰(드래그=focal) + zoom 슬라이더 + 초기화.
  function _slotAdjustHTML(slotKey, src) {
    const s = _imgSlot(slotKey) || { focal: { x: 0.5, y: 0.5 }, zoom: 1 };
    const fx = (s.focal && s.focal.x) || 0.5, fy = (s.focal && s.focal.y) || 0.5, z = s.zoom || 1;
    const prevStyle = 'touch-action:none;width:100%;max-width:160px;aspect-ratio:4/5;border-radius:10px;overflow:hidden;cursor:grab;'
      + 'background-repeat:no-repeat;background-color:#eee;'
      + `background-image:url('${_esc(src || '')}');background-size:${(z * 100).toFixed(0)}% auto;background-position:${(fx * 100).toFixed(1)}% ${(fy * 100).toFixed(1)}%;`;
    return `<div class="pe-tpl-edit-adjust" data-slot-adjust="${_esc(slotKey)}" style="margin-top:8px;display:flex;gap:10px;align-items:center;">
      <div class="pe-tpl-edit-adjust-prev" data-adjust-prev style="${prevStyle}"></div>
      <div class="pe-tpl-edit-adjust-ctrl" style="flex:1;display:flex;flex-direction:column;gap:6px;font-size:12px;color:#6b7684;">
        <span>위치는 드래그, 확대는 슬라이더</span>
        <input type="range" min="1" max="3" step="0.05" value="${z}" data-adjust-zoom aria-label="확대" style="width:100%;" />
        <button type="button" data-adjust-reset style="align-self:flex-start;padding:4px 10px;border:0.5px solid #E5E8EB;border-radius:8px;background:#fff;color:#4E5968;cursor:pointer;">초기화</button>
      </div>
    </div>`;
  }

  function _mainSlotHTML(slot) {
    const main = _mainSlot();
    const has = !!(main && main.src);
    const thumb = has
      ? `<img src="${_esc(main.src)}" alt="">`
      : '<span class="pe-tpl-edit-imgplus">＋</span>';
    const stateText = has ? '선택한 대표 사진을 사용 중이에요.' : '현재 편집 사진을 사용 중이에요.';
    return `<div class="pe-tpl-edit-field pe-tpl-edit-imgslot" data-img-slot="main">
      <label>${_esc(slot.label || '대표 사진')}</label>
      <div class="pe-tpl-edit-imgrow">
        <div class="pe-tpl-edit-imgthumb${has ? '' : ' is-empty'}" data-img-thumb>${thumb}</div>
        <div class="pe-tpl-edit-imgbtns">
          <button type="button" class="pe-tpl-edit-imgpick" data-img-pick>${has ? '다른 사진' : '파일에서 선택'}</button>
          <button type="button" class="pe-tpl-edit-imgclear" data-img-clear>현재 편집 사진으로 되돌리기</button>
        </div>
      </div>
      <input type="file" accept="image/*" data-img-input hidden>
      <p class="pe-tpl-edit-imghint" data-main-img-hint>${stateText}</p>
      ${has ? _slotAdjustHTML('main_photo', main.src) : ''}
    </div>`;
  }

  function _afterSlotHTML(slot) {
    const after = _afterSlot();
    const has = !!(after && after.src);
    const thumb = has
      ? `<img src="${_esc(after.src)}" alt="">`
      : '<span class="pe-tpl-edit-imgplus">＋</span>';
    const stateText = has ? '선택한 After 사진을 사용 중이에요.' : '현재 편집 사진을 사용 중이에요.';
    return `<div class="pe-tpl-edit-field pe-tpl-edit-imgslot" data-img-slot="after">
      <label>${_esc(slot.label || '시술 후 사진')}</label>
      <div class="pe-tpl-edit-imgrow">
        <div class="pe-tpl-edit-imgthumb${has ? '' : ' is-empty'}" data-img-thumb>${thumb}</div>
        <div class="pe-tpl-edit-imgbtns">
          <button type="button" class="pe-tpl-edit-imgpick" data-img-pick>${has ? '다른 사진' : '파일에서 선택'}</button>
          <button type="button" class="pe-tpl-edit-imgclear" data-img-clear>현재 편집 사진으로 되돌리기</button>
        </div>
      </div>
      <input type="file" accept="image/*" data-img-input hidden>
      <p class="pe-tpl-edit-imghint" data-after-img-hint>${stateText}</p>
      ${has ? _slotAdjustHTML('after_photo', after.src) : ''}
    </div>`;
  }

  function _servicesHTML(slot, services) {
    const rows = services.slice(0, MAX_SERVICES);
    while (rows.length < 4) rows.push({ name: '', desc: '', price: '' });
    const ph = '가격표를 한 줄에 하나씩 붙여넣어요\n예) 물광케어 8만원\n진정관리 120000\n리프팅관리 150,000원';
    return `<div class="pe-tpl-edit-field pe-tpl-edit-services">
      <label>${_esc(slot.label)} (최대 ${MAX_SERVICES}개)<span class="pe-tpl-edit-svc-actions">
        <button type="button" class="pe-tpl-edit-pastebtn" data-svc-paste>붙여넣기</button>
        <button type="button" class="pe-tpl-edit-addrow" data-svc-add>+ 항목 추가</button></span></label>
      <div class="pe-tpl-edit-paste" data-svc-paste-box hidden>
        <textarea data-svc-paste-input rows="4" placeholder="${_esc(ph)}"></textarea>
        <div class="pe-tpl-edit-paste-foot">
          <button type="button" class="pe-tpl-edit-paste-cancel" data-svc-paste-cancel>취소</button>
          <button type="button" class="pe-tpl-edit-paste-apply" data-svc-paste-apply>자동 배치</button></div></div>
      <div data-svc-list>${rows.map((r, i) => _svcRowHTML(r, i)).join('')}</div></div>`;
  }
  function _svcRowHTML(r, i) {
    return `<div class="pe-tpl-edit-svc-row" data-svc-row="${i}">
      <div class="pe-tpl-edit-svc-no">${i + 1}</div>
      <div class="pe-tpl-edit-svc-fields">
        <input type="text" data-svc="name" placeholder="시술명" value="${_esc(r.name || '')}" />
        <div class="pe-tpl-edit-svc-line">
          <input type="text" data-svc="desc" placeholder="설명 (선택)" value="${_esc(r.desc || '')}" />
          <input type="text" data-svc="price" placeholder="가격" value="${_esc(r.price || '')}" inputmode="numeric" />
        </div>
      </div>
      <button type="button" class="pe-tpl-edit-svc-del" data-svc-del aria-label="삭제">${_CLOSE_SVG}</button></div>`;
  }

  // [S3a] before 사진 슬롯 — 현재 secondImg 썸네일 + 파일 선택/비우기
  function _beforeSlotHTML(slot) {
    const img = _ctx && _ctx.state && _ctx.state.secondImg;
    const has = !!img;
    const thumb = has
      ? `<img src="${_esc(img.src || '')}" alt="">`
      : '<span class="pe-tpl-edit-imgplus">＋</span>';
    return `<div class="pe-tpl-edit-field pe-tpl-edit-imgslot" data-img-slot="before">
      <label>${_esc(slot.label)}</label>
      <div class="pe-tpl-edit-imgrow">
        <div class="pe-tpl-edit-imgthumb${has ? '' : ' is-empty'}" data-img-thumb>${thumb}</div>
        <div class="pe-tpl-edit-imgbtns">
          <button type="button" class="pe-tpl-edit-imgpick" data-img-pick>${has ? '다른 사진' : '파일에서 선택'}</button>
          ${has ? '<button type="button" class="pe-tpl-edit-imgclear" data-img-clear>비우기</button>' : ''}
        </div>
      </div>
      <input type="file" accept="image/*" data-img-input hidden>
      <p class="pe-tpl-edit-imghint">시술 전 사진을 넣으면 전후가 완성돼요. (시술 후는 현재 편집 사진)</p>
      ${has ? _slotAdjustHTML('before_photo', (img && img.src) || '') : ''}
    </div>`;
  }

  // ── 바인딩 ──
  function _bindFields() {
    _el.querySelectorAll('[data-edit-key]').forEach((inp) => {
      inp.addEventListener('input', () => {
        _ctx.values[inp.dataset.editKey] = inp.value;
        const c = _el.querySelector('[data-count-for="' + inp.dataset.editKey + '"]');
        if (c) c.textContent = inp.value.length + '/' + inp.maxLength;
        _schedule();
      });
    });
    // [ARCH-1] choice 칩 — 클릭 시 값 갱신 + 활성 토글 + 즉시 redraw.
    _el.querySelectorAll('[data-choice-val]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.choiceKey, val = btn.dataset.choiceVal;
        _ctx.values[key] = val;
        _el.querySelectorAll(`[data-choice-key="${key}"]`).forEach(b => b.classList.toggle('is-on', b === btn));
        try { if (_ctx.helpers && _ctx.helpers.pushHistory) _ctx.helpers.pushHistory(); } catch (_e) { /* ignore */ }
        _schedule();
      });
    });
    _el.querySelectorAll('[data-svc-row]').forEach(_bindSvcRow);
    _el.querySelector('[data-svc-add]')?.addEventListener('click', _addSvcRow);
    _el.querySelector('[data-svc-paste]')?.addEventListener('click', () => _togglePaste());
    _el.querySelector('[data-svc-paste-cancel]')?.addEventListener('click', () => _togglePaste(false));
    _el.querySelector('[data-svc-paste-apply]')?.addEventListener('click', _applyPaste);
    _el.querySelectorAll('[data-img-slot="before"]').forEach(_bindImgSlot);
    _el.querySelectorAll('[data-img-slot="main"]').forEach(_bindMainImgSlot);
    _el.querySelectorAll('[data-img-slot="after"]').forEach(_bindAfterImgSlot);
  }

  // [S4-2] 위치(드래그=focal)/확대(슬라이더=zoom)/초기화 바인딩. 값은 slot 에 저장 → _schedule(즉시 redraw).
  function _bindSlotAdjust(box, slotKey) {
    const wrap = box.querySelector('[data-slot-adjust]'); if (!wrap) return;
    const prev = wrap.querySelector('[data-adjust-prev]');
    const zoomEl = wrap.querySelector('[data-adjust-zoom]');
    const resetEl = wrap.querySelector('[data-adjust-reset]');
    const slot = _imgSlot(slotKey); if (!slot) return;
    const sync = () => { if (!prev) return; const z = slot.zoom || 1; prev.style.backgroundSize = (z * 100).toFixed(0) + '% auto'; prev.style.backgroundPosition = (slot.focal.x * 100).toFixed(1) + '% ' + (slot.focal.y * 100).toFixed(1) + '%'; };
    const pushH = () => { try { if (_ctx.helpers && _ctx.helpers.pushHistory) _ctx.helpers.pushHistory(); } catch (_e) { /* ignore */ } };
    let drag = null;
    if (prev) {
      prev.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, fx: slot.focal.x, fy: slot.focal.y, w: prev.clientWidth || 1, h: prev.clientHeight || 1 }; try { prev.setPointerCapture(e.pointerId); } catch (_e) { /* ignore */ } prev.style.cursor = 'grabbing'; });
      prev.addEventListener('pointermove', (e) => { if (!drag) return; e.preventDefault(); slot.focal = { x: Math.max(0, Math.min(1, drag.fx + (e.clientX - drag.x) / drag.w)), y: Math.max(0, Math.min(1, drag.fy + (e.clientY - drag.y) / drag.h)) }; sync(); _schedule(); });
      const end = () => { if (!drag) return; drag = null; prev.style.cursor = 'grab'; pushH(); };
      prev.addEventListener('pointerup', end); prev.addEventListener('pointercancel', end);
    }
    if (zoomEl) zoomEl.addEventListener('input', () => { slot.zoom = parseFloat(zoomEl.value) || 1; sync(); _schedule(); });
    if (zoomEl) zoomEl.addEventListener('change', pushH);
    if (resetEl) resetEl.addEventListener('click', () => { slot.focal = { x: 0.5, y: 0.5 }; slot.zoom = 1; if (zoomEl) zoomEl.value = '1'; sync(); _schedule(); pushH(); });
  }

  function _bindMainImgSlot(box) {
    _bindSlotAdjust(box, 'main_photo');
    const input = box.querySelector('[data-img-input]');
    box.querySelector('[data-img-pick]')?.addEventListener('click', () => input && input.click());
    box.querySelector('[data-img-clear]')?.addEventListener('click', () => _setMainPhoto(''));
    input?.addEventListener('change', async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      try {
        const out = await _compressMainPhoto(f);
        _setMainPhoto(out.dataUrl, false);
        if (out.reduced) _toast('사진을 편집용 크기로 줄였어요');
        else _toast('대표 사진을 변경했어요');
      } catch (err) {
        console.warn('[template-edit] main photo load failed', err);
        _toast('사진을 불러오지 못했어요');
      } finally {
        input.value = '';
      }
    });
  }

  function _compressMainPhoto(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        try { resolve(_mainPhotoDataURL(img)); } catch (err) { reject(err); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image_load_failed')); };
      img.src = url;
    });
  }

  function _mainPhotoDataURL(img) {
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    if (!iw || !ih) throw new Error('invalid_image_size');
    const scale = Math.min(1, MAIN_MAX_EDGE / Math.max(iw, ih));
    const w = Math.max(1, Math.round(iw * scale));
    const h = Math.max(1, Math.round(ih * scale));
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    cv.getContext('2d').drawImage(img, 0, 0, w, h);
    return { dataUrl: cv.toDataURL('image/jpeg', MAIN_JPEG_QUALITY), reduced: scale < 1 };
  }

  function _setMainPhoto(src, showToast) {
    const main = _mainSlot();
    main.src = src || '';
    main.fit = 'cover';
    main.focal = main.focal || { x: 0.5, y: 0.5 };
    _primeMainPhoto(main.src);
    _refreshMainSlot();
    try { if (_ctx.helpers && _ctx.helpers.pushHistory) _ctx.helpers.pushHistory(); } catch (_e) { /* ignore */ }
    _schedule();
    if (showToast !== false) _toast(main.src ? '대표 사진을 변경했어요' : '현재 편집 사진을 사용해요');
  }

  function _primeMainPhoto(src) {
    if (!src || !window.PhotoEditorPremiumTemplates || !window.PhotoEditorPremiumTemplates.primeImage) return;
    const img = new Image();
    img.onload = () => window.PhotoEditorPremiumTemplates.primeImage(src, img);
    img.src = src;
  }

  function _refreshMainSlot() {
    const box = _el.querySelector('[data-img-slot="main"]');
    const slot = (_ctx.slots || []).find(s => s.type === 'image' && s.role === 'main');
    if (!box || !slot) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = _mainSlotHTML(slot);
    const fresh = tmp.firstElementChild;
    box.replaceWith(fresh);
    _bindMainImgSlot(fresh);
  }

  function _bindAfterImgSlot(box) {
    _bindSlotAdjust(box, 'after_photo');
    const input = box.querySelector('[data-img-input]');
    box.querySelector('[data-img-pick]')?.addEventListener('click', () => input && input.click());
    box.querySelector('[data-img-clear]')?.addEventListener('click', () => _setAfterPhoto(''));
    input?.addEventListener('change', async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      try {
        const out = await _compressMainPhoto(f);
        _setAfterPhoto(out.dataUrl, false);
        if (out.reduced) _toast('사진을 편집용 크기로 줄였어요');
        else _toast('After 사진을 변경했어요');
      } catch (err) {
        console.warn('[template-edit] after photo load failed', err);
        _toast('사진을 불러오지 못했어요');
      } finally {
        input.value = '';
      }
    });
  }

  function _setAfterPhoto(src, showToast) {
    const after = _afterSlot();
    after.src = src || '';
    after.fit = 'cover';
    after.focal = after.focal || { x: 0.5, y: 0.5 };
    _primeAfterPhoto(after.src);
    _refreshAfterSlot();
    try { if (_ctx.helpers && _ctx.helpers.pushHistory) _ctx.helpers.pushHistory(); } catch (_e) { /* ignore */ }
    _schedule();
    if (showToast !== false) _toast(after.src ? 'After 사진을 변경했어요' : '현재 편집 사진을 사용해요');
  }

  function _primeAfterPhoto(src) {
    if (!src || !window.PhotoEditorBACompose || !window.PhotoEditorBACompose.primeImage) return;
    const img = new Image();
    img.onload = () => window.PhotoEditorBACompose.primeImage(src, img);
    img.src = src;
  }

  function _refreshAfterSlot() {
    const box = _el.querySelector('[data-img-slot="after"]');
    const slot = (_ctx.slots || []).find(s => s.type === 'image' && s.role === 'after');
    if (!box || !slot) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = _afterSlotHTML(slot);
    const fresh = tmp.firstElementChild;
    box.replaceWith(fresh);
    _bindAfterImgSlot(fresh);
  }

  // [S3a] before 슬롯 바인딩
  function _bindImgSlot(box) {
    _bindSlotAdjust(box, 'before_photo');
    const input = box.querySelector('[data-img-input]');
    box.querySelector('[data-img-pick]')?.addEventListener('click', () => input && input.click());
    box.querySelector('[data-img-clear]')?.addEventListener('click', () => _setBefore(null));
    input?.addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const img = new Image();
      // [2026-09-03] objectURL 회수 누락 — 사진을 고를 때마다 blob 이 쌓였다(같은 파일 슬롯을 여러 번 바꾸면 계속 누적).
      //   같은 파일을 다시 고를 수 있게 input.value 도 비운다(change 가 안 터져 '눌러도 반응 없음'이 되던 것).
      const _u = URL.createObjectURL(f);
      const _free = () => { try { URL.revokeObjectURL(_u); } catch (_e) { /* 이미 회수됨 */ } };
      img.onload = () => { _free(); _setBefore(img); };
      img.onerror = () => { _free(); _toast('사진을 불러오지 못했어요'); };
      img.src = _u;
      e.target.value = '';
    });
  }

  function _setBefore(img) {
    if (!_ctx || !_ctx.state) return;
    _ctx.state.secondImg = img;   // ba-compose _beforeCanvas 가 읽음(없으면 placeholder)
    _refreshBeforeSlot();
    try { if (_ctx.helpers && _ctx.helpers.pushHistory) _ctx.helpers.pushHistory(); } catch (_e) { /* ignore */ }
    _schedule();
  }

  function _refreshBeforeSlot() {
    const box = _el.querySelector('[data-img-slot="before"]');
    const slot = (_ctx.slots || []).find(s => s.type === 'image' && s.role === 'before');
    if (!box || !slot) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = _beforeSlotHTML(slot);
    const fresh = tmp.firstElementChild;
    box.replaceWith(fresh);
    _bindImgSlot(fresh);
  }

  function _bindSvcRow(row) {
    row.querySelectorAll('input').forEach((inp) => inp.addEventListener('input', () => { _collectServices(); _schedule(); }));
    const price = row.querySelector('[data-svc="price"]');
    price?.addEventListener('blur', (e) => {
      const FT = window.PhotoEditorTemplateFitText;
      if (FT && e.target.value.trim()) { e.target.value = FT.formatPrice(e.target.value); _collectServices(); _schedule(); }
    });
    row.querySelector('[data-svc-del]')?.addEventListener('click', () => { row.remove(); _renumberSvc(); _collectServices(); _schedule(); });
  }

  function _addSvcRow() {
    const list = _el.querySelector('[data-svc-list]');
    if (!list || list.querySelectorAll('[data-svc-row]').length >= MAX_SERVICES) return;
    list.insertAdjacentHTML('beforeend', _svcRowHTML({}, list.children.length));
    _bindSvcRow(list.lastElementChild);
    _renumberSvc();
  }

  function _renumberSvc() {
    _el.querySelectorAll('[data-svc-row]').forEach((r, i) => { r.dataset.svcRow = i; r.querySelector('.pe-tpl-edit-svc-no').textContent = i + 1; });
  }

  function _collectServices() {
    const list = [];
    _el.querySelectorAll('[data-svc-row]').forEach((row) => {
      const name = row.querySelector('[data-svc="name"]').value.trim();
      const desc = row.querySelector('[data-svc="desc"]').value.trim();
      const price = row.querySelector('[data-svc="price"]').value.trim();
      if (name || price) list.push({ name: name, desc: desc, price: price });
    });
    _ctx.values.services = list;   // _ctx.values === state.tplV2.slotValues (동일 참조)
  }

  // ── 붙여넣기 자동 배치 (S5a) ──
  // services 행 DOM 을 주어진 배열로 재구성(전체 교체). 편집 affordance 위해 최소 4행 패딩.
  function _renderSvcList(rows) {
    const list = _el.querySelector('[data-svc-list]');
    if (!list) return;
    const arr = (rows || []).slice(0, MAX_SERVICES).map(r => ({ name: r.name || '', desc: r.desc || '', price: r.price || '' }));
    while (arr.length < 4) arr.push({ name: '', desc: '', price: '' });
    list.innerHTML = arr.map((r, i) => _svcRowHTML(r, i)).join('');
    list.querySelectorAll('[data-svc-row]').forEach(_bindSvcRow);
  }

  function _togglePaste(show) {
    const box = _el.querySelector('[data-svc-paste-box]');
    if (!box) return;
    const open = (show === undefined) ? box.hasAttribute('hidden') : !!show;
    if (open) { box.removeAttribute('hidden'); box.querySelector('[data-svc-paste-input]')?.focus(); }
    else { box.setAttribute('hidden', ''); }
  }

  function _applyPaste() {
    const FT = window.PhotoEditorTemplateFitText;
    const ta = _el.querySelector('[data-svc-paste-input]');
    if (!FT || !FT.parseServicePrices || !ta) return;
    if (!ta.value.trim()) { _toast('붙여넣을 가격표를 입력해 주세요'); return; }
    // 가격 없는 줄은 name 만 반영, 빈 줄은 parseServicePrices 가 무시.
    const parsed = (FT.parseServicePrices(ta.value) || []).filter(r => (r.name || r.price));
    if (!parsed.length) { _toast('가격표를 인식하지 못했어요'); return; }
    const over = parsed.length > MAX_SERVICES;
    const rows = parsed.slice(0, MAX_SERVICES).map(r => ({ name: r.name || '', desc: '', price: r.price || '' }));
    const prev = (_ctx.values.services || []).map(r => ({ name: r.name || '', desc: r.desc || '', price: r.price || '' }));
    _renderSvcList(rows);          // 전체 교체(overwrite)
    _collectServices();
    _schedule();
    _togglePaste(false);
    ta.value = '';
    _showUndo(prev, over);
  }

  function _showUndo(prevServices, over) {
    _clearUndo();
    const sheet = _el && _el.querySelector('.pe-tpl-edit-sheet');
    if (!sheet) return;
    const msg = over ? ('가격표 ' + MAX_SERVICES + '개까지 자동 배치했어요') : '가격표를 자동 배치했어요';
    const el = document.createElement('div');
    el.className = 'pe-tpl-edit-undo';
    el.innerHTML = '<span>' + _esc(msg) + '</span><button type="button" data-undo>되돌리기</button>';
    sheet.appendChild(el);
    el.querySelector('[data-undo]').addEventListener('click', () => {
      _renderSvcList(prevServices);
      _collectServices();
      _schedule();
      _clearUndo();
      _toast('되돌렸어요');
    });
    _undoTimer = setTimeout(_clearUndo, 5000);
  }

  function _clearUndo() {
    if (_undoTimer) { clearTimeout(_undoTimer); _undoTimer = 0; }
    const ex = _el && _el.querySelector('.pe-tpl-edit-undo');
    if (ex) ex.remove();
  }

  // 입력 즉시 state 반영(위에서 완료), 렌더만 rAF 디바운스.
  function _schedule() {
    if (_raf) return;
    _raf = requestAnimationFrame(() => {
      _raf = 0;
      try { if (_ctx && _ctx.helpers && _ctx.helpers.scheduleRedraw) _ctx.helpers.scheduleRedraw(); } catch (_e) { /* ignore */ }
      try { if (_ctx && _ctx.onChange) _ctx.onChange(); } catch (_e) { /* ignore */ }
    });
  }

  window.PhotoEditorTemplateEditSheet = { open: open, close: close, isOpen: isOpen };
})();
