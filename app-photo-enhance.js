// Itdasy Studio - 시술 사진 디테일 보정 v2 (2026-05-03)

const _ENHANCE_DEFAULTS = {
  cleanup: 0,
  color: 0,
  smooth: 0,
  red: 0,
};

function _enhanceShopType() {
  return (localStorage.getItem('shop_type') || '').toLowerCase();
}

function _enhanceVisibleKeys() {
  const type = _enhanceShopType();
  const hair = ['붙임머리', 'extension', 'hair', '헤어', '헤어샵', '미용'].some(x => type.includes(x));
  const lash = ['속눈썹', 'lash'].some(x => type.includes(x));
  const semi = ['반영구', 'tattoo', '문신'].some(x => type.includes(x));
  const nail = ['네일', 'nail'].some(x => type.includes(x));
  if (hair) return ['cleanup', 'color', 'smooth'];
  if (lash) return ['cleanup', 'smooth', 'red'];
  if (semi) return ['color', 'red'];
  if (nail) return ['color'];
  // shop_type 미설정 또는 미분류 → 전체 노출
  return ['cleanup', 'color', 'smooth', 'red'];
}

function openEnhancePanel() {
  const panel = document.getElementById('enhancePanel');
  if (!panel) return;
  panel.classList.add('ws-panel--open');
  _renderEnhancePanel();
}

function closeEnhancePanel() {
  document.getElementById('enhancePanel')?.classList.remove('ws-panel--open');
}

function _enhanceRow(key, label, hint) {
  return `
    <label data-enhance-row="${key}" style="display:block;margin-bottom:14px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:7px;">
        <span style="font-size:13px;font-weight:800;color:var(--text);">${label}</span>
        <span data-enhance-val="${key}" style="font-size:11px;color:var(--text3);">0</span>
      </div>
      <input data-enhance="${key}" type="range" min="0" max="100" value="${_ENHANCE_DEFAULTS[key]}" style="width:100%;">
      <div style="font-size:11px;color:var(--text3);line-height:1.45;margin-top:3px;">${hint}</div>
    </label>
  `;
}

function _renderEnhancePanel() {
  const body = document.getElementById('enhancePanelBody');
  if (!body) return;
  const visible = new Set(_enhanceVisibleKeys());
  body.innerHTML = `
    <div style="font-size:12px;color:var(--text3);line-height:1.55;margin-bottom:14px;">
      선택한 사진에만 적용돼요. 사진을 고른 뒤 아래 값을 조절하세요.
    </div>
    ${_enhanceRow('cleanup', '잔머리 정리', '사진 가장자리의 얇은 잔머리·잔털을 배경으로 녹여요.')}
    ${_enhanceRow('color', '색 균일화', '뿌염·얼룩진 색감을 부드럽게 맞춰요.')}
    ${_enhanceRow('smooth', '결 부드럽게', '머릿결·속눈썹 결을 매끈하게 보여줘요.')}
    ${_enhanceRow('red', '충혈 제거', '시술 직후 붉어진 눈 흰자를 자연스럽게 낮춰요.')}
    <button type="button" onclick="applyEnhanceToSelected()" class="btn-primary" style="width:100%;margin-top:6px;">보정 적용</button>
  `;
  body.querySelectorAll('[data-enhance-row]').forEach(row => {
    row.style.display = visible.has(row.dataset.enhanceRow) ? 'block' : 'none';
  });
  body.querySelectorAll('[data-enhance]').forEach(input => {
    input.addEventListener('input', () => {
      body.querySelector(`[data-enhance-val="${input.dataset.enhance}"]`).textContent = input.value;
    });
  });
}

function _enhanceSettings() {
  const panel = document.getElementById('enhancePanel');
  const out = { ..._ENHANCE_DEFAULTS };
  Object.keys(out).forEach(key => {
    const input = panel?.querySelector(`[data-enhance="${key}"]`);
    out[key] = Math.max(0, Math.min(100, parseInt(input?.value || '0', 10))) / 100;
  });
  return out;
}

function _loadEnhanceImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function _drawEnhanceBase(img) {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  canvas.getContext('2d').drawImage(img, 0, 0);
  return canvas;
}

// 색 균일화 + 충혈 제거 — pixel 단위
function _applyColorPixels(data, opt) {
  const color = opt.color || 0;
  const red = opt.red || 0;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i], g = data[i + 1], b = data[i + 2];
    const avg = (r + g + b) / 3;

    // 색 균일화: saturation 감쇄 (회색 방향으로 끌어당김) — 계수 0.65로 강화
    if (color > 0) {
      r += (avg - r) * color * 0.65;
      g += (avg - g) * color * 0.65;
      b += (avg - b) * color * 0.65;
    }

    // 충혈 제거: 밝고 붉은 픽셀만 타겟 (눈 흰자)
    if (red > 0 && avg > 110 && r > g + 15 && r > b + 15) {
      const excess = r - Math.max(g, b);
      r -= excess * red * 0.88;
      g += (255 - g) * red * 0.07;
      b += (255 - b) * red * 0.05;
    }

    data[i]     = Math.max(0, Math.min(255, r));
    data[i + 1] = Math.max(0, Math.min(255, g));
    data[i + 2] = Math.max(0, Math.min(255, b));
  }
}

