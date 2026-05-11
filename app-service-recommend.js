/**
 * app-service-recommend.js — E1 손님 사진 기반 시술 추천 (영업 도구)
 *
 * 진입: window.openServiceRecommend()
 * - 손님 사진 촬영/선택 → AI 분석 → 시술 3개 추천 카드
 * - "이 시술로 예약" → window.openBooking() 으로 prefilled
 *
 * 의존:
 *  - window.API (백엔드 베이스), window.authHeader()
 *  - window.compressImageForUpload() — app-receipt-scan.js 에서 정의
 *  - window.showToast() (선택)
 *  - window.openBooking(date) — app-calendar-view.js (prefill 은 sessionStorage 경유)
 */
(function () {
  'use strict';

  const SHEET_ID = 'serviceRecommendSheet';
  const ENDPOINT = '/recommendations/services';

  function _toast(msg) {
    if (window.showToast) window.showToast(msg);
    else if (window.toast) window.toast(msg);
  }

  function _ensureStyles() {
    if (document.getElementById('srRecommendCss')) return;
    const css = document.createElement('style');
    css.id = 'srRecommendCss';
    css.textContent = `
#${SHEET_ID} { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 9000;
  display: none; align-items: flex-end; justify-content: center; padding-bottom: env(safe-area-inset-bottom); }
#${SHEET_ID}.shown { display: flex; }
#${SHEET_ID} .sr-panel { background: #fff; width: 100%; max-width: 560px; border-radius: 18px 18px 0 0;
  max-height: 92vh; overflow-y: auto; padding: 20px 18px 28px; }
#${SHEET_ID} .sr-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
#${SHEET_ID} .sr-head h2 { font-size: 18px; font-weight: 700; margin: 0; }
#${SHEET_ID} .sr-close { background: transparent; border: 0; font-size: 22px; cursor: pointer; color: #888; }
#${SHEET_ID} .sr-uploader { border: 2px dashed #d8d8e0; border-radius: 16px; padding: 22px 16px; text-align: center;
  background: #fafafd; transition: background .15s; }
#${SHEET_ID} .sr-uploader p { color:var(--text-muted); margin: 6px 0 0; font-size: 13px; }
#${SHEET_ID} .sr-pick-row { display: flex; gap: 10px; margin-top: 14px; }
#${SHEET_ID} .sr-pick-btn { flex: 1; padding: 14px 10px; border-radius: 14px; border: 1.5px solid #e0d8ff;
  background: #fff; color: #5a3ee8; font-weight: 700; font-size: 14px; cursor: pointer;
  display: flex; flex-direction: column; align-items: center; gap: 6px; min-height: 76px;
  transition: background .12s, border-color .12s; }
#${SHEET_ID} .sr-pick-btn:active { background: #f4f0ff; border-color: #7c5fff; }
#${SHEET_ID} .sr-actions { display: flex; gap: 10px; margin-top: 14px; }
#${SHEET_ID} .sr-btn { flex: 1; padding: 14px; border-radius: 14px; border: 0; font-weight: 600; cursor: pointer; font-size: 14px; }
#${SHEET_ID} .sr-btn-primary { background: linear-gradient(135deg,#7c5fff,#5a3ee8); color: #fff; }
#${SHEET_ID} .sr-btn-secondary { background: #f0f0f5; color: #333; }
#${SHEET_ID} .sr-preview { margin-top: 14px; border-radius: 14px; overflow: hidden; max-height: 280px;
  display: flex; justify-content: center; background: #f6f6fa; }
#${SHEET_ID} .sr-preview img { max-width: 100%; max-height: 280px; object-fit: contain; }
#${SHEET_ID} .sr-skel { display: flex; flex-direction: column; gap: 10px; margin-top: 16px; }
#${SHEET_ID} .sr-skel-card { height: 90px; border-radius: 14px;
  background: linear-gradient(90deg,#eee 0%, #f7f7fa 50%, #eee 100%);
  background-size: 200% 100%; animation: srShimmer 1.2s linear infinite; }
@keyframes srShimmer { 0% {background-position: 200% 0;} 100% {background-position: -200% 0;} }
#${SHEET_ID} .sr-card { border: 1px solid #ececf0; border-radius: 14px; padding: 14px; margin-top: 10px;
  background: #fff; }
#${SHEET_ID} .sr-card-title { font-size: 16px; font-weight: 700; margin: 0 0 4px; color: #1a1a2a; }
#${SHEET_ID} .sr-card-reason { font-size: 13px; color: #555; margin: 0 0 10px; line-height: 1.5; }
#${SHEET_ID} .sr-card-meta { display: flex; gap: 12px; font-size: 12px; color: #777; margin-bottom: 10px; }
#${SHEET_ID} .sr-conf-bar { height: 6px; border-radius: 4px; background: #eee; overflow: hidden; margin-bottom: 10px; }
#${SHEET_ID} .sr-conf-fill { height: 100%; background: linear-gradient(90deg,#7c5fff,#5a3ee8); border-radius: 4px; }
#${SHEET_ID} .sr-card-book { width: 100%; padding: 11px; border-radius: 12px; border: 0;
  background: #1a1a2a; color: #fff; font-weight: 600; cursor: pointer; font-size: 13px; }
#${SHEET_ID} .sr-empty { padding: 28px 16px; text-align: center; color: #888; font-size: 14px; }
#${SHEET_ID} .sr-analysis { font-size: 12px; color: #888; padding: 8px 12px; background: #f6f6fa;
  border-radius: 10px; margin-top: 12px; }
    `;
    document.head.appendChild(css);
  }

  function _ensureSheet() {
    let sheet = document.getElementById(SHEET_ID);
    if (sheet) return sheet;
    _ensureStyles();
    sheet = document.createElement('div');
    sheet.id = SHEET_ID;
    sheet.innerHTML = `
      <div class="sr-panel" role="dialog" aria-modal="true" aria-labelledby="srTitle">
        <div class="sr-head">
          <h2 id="srTitle">손님 시술 추천</h2>
          <button class="sr-close" data-sr-close type="button" aria-label="닫기">×</button>
        </div>

        <div class="sr-uploader">
          <i class="ph-duotone ph-camera" aria-hidden="true"></i>
          <p>손님 사진을 찍거나 갤러리에서 선택해 주세요</p>
          <p style="font-size:11px;color:var(--text-subtle);margin-top:4px;">10MB 이하 · JPG/PNG/WEBP</p>
        </div>
        <div class="sr-pick-row">
          <button type="button" class="sr-pick-btn" data-sr-camera>
            <i class="ph-duotone ph-camera" aria-hidden="true"></i>
            <span>카메라 촬영</span>
          </button>
          <button type="button" class="sr-pick-btn" data-sr-gallery>
            <i class="ph-duotone ph-image" aria-hidden="true"></i>
            <span>갤러리에서 선택</span>
          </button>
        </div>
        <input type="file" accept="image/*" capture="environment" data-sr-camera-input style="display:none;">
        <input type="file" accept="image/*" data-sr-gallery-input style="display:none;">

        <div class="sr-preview" data-sr-preview style="display:none;"></div>

        <div class="sr-actions">
          <button class="sr-btn sr-btn-secondary" data-sr-reset type="button">다시 선택</button>
          <button class="sr-btn sr-btn-primary" data-sr-submit type="button" disabled>AI 추천 받기</button>
        </div>

        <div class="sr-result" data-sr-result></div>
      </div>
    `;
    document.body.appendChild(sheet);

    sheet.addEventListener('click', (e) => {
      if (e.target === sheet) _close();
    });
    sheet.querySelector('[data-sr-close]').addEventListener('click', _close);

    const camInput = sheet.querySelector('[data-sr-camera-input]');
    const galInput = sheet.querySelector('[data-sr-gallery-input]');
    sheet.querySelector('[data-sr-camera]').addEventListener('click', (e) => {
      e.preventDefault();
      camInput.click();
    });
    sheet.querySelector('[data-sr-gallery]').addEventListener('click', (e) => {
      e.preventDefault();
      galInput.click();
    });
    camInput.addEventListener('change', _onPick);
    galInput.addEventListener('change', _onPick);

    sheet.querySelector('[data-sr-reset]').addEventListener('click', _reset);
    sheet.querySelector('[data-sr-submit]').addEventListener('click', _submit);

    return sheet;
  }

  let _pickedFile = null;

  function _onPick(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) {
      _toast('10MB 이하 사진만 가능해요');
      return;
    }
    _pickedFile = f;
    const sheet = document.getElementById(SHEET_ID);
    const preview = sheet.querySelector('[data-sr-preview]');
    preview.style.display = 'flex';
    preview.innerHTML = '';
    const img = document.createElement('img');
    img.src = URL.createObjectURL(f);
    img.alt = '미리보기';
    preview.appendChild(img);
    sheet.querySelector('[data-sr-submit]').disabled = false;
  }

  function _reset() {
    _pickedFile = null;
    const sheet = document.getElementById(SHEET_ID);
    if (!sheet) return;
    const camInput = sheet.querySelector('[data-sr-camera-input]');
    const galInput = sheet.querySelector('[data-sr-gallery-input]');
    if (camInput) camInput.value = '';
    if (galInput) galInput.value = '';
    const preview = sheet.querySelector('[data-sr-preview]');
    preview.style.display = 'none';
    preview.innerHTML = '';
    sheet.querySelector('[data-sr-submit]').disabled = true;
    sheet.querySelector('[data-sr-result]').innerHTML = '';
  }

  function _renderSkeleton() {
    const sheet = document.getElementById(SHEET_ID);
    const r = sheet.querySelector('[data-sr-result]');
    r.innerHTML = `
      <div class="sr-skel">
        <div class="sr-skel-card"></div>
        <div class="sr-skel-card"></div>
        <div class="sr-skel-card"></div>
      </div>
      <p style="text-align:center;color:#888;font-size:13px;margin-top:12px;">AI 가 어울리는 시술을 분석 중이에요…</p>
    `;
  }

  function _renderResult(data) {
    const sheet = document.getElementById(SHEET_ID);
    const r = sheet.querySelector('[data-sr-result]');
    const items = (data && data.recommendations) || [];

    if (!items.length) {
      r.innerHTML = '<div class="sr-empty">추천 결과를 받지 못했어요. 다른 사진으로 다시 시도해 보세요.</div>';
      return;
    }

    let html = '';
    items.forEach((it, idx) => {
      const conf = Math.max(0, Math.min(1, Number(it.confidence || 0)));
      const confPct = Math.round(conf * 100);
      const dur = Number(it.estimated_duration || 0);
      const price = Number(it.estimated_price || 0);
      html += `
        <div class="sr-card" data-idx="${idx}">
          <p class="sr-card-title">${_esc(it.service_name)}</p>
          <p class="sr-card-reason">${_esc(it.reason || '')}</p>
          <div class="sr-card-meta">
            <span>예상 ${dur}분</span>
            <span>${price.toLocaleString()}원</span>
            <span style="margin-left:auto;">신뢰도 ${confPct}%</span>
          </div>
          <div class="sr-conf-bar"><div class="sr-conf-fill" style="width:${confPct}%;"></div></div>
          <button class="sr-card-book" data-sr-book="${idx}" type="button">이 시술로 예약</button>
        </div>
      `;
    });

    if (data.analysis && Object.keys(data.analysis).length) {
      const a = data.analysis;
      const parts = [];
      if (a.face_shape) parts.push(`얼굴: ${a.face_shape}`);
      if (a.hair_length) parts.push(`머리: ${a.hair_length}`);
      if (a.skin_tone) parts.push(`피부톤: ${a.skin_tone}`);
      if (parts.length) {
        html += `<div class="sr-analysis">분석: ${_esc(parts.join(' · '))}</div>`;
      }
    }

    r.innerHTML = html;

    // 예약 버튼 바인딩 — sessionStorage 로 prefill 정보 전달
    r.querySelectorAll('[data-sr-book]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-sr-book'));
        const picked = items[idx];
        if (!picked) return;
        try {
          sessionStorage.setItem('itdasy_booking_prefill', JSON.stringify({
            service_name: picked.service_name,
            duration_min: Number(picked.estimated_duration || 60),
            price: Number(picked.estimated_price || 0),
            source: 'service_recommend',
          }));
        } catch (_e) { /* sessionStorage 실패 무시 */ }
        _close();
        if (typeof window.openBooking === 'function') {
          window.openBooking();
        } else {
          _toast('예약 화면을 열 수 없어요');
        }
      });
    });
  }

  function _esc(s) {
    const div = document.createElement('div');
    div.textContent = String(s == null ? '' : s);
    return div.innerHTML;
  }

  async function _submit() {
    if (!_pickedFile) {
      _toast('사진을 먼저 선택해 주세요');
      return;
    }
    const sheet = document.getElementById(SHEET_ID);
    const submitBtn = sheet.querySelector('[data-sr-submit]');
    submitBtn.disabled = true;
    _renderSkeleton();

    try {
      let upload = _pickedFile;
      if (typeof window.compressImageForUpload === 'function') {
        try { upload = await window.compressImageForUpload(_pickedFile); }
        catch (_e) { upload = _pickedFile; }
      }
      const fd = new FormData();
      fd.append('photo', upload);

      const auth = window.authHeader ? window.authHeader() : {};
      const res = await fetch(window.API + ENDPOINT, {
        method: 'POST',
        headers: { Authorization: auth.Authorization || '' },
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || ('HTTP ' + res.status));
      }
      const data = await res.json();
      _renderResult(data);
    } catch (e) {
      const r = sheet.querySelector('[data-sr-result]');
      r.innerHTML = `<div class="sr-empty">추천 실패: ${_esc(e.message || '알 수 없는 오류')}</div>`;
      _toast('추천 실패: ' + (e.message || ''));
    } finally {
      submitBtn.disabled = false;
    }
  }

  function _close() {
    const sheet = document.getElementById(SHEET_ID);
    if (!sheet) return;
    sheet.classList.remove('shown');
    document.body.style.overflow = '';
  }

  window.openServiceRecommend = function () {
    const sheet = _ensureSheet();
    _reset();
    sheet.classList.add('shown');
    document.body.style.overflow = 'hidden';
  };
})();
