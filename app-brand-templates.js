/* app-brand-templates.js — 브랜드 템플릿 저장·적용 (§25 P3)
 * 의존: localStorage (`itdasy_brand_kit.templates`). window.BrandKit 있으면 사용.
 *
 * 사용자가 사진 편집기에서 만든 텍스트·워터마크·색상 조합을
 * "이 템플릿 저장" 버튼으로 저장 → 사진 편집기 브랜드 탭 또는 BrandKit 모달에서 1-탭 적용.
 *
 * 저장 구조 (브랜드 키트 객체 내부 `templates` 배열):
 *   {
 *     id: 'tpl_xxx',
 *     name: '봄 핑크 세트',
 *     created_at: 1700000000000,
 *     watermark: { value, position, opacity },
 *     text_style: { value, x, y, color },
 *     brand_color: '#F18091',
 *   }
 *
 * 공개:
 *   BrandTemplates.list()                              → Array<template>
 *   BrandTemplates.save({ name, fromPhotoEditor? })    → template (현재 사진 편집기 상태로부터 저장)
 *   BrandTemplates.saveFromState(name, state)          → template
 *   BrandTemplates.apply(id, opts?)                    → boolean (PhotoEditor._state 갱신 + 다시 그리기)
 *   BrandTemplates.remove(id)                          → boolean
 *   BrandTemplates.openPicker()                        → 1-탭 적용 시트
 */
