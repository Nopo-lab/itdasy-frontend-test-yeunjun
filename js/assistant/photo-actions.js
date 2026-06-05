/* AI 잇비 — 사진/보정 결과 클릭 처리
   app-assistant.js의 큰 클릭 처리 함수에서 사진 관련 경로만 분리. */
(function () {
  'use strict';

  function _bodyContains(el) {
    const body = document.getElementById('asstBody');
    const dock = document.getElementById('asstResultDock');
    return !!(el && ((body && body.contains(el)) || (dock && dock.contains(el))));
  }

  function _sheetContains(el) {
    const sheet = document.getElementById('assistantSheet');
    return !!(el && sheet && sheet.contains(el));
  }

  function _safeToast(message) {
    if (typeof window.showToast === 'function') window.showToast(message);
  }

  function _captionPrefill() {
    try {
      if (window.CaptionPrefill && typeof window.CaptionPrefill.get === 'function') {
        return window.CaptionPrefill.get() || '';
      }
    } catch (_e) {
      void _e;
    }
    return '';
  }

  function _downloadDataUrl(dataUrl) {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = 'itdasy-' + Date.now() + '.jpg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function _handlePendingRemove(e, deps) {
    const el = e.target.closest('[data-pending-remove]');
    if (!el || !_sheetContains(el)) return false;
    const i = parseInt(el.dataset.pendingRemove, 10);
    try { URL.revokeObjectURL(deps.pendingThumbs[i]); } catch (_e) { void _e; }
    deps.pendingFiles.splice(i, 1);
    deps.pendingThumbs.splice(i, 1);
    deps.renderPending();
    if (!deps.pendingFiles.length) document.getElementById('asstInput')?.focus();
    return true;
  }

  function _handleUploadPhotoClick(e, deps) {
    const el = e.target.closest('[data-asst-photo]');
    if (!el || !_bodyContains(el)) return false;
    const [hi, pi] = el.dataset.asstPhoto.split(':').map(n => parseInt(n, 10));
    const msg = deps.history[hi];
    const photos = (msg && Array.isArray(msg.photos) && msg.photos.length)
      ? msg.photos
      : (msg && msg.thumb ? [msg.thumb] : []);
    if (photos.length) deps.openLightbox(photos, pi || 0);
    return true;
  }

  function _handlePhotoResultClick(e, deps) {
    const el = e.target.closest('[data-asst-photo-result]');
    if (!el || !_bodyContains(el)) return false;
    const hi = parseInt(el.dataset.asstPhotoResult, 10);
    const msg = deps.history[hi];
    if (msg && msg.photo_result && msg.photo_result.dataUrl) {
      deps.openLightbox([msg.photo_result.dataUrl], 0);
    }
    return true;
  }

  function _handleIntentChip(e, deps) {
    const el = e.target.closest('[data-asst-intent-chip]');
    if (!el || !_bodyContains(el)) return false;
    if (deps.isSendInFlight()) return true;
    const [hiStr, chipId] = el.dataset.asstIntentChip.split(':');
    const hi = parseInt(hiStr, 10);
    const chipMsg = deps.history[hi];
    const userMsg = deps.history[hi - 1];
    if (!chipMsg || !Array.isArray(chipMsg.intent_chips) || !userMsg) return true;
    const chip = chipMsg.intent_chips.find(c => c.id === chipId);
    if (!chip) return true;
    const photoUrl = userMsg.thumb || (Array.isArray(userMsg.photos) ? userMsg.photos[0] : '');
    const photos = Array.isArray(userMsg.photos) ? userMsg.photos : (photoUrl ? [photoUrl] : []);
    if (!photoUrl) return true;
    deps.history.splice(hi - 1, 2);
    deps.renderHistory();
    deps.runChatAutoEdit({ photoUrl, photos, question: chip.question, customerCtx: null });
    return true;
  }

  function _handlePhotoAction(e, deps) {
    const el = e.target.closest('[data-asst-photo-act]');
    if (!el || !_bodyContains(el)) return false;
    const [hiStr, actId] = el.dataset.asstPhotoAct.split(':');
    const hi = parseInt(hiStr, 10);
    const msg = deps.history[hi];
    if (!msg || !msg.photo_result || !msg.photo_result.dataUrl) return true;
    _runPhotoAction(actId, hi, msg, deps);
    return true;
  }

  function _runPhotoAction(actId, hi, msg, deps) {
    const dataUrl = msg.photo_result.dataUrl;
    if (actId === 'instagram') _openInstagram(dataUrl, msg.photo_result.ratio || '4:5');
    else if (actId === 'editor') _openEditor(dataUrl);
    else if (actId === 'save') _savePhotoResult(dataUrl);
    else if (actId === 'retry') _retryPhotoEdit(hi, deps);
  }

  function _openInstagram(dataUrl, ratio) {
    if (typeof window.openInstagramPreview !== 'function') return;
    try {
      window.openInstagramPreview({ src: dataUrl, ratio, caption: _captionPrefill(), enableUpload: true });
    } catch (_e) {
      void _e;
    }
  }

  function _openEditor(dataUrl) {
    if (window.PhotoEditor && typeof window.PhotoEditor.open === 'function') {
      window.PhotoEditor.open({ src: dataUrl, initial_tab: 'tune' });
    }
  }

  function _savePhotoResult(dataUrl) {
    try {
      _downloadDataUrl(dataUrl);
      _safeToast('저장 완료');
    } catch (_e) {
      _safeToast('저장 실패');
    }
  }

  function _retryPhotoEdit(hi, deps) {
    const userMsg = deps.history[hi - 1];
    if (!userMsg || !userMsg.thumb) return;
    const photoUrl = userMsg.thumb;
    const photos = Array.isArray(userMsg.photos) ? userMsg.photos : [photoUrl];
    const question = userMsg.text || '예쁘게 보정해줘';
    deps.history.splice(hi - 1, 2);
    deps.renderHistory();
    deps.runChatAutoEdit({ photoUrl, photos, question, customerCtx: null });
  }

  function handleClick(e, deps) {
    return _handlePendingRemove(e, deps)
      || _handleUploadPhotoClick(e, deps)
      || _handlePhotoResultClick(e, deps)
      || _handleIntentChip(e, deps)
      || _handlePhotoAction(e, deps);
  }

  window.ItdasyAssistantPhotoActions = { handleClick };
})();
