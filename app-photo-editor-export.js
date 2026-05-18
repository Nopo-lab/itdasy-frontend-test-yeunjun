/* 사진 편집기 — 저장/다음 단계 모듈 (2026-05-19 v206.5 분할)
   책임:
     • PNG/JPG/WebP/2배 고화질/피드+스토리 세트 저장
     • 저장 후 캡션/고객기록/인스타 미리보기 다음 단계 모달
*/
(function () {
  'use strict';

  function _getOption(format) {
    if (format === 'jpg') return { mime: 'image/jpeg', ext: 'jpg', quality: 0.95, scale: 1, label: 'JPG' };
    if (format === 'webp') return { mime: 'image/webp', ext: 'webp', quality: 0.9, scale: 1, label: 'WebP' };
    if (format === 'png2') return { mime: 'image/png', ext: 'png', quality: 0.95, scale: 2, label: '2배 고화질 PNG' };
    return { mime: 'image/png', ext: 'png', quality: 0.95, scale: 1, label: 'PNG' };
  }

  async function _save(format, state, helpers) {
    if (!state || !state.originalImg) return _toast(helpers, '편집할 사진이 없어요');
    const cv = document.getElementById('peCanvas');
    if (!cv) return;
    if (format === 'set') return _savePostSet(cv, state, helpers);
    const opt = _getOption(format);
    const exportCv = _makeExportCanvas(cv, opt.scale);
    exportCv.toBlob((blob) => _finishSave(blob, exportCv, opt, state, helpers), opt.mime, opt.quality);
  }

  function _savePostSet(cv, state, helpers) {
    const feed = _makeCoverCanvas(cv, 1080, 1350);
    const story = _makeCoverCanvas(cv, 1080, 1920);
    _downloadCanvas(feed, 'itdasy-feed-4x5-' + Date.now() + '.png');
    _downloadCanvas(story, 'itdasy-story-9x16-' + Date.now() + '.png');
    _toast(helpers, '피드+스토리 2장 저장 완료');
    if (state) state._savedAtCursor = state.historyCursor;
    _notifyExport();
    _showNextSteps(story, state, helpers);
  }

  function _makeCoverCanvas(src, width, height) {
    const out = document.createElement('canvas');
    out.width = width; out.height = height;
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#0c0c10';
    ctx.fillRect(0, 0, width, height);
    const fit = _coverRect(src.width, src.height, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, fit.sx, fit.sy, fit.sw, fit.sh, 0, 0, width, height);
    return out;
  }

  function _coverRect(srcW, srcH, outW, outH) {
    const srcAR = srcW / srcH, outAR = outW / outH;
    if (srcAR > outAR) {
      const sw = Math.round(srcH * outAR);
      return { sx: Math.round((srcW - sw) / 2), sy: 0, sw, sh: srcH };
    }
    const sh = Math.round(srcW / outAR);
    return { sx: 0, sy: Math.round((srcH - sh) / 2), sw: srcW, sh };
  }

  function _downloadCanvas(cv, filename) {
    cv.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
    }, 'image/png', 0.95);
  }

  function _finishSave(blob, exportCv, opt, state, helpers) {
    if (!blob) return _toast(helpers, '저장 실패 — 다시 시도해 주세요');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'itdasy-edit-' + Date.now() + '.' + opt.ext;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
    _toast(helpers, opt.label + ' 저장 완료');
    if (state) state._savedAtCursor = state.historyCursor;
    _notifyExport();
    _showNextSteps(exportCv, state, helpers);
  }

  function _makeExportCanvas(cv, scale) {
    if (!scale || scale === 1) return cv;
    const out = document.createElement('canvas');
    out.width = Math.round(cv.width * scale);
    out.height = Math.round(cv.height * scale);
    const ctx = out.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(cv, 0, 0, out.width, out.height);
    return out;
  }

  function _notifyExport() {
    try {
      window.dispatchEvent(new CustomEvent('itdasy:gallery:photo-replaced', {
        detail: { kind: 'export_marketing_image', source: 'photo-editor' },
      }));
    } catch (err) {
      console.warn('[photo-export] 저장 알림 실패:', err);
    }
  }

  function _showNextSteps(cv, state, helpers) {
    document.getElementById('peNextStepsModal')?.remove();
    const dataUrl = _safeDataUrl(cv);
    const modal = document.createElement('div');
    modal.id = 'peNextStepsModal';
    modal.className = 'pe-modal';
    modal.innerHTML = _nextStepsHTML(dataUrl);
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => _onNextStepClick(e, modal, dataUrl, state, helpers));
  }

  function _nextStepsHTML(dataUrl) {
    return `<div class="pe-modal-backdrop" data-pe-ns="close"></div><div class="pe-modal-card">
      <div class="pe-modal-head"><strong>저장 완료! 다음에 뭘 할까요?</strong><button type="button" class="pe-iconbtn" data-pe-ns="close" aria-label="닫기">×</button></div>
      ${dataUrl ? `<div class="pe-modal-thumb"><img src="${dataUrl}" alt="편집본 미리보기" /></div>` : ''}
      <div class="pe-modal-actions"><button type="button" class="pe-action-btn" data-pe-ns="caption">✨ 캡션 만들기</button><button type="button" class="pe-action-btn" data-pe-ns="attach">📎 고객 기록에 첨부</button><button type="button" class="pe-action-btn" data-pe-ns="instagram">📷 인스타 미리보기</button></div>
      <div class="pe-hint" style="text-align:center;margin-top:10px;">다시 편집하려면 닫고 슬라이더를 조정하세요.</div></div>`;
  }

  function _onNextStepClick(e, modal, dataUrl, state, helpers) {
    const act = e.target.closest('[data-pe-ns]')?.dataset.peNs;
    if (!act) return;
    if (act === 'close') return modal.remove();
    modal.remove();
    if (act === 'caption') _openCaption(helpers);
    else if (act === 'attach') _toast(helpers, '편집본을 고객 상세의 사진에 첨부하려면 시술 기록 화면을 열어주세요');
    else if (act === 'instagram') _openInstagram(dataUrl, state, helpers);
  }

  function _openCaption(helpers) {
    if (typeof window.openCaptionScenarioPopup !== 'function') return _toast(helpers, '캡션 모듈을 찾을 수 없어요');
    try {
      window.openCaptionScenarioPopup();
      _toast(helpers, '캡션 시나리오를 열었어요');
    } catch (err) {
      console.warn('[photo-export] 캡션 열기 실패:', err);
      _toast(helpers, '캡션 화면을 여는 중 문제가 생겼어요');
    }
  }

  function _openInstagram(dataUrl, state, helpers) {
    if (typeof window.openInstagramPreview === 'function') {
      try {
        window.openInstagramPreview({ ratio: (state && state.ratio) || '1:1', src: dataUrl });
      } catch (err) {
        console.warn('[photo-export] 인스타 미리보기 실패:', err);
        _toast(helpers, '인스타 미리보기 화면을 여는 중 문제가 생겼어요');
      }
    } else if (typeof window.showTab === 'function') {
      window.showTab('finish');
      _toast(helpers, '마무리 탭으로 이동했어요');
    } else {
      _toast(helpers, '인스타 미리보기 화면을 찾을 수 없어요');
    }
  }

  function _safeDataUrl(cv) {
    try { return cv.toDataURL('image/png'); }
    catch (err) {
      console.warn('[photo-export] 미리보기 생성 실패:', err);
      return '';
    }
  }

  function _toast(helpers, message) {
    if (helpers && typeof helpers.toast === 'function') helpers.toast(message);
  }

  window.PhotoEditorExport = { save: _save };
})();