(function () {
  'use strict';

  const BK_KEY = 'itdasy_brand_kit';
  const MAX_TEMPLATES = 12; // localStorage 1MB 이내 안전치

  function _readKit() {
    try { return JSON.parse(localStorage.getItem(BK_KEY) || '{}') || {}; }
    catch (_e) { return {}; }
  }
  function _writeKit(kit) {
    try { localStorage.setItem(BK_KEY, JSON.stringify(kit || {})); return true; }
    catch (_e) { return false; }
  }

  function _toast(msg, type) {
    if (typeof window.showToast === 'function') window.showToast(msg, type || 'info');
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
  }

  function _genId() {
    return 'tpl_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  }

  function list() {
    const kit = _readKit();
    return Array.isArray(kit.templates) ? kit.templates.slice() : [];
  }

  function _writeList(arr) {
    const kit = _readKit();
    kit.templates = Array.isArray(arr) ? arr : [];
    return _writeKit(kit);
  }

  // 현재 사진 편집기 상태 객체 → 템플릿 객체 정규화.
  function _normalize(name, peState, kit) {
    const wm = (peState && peState.watermark) || {};
    const tx = (peState && peState.text) || {};
    return {
      id: _genId(),
      name: String(name || '').trim() || ('템플릿 ' + new Date().toLocaleDateString('ko-KR')),
      created_at: Date.now(),
      watermark: {
        value: wm.value || '',
        position: wm.position || 'br',
        opacity: typeof wm.opacity === 'number' ? wm.opacity : 0.85,
      },
      text_style: {
        value: tx.value || '',
        x: typeof tx.x === 'number' ? tx.x : 0.5,
        y: typeof tx.y === 'number' ? tx.y : 0.92,
        color: tx.color || '#ffffff',
      },
      brand_color: (kit && kit.brand_color) || '#F18091',
    };
  }

  function saveFromState(name, peState) {
    if (!peState) return null;
    const kit = _readKit();
    const tpl = _normalize(name, peState, kit);
    const arr = Array.isArray(kit.templates) ? kit.templates.slice() : [];
    arr.unshift(tpl);
    while (arr.length > MAX_TEMPLATES) arr.pop();
    if (!_writeList(arr)) {
      _toast('템플릿 저장에 실패했어요 (저장 공간 부족)', 'error');
      return null;
    }
    try { window.dispatchEvent(new CustomEvent('itdasy:brand-templates:updated', { detail: tpl })); }
    catch (_e) { void _e; }
    return tpl;
  }

  // 사진 편집기에서 호출 — PhotoEditor 내부 _state 접근.
  // PhotoEditor._internal 이 없으면 null 반환 (안전).
  function save(opts) {
    opts = opts || {};
    const peState = _readPeState();
    if (!peState) {
      _toast('사진 편집기를 먼저 열어주세요');
      return null;
    }
    const name = opts.name || _promptName();
    if (name === null) return null; // 사용자가 취소
    const tpl = saveFromState(name, peState);
    if (tpl) _toast('템플릿 "' + tpl.name + '"을(를) 저장했어요', 'success');
    return tpl;
  }

  function _promptName() {
    try {
      const v = window.prompt('템플릿 이름 (예: 봄 핑크 세트)', '');
      if (v == null) return null;
      return String(v).trim() || ('템플릿 ' + new Date().toLocaleString('ko-KR'));
    } catch (_e) { return '템플릿 ' + Date.now(); }
  }

  // PhotoEditor._internal 사용 — 비공식이지만 같은 레포 내 안전.
  function _readPeState() {
    try {
      const PE = window.PhotoEditor;
      if (PE && PE._internal && typeof PE._internal.getState === 'function') {
        return PE._internal.getState();
      }
      return window._peLastState || null;
    } catch (_e) { return null; }
  }

  // 적용 — PhotoEditor 가 열려있으면 watermark/text/brand_color 를 갱신해서 다시 그림.
  function apply(id, _opts) {
    const arr = list();
    const tpl = arr.find(t => t.id === id);
    if (!tpl) { _toast('템플릿을 찾을 수 없어요', 'error'); return false; }

    // PhotoEditor 가 열려있다면 _peLastState 통해 watermark/text 반영.
    const PE = window.PhotoEditor;
    let applied = false;
    try {
      const patch = {};
      if (tpl.watermark) {
        patch.watermark = {
          value: tpl.watermark.value || '',
          position: tpl.watermark.position || 'br',
          opacity: (typeof tpl.watermark.opacity === 'number') ? tpl.watermark.opacity : 0.85,
        };
      }
      if (tpl.text_style) {
        patch.text = {
          value: tpl.text_style.value || '',
          x: (typeof tpl.text_style.x === 'number') ? tpl.text_style.x : 0.5,
          y: (typeof tpl.text_style.y === 'number') ? tpl.text_style.y : 0.92,
          color: tpl.text_style.color || '#ffffff',
        };
      }
      if (PE && PE._internal && typeof PE._internal.applyStatePatch === 'function') {
        applied = PE._internal.applyStatePatch(patch);
      } else if (window._peLastState) {
        const s = window._peLastState;
        if (patch.watermark) s.watermark = Object.assign(s.watermark || {}, patch.watermark);
        if (patch.text) s.text = Object.assign(s.text || {}, patch.text);
        applied = true;
      }
    } catch (_e) { void _e; }

    // BrandKit 의 brand_color 도 갱신 — 다른 모듈이 색상 사용 가능.
    if (tpl.brand_color) {
      try {
        if (window.BrandKit && typeof window.BrandKit.save === 'function') {
          window.BrandKit.save({ brand_color: tpl.brand_color });
        } else {
          const kit = _readKit();
          kit.brand_color = tpl.brand_color;
          _writeKit(kit);
        }
      } catch (_e) { void _e; }
    }

    if (applied) _toast('템플릿 "' + tpl.name + '"을(를) 적용했어요', 'success');
    else _toast('사진 편집기를 열고 다시 시도해 주세요');
    return applied;
  }

  function remove(id) {
    const arr = list().filter(t => t.id !== id);
    const ok = _writeList(arr);
    if (ok) {
      try { window.dispatchEvent(new CustomEvent('itdasy:brand-templates:updated', { detail: { removed: id } })); }
      catch (_e) { void _e; }
    }
    return ok;
  }

  // ── 1-탭 적용 시트 ───────────────────────────────────
  const PICKER_ID = 'brandTemplatesPicker';

  function _buildPicker() {
    const arr = list();
    const wrap = document.createElement('div');
    wrap.id = PICKER_ID;
    wrap.style.cssText = 'position:fixed;inset:0;z-index:9600;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,0.45);';
    const items = arr.length ? arr.map(t => `
      <button type="button" data-bt-id="${_esc(t.id)}"
        style="display:flex;align-items:center;gap:10px;padding:12px;border:1px solid #eee;border-radius:14px;background:#fff;text-align:left;cursor:pointer;">
        <span style="width:34px;height:34px;border-radius:10px;background:${_esc(t.brand_color || '#F18091')};display:inline-block;flex-shrink:0;"></span>
        <span style="flex:1;min-width:0;">
          <span style="display:block;font-size:13px;font-weight:700;color:#222;">${_esc(t.name)}</span>
          <span style="display:block;font-size:11px;color:#888;margin-top:2px;">${_esc(t.watermark && t.watermark.value || '워터마크 없음')} · ${_esc(t.text_style && t.text_style.value || '텍스트 없음')}</span>
        </span>
        <span data-bt-del="${_esc(t.id)}" role="button" aria-label="삭제"
          style="color:#aaa;font-size:18px;padding:4px 8px;cursor:pointer;">×</span>
      </button>
    `).join('') : `
      <div style="text-align:center;padding:24px;color:#888;font-size:13px;line-height:1.6;">
        저장된 템플릿이 없어요.<br>사진 편집기에서 텍스트·워터마크·색상을 설정한 뒤 "이 템플릿 저장" 버튼을 눌러주세요.
      </div>
    `;
    wrap.innerHTML = `
      <div role="dialog" aria-modal="true" aria-label="브랜드 템플릿"
        style="width:100%;max-width:480px;background:#fff;border-radius:20px 20px 0 0;padding:18px 16px 24px;max-height:80vh;overflow:auto;display:flex;flex-direction:column;gap:10px;">
        <div style="width:38px;height:4px;background:#e0e0e0;border-radius:2px;margin:0 auto 6px;"></div>
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <strong style="font-size:15px;">브랜드 템플릿</strong>
          <button type="button" data-bt-act="close" aria-label="닫기"
            style="background:none;border:none;font-size:22px;color:#666;cursor:pointer;line-height:1;">×</button>
        </div>
        <div style="font-size:11px;color:#888;line-height:1.5;margin-bottom:4px;">저장된 조합을 한 번 누르면 사진 편집기에 즉시 적용돼요.</div>
        <div style="display:flex;flex-direction:column;gap:8px;">${items}</div>
        <button type="button" data-bt-act="save-current"
          style="margin-top:6px;padding:11px;border:1px dashed #d4d4d4;border-radius:12px;background:#fafafa;color:#555;font-weight:700;cursor:pointer;">현재 사진 편집기 설정 저장</button>
      </div>`;
    return wrap;
  }

  function openPicker() {
    closePicker();
    const wrap = _buildPicker();
    document.body.appendChild(wrap);
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap) return closePicker();
      const act = e.target.closest('[data-bt-act]')?.dataset.btAct;
      if (act === 'close') return closePicker();
      if (act === 'save-current') {
        const tpl = save();
        if (tpl) { closePicker(); }
        return;
      }
      // 삭제 우선 처리
      const delId = e.target.closest('[data-bt-del]')?.dataset.btDel;
      if (delId) {
        e.stopPropagation();
        if (window.confirm('이 템플릿을 삭제할까요?')) {
          remove(delId);
          // 다시 렌더
          closePicker();
          openPicker();
        }
        return;
      }
      const id = e.target.closest('[data-bt-id]')?.dataset.btId;
      if (id) {
        const ok = apply(id);
        if (ok) closePicker();
      }
    });
  }

  function closePicker() {
    const ex = document.getElementById(PICKER_ID);
    if (ex && ex.parentNode) ex.parentNode.removeChild(ex);
  }

  // ── PhotoEditor 상태 미러링 (apply 가 동작하도록) ─────
  // PhotoEditor 는 _state 를 직접 노출하지 않지만, registerDrawHook 마다 state 가 인자로 전달됨.
  // 그 순간에 window._peLastState 에 캐시해두면 apply 가 동작.
  function _attachStateMirror() {
    try {
      const PE = window.PhotoEditor;
      if (!PE || !PE._internal || typeof PE._internal.registerDrawHook !== 'function') return false;
      PE._internal.registerDrawHook('_brand_templates_mirror', function (_ctx, _w, _h, _data, _helpers) {
        // 이 훅 자체는 그림 안 그림. state 캐싱만.
        // 실제 호출 시점엔 data 가 beauty 객체라 직접 state 접근 불가 → 다른 경로 필요.
        // 그래서 helpers.redraw 호출 시점에 _peLastState 를 만들 수 없음. → 대안 사용 안 함.
      });
      return true;
    } catch (_e) { return false; }
  }

  // 더 안정적인 방법: PhotoEditor 가 _state 를 자체적으로 노출하지 않으므로
  // BrandKit/photo-editor 가 dispatch 하는 이벤트 (`itdasy:brand-kit:updated`) 를 보고
  // 마지막 watermark/text 값을 _peLastState 에 저장. 사진 편집기 자체 수정 없이 동작.
  window.addEventListener('itdasy:brand-kit:updated', (e) => {
    try {
      const bk = (e && e.detail) || _readKit();
      window._peLastState = window._peLastState || { watermark: {}, text: {} };
      const s = window._peLastState;
      if (bk.watermark_text != null) s.watermark.value = bk.watermark_text;
      if (bk.watermark_position) s.watermark.position = bk.watermark_position;
      if (typeof bk.watermark_opacity === 'number') s.watermark.opacity = bk.watermark_opacity;
    } catch (_e) { void _e; }
  });

  _attachStateMirror();

  window.BrandTemplates = {
    list: list,
    save: save,
    saveFromState: saveFromState,
    apply: apply,
    remove: remove,
    openPicker: openPicker,
    closePicker: closePicker,
  };
})();
