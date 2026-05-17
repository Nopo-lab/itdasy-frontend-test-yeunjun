/* 사진 편집기 — 뷰티 모듈 (v180 2026-05-18)
   v175 → v180 변경:
     • shop_type 기반 카테고리 필터 — 처음 샵 선택에 맞는 핵심 보정 우선 노출
     • 신규 슬라이더 5종: yellowness, coolness, textureSmooth, hairColorPop, closeUpDetail
     • AI 보정 (준비 중) 섹션 — 컬·웨이브·볼륨·두피 등 AI 필요 항목 placeholder
     • '전체 보정 보기' 토글로 비-추천 슬라이더 숨김

   메인 (app-photo-editor.js) 의 _internal API 로 등록.
     • registerTabPanel('beauty', { html, bind })
     • registerDrawHook('beauty', applyBeauty)
*/
(function () {
  'use strict';

  function _clamp(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

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

  // ── 슬라이더 정의 (key → meta) ──
  const SLIDERS = {
    // 얼굴·피부
    skin:          { label: '피부톤 정리',     group: 'face', min: 0,   max: 100, step: 1 },
    redness:       { label: '붉은기 완화',     group: 'face', min: 0,   max: 100, step: 1 },
    blemish:       { label: '잡티 완화',       group: 'face', min: 0,   max: 100, step: 1 },
    eyeShadow:     { label: '눈가 그림자',     group: 'face', min: 0,   max: 100, step: 1 },
    textureSmooth: { label: '결 정리 (자연)',  group: 'face', min: 0,   max: 100, step: 1 },
    yellowness:    { label: '노란기 완화',     group: 'face', min: 0,   max: 100, step: 1 },
    // 손·네일
    handSkin:      { label: '손 피부톤',       group: 'hand', min: 0,   max: 100, step: 1 },
    nailGloss:     { label: '네일 광택',       group: 'hand', min: 0,   max: 100, step: 1 },
    coolness:      { label: '푸른기 완화 (손)', group: 'hand', min: 0,   max: 100, step: 1 },
    // 모발
    hairShine:     { label: '모발 윤기',       group: 'hair', min: 0,   max: 100, step: 1 },
    hairColor:     { label: '모발 색감 (- 차가운 / + 따뜻)', group: 'hair', min: -50, max: 50, step: 1 },
    hairDetail:    { label: '머리결',          group: 'hair', min: 0,   max: 100, step: 1 },
    hairColorPop:  { label: '염색 컬러 강조',  group: 'hair', min: 0,   max: 100, step: 1 },
    // 속눈썹
    lashSharp:     { label: '속눈썹 선명도',   group: 'lash', min: 0,   max: 100, step: 1 },
    closeUpDetail: { label: '눈가 디테일 (close-up)', group: 'lash', min: 0,   max: 100, step: 1 },
  };

  // shop_type → 추천 보정 슬라이더 우선순위 (5~6개)
  const SHOP_FEATURED = {
    hair: ['hairShine', 'hairDetail', 'hairColor', 'hairColorPop', 'yellowness', 'redness'],
    lash: ['lashSharp', 'closeUpDetail', 'eyeShadow', 'redness', 'skin', 'yellowness'],
    nail: ['nailGloss', 'handSkin', 'coolness', 'yellowness', 'redness'],
    wax:  ['skin', 'redness', 'blemish', 'textureSmooth', 'eyeShadow'],
  };

  // AI 필요 항목 — 컬·웨이브·볼륨·두피·붙임머리 등은 픽셀 walk 불가 → 카드 발급 후 활성화 예정.
  const AI_FEATURES = {
    hair: ['컬·웨이브 또렷하게', '잔머리 정리', '볼륨/풍성함 강화', '두피·정수리 휑함 완화', '붙임머리 결합부 자연스럽게'],
    lash: ['컬 또렷하게', '빈 부분 자연스럽게 보완'],
    nail: ['큐티클·주변부 정리', '컬러 정확도 보정', '배경 깔끔화'],
    wax:  ['부위 강조 자동', '결 자연 보정 (강도)'],
  };

  function _detectShopCat() {
    try {
      const t = (localStorage.getItem('shop_type') || '').toLowerCase();
      if (!t) return null;
      if (/(헤어|붙임머리|미용|hair|extension)/.test(t)) return 'hair';
      if (/(속눈썹|lash)/.test(t)) return 'lash';
      if (/(네일|nail)/.test(t)) return 'nail';
      if (/(왁싱|피부|반영구|문신|skin|tattoo|wax)/.test(t)) return 'wax';
    } catch (_e) { void _e; }
    return null;
  }

  function _slider(esc, key, val) {
    const m = SLIDERS[key];
    return `
      <label class="pe-slider">
        <div class="pe-slider-head">
          <span>${esc(m.label)}</span>
          <span class="pe-slider-val" data-pe-slider-val="${key}">${val}</span>
        </div>
        <input type="range" min="${m.min}" max="${m.max}" step="${m.step}" value="${val}" data-pe-slider="${key}" />
      </label>
    `;
  }

  function _groupedHTML(esc, keys, b) {
    const GROUPS = { face: '얼굴 · 피부', hand: '손 · 네일', hair: '모발', lash: '속눈썹' };
    let html = '';
    Object.keys(GROUPS).forEach(g => {
      const gk = keys.filter(k => SLIDERS[k] && SLIDERS[k].group === g);
      if (!gk.length) return;
      html += `<div class="pe-group-label">${GROUPS[g]}</div>`;
      html += gk.map(k => _slider(esc, k, b[k])).join('');
    });
    return html;
  }

  function _panelBeautyHTML(state) {
    const DEF = Object.keys(SLIDERS).reduce((a, k) => { a[k] = 0; return a; }, {});
    const b = Object.assign({}, DEF, state.beauty || {});
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, ch =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));

    const cat = _detectShopCat();
    const featured = cat ? (SHOP_FEATURED[cat] || []) : [];
    const otherKeys = Object.keys(SLIDERS).filter(k => !featured.includes(k));
    const aiItems = cat ? (AI_FEATURES[cat] || []) : [];
    const catLabel = { hair: '헤어·붙임머리·미용', lash: '속눈썹', nail: '네일', wax: '왁싱·피부·반영구' }[cat || ''] || '';

    let featuredHtml = '';
    if (featured.length) {
      featuredHtml = `
        <div class="pe-group-label" style="color:#F18091;font-weight:800;">✦ 추천 보정 — ${esc(catLabel)}</div>
        ${featured.map(k => _slider(esc, k, b[k])).join('')}
      `;
    }

    // featured 가 있으면 나머지는 토글로 숨김. 없으면 전체 노출.
    let moreHtml = '';
    if (otherKeys.length) {
      if (featured.length) {
        moreHtml = `
          <button type="button" data-pe-beauty-toggle="1"
            style="margin:14px 0 6px;width:100%;padding:10px;background:rgba(255,255,255,0.05);color:#c9c9d0;border:1px dashed rgba(255,255,255,0.18);border-radius:10px;font-size:12px;font-weight:700;cursor:pointer;">
            ＋ 전체 보정 보기 (+${otherKeys.length})
          </button>
          <div id="peBeautyMore" hidden>
            ${_groupedHTML(esc, otherKeys, b)}
          </div>
        `;
      } else {
        moreHtml = _groupedHTML(esc, otherKeys, b);
      }
    }

    let aiHtml = '';
    if (aiItems.length) {
      aiHtml = `
        <div class="pe-group-label" style="color:#7f7f87;margin-top:18px;">AI 보정 (준비 중)</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
          ${aiItems.map(t => `<button type="button" data-pe-ai-coming="1"
            style="padding:9px 10px;background:rgba(241,128,145,0.08);color:#f9c4ce;border:1px dashed rgba(241,128,145,0.30);border-radius:10px;font-size:11px;line-height:1.3;cursor:not-allowed;text-align:left;">${esc(t)}</button>`).join('')}
        </div>
        <div class="pe-hint" style="color:#7f7f87;">AI 보정은 컬·볼륨·결합부 등 픽셀 보정 불가 항목입니다. 카드 발급 후 Ideogram API 연동 예정.</div>
      `;
    }

    return `
      ${featuredHtml}
      ${moreHtml}
      ${aiHtml}
      <div class="pe-hint">시술 왜곡 없이 자연 보정 위주로 동작해요. 슬라이더는 손 떼는 순간 반영됩니다.</div>
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
        scheduleRedraw();
      });
      inp.addEventListener('change', () => pushHistory());
    });
    // 전체 보정 보기 토글
    const toggleBtn = panel.querySelector('[data-pe-beauty-toggle]');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const more = panel.querySelector('#peBeautyMore');
        if (!more) return;
        if (more.hidden) {
          more.hidden = false;
          toggleBtn.textContent = '－ 추천 보정만 보기';
        } else {
          more.hidden = true;
          toggleBtn.textContent = '＋ 전체 보정 보기';
        }
      });
    }
    // AI 준비 중 클릭 → 토스트
    panel.querySelectorAll('[data-pe-ai-coming]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (window.showToast) window.showToast('AI 보정은 카드 발급 후 활성화 예정이에요');
      });
    });
  }

  // ── 뷰티 보정 (픽셀 walk + HSV 마스킹) ──
  function _applyBeauty(ctx, w, h, b /*, helpers */) {
    if (!b) return;
    const anyOn = b.skin || b.redness || b.hairShine || b.nailGloss || b.lashSharp
      || b.blemish || b.handSkin || b.hairColor || b.hairDetail || b.eyeShadow
      || b.yellowness || b.coolness || b.textureSmooth || b.hairColorPop || b.closeUpDetail;
    if (!anyOn) return;

    let data;
    try { data = ctx.getImageData(0, 0, w, h); }
    catch (_e) { return; }
    const d = data.data;

    const skinK     = (b.skin || 0) / 100;
    const redK      = (b.redness || 0) / 100;
    const hairK     = (b.hairShine || 0) / 100;
    const nailK     = (b.nailGloss || 0) / 100;
    const blemishK  = (b.blemish || 0) / 100;
    const handK     = (b.handSkin || 0) / 100;
    const eyeShK    = (b.eyeShadow || 0) / 100;
    const hairColK  = (b.hairColor || 0) / 100;
    const yelK      = (b.yellowness || 0) / 100;
    const coolK     = (b.coolness || 0) / 100;
    const txK       = (b.textureSmooth || 0) / 100;
    const hairPopK  = (b.hairColorPop || 0) / 100;

    // 저주파 (블러) — blemish / textureSmooth 둘 다 필요.
    let blurD = null;
    if (blemishK > 0 || txK > 0) {
      try { blurD = _boxBlur(data, w, h, 1).data; }
      catch (_e) { blurD = null; }
    }

    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i+1], bl = d[i+2];
      const isSkin = r > 80 && r > g && g > bl && (r - bl) > 15 && (r - bl) < 110;
      const isReddish = r > 80 && r > g && (r - bl) > 10 && (r - bl) < 140;

      if (redK > 0 && isReddish) {
        d[i]   = _clamp(d[i]   - 18 * redK);
        d[i+1] = _clamp(d[i+1] +  2 * redK);
        d[i+2] = _clamp(d[i+2] +  3 * redK);
      }
      // 노란기 완화 — 노란 cast (R≈G AND G > B by 10+) → G↓ B↑
      if (yelK > 0) {
        const isYellowCast = Math.abs(r - g) < 22 && (g - bl) > 10 && r > 100;
        if (isYellowCast) {
          d[i+1] = _clamp(d[i+1] - 5 * yelK);
          d[i+2] = _clamp(d[i+2] + 7 * yelK);
        }
      }
      if (isSkin) {
        if (skinK > 0) {
          d[i]   = _clamp(d[i]   + 4 * skinK);
          d[i+1] = _clamp(d[i+1] + 2 * skinK);
          d[i+2] = _clamp(d[i+2] + 1 * skinK);
        }
        if (handK > 0) {
          d[i]   = _clamp(d[i]   + 3 * handK);
          d[i+1] = _clamp(d[i+1] + 1.5 * handK);
          d[i+2] = _clamp(d[i+2] - 1 * handK);
        }
        // 푸른기 완화 — 피부인데 B>R+10 cold cast → 따뜻하게.
        if (coolK > 0 && (bl > r - 10) && (bl - g) > 5) {
          d[i]   = _clamp(d[i]   + 6 * coolK);
          d[i+1] = _clamp(d[i+1] + 2 * coolK);
          d[i+2] = _clamp(d[i+2] - 8 * coolK);
        }
        // 결 정리 — 피부 영역 light blur 혼합 (최대 40%).
        if (txK > 0 && blurD) {
          const mix = 0.4 * txK;
          d[i]   = _clamp(d[i]   * (1 - mix) + blurD[i]   * mix);
          d[i+1] = _clamp(d[i+1] * (1 - mix) + blurD[i+1] * mix);
          d[i+2] = _clamp(d[i+2] * (1 - mix) + blurD[i+2] * mix);
        }
        // 잡티 완화 — 명도 분산 큰 픽셀 저주파 혼합.
        if (blemishK > 0 && blurD) {
          const lum  = (d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114);
          const blum = (blurD[i] * 0.299 + blurD[i+1] * 0.587 + blurD[i+2] * 0.114);
          if (Math.abs(lum - blum) > 12) {
            const mix = 0.6 * blemishK;
            d[i]   = _clamp(d[i]   * (1 - mix) + blurD[i]   * mix);
            d[i+1] = _clamp(d[i+1] * (1 - mix) + blurD[i+1] * mix);
            d[i+2] = _clamp(d[i+2] * (1 - mix) + blurD[i+2] * mix);
          }
        }
        if (eyeShK > 0) {
          const lum = (d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114);
          if (lum < 130) {
            const w2 = (130 - lum) / 130;
            d[i]   = _clamp(d[i]   + 12 * eyeShK * w2);
            d[i+1] = _clamp(d[i+1] + 10 * eyeShK * w2);
            d[i+2] = _clamp(d[i+2] +  8 * eyeShK * w2);
          }
        }
      }
      // 모발 윤기
      if (hairK > 0) {
        const lum = (d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114);
        if (lum > 80 && lum < 180 && Math.abs(d[i] - d[i+1]) < 40 && Math.abs(d[i+1] - d[i+2]) < 40) {
          d[i]   = _clamp(d[i]   + 6 * hairK);
          d[i+1] = _clamp(d[i+1] + 6 * hairK);
          d[i+2] = _clamp(d[i+2] + 4 * hairK);
        }
      }
      // 모발 색감 (양방향)
      if (hairColK !== 0) {
        const lum = (d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114);
        if (lum < 160) {
          d[i]   = _clamp(d[i]   + 10 * hairColK);
          d[i+1] = _clamp(d[i+1] +  3 * hairColK);
          d[i+2] = _clamp(d[i+2] - 10 * hairColK);
        }
      }
      // 염색 컬러 강조 — 어두운·중간 톤에서 채도 ↑ (lum 기준 거리 가산).
      if (hairPopK > 0) {
        const lum = (d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114);
        if (lum < 160) {
          const sat = 0.4 * hairPopK;
          d[i]   = _clamp(d[i]   + (d[i]   - lum) * sat);
          d[i+1] = _clamp(d[i+1] + (d[i+1] - lum) * sat);
          d[i+2] = _clamp(d[i+2] + (d[i+2] - lum) * sat);
        }
      }
      // 네일 광택
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

    // 머리결 / 속눈썹 선명도 / 눈가 close-up 디테일 — 모두 unsharp mask 기반.
    if (b.hairDetail > 10) _unsharpMask(ctx, w, h, b.hairDetail / 300);
    if (b.lashSharp > 10) _unsharpMask(ctx, w, h, b.lashSharp / 200);
    if (b.closeUpDetail > 10) _unsharpMask(ctx, w, h, b.closeUpDetail / 250);
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
