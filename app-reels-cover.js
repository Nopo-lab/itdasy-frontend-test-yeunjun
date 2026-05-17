/* app-reels-cover.js — 릴스 커버 생성 (§25 P3)
 * 의존: 없음 (window.showToast / window.BrandKit / window.PhotoEditor 있으면 활용)
 *
 * 9:16 (1080×1920) 캔버스에 사진 1장 + 큰 텍스트(시술명) + 작은 텍스트(샵명·가격) 합성.
 * 사용자가 사진 1장 골라 자동 합성 후 PNG·JPG 1080×1920 export.
 *
 * 진입:
 *   window.ReelsCover.open({ photo_url?, service_name?, price?, shop_name? })
 *   window.openReelsCover(payload)                  (alias)
 *   ItdasyAssistant local handler: kind='open_reels_cover'
 *
 * 푸시 금지 정책 준수: index.html 손대지 않음. 오케스트레이터가 로드 순서 처리.
 */
(function () {
  'use strict';

  const SHEET_ID = 'reelsCoverSheet';
  const CV_ID = 'rcCanvas';
  const CV_W = 1080;
  const CV_H = 1920;

  let _state = null; // { img, serviceName, priceText, shopName, brandColor, ratio }

  function _toast(msg, type) {
    if (typeof window.showToast === 'function') window.showToast(msg, type || 'info');
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
  }

  function _readBrand() {
    try {
      const bk = (window.BrandKit && window.BrandKit.get && window.BrandKit.get()) || null;
      if (bk) return bk;
      return JSON.parse(localStorage.getItem('itdasy_brand_kit') || '{}');
    } catch (_e) { return {}; }
  }

  function _formatPrice(n) {
    const num = Number(n);
    if (!isFinite(num) || num <= 0) return '';
    if (num >= 10000) {
      const man = num / 10000;
      // 정수면 그대로, 소수점 있으면 1자리
      return (man % 1 === 0 ? man.toFixed(0) : man.toFixed(1)) + '만원';
    }
    return num.toLocaleString('ko-KR') + '원';
  }

  function _initState(opts) {
    const brand = _readBrand();
    return {
      img: null,
      photoUrl: opts.photo_url || opts.src || '',
      serviceName: opts.service_name || opts.serviceName || '',
      priceText: _formatPrice(opts.price || 0),
      shopName: opts.shop_name || opts.shopName || brand.shop_name || '',
      brandColor: brand.brand_color || '#F18091',
      watermark: brand.watermark_text || '',
    };
  }

  // ── 시트 ──────────────────────────────────────────────
  function _ensureSheet() {
    let sheet = document.getElementById(SHEET_ID);
    if (sheet) return sheet;
    sheet = document.createElement('div');
    sheet.id = SHEET_ID;
    sheet.style.cssText = 'position:fixed;inset:0;z-index:9500;display:none;background:rgba(0,0,0,0.55);align-items:center;justify-content:center;';
    sheet.innerHTML = `
      <div class="rc-root" role="dialog" aria-modal="true" aria-label="릴스 커버 만들기"
        style="width:min(96vw,420px);max-height:92vh;background:#fff;border-radius:18px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,0.25);">
        <header style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid #f0f0f0;">
          <strong style="font-size:15px;">릴스 커버 만들기</strong>
          <button type="button" data-rc-act="close" aria-label="닫기"
            style="background:none;border:none;font-size:22px;cursor:pointer;color:#666;line-height:1;">×</button>
        </header>
        <div style="padding:14px 16px 8px;display:flex;flex-direction:column;gap:10px;overflow:auto;">
          <div style="position:relative;width:100%;aspect-ratio:9/16;background:#f5f5f5;border-radius:14px;overflow:hidden;display:flex;align-items:center;justify-content:center;">
            <canvas id="${CV_ID}" style="width:100%;height:100%;display:none;"></canvas>
            <div id="rcEmpty" style="display:flex;flex-direction:column;align-items:center;gap:10px;padding:14px;text-align:center;color:#888;font-size:13px;">
              <div>사진 1장을 골라주세요</div>
              <button type="button" class="rc-btn rc-btn-primary" data-rc-act="pick"
                style="padding:10px 18px;border:none;border-radius:12px;background:linear-gradient(135deg,#FF6B9D,#F18091);color:#fff;font-weight:700;cursor:pointer;">사진 고르기</button>
              <input type="file" id="rcPicker" accept="image/*" style="display:none;" />
            </div>
          </div>
          <label style="display:flex;flex-direction:column;gap:6px;font-size:12px;color:#444;">
            <span>시술명 (큰 글씨)</span>
            <input type="text" data-rc-field="service" maxlength="30" placeholder="예) 속눈썹펌"
              style="padding:10px 12px;border:1px solid #e0e0e0;border-radius:10px;font-size:14px;outline:none;" />
          </label>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <label style="display:flex;flex-direction:column;gap:6px;font-size:12px;color:#444;">
              <span>샵 이름</span>
              <input type="text" data-rc-field="shop" maxlength="30" placeholder="샵 이름"
                style="padding:10px 12px;border:1px solid #e0e0e0;border-radius:10px;font-size:14px;outline:none;" />
            </label>
            <label style="display:flex;flex-direction:column;gap:6px;font-size:12px;color:#444;">
              <span>가격 (선택)</span>
              <input type="text" data-rc-field="price" maxlength="20" placeholder="예) 4만원·문의"
                style="padding:10px 12px;border:1px solid #e0e0e0;border-radius:10px;font-size:14px;outline:none;" />
            </label>
          </div>
          <div style="font-size:11px;color:#888;line-height:1.5;">
            9:16 비율 1080×1920로 자동 합성됩니다. 사진은 화면을 꽉 채우게 잘려요.
          </div>
        </div>
        <footer style="padding:12px 16px;display:flex;gap:8px;border-top:1px solid #f0f0f0;">
          <button type="button" data-rc-act="export-png" class="rc-btn"
            style="flex:1;padding:11px 0;border:1px solid #e0e0e0;border-radius:12px;background:#fff;font-weight:700;cursor:pointer;">PNG 저장</button>
          <button type="button" data-rc-act="export-jpg" class="rc-btn rc-btn-primary"
            style="flex:1;padding:11px 0;border:none;border-radius:12px;background:linear-gradient(135deg,#FF6B9D,#F18091);color:#fff;font-weight:700;cursor:pointer;">JPG 저장</button>
        </footer>
      </div>`;
    document.body.appendChild(sheet);
    _bindSheet(sheet);
    return sheet;
  }

  function _bindSheet(sheet) {
    sheet.addEventListener('click', (e) => {
      if (e.target === sheet) return _close();
      const act = e.target.closest('[data-rc-act]')?.dataset.rcAct;
      if (act === 'close') return _close();
      if (act === 'pick') return sheet.querySelector('#rcPicker').click();
      if (act === 'export-png') return _export('png');
      if (act === 'export-jpg') return _export('jpg');
    });
    sheet.querySelectorAll('[data-rc-field]').forEach(inp => {
      inp.addEventListener('input', () => {
        const key = inp.dataset.rcField;
        if (key === 'service') _state.serviceName = inp.value;
        else if (key === 'shop') _state.shopName = inp.value;
        else if (key === 'price') _state.priceText = inp.value;
        _redraw();
      });
    });
    sheet.querySelector('#rcPicker').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) _loadImage(URL.createObjectURL(f));
    });
    window.addEventListener('keydown', _onKeydown);
  }

  function _onKeydown(e) {
    if (e.key !== 'Escape') return;
    const sheet = document.getElementById(SHEET_ID);
    if (sheet && sheet.style.display !== 'none') { e.preventDefault(); _close(); }
  }

  function _loadImage(src) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      _state.img = img;
      const empty = document.getElementById('rcEmpty');
      const cv = document.getElementById(CV_ID);
      if (empty) empty.style.display = 'none';
      if (cv) cv.style.display = 'block';
      _redraw();
    };
    img.onerror = () => _toast('사진을 불러오지 못했어요', 'error');
    img.src = src;
  }

  // ── 캔버스 합성 (1080×1920 cover crop + 그라데이션 + 텍스트) ──
  function _redraw() {
    const cv = document.getElementById(CV_ID);
    if (!cv || !_state || !_state.img) return;
    cv.width = CV_W;
    cv.height = CV_H;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, CV_W, CV_H);

    // 사진 cover crop
    const img = _state.img;
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const targetAR = CV_W / CV_H;
    const imgAR = iw / ih;
    let sx, sy, sw, sh;
    if (imgAR > targetAR) {
      sh = ih; sw = Math.round(ih * targetAR);
      sx = Math.round((iw - sw) / 2); sy = 0;
    } else {
      sw = iw; sh = Math.round(iw / targetAR);
      sx = 0; sy = Math.round((ih - sh) / 2);
    }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, CV_W, CV_H);

    // 가독성 — 하단 1/3 그라데이션 어둡게
    const grad = ctx.createLinearGradient(0, CV_H * 0.45, 0, CV_H);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.65)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CV_W, CV_H);

    // 시술명 (큰 글씨) — 하단 중앙
    const service = (_state.serviceName || '').trim();
    if (service) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = 22;
      ctx.font = `900 ${_fitFont(ctx, service, CV_W * 0.88, 180, 72)}px Pretendard, "Noto Sans KR", sans-serif`;
      ctx.fillText(service, CV_W / 2, CV_H * 0.78, CV_W * 0.9);
      ctx.restore();
    }

    // 샵명 · 가격 (작은 글씨) — 시술명 아래
    const shop = (_state.shopName || '').trim();
    const price = (_state.priceText || '').trim();
    const subParts = [];
    if (shop) subParts.push(shop);
    if (price) subParts.push(price);
    if (subParts.length) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = _state.brandColor || '#FFD2DA';
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = 14;
      ctx.font = `700 42px Pretendard, "Noto Sans KR", sans-serif`;
      ctx.fillText(subParts.join('  ·  '), CV_W / 2, CV_H * 0.88, CV_W * 0.9);
      ctx.restore();
    }
  }

  // 너비에 맞게 폰트 사이즈 자동 축소 (최대 maxPx, 최소 minPx).
  function _fitFont(ctx, text, maxWidth, maxPx, minPx) {
    let size = maxPx;
    while (size > minPx) {
      ctx.font = `900 ${size}px Pretendard, "Noto Sans KR", sans-serif`;
      const w = ctx.measureText(text).width;
      if (w <= maxWidth) return size;
      size -= 6;
    }
    return minPx;
  }

  function _export(format) {
    const cv = document.getElementById(CV_ID);
    if (!cv || !_state || !_state.img) return _toast('사진을 먼저 골라주세요');
    const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
    cv.toBlob((blob) => {
      if (!blob) return _toast('저장 실패 — 다시 시도해 주세요', 'error');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'itdasy-reels-cover-' + Date.now() + '.' + format;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
      _toast('릴스 커버 ' + format.toUpperCase() + ' 저장 완료', 'success');
    }, mime, 0.95);
  }

  function _fillInitialInputs() {
    const sheet = document.getElementById(SHEET_ID);
    if (!sheet) return;
    const f = (k, v) => { const el = sheet.querySelector(`[data-rc-field="${k}"]`); if (el) el.value = v || ''; };
    f('service', _state.serviceName);
    f('shop', _state.shopName);
    f('price', _state.priceText);
  }

  function open(opts) {
    opts = opts || {};
    _state = _initState(opts);
    const sheet = _ensureSheet();
    sheet.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    _fillInitialInputs();
    // 사진 초기화: 비어있으면 empty UI, 있으면 자동 로드
    const cv = document.getElementById(CV_ID);
    const empty = document.getElementById('rcEmpty');
    if (cv) cv.style.display = 'none';
    if (empty) empty.style.display = 'flex';
    if (_state.photoUrl) _loadImage(_state.photoUrl);
  }

  function _close() {
    const sheet = document.getElementById(SHEET_ID);
    if (sheet) sheet.style.display = 'none';
    document.body.style.overflow = '';
    _state = null;
    window.removeEventListener('keydown', _onKeydown);
  }

  // 공개 API
  window.ReelsCover = { open: open, close: _close };
  window.openReelsCover = open;

  // app-assistant.js 로컬 핸들러 — kind='open_reels_cover'
  function _registerLocal() {
    if (window.ItdasyAssistant && typeof window.ItdasyAssistant.registerLocalHandler === 'function') {
      window.ItdasyAssistant.registerLocalHandler('open_reels_cover', async (action) => {
        const p = (action && action.payload) || {};
        open(p);
        return { message: '릴스 커버 화면을 열었어요' };
      });
      return true;
    }
    return false;
  }
  if (!_registerLocal()) {
    let tries = 0;
    const iv = setInterval(() => {
      if (_registerLocal() || ++tries > 50) clearInterval(iv);
    }, 100);
  }
})();
