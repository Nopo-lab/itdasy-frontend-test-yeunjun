/* 잇데이 — 스마트 콜라주 (PE-9) 2026-05-19 v207
   사진 2-6장 → AI 최적 레이아웃 자동 배치 */
(function () {
  'use strict';
  if (window.PhotoEditorCollage) return;

  const LAYOUTS = {
    2: [
      { name: '좌우', cells: [{x:0,y:0,w:.5,h:1},{x:.5,y:0,w:.5,h:1}] },
      { name: '상하', cells: [{x:0,y:0,w:1,h:.5},{x:0,y:.5,w:1,h:.5}] },
    ],
    3: [
      { name: '1+2', cells: [{x:0,y:0,w:1,h:.5},{x:0,y:.5,w:.5,h:.5},{x:.5,y:.5,w:.5,h:.5}] },
      { name: '2+1', cells: [{x:0,y:0,w:.5,h:.5},{x:.5,y:0,w:.5,h:.5},{x:0,y:.5,w:1,h:.5}] },
    ],
    4: [
      { name: '그리드', cells: [{x:0,y:0,w:.5,h:.5},{x:.5,y:0,w:.5,h:.5},{x:0,y:.5,w:.5,h:.5},{x:.5,y:.5,w:.5,h:.5}] },
    ],
    5: [
      { name: '1+4', cells: [{x:0,y:0,w:1,h:.5},{x:0,y:.5,w:.25,h:.5},{x:.25,y:.5,w:.25,h:.5},{x:.5,y:.5,w:.25,h:.5},{x:.75,y:.5,w:.25,h:.5}] },
    ],
    6: [
      { name: '2×3', cells: [{x:0,y:0,w:1/3,h:.5},{x:1/3,y:0,w:1/3,h:.5},{x:2/3,y:0,w:1/3,h:.5},{x:0,y:.5,w:1/3,h:.5},{x:1/3,y:.5,w:1/3,h:.5},{x:2/3,y:.5,w:1/3,h:.5}] },
    ],
  };

  function _toast(msg) { if (window.showToast) window.showToast(msg); }

  function open() {
    let pop = document.getElementById('peCollagePop');
    if (!pop) { pop = document.createElement('div'); pop.id = 'peCollagePop'; pop.style.cssText = 'position:fixed;inset:0;z-index:10100;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:16px;'; document.body.appendChild(pop); }
    pop.innerHTML = `<div style="background:var(--surface,#fff);width:100%;max-width:420px;border-radius:20px;padding:24px;max-height:85vh;overflow-y:auto;">
      <div style="font-size:17px;font-weight:800;margin-bottom:4px;">🖼️ 스마트 콜라주</div>
      <div style="font-size:12px;color:var(--text3);margin-bottom:16px;">사진 2~6장을 선택하면 자동으로 레이아웃을 잡아드려요</div>
      <input type="file" id="collageFileInput" accept="image/*" multiple style="display:none;">
      <button onclick="document.getElementById('collageFileInput').click()" style="width:100%;height:52px;border:2px dashed var(--accent,#F18091);border-radius:14px;background:rgba(241,128,145,0.04);color:var(--accent);font-size:14px;font-weight:700;cursor:pointer;">📷 사진 고르기 (2~6장)</button>
      <div id="collagePreview" style="margin-top:16px;"></div>
      <div style="display:flex;gap:8px;margin-top:16px;">
        <button onclick="document.getElementById('peCollagePop').style.display='none'" style="flex:1;height:44px;border:1px solid #e5e7eb;border-radius:12px;background:#fff;font-weight:600;cursor:pointer;">취소</button>
        <button id="collageCreateBtn" disabled style="flex:1.5;height:44px;border:none;border-radius:12px;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;font-weight:800;cursor:pointer;opacity:0.5;">콜라주 만들기</button>
      </div>
    </div>`;
    pop.style.display = 'flex';

    const fileInput = pop.querySelector('#collageFileInput');
    const images = [];
    fileInput.addEventListener('change', e => {
      const files = Array.from(e.target.files || []).slice(0, 6);
      if (files.length < 2) return _toast('최소 2장을 선택해주세요');
      images.length = 0;
      let loaded = 0;
      files.forEach(f => {
        const img = new Image();
        img.onload = () => { loaded++; if (loaded === files.length) { pop.querySelector('#collageCreateBtn').disabled = false; pop.querySelector('#collageCreateBtn').style.opacity = '1'; pop.querySelector('#collagePreview').innerHTML = `<div style="font-size:13px;color:var(--accent);font-weight:600;">${files.length}장 선택 완료 ✓</div>`; } };
        img.src = URL.createObjectURL(f);
        images.push(img);
      });
    });

    pop.querySelector('#collageCreateBtn').addEventListener('click', () => {
      if (images.length < 2) return;
      const result = _compose(images);
      pop.style.display = 'none';
      // 편집기에 로드
      if (window.PhotoEditor) {
        window.PhotoEditor.open({ src: result });
        _toast('콜라주 완성! 추가 편집할 수 있어요');
      }
    });
  }

  function _compose(images) {
    const n = Math.min(images.length, 6);
    const layouts = LAYOUTS[n] || LAYOUTS[2];
    const layout = layouts[0];
    const W = 1080, H = 1080;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#1a1a20'; ctx.fillRect(0, 0, W, H);
    const gap = 4;
    layout.cells.forEach((c, i) => {
      if (i >= images.length) return;
      const img = images[i];
      const dx = Math.round(c.x * W) + gap, dy = Math.round(c.y * H) + gap;
      const dw = Math.round(c.w * W) - gap * 2, dh = Math.round(c.h * H) - gap * 2;
      // cover fit
      const sAR = img.naturalWidth / img.naturalHeight, dAR = dw / dh;
      let sx, sy, sw, sh;
      if (sAR > dAR) { sh = img.naturalHeight; sw = sh * dAR; sx = (img.naturalWidth - sw) / 2; sy = 0; }
      else { sw = img.naturalWidth; sh = sw / dAR; sx = 0; sy = (img.naturalHeight - sh) / 2; }
      ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
    });
    return cv.toDataURL('image/jpeg', 0.92);
  }

  window.PhotoEditorCollage = { open };
})();
