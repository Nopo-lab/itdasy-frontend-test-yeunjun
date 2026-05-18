/* 잇데이 — AI 사진 품질 스코어 (PE-10) 2026-05-19 v207
   구도/조명/선명도 점수 + 개선 팁 제안 */
(function () {
  'use strict';
  if (window.PhotoEditorQuality) return;

  function _toast(msg) { if (window.showToast) window.showToast(msg); }

  function _panelHTML(state) {
    return `
      <div class="pe-field-label">📊 AI 사진 품질 분석</div>
      <div class="pe-panel-row"><button type="button" class="pe-action-btn" data-quality-analyze>🔍 사진 품질 분석하기</button></div>
      <div id="peQualityResult" style="margin-top:12px;"></div>
      <div class="pe-hint">사진의 구도, 조명, 선명도를 AI가 분석하고 개선 팁을 알려줘요</div>`;
  }

  function _bindPanel(panel, state, helpers) {
    const btn = panel.querySelector('[data-quality-analyze]');
    if (btn) btn.addEventListener('click', () => _analyze(state, helpers));
  }

  function _analyze(state, helpers) {
    if (!state || !state.originalImg) return _toast('편집할 사진을 먼저 골라주세요');

    const img = state.originalImg;
    const cv = document.createElement('canvas');
    const W = Math.min(400, img.naturalWidth || img.width);
    const ratio = W / (img.naturalWidth || img.width);
    const H = Math.round((img.naturalHeight || img.height) * ratio);
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.drawImage(img, 0, 0, W, H);

    let imgData;
    try { imgData = ctx.getImageData(0, 0, W, H); }
    catch (_) { return _toast('CORS로 분석 불가'); }

    const d = imgData.data;
    // 밝기 분석
    let totalBrightness = 0, darkPixels = 0, brightPixels = 0;
    for (let i = 0; i < d.length; i += 4) {
      const luma = d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114;
      totalBrightness += luma;
      if (luma < 50) darkPixels++;
      if (luma > 230) brightPixels++;
    }
    const pixelCount = d.length / 4;
    const avgBrightness = totalBrightness / pixelCount;
    const darkRatio = darkPixels / pixelCount;
    const brightRatio = brightPixels / pixelCount;

    // 선명도 분석 (라플라시안 분산)
    let sharpnessVar = 0;
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const idx = (y * W + x) * 4;
        const c = d[idx]; // R channel
        const lap = -4 * c + d[idx-4] + d[idx+4] + d[((y-1)*W+x)*4] + d[((y+1)*W+x)*4];
        sharpnessVar += lap * lap;
      }
    }
    sharpnessVar /= ((W - 2) * (H - 2));

    // 구도 — 중심 vs 삼등분 (간단 분석)
    const centerWeight = _centerWeightScore(d, W, H);

    // 점수 계산
    const lightScore = Math.round(Math.min(100, Math.max(0,
      avgBrightness > 60 && avgBrightness < 200 ? 85 + (1 - Math.abs(avgBrightness - 130) / 130) * 15
      : avgBrightness < 60 ? 30 + avgBrightness / 2
      : 60 - (avgBrightness - 200) / 2
    )));
    const sharpScore = Math.round(Math.min(100, Math.max(0, Math.sqrt(sharpnessVar) * 0.8)));
    const compScore = Math.round(centerWeight);
    const overall = Math.round((lightScore * 0.35 + sharpScore * 0.35 + compScore * 0.3));

    // 팁 생성
    const tips = [];
    if (lightScore < 60) tips.push('💡 사진이 어두워요 — 조명 탭에서 밝기를 올려보세요');
    if (lightScore > 90 && brightRatio > 0.3) tips.push('☀️ 과다 노출 — 밝기를 조금 낮춰보세요');
    if (sharpScore < 50) tips.push('🔍 선명도가 낮아요 — 보정 탭에서 선명도를 올려보세요');
    if (compScore < 50) tips.push('📐 구도 개선 — 피사체를 중앙이나 삼등분선에 배치해 보세요');
    if (darkRatio > 0.4) tips.push('🌙 어두운 영역이 많아요 — 릴라이팅 탭을 사용해 보세요');
    if (tips.length === 0) tips.push('✨ 훌륭한 사진이에요! 인스타에 올리기 좋아요');

    // 결과 렌더
    const result = document.getElementById('peQualityResult');
    if (!result) return;
    result.innerHTML = `
      <div style="background:rgba(241,128,145,0.04);border:1px solid rgba(241,128,145,0.12);border-radius:14px;padding:16px;">
        <div style="text-align:center;margin-bottom:12px;">
          <div style="font-size:48px;font-weight:900;color:${overall>=80?'#4ade80':overall>=60?'#fbbf24':'#ef4444'};">${overall}</div>
          <div style="font-size:12px;font-weight:700;color:var(--text3);">종합 점수</div>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:14px;">
          <div style="flex:1;text-align:center;padding:8px;background:#fafafa;border-radius:10px;">
            <div style="font-size:20px;font-weight:800;">${lightScore}</div>
            <div style="font-size:10px;color:#888;">조명</div>
          </div>
          <div style="flex:1;text-align:center;padding:8px;background:#fafafa;border-radius:10px;">
            <div style="font-size:20px;font-weight:800;">${sharpScore}</div>
            <div style="font-size:10px;color:#888;">선명도</div>
          </div>
          <div style="flex:1;text-align:center;padding:8px;background:#fafafa;border-radius:10px;">
            <div style="font-size:20px;font-weight:800;">${compScore}</div>
            <div style="font-size:10px;color:#888;">구도</div>
          </div>
        </div>
        <div style="font-size:12px;font-weight:700;margin-bottom:6px;">💡 개선 팁</div>
        ${tips.map(t => `<div style="font-size:12px;line-height:1.6;color:var(--text2);padding:4px 0;">${t}</div>`).join('')}
      </div>`;
  }

  function _centerWeightScore(d, W, H) {
    let centerLuma = 0, edgeLuma = 0, cc = 0, ec = 0;
    const cx = W / 2, cy = H / 2, r = Math.min(W, H) * 0.3;
    for (let y = 0; y < H; y += 4) {
      for (let x = 0; x < W; x += 4) {
        const i = (y * W + x) * 4;
        const luma = d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114;
        const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        if (dist < r) { centerLuma += luma; cc++; }
        else { edgeLuma += luma; ec++; }
      }
    }
    const cAvg = cc > 0 ? centerLuma / cc : 128;
    const eAvg = ec > 0 ? edgeLuma / ec : 128;
    const contrast = Math.abs(cAvg - eAvg);
    return Math.min(100, 50 + contrast * 0.5);
  }

  // 탭 등록
  function _register() {
    if (!window.PhotoEditor || !window.PhotoEditor._internal) return false;
    const i = window.PhotoEditor._internal;
    const tabs = document.getElementById('peTabs');
    if (tabs && !tabs.querySelector('[data-pe-tab="quality"]')) {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'pe-tab'; btn.dataset.peTab = 'quality'; btn.textContent = '품질';
      const exp = tabs.querySelector('[data-pe-tab="export"]');
      if (exp) tabs.insertBefore(btn, exp); else tabs.appendChild(btn);
    }
    i.registerTabPanel('quality', { html: _panelHTML, bind: _bindPanel });
    return true;
  }
  if (!_register()) { let t = 0; const iv = setInterval(() => { if (_register() || ++t > 50) clearInterval(iv); }, 100); }

  window.PhotoEditorQuality = { analyze: _analyze };
})();