// 결 부드럽게 — Gaussian blur blend (강화)
function _blendSmooth(canvas, amount) {
  if (!amount) return;
  const ctx = canvas.getContext('2d');
  const original = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const tmp = document.createElement('canvas');
  tmp.width = canvas.width; tmp.height = canvas.height;
  const tctx = tmp.getContext('2d');
  tctx.filter = `blur(${Math.max(0.8, amount * 4)}px)`;
  tctx.drawImage(canvas, 0, 0);
  const blur = tctx.getImageData(0, 0, canvas.width, canvas.height);
  const mix = Math.min(0.55, amount * 0.55);  // 최대 55% 블렌딩
  for (let i = 0; i < original.data.length; i += 4) {
    original.data[i]     += (blur.data[i]     - original.data[i])     * mix;
    original.data[i + 1] += (blur.data[i + 1] - original.data[i + 1]) * mix;
    original.data[i + 2] += (blur.data[i + 2] - original.data[i + 2]) * mix;
  }
  ctx.putImageData(original, 0, 0);
}

// 잔머리 정리 — 주변보다 어두운 픽셀(잔털 후보)을 주변 평균으로 블렌딩
function _applyCleanup(canvas, amount) {
  if (!amount) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;

  // Step 1: 블러 버전 생성 (잔털 제거 기준)
  const tmp = document.createElement('canvas');
  tmp.width = w; tmp.height = h;
  const tctx = tmp.getContext('2d');
  tctx.filter = `blur(${Math.max(1.5, amount * 3.5)}px)`;
  tctx.drawImage(canvas, 0, 0);
  const blurred = tctx.getImageData(0, 0, w, h);

  // Step 2: 원본에서 주변보다 어두운 픽셀(잔털)을 블러 버전으로 대체
  const src = ctx.getImageData(0, 0, w, h);
  const threshold = 0.65;  // 주변보다 35% 이상 어두우면 잔털로 판단
  const strength = Math.min(0.92, amount * 0.92);

  for (let i = 0; i < src.data.length; i += 4) {
    const rS = src.data[i], gS = src.data[i + 1], bS = src.data[i + 2];
    const rB = blurred.data[i], gB = blurred.data[i + 1], bB = blurred.data[i + 2];
    const brightSrc = (rS + gS + bS) / 3;
    const brightBlur = (rB + gB + bB) / 3;

    // 블러 버전보다 크게 어두운 픽셀 = 잔털 후보 → 블러로 교체
    if (brightSrc < brightBlur * threshold) {
      src.data[i]     = rS + (rB - rS) * strength;
      src.data[i + 1] = gS + (gB - gS) * strength;
      src.data[i + 2] = bS + (bB - bS) * strength;
    }
  }
  ctx.putImageData(src, 0, 0);
}

async function _enhanceOnePhoto(photo, opt) {
  const img = await _loadEnhanceImage(photo.editedDataUrl || photo.dataUrl);
  const canvas = _drawEnhanceBase(img);
  const ctx = canvas.getContext('2d');

  // 잔머리 먼저 (원본 기준으로 제거)
  _applyCleanup(canvas, opt.cleanup);

  // 색 균일화 + 충혈 제거
  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
  _applyColorPixels(frame.data, opt);
  ctx.putImageData(frame, 0, 0);

  // 결 부드럽게 (마지막 — 색 처리 후 적용)
  _blendSmooth(canvas, opt.smooth);

  photo.beforeEnhanceDataUrl = photo.editedDataUrl || photo.dataUrl;
  photo.editedDataUrl = canvas.toDataURL('image/jpeg', 0.92);
  photo.mode = 'enhanced';
}

