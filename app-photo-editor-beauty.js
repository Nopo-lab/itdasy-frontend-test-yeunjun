/* 사진 편집기 — 뷰티 모듈 (2026-05-18 v168 분할)
   설계 문서: ~/.claude/plans/zesty-snacking-clarke.md §25

   메인 (app-photo-editor.js) 의 _internal API 로 등록.
     • registerTabPanel('beauty', { html, bind })
     • registerDrawHook('beauty', applyBeauty)

   책임:
     • 뷰티 패널 HTML (슬라이더 5종)
     • 뷰티 패널 이벤트 바인딩 (input → state 갱신 + scheduleRedraw)
     • _applyBeauty — HSV 마스킹 픽셀 walk (피부톤·붉은기·모발·네일·속눈썹)
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
    const b = state.beauty || { skin: 0, redness: 0, hairShine: 0, nailGloss: 0, lashSharp: 0 };
    // helpers.esc 는 bind 단계에서 받음 — 여기는 메인에서 노출된 글로벌이 없으므로 단순 escape.
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, ch =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
    return `
      ${_slider(esc, '피부톤 정리', 'skin',       b.skin,       0, 100, 1)}
      ${_slider(esc, '붉은기 완화', 'redness',    b.redness,    0, 100, 1)}
      ${_slider(esc, '모발 윤기',   'hairShine',  b.hairShine,  0, 100, 1)}
      ${_slider(esc, '네일 광택',   'nailGloss',  b.nailGloss,  0, 100, 1)}
      ${_slider(esc, '속눈썹 선명도', 'lashSharp', b.lashSharp, 0, 100, 1)}
      <div class="pe-hint">시술 결과가 왜곡되지 않게 자연 보정 위주로 동작해요. 슬라이더는 손 떼는 순간 반영됩니다.</div>
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
    if (!b || (!b.skin && !b.redness && !b.hairShine && !b.nailGloss && !b.lashSharp)) return;
    let data;
    try { data = ctx.getImageData(0, 0, w, h); }
    catch (_e) { return; /* CORS 제한 시 skip */ }
    const d = data.data;
    const skinK = (b.skin || 0) / 100;
    const redK  = (b.redness || 0) / 100;
    const hairK = (b.hairShine || 0) / 100;
    const nailK = (b.nailGloss || 0) / 100;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i+1], bl = d[i+2];
      // 피부톤 hue 대략 (10°~50°): R > G > B
      const isSkin = r > 80 && r > g && g > bl && (r - bl) > 15 && (r - bl) < 110;
      if (isSkin) {
        if (skinK > 0) {
          // 약한 매끄러움 — 채도 살짝 ↑, 명도 살짝 ↑
          d[i]   = _clamp(r  + 4 * skinK);
          d[i+1] = _clamp(g  + 2 * skinK);
          d[i+2] = _clamp(bl + 1 * skinK);
        }
        if (redK > 0) {
          // 붉은기 완화 — R 채널만 살짝 ↓
          d[i] = _clamp(r - 10 * redK);
        }
      }
      // 모발 윤기 — 어두운 영역(머리카락 짙은 톤)에 하이라이트 픽셀 살짝 ↑
      if (hairK > 0) {
        const lum = (r * 0.299 + g * 0.587 + bl * 0.114);
        if (lum > 80 && lum < 180 && Math.abs(r - g) < 40 && Math.abs(g - bl) < 40) {
          d[i]   = _clamp(r  + 6 * hairK);
          d[i+1] = _clamp(g  + 6 * hairK);
          d[i+2] = _clamp(bl + 4 * hairK);
        }
      }
      // 네일 광택 — 명도 상위 픽셀 부스트
      if (nailK > 0) {
        const lum = (r * 0.299 + g * 0.587 + bl * 0.114);
        if (lum > 180) {
          d[i]   = _clamp(r  + 8 * nailK);
          d[i+1] = _clamp(g  + 8 * nailK);
          d[i+2] = _clamp(bl + 8 * nailK);
        }
      }
    }
    ctx.putImageData(data, 0, 0);
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
