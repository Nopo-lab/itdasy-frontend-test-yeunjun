/* 사진 편집기 — 뷰티 모듈 (2026-05-18 v169 슬라이더 10종)
   설계 문서: ~/.claude/plans/zesty-snacking-clarke.md §25 / §25.5

   메인 (app-photo-editor.js) 의 _internal API 로 등록.
     • registerTabPanel('beauty', { html, bind })
     • registerDrawHook('beauty', applyBeauty)

   책임:
     • 뷰티 패널 HTML (슬라이더 10종 — 얼굴/피부 4, 손·네일 2, 모발 3, 속눈썹 1)
     • 뷰티 패널 이벤트 바인딩 (input → state 갱신 + scheduleRedraw)
     • _applyBeauty — HSV 마스킹 픽셀 walk
       (피부톤·붉은기·잡티·눈가그림자·손피부톤·네일광택·모발윤기·모발색감·머리결·속눈썹선명도)
*/
(function () {
  'use strict';

  function _clamp(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

  // 간단 unsharp mask — 박스 블러로 저주파 만든 뒤 (원본 - 저주파) 가산.
  // 메인이 helpers 로 노출하지 않은 도구라 자체 보유.
  function _boxBlur(img, w, h, r) {
    const out = new ImageData(w, h);
    const d = img.data, o = out.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let rSum = 0, gSum = 0, bSum = 0, n = 0;
        for (let kx = -r; kx <= r; kx++) {
          const xx = Math.min(w - 1, Math.max(0, x + kx));
          const p = (y * w + xx) * 4;
          rSum += d[p]; gSum += d[p+1]; bSum += d[p+2]; n++;
        }
        const p = (y * w + x) * 4;
        o[p] = rSum / n; o[p+1] = gSum / n; o[p+2] = bSum / n; o[p+3] = d[p+3];
      }
    }
    return out;
  }
  function _unsharpMask(ctx, w, h, strength) {
    try {
      const src = ctx.getImageData(0, 0, w, h);
      const blur = _boxBlur(src, w, h, 1);
      const out = ctx.createImageData(w, h);
      const k = 1 + strength * 1.2;
      for (let i = 0; i < src.data.length; i += 4) {
        out.data[i]   = _clamp(src.data[i]   + (src.data[i]   - blur.data[i])   * (k - 1));
        out.data[i+1] = _clamp(src.data[i+1] + (src.data[i+1] - blur.data[i+1]) * (k - 1));
        out.data[i+2] = _clamp(src.data[i+2] + (src.data[i+2] - blur.data[i+2]) * (k - 1));
        out.data[i+3] = src.data[i+3];
      }
      ctx.putImageData(out, 0, 0);
    } catch (_e) { /* CORS·메모리 부족 시 skip */ }
  }

  // ── 패널 HTML (helpers.slider 가 있으면 그것 활용; 없으면 자체 슬라이더 마크업) ──
  function _slider(esc, label, key, val, min, max, step) {
    return `
      <label class="pe-slider">
        <div class="pe-slider-head">
          <span>${esc(label)}</span>
          <span class="pe-slider-val" data-pe-slider-val="${key}">${val}</span>
        </div>
        <input type="range" min="${min}" max="${max}" step="${step}" value="${val}" data-pe-slider="${key}" />
      </label>
    `;
  }

  function _panelBeautyHTML(state) {
    const DEF = { skin: 0, redness: 0, hairShine: 0, nailGloss: 0, lashSharp: 0,
                  blemish: 0, handSkin: 0, hairColor: 0, hairDetail: 0, eyeShadow: 0 };
    const b = Object.assign({}, DEF, state.beauty || {});
    // helpers.esc 는 bind 단계에서 받음 — 여기는 메인에서 노출된 글로벌이 없으므로 단순 escape.
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, ch =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
    return `
      <div class="pe-group-label">얼굴 · 피부</div>
      ${_slider(esc, '피부톤 정리',  'skin',      b.skin,      0, 100, 1)}
      ${_slider(esc, '붉은기 완화',  'redness',   b.redness,   0, 100, 1)}
      ${_slider(esc, '잡티 완화',    'blemish',   b.blemish,   0, 100, 1)}
      ${_slider(esc, '눈가 그림자',  'eyeShadow', b.eyeShadow, 0, 100, 1)}
      <div class="pe-group-label">손 · 네일</div>
      ${_slider(esc, '손 피부톤',    'handSkin',  b.handSkin,  0, 100, 1)}
      ${_slider(esc, '네일 광택',    'nailGloss', b.nailGloss, 0, 100, 1)}
      <div class="pe-group-label">모발</div>
      ${_slider(esc, '모발 윤기',    'hairShine', b.hairShine, 0, 100, 1)}
      ${_slider(esc, '모발 색감',    'hairColor', b.hairColor, -50, 50, 1)}
      ${_slider(esc, '머리결',       'hairDetail', b.hairDetail, 0, 100, 1)}
      <div class="pe-group-label">속눈썹</div>
      ${_slider(esc, '속눈썹 선명도', 'lashSharp', b.lashSharp, 0, 100, 1)}
      <div class="pe-hint">시술 결과가 왜곡되지 않게 자연 보정 위주로 동작해요. 슬라이더는 손 떼는 순간 반영됩니다. 모발 색감만 0 중심 좌우 슬라이더예요(- 차가운 / + 따뜻).</div>
    `;
  }

  function _bindBeautyPanel(panel, state, helpers) {
    const scheduleRedraw = helpers.scheduleRedraw;
    const pushHistory = helpers.pushHistory;
    panel.querySelectorAll('[data-pe-slider]').forEach(inp => {
      inp.addEventListener('input', () => {
        const key = inp.dataset.peSlider;
        state.beauty[key] = +inp.value;
        const out = panel.querySelector(`[data-pe-slider-val="${key}"]`);
        if (out) out.textContent = inp.value;
        scheduleRedraw(); // 드래그 중 80ms throttle로 픽셀 합성
      });
      inp.addEventListener('change', () => pushHistory());
    });
  }

  // ── 뷰티 보정 (픽셀 walk + HSV 마스킹) — _redraw 안에서 호출됨 ──
  // 모두 0이면 즉시 return — 비용 0.
  function _applyBeauty(ctx, w, h, b /*, helpers */) {
    if (!b) return;
    // hairColor 만 양방향(-50~+50) — 0이 아닐 때만 동작.
    const anyOn = b.skin || b.redness || b.hairShine || b.nailGloss || b.lashSharp
      || b.blemish || b.handSkin || b.hairColor || b.hairDetail || b.eyeShadow;
    if (!anyOn) return;

    // 머리결 (edge enhance) — 픽셀 walk 이전에 처리하면 다른 보정의 입력이 변하므로,
    // 다른 보정과 동일하게 putImageData 이후, 속눈썹 선명도 직전에 처리.
    // (블러 + 가산을 한 번 더 일으키는 비용이라 임계값 사용.)

    let data;
    try { data = ctx.getImageData(0, 0, w, h); }
    catch (_e) { return; /* CORS 제한 시 skip */ }
    const d = data.data;
    const skinK     = (b.skin || 0) / 100;
    const redK      = (b.redness || 0) / 100;
    const hairK     = (b.hairShine || 0) / 100;
    const nailK     = (b.nailGloss || 0) / 100;
    const blemishK  = (b.blemish || 0) / 100;
    const handK     = (b.handSkin || 0) / 100;
    const eyeShK    = (b.eyeShadow || 0) / 100;
    // hairColor 는 -50~+50, 부호 보존해서 -0.5~+0.5 로 정규화.
    const hairColK  = (b.hairColor || 0) / 100; // 양수=따뜻, 음수=차가움

    // 잡티 완화용 저주파 (블러) — blemishK > 0 일 때만 한 번 생성.
    let blurD = null;
    if (blemishK > 0) {
      try {
        const blurImg = _boxBlur(data, w, h, 1);
        blurD = blurImg.data;
      } catch (_e) { blurD = null; }
    }

    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i+1], bl = d[i+2];
      // 피부톤 hue 대략 (10°~50°): R > G > B
      const isSkin = r > 80 && r > g && g > bl && (r - bl) > 15 && (r - bl) < 110;
      if (isSkin) {
        if (skinK > 0) {
          // 약한 매끄러움 — 채도 살짝 ↑, 명도 살짝 ↑
          d[i]   = _clamp(d[i]   + 4 * skinK);
          d[i+1] = _clamp(d[i+1] + 2 * skinK);
          d[i+2] = _clamp(d[i+2] + 1 * skinK);
        }
        if (redK > 0) {
          // 붉은기 완화 — R 채널만 살짝 ↓
          d[i] = _clamp(d[i] - 10 * redK);
        }
        // 손 피부톤 — 피부 픽셀 전체에 약한 균일화(살짝 따뜻하게).
        // 얼굴 마스킹 분리는 P2+. 슬라이더 강도 자체를 낮게 잡아 얼굴에 적용돼도 자연스럽도록.
        if (handK > 0) {
          d[i]   = _clamp(d[i]   + 3 * handK);
          d[i+1] = _clamp(d[i+1] + 1.5 * handK);
          d[i+2] = _clamp(d[i+2] - 1 * handK);
        }
        // 잡티 완화 — 피부 영역에서 명도 분산 큰 픽셀(=점/잡티)을 저주파(블러)와 섞어 감쇠.
        if (blemishK > 0 && blurD) {
          const lum  = (d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114);
          const blum = (blurD[i] * 0.299 + blurD[i+1] * 0.587 + blurD[i+2] * 0.114);
          // 주변보다 어두운 점이 잡티의 전형 — 차이 임계 12 이상에서만.
          if (Math.abs(lum - blum) > 12) {
            const mix = 0.6 * blemishK; // 최대 60% 까지 저주파 혼합
            d[i]   = _clamp(d[i]   * (1 - mix) + blurD[i]   * mix);
            d[i+1] = _clamp(d[i+1] * (1 - mix) + blurD[i+1] * mix);
            d[i+2] = _clamp(d[i+2] * (1 - mix) + blurD[i+2] * mix);
          }
        }
        // 눈가 그림자 정리 — 피부 hue 인데 명도 낮은(=다크서클) 픽셀에 명도 살짝 ↑.
        if (eyeShK > 0) {
          const lum = (d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114);
          if (lum < 130) {
            // 어두울수록 더 많이 끌어올림 (130 - lum)/130 가중치.
            const w2 = (130 - lum) / 130; // 0~1
            d[i]   = _clamp(d[i]   + 12 * eyeShK * w2);
            d[i+1] = _clamp(d[i+1] + 10 * eyeShK * w2);
            d[i+2] = _clamp(d[i+2] +  8 * eyeShK * w2);
          }
        }
      }
      // 모발 윤기 — 어두운 영역(머리카락 짙은 톤)에 하이라이트 픽셀 살짝 ↑
      if (hairK > 0) {
        const lum = (d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114);
        if (lum > 80 && lum < 180 && Math.abs(d[i] - d[i+1]) < 40 && Math.abs(d[i+1] - d[i+2]) < 40) {
          d[i]   = _clamp(d[i]   + 6 * hairK);
          d[i+1] = _clamp(d[i+1] + 6 * hairK);
          d[i+2] = _clamp(d[i+2] + 4 * hairK);
        }
      }
      // 모발 색감 — 어두운 영역에 색온도 살짝 이동. 양방향(-0.5~+0.5).
      // 양수=따뜻한 갈색(R↑·G살짝↑·B↓), 음수=차가운 톤(R↓·B↑).
      if (hairColK !== 0) {
        const lum = (d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114);
        if (lum < 160) {
          const k = hairColK; // -0.5 ~ +0.5
          d[i]   = _clamp(d[i]   + 10 * k);
          d[i+1] = _clamp(d[i+1] +  3 * k);
          d[i+2] = _clamp(d[i+2] - 10 * k);
        }
      }
      // 네일 광택 — 명도 상위 픽셀 부스트
      if (nailK > 0) {
        const lum = (d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114);
        if (lum > 180) {
          d[i]   = _clamp(d[i]   + 8 * nailK);
          d[i+1] = _clamp(d[i+1] + 8 * nailK);
          d[i+2] = _clamp(d[i+2] + 8 * nailK);
        }
      }
    }
    ctx.putImageData(data, 0, 0);
    // 머리결 — 어두운 영역 edge enhance. lashSharp 와 같이 두 번 호출되지 않도록 임계값 사용.
    if (b.hairDetail > 10) _unsharpMask(ctx, w, h, b.hairDetail / 300);
    // 속눈썹 선명도 — edge enhance (unsharp mask 약하게 한 번 더)
    if (b.lashSharp > 10) _unsharpMask(ctx, w, h, b.lashSharp / 200);
  }

  // ── 메인 모듈 준비될 때까지 폴링 후 등록 ──
  function _register() {
    if (!window.PhotoEditor || !window.PhotoEditor._internal) return false;
    const i = window.PhotoEditor._internal;
    i.registerTabPanel('beauty', { html: _panelBeautyHTML, bind: _bindBeautyPanel });
    i.registerDrawHook('beauty', _applyBeauty);
    return true;
  }
  if (!_register()) {
    let tries = 0;
    const iv = setInterval(() => {
      if (_register() || ++tries > 50) clearInterval(iv);
    }, 100);
  }
})();