// ── 업종별 자동 보정 프리셋 (PhotoEditor 자동 탭 ⚡ 버튼에서 사용) ──
// localStorage.shop_type 기반으로 4 업종 + 일반 폴백.
// 반환: { label, adjust, beauty } — PhotoEditor _state.adjust / _state.beauty 에 직접 Object.assign.
window.PhotoEnhance = window.PhotoEnhance || {};
// [v183 2026-05-18] 강도 ↑ — 기존 약함 컴플레인 해결.
//   intensity: 'natural'(0.7×) | 'standard'(1.0×) | 'strong'(1.4×) — 사장님 토글 가능.
//   강도 기준은 'standard'. 메이투 수준 체감 위해 redness/lashSharp/hairShine 상향.
//   v180 신규 슬라이더 (yellowness/coolness/textureSmooth/hairColorPop/closeUpDetail) 도 프리셋에 반영.
window.PhotoEnhance.getShopPreset = function(shopType, intensity) {
  const t = (shopType || _enhanceShopType()).toLowerCase();
  const k = intensity === 'natural' ? 0.7 : intensity === 'strong' ? 1.4 : 1.0;
  const _s = (v) => Math.min(100, Math.max(0, Math.round(v * k)));
  const _sym = (v) => Math.max(-50, Math.min(50, Math.round(v * k)));  // hairColor 양방향

  // [v192 2026-05-18] makeup / scalp / general 카테고리 신규 추가
  if (/(메이크업|눈썹|makeup|brow)/.test(t)) {
    return {
      label: '메이크업',
      adjust: { brightness: 108, saturate: 115, sharpness: 30, temperature: 3 },
      beauty: {
        skin: _s(30), redness: _s(25), lipPop: _s(50), eyeColor: _s(40), browSharp: _s(30),
        yellowness: _s(15),
      },
    };
  }
  if (/(두피|탈모|scalp)/.test(t)) {
    return {
      label: '두피탈모',
      adjust: { brightness: 110, saturate: 108, sharpness: 25, temperature: 5 },
      beauty: {
        hairShine: _s(40), hairDetail: _s(30), scalpBoost: _s(55),
        skin: _s(20), redness: _s(25),
      },
    };
  }
  if (/(헤어|붙임머리|미용|hair|extension)/.test(t)) {
    return {
      label: '헤어',
      adjust: { brightness: 105, saturate: 110, sharpness: 35, temperature: 5 },
      beauty: {
        hairShine: _s(55), hairDetail: _s(45), hairColor: _sym(8), hairColorPop: _s(40),
        skin: _s(15), redness: _s(30), yellowness: _s(20),
      },
    };
  }
  if (/(속눈썹|lash)/.test(t)) {
    return {
      label: '속눈썹',
      adjust: { brightness: 105, saturate: 110, sharpness: 50, temperature: 0 },
      beauty: {
        lashSharp: _s(75), closeUpDetail: _s(45), eyeShadow: _s(50),
        redness: _s(40), skin: _s(20), yellowness: _s(15),
      },
    };
  }
  if (/(네일|nail|패디|풋케어|pedi|foot)/.test(t)) {
    return {
      label: t.includes('패디') || /(pedi|foot)/.test(t) ? '패디' : '네일',
      adjust: { brightness: 110, saturate: 120, sharpness: 35, temperature: -3 },
      beauty: {
        handSkin: _s(45), nailGloss: _s(70), coolness: _s(30), nailShape: _s(35),
        redness: _s(30), yellowness: _s(25), skin: _s(15),
      },
    };
  }
  if (/(왁싱|바디|피부|반영구|문신|tattoo|skin|wax|body)/.test(t)) {
    const isBody = /(바디|body)/.test(t);
    const isSkin = /(피부|반영구|문신|tattoo|skin)/.test(t) && !isBody;
    return {
      label: isBody ? '바디' : isSkin ? '피부·반영구' : '왁싱',
      adjust: { brightness: 105, saturate: 102, sharpness: 18, temperature: 2 },
      beauty: {
        skin: _s(45), redness: _s(55), blemish: _s(40), textureSmooth: _s(35),
        eyeShadow: _s(15), hairyArm: isBody ? _s(40) : 0,
      },
    };
  }
  // 기타 / 일반 폴백 — 전체 슬라이더 노출 보장
  return {
    label: '일반',
    adjust: { brightness: 105, saturate: 112, sharpness: 32, temperature: 5 },
    beauty: { skin: _s(15), redness: _s(20), yellowness: _s(10) },
  };
};

async function applyEnhanceToSelected() {
  const slot = _slots.find(s => s.id === _popupSlotId);
  if (!slot) return;
  const selected = slot.photos.filter(p => _popupSelIds.has(p.id) && !p.hidden);
  if (!selected.length) { showToast('먼저 사진을 선택해주세요'); return; }
  const progress = document.getElementById('popupProgress');
  if (progress) { progress.style.display = 'block'; progress.textContent = '보정 중...'; }
  try {
    const opt = _enhanceSettings();
    for (let i = 0; i < selected.length; i++) {
      if (progress) progress.textContent = `보정 중... ${i + 1}/${selected.length}`;
      await _enhanceOnePhoto(selected[i], opt);
    }
    await saveSlotToDB(slot);
    _popupSelIds.clear();
    _renderPopupPhotoGrid(slot);
    closeEnhancePanel();
    showToast(`${selected.length}장 보정 완료`);
  } catch (e) {
    console.warn('사진 보정 실패:', e);
    showToast('보정 실패: ' + (e.message || ''));
  } finally {
    if (progress) progress.style.display = 'none';
  }
}
