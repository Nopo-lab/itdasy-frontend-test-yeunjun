/* 사진 편집기 — 배치 편집 모듈 (2026-05-19 v206.4 분할)
   책임:
     • 현재 갤러리 슬롯 사진 N장 찾기
     • 현재 보정값을 임시 캔버스에서 사진마다 적용
     • 버튼 진행 상태 / 갤러리 저장 / 갤러리 갱신 알림
*/
(function () {
  'use strict';

  function _getCurrentSlot() {
    try {
      if (typeof window._slots === 'undefined' || typeof window._popupSlotId === 'undefined') return null;
      const slot = (window._slots || []).find(s => s && s.id === window._popupSlotId);
      if (!slot) return null;
      const photos = _visiblePhotos(slot);
      if (photos.length < 2) return null;
      return { id: slot.id, label: slot.label || '슬롯', count: photos.length };
    } catch (err) {
      console.warn('[photo-batch] 슬롯 확인 실패:', err);
      return null;
    }
  }

  async function _applyToSlot(state, helpers, buttonEl) {
    const slotInfo = _getCurrentSlot();
    if (!slotInfo) return _toast(helpers, '현재 슬롯을 찾지 못했어요');
    const slot = (window._slots || []).find(s => s && s.id === slotInfo.id);
    const photos = _visiblePhotos(slot);
    if (!photos.length) return _toast(helpers, '적용할 사진이 없어요');
    if (!_confirmApply(photos.length)) return;

    const restoreText = _setBusy(buttonEl, photos.length);
    const adjust = _clone(state && state.adjust);
    const beauty = _clone(state && state.beauty);
    let done = 0, fail = 0;

    for (let i = 0; i < photos.length; i++) {
      const ok = await _applyOne(photos[i], adjust, beauty, helpers);
      if (ok) done++;
      else fail++;
      _updateBusy(buttonEl, i + 1, photos.length);
    }

    await _saveSlot(slot);
    _restoreButton(buttonEl, restoreText);
    _toast(helpers, '배치 보정 완료: ' + done + '장 성공, ' + fail + '장 실패');
    _notifyGallery(slot.id, done);
  }

  async function _applyOne(photo, adjust, beauty, helpers) {
    try {
      const srcUrl = photo && (photo.dataUrl || photo.editedDataUrl);
      if (!srcUrl) return false;
      const result = await _composeWithSettings(srcUrl, adjust, beauty, helpers);
      if (!result) return false;
      photo.editedDataUrl = result;
      return true;
    } catch (err) {
      console.warn('[photo-batch] 사진 보정 실패:', err);
      return false;
    }
  }

  function _composeWithSettings(srcDataUrl, adjust, beauty, helpers) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(_drawAdjusted(img, adjust, beauty, helpers));
      img.onerror = () => resolve(null);
      img.src = srcDataUrl;
    });
  }

  function _drawAdjusted(img, adjust, beauty, helpers) {
    try {
      const iw = img.naturalWidth, ih = img.naturalHeight;
      const k = Math.min(1080, iw) / iw;
      const dw = Math.round(iw * k), dh = Math.round(ih * k);
      const cv = document.createElement('canvas');
      cv.width = dw; cv.height = dh;
      const ctx = cv.getContext('2d');
      const temp = adjust.temperature || 0;
      const sepia = Math.max(0, temp) / 100, contrast = 100 + Math.max(0, -temp) * 0.3;
      ctx.filter = 'brightness(' + adjust.brightness + '%) saturate(' + adjust.saturate + '%) contrast(' + contrast + '%) sepia(' + sepia + ')';
      ctx.drawImage(img, 0, 0, iw, ih, 0, 0, dw, dh);
      ctx.filter = 'none';
      if (adjust.sharpness > 10 && helpers && typeof helpers.unsharpMask === 'function') {
        helpers.unsharpMask(ctx, dw, dh, adjust.sharpness / 100);
      }
      _applyBeauty(ctx, dw, dh, beauty, helpers);
      return cv.toDataURL('image/jpeg', 0.92);
    } catch (err) {
      console.warn('[photo-batch] 캔버스 합성 실패:', err);
      return null;
    }
  }

  function _applyBeauty(ctx, dw, dh, beauty, helpers) {
    if (!helpers || typeof helpers.applyDrawHook !== 'function') return;
    try {
      helpers.applyDrawHook('beauty', ctx, dw, dh, beauty, helpers);
    } catch (err) {
      console.warn('[photo-batch] 뷰티 보정 실패:', err);
    }
  }

  async function _saveSlot(slot) {
    try {
      if (typeof window.saveSlotToDB === 'function') await window.saveSlotToDB(slot);
    } catch (err) {
      console.warn('[photo-batch] 슬롯 저장 실패:', err);
    }
  }

  function _notifyGallery(slotId, count) {
    try {
      window.dispatchEvent(new CustomEvent('itdasy:gallery:photo-replaced', {
        detail: { kind: 'batch_edit', slotId, count },
      }));
    } catch (err) {
      console.warn('[photo-batch] 갤러리 갱신 알림 실패:', err);
    }
  }

  function _visiblePhotos(slot) {
    return ((slot && slot.photos) || []).filter(p => p && !p.hidden);
  }

  function _clone(value) {
    return JSON.parse(JSON.stringify(value || {}));
  }

  function _confirmApply(count) {
    if (typeof window.confirm !== 'function') return true;
    return window.confirm('슬롯 사진 ' + count + '장에 현재 보정을 일괄 적용할까요? 원본은 보존되고 편집본만 갱신됩니다.');
  }

  function _setBusy(buttonEl, total) {
    if (!buttonEl) return '';
    const text = buttonEl.textContent;
    buttonEl.disabled = true;
    buttonEl.textContent = '배치 보정 중... 0/' + total;
    return text;
  }

  function _updateBusy(buttonEl, current, total) {
    if (buttonEl) buttonEl.textContent = '배치 보정 중... ' + current + '/' + total;
  }

  function _restoreButton(buttonEl, text) {
    if (!buttonEl) return;
    buttonEl.disabled = false;
    buttonEl.textContent = text;
  }

  function _toast(helpers, message) {
    if (helpers && typeof helpers.toast === 'function') helpers.toast(message);
  }

  window.PhotoEditorBatch = {
    getCurrentSlot: _getCurrentSlot,
    applyToSlot: _applyToSlot,
  };
})();
