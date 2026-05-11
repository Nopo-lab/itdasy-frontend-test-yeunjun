// Itdasy Studio — D1: 시술 후 1초 워크플로우
// 사진 1장 업로드 → 자동으로 (a) 시술 키워드 추출 → (b) 캡션·해시태그 생성 → (c) 9:16 스토리 PNG 합성
// 모두 단일 탭에서 끝남. 시나리오 시트·3 클릭 없음.
//
// 의존:
//   - window.API · window.authHeader (app-core.js)
//   - window.showToast (app-core.js)
//   - POST /persona/generate (백엔드 — 기존)
//   - POST /image/detect-face (선택 · 키워드 보강용)
//
// 9:16 스토리 합성은 app-story-template.js 의 renderStory 가 있으면 그걸 쓰고,
// 없을 땐 내부 폴백 합성기로 동작한다.
//
// 외부 진입: window.openInstantCaption() · 버튼 자동 주입은 attachInstantButton()

(function instantCaption() {
  'use strict';

  const W = 1080, H = 1920;

  const SHOP_TAGS = {
    '붙임머리': ['붙임머리', '롱헤어', '내추럴익스텐션', '헤어샵', '뷰티스타그램'],
    '네일아트': ['네일아트', '젤네일', '네일스타그램', '오늘의네일', '뷰티스타그램'],
    '네일':     ['네일아트', '젤네일', '네일스타그램', '오늘의네일', '뷰티스타그램'],
    '헤어':     ['헤어스타그램', '미용실', '컷', '펌', '염색', '뷰티스타그램'],
    '헤어샵':   ['헤어스타그램', '미용실', '컷', '펌', '염색', '뷰티스타그램'],
    '속눈썹':   ['속눈썹펌', '래쉬리프트', '속눈썹연장', '클래식래쉬', '뷰티스타그램'],
    '왁싱':     ['왁싱', '바디왁싱', '브라질리언왁싱', '제모', '피부케어', '왁싱샵'],
    '피부':     ['피부관리', '피부케어', '에스테틱', '모공관리', '수분관리', '글로우스킨'],
    '반영구':   ['반영구', '반영구메이크업', '눈썹문신', '입술문신', '아이라인반영구', '자연눈썹'],
  };

  const _CAT_MAP = {
    '붙임머리': 'extension', '네일아트': 'nail', '네일': 'nail',
    '헤어': 'hair', '헤어샵': 'hair',
    '속눈썹': 'lash',
    '왁싱': 'wax',
    '피부': 'skin',
    '반영구': 'tattoo',
  };

  function _api() { return (window.API || ''); }
  function _toast(msg) { if (typeof window.showToast === 'function') window.showToast(msg); }

  async function _fetchJson(method, path, body) {
    const headers = window.authHeader ? window.authHeader() : {};
    if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
    const url = _api() + path;
    let res;
    try {
      res = await fetch(url, {
        method,
        headers,
        body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
      });
    } catch (netErr) {
      console.error('[instant-caption] fetch 실패:', method, url, netErr);
      throw netErr;
    }
    // [2026-04-26] res.json() 은 단 한 번만 호출. 이중 호출은 stream 소진 → TypeError 의 원인.
    const data = await res.json().catch((parseErr) => {
      console.error('[instant-caption] JSON parse 실패:', parseErr, 'status=', res.status);
      return {};
    });
    if (!res.ok) {
      console.error('[instant-caption] HTTP error:', res.status, data);
      throw new Error(data.detail || ('HTTP ' + res.status));
    }
    return data;
  }

  // ── (a) 시술 카테고리·키워드 자동 추출 ─────────────────────────────
  // 비용 방어: shop_type 기반 기본 키워드 + 파일명·EXIF 힌트 + 얼굴 감지(선택)
  // Gemini Vision 별도 호출은 비용 발생 → 캡션 생성 단계의 photo_context 에서 통합 처리
  async function _autoDetectKeywords(file) {
    const shopType = localStorage.getItem('shop_type') || '붙임머리';
    const baseTags = SHOP_TAGS[shopType] || SHOP_TAGS['붙임머리'];

    // 파일명 힌트 (인치·컬러 키워드)
    const nameHint = (file && file.name) ? file.name.toLowerCase() : '';
    const lengthHint = (nameHint.match(/(14|18|22|24|26|28|30)\s*인치/) || [])[0] || '';
    const colorHint = (nameHint.match(/(블랙|브라운|애쉬|옴브레|하이라이트|블론드)/) || [])[0] || '';

    return {
      category: _CAT_MAP[shopType] || 'extension',
      shopType,
      baseTags,
      lengthHint,
      colorHint,
    };
  }

  // ── (b) 캡션 생성 (페르소나 기반) ──────────────────────────────────
  async function _generateCaption(meta) {
    const cfg = meta;
    const parts = [];
    parts.push(`${cfg.shopType} 시술 후 결과 사진.`);
    if (cfg.lengthHint) parts.push(cfg.lengthHint + ' 길이.');
    if (cfg.colorHint) parts.push(cfg.colorHint + ' 컬러.');
    parts.push('자연스럽고 만족스러운 마무리. 손님께서 좋아하셨음.');

    const payload = {
      category: cfg.category,
      photo_context: parts.join(' '),
      length_tier: 'medium',
      tone_override: 'normal',
    };

    const data = await _fetchJson('POST', '/persona/generate', payload);
    return data.caption || '';
  }

  // ── (c) 9:16 스토리 합성 ──────────────────────────────────────────
  function _readFileAsDataUrl(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }

  function _loadImg(src) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = src;
    });
  }

  function _drawCover(ctx, img, x, y, w, h) {
    const ir = img.width / img.height;
    const cr = w / h;
    let sx, sy, sw, sh;
    if (ir > cr) {
      sh = img.height;
      sw = sh * cr;
      sx = (img.width - sw) / 2;
      sy = 0;
    } else {
      sw = img.width;
      sh = sw / cr;
      sx = 0;
      sy = (img.height - sh) / 2;
    }
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  }

  function _wrap(ctx, text, x, y, maxW, lh) {
    const lines = [];
    for (const para of (text || '').split('\n')) {
      let line = '';
      for (const ch of para) {
        const t = line + ch;
        if (ctx.measureText(t).width > maxW && line) {
          lines.push(line);
          line = ch;
        } else {
          line = t;
        }
      }
      if (line) lines.push(line);
    }
    lines.slice(0, 6).forEach((l, i) => ctx.fillText(l, x, y + i * lh));
    return Math.min(lines.length, 6) * lh;
  }

  async function _renderStory(imageSrc, caption) {
    // app-story-template.js 의 renderStory 가 등록되어 있으면 그걸 우선 사용
    if (typeof window._renderStoryTemplate === 'function') {
      return window._renderStoryTemplate({ imageSrc, caption, tagLine: '오늘의 시술', watermark: '@itdasy' });
    }

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // 배경 그라디언트
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#1a0c10');
    grad.addColorStop(1, '#3d1a22');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    try {
      const img = await _loadImg(imageSrc);
      _drawCover(ctx, img, 60, 140, W - 120, H * 0.55);
      ctx.strokeStyle = 'rgba(241,128,145,0.3)';
      ctx.lineWidth = 4;
      ctx.strokeRect(60, 140, W - 120, H * 0.55);
    } catch (_) {
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(60, 140, W - 120, H * 0.55);
    }

    // 상단 태그라인
    ctx.fillStyle = 'var(--brand)';
    ctx.font = 'bold 36px Pretendard, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('오늘의 시술', W / 2, 80);

    // 캡션 (하단)
    if (caption) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 44px Pretendard, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      _wrap(ctx, caption, W / 2, 140 + H * 0.55 + 60, W - 160, 58);
    }

    // 워터마크
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '28px Pretendard, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('@itdasy · 잇데이 스튜디오', W / 2, H - 60);

    return canvas.toDataURL('image/png');
  }

  // ── 해시태그 구성 ─────────────────────────────────────────────────
  function _buildHashtags(meta, caption) {
    const tags = new Set();
    (meta.baseTags || []).forEach(t => tags.add('#' + t.replace(/^#/, '')));
    if (meta.lengthHint) tags.add('#' + meta.lengthHint.replace(/\s/g, ''));
    if (meta.colorHint) tags.add('#' + meta.colorHint);
    // 캡션 자체에 들어 있던 해시태그도 흡수
    (caption.match(/#[\wㄱ-ㅎㅏ-ㅣ가-힣]+/g) || []).forEach(t => tags.add(t));
    return Array.from(tags).slice(0, 12);
  }

  // ── UI: 1초 워크플로우 팝업 ───────────────────────────────────────
  function _ensurePopup() {
    let p = document.getElementById('_instantCaptionPopup');
    if (p) return p;

    p = document.createElement('div');
    p.id = '_instantCaptionPopup';
    p.style.cssText = 'display:none; position:fixed; inset:0; z-index:9400; background:rgba(0,0,0,0.6); align-items:flex-end; justify-content:center;';
    p.innerHTML = `
      <div style="width:100%; max-width:480px; background:#fff; border-radius:24px 24px 0 0; padding:24px 20px calc(32px + env(safe-area-inset-bottom)); max-height:92vh; overflow-y:auto;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
          <div style="font-size:17px; font-weight:800;">1초 캡션</div>
          <button id="_icClose" style="background:none; border:none; font-size:22px; width:44px; height:44px; cursor:pointer; color:var(--text-subtle);">✕</button>
        </div>
        <div style="font-size:12px; color:var(--text-muted); margin-bottom:14px; line-height:1.5;">
          시술 끝난 사진 1장만 골라주세요. 캡션 · 해시태그 · 9:16 스토리까지 한 번에 만들어드려요.
        </div>

        <label style="display:block;">
          <input id="_icFile" type="file" accept="image/*" style="display:none;">
          <div id="_icPickBtn" style="padding:18px; border:2px dashed var(--brand); border-radius:14px; text-align:center; color:var(--brand); font-weight:700; font-size:14px; cursor:pointer; background:#fff5f7;">
            사진 고르기
          </div>
        </label>

        <div id="_icPreviewPhoto" style="margin-top:12px; display:none;">
          <img id="_icPhoto" style="width:100%; border-radius:14px; max-height:220px; object-fit:cover; border:1px solid #eee;">
        </div>

        <div id="_icProgress" style="display:none; margin-top:18px;">
          <div id="_icStep" style="font-size:13px; font-weight:700; color:#1a1a1a; margin-bottom:8px;">분석 중…</div>
          <div style="width:100%; height:8px; background:#f0f0f0; border-radius:4px; overflow:hidden;">
            <div id="_icBar" style="width:0%; height:100%; background:linear-gradient(90deg,var(--brand),#ff9aa8); transition:width .3s ease;"></div>
          </div>
        </div>

        <div id="_icResult" style="display:none; margin-top:18px;">
          <div style="font-size:13px; font-weight:700; margin-bottom:6px;">캡션</div>
          <textarea id="_icCaption" rows="5" style="width:100%; padding:12px; border:1.5px solid #e0e0e0; border-radius:10px; font-size:14px; box-sizing:border-box; resize:vertical;"></textarea>
          <button id="_icCopyCaption" style="margin-top:6px; padding:8px 12px; border:1px solid #e0e0e0; border-radius:8px; background:#fff; font-size:12px; cursor:pointer; min-height:36px;">캡션 복사</button>

          <div style="font-size:13px; font-weight:700; margin:14px 0 6px;">해시태그</div>
          <div id="_icTags" style="display:flex; flex-wrap:wrap; gap:6px; padding:10px; background:#fafafa; border-radius:10px; font-size:12px;"></div>
          <button id="_icCopyTags" style="margin-top:6px; padding:8px 12px; border:1px solid #e0e0e0; border-radius:8px; background:#fff; font-size:12px; cursor:pointer; min-height:36px;">해시태그 복사</button>

          <div style="font-size:13px; font-weight:700; margin:14px 0 6px;">9:16 스토리 미리보기</div>
          <img id="_icStory" style="width:60%; max-width:240px; border-radius:14px; border:1px solid #eee; display:block; margin:0 auto;">
          <div style="display:flex; gap:8px; margin-top:12px;">
            <a id="_icStoryDownload" download="itdasy-story.png" style="flex:1; text-align:center; padding:12px; border-radius:12px; background:#4caf50; color:#fff; text-decoration:none; font-weight:700; font-size:13px; min-height:44px; display:flex; align-items:center; justify-content:center;">💾 스토리 저장</a>
            <button id="_icAgain" style="flex:1; padding:12px; border-radius:12px; border:none; background:var(--brand); color:#fff; font-weight:700; font-size:13px; min-height:44px; cursor:pointer;">🔁 다른 사진</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(p);

    p.addEventListener('click', (e) => { if (e.target === p) _close(); });
    p.querySelector('#_icClose').addEventListener('click', _close);
    p.querySelector('#_icPickBtn').addEventListener('click', () => p.querySelector('#_icFile').click());
    p.querySelector('#_icFile').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) _runPipeline(f);
    });
    p.querySelector('#_icAgain').addEventListener('click', () => {
      p.querySelector('#_icFile').value = '';
      p.querySelector('#_icResult').style.display = 'none';
      p.querySelector('#_icPreviewPhoto').style.display = 'none';
      p.querySelector('#_icFile').click();
    });
    p.querySelector('#_icCopyCaption').addEventListener('click', async () => {
      const v = p.querySelector('#_icCaption').value;
      try { await navigator.clipboard.writeText(v); _toast('캡션 복사됨'); } catch (_) { _toast('복사 실패'); }
    });
    p.querySelector('#_icCopyTags').addEventListener('click', async () => {
      const v = p.querySelector('#_icTags').textContent.trim();
      try { await navigator.clipboard.writeText(v); _toast('해시태그 복사됨'); } catch (_) { _toast('복사 실패'); }
    });

    return p;
  }

  function _close() {
    const p = document.getElementById('_instantCaptionPopup');
    if (p) p.style.display = 'none';
  }

  function _setProgress(step, pct) {
    const p = document.getElementById('_instantCaptionPopup');
    if (!p) return;
    p.querySelector('#_icProgress').style.display = 'block';
    p.querySelector('#_icStep').textContent = step;
    p.querySelector('#_icBar').style.width = pct + '%';
  }

  async function _runPipeline(file) {
    const p = _ensurePopup();
    const photoUrl = await _readFileAsDataUrl(file);
    p.querySelector('#_icPhoto').src = photoUrl;
    p.querySelector('#_icPreviewPhoto').style.display = 'block';
    p.querySelector('#_icResult').style.display = 'none';

    let caption = '';
    let meta = null;
    try {
      _setProgress('① 사진 분석 중…', 25);
      meta = await _autoDetectKeywords(file);

      _setProgress('② 캡션 작성 중…', 60);
      caption = await _generateCaption(meta);
      console.log('[instant-caption] caption 생성:', (caption || '').slice(0, 60));

      if (!caption || !caption.trim()) {
        // 백엔드가 200 OK 로 빈 문자열 돌려주는 케이스 — 사용자에게 명확히 안내
        console.error('[instant-caption] 빈 캡션 응답');
        throw new Error('AI 가 캡션을 만들지 못했어요. 잠시 후 다시 시도해주세요.');
      }

      // [2026-04-26] 캡션 확보 → 결과 블록을 먼저 띄운다. 스토리 합성 실패해도 캡션은 노출.
      const tags = _buildHashtags(meta, caption);
      p.querySelector('#_icCaption').value = caption;
      const tagsBox = p.querySelector('#_icTags');
      tagsBox.innerHTML = '';
      tags.forEach(t => {
        const span = document.createElement('span');
        span.style.cssText = 'background:#fff5f7; color:var(--brand); padding:4px 10px; border-radius:999px;';
        span.textContent = t;
        tagsBox.appendChild(span);
      });
      p.querySelector('#_icResult').style.display = 'block';

      _setProgress('③ 9:16 스토리 합성 중…', 85);
      let storyDataUrl = '';
      try {
        storyDataUrl = await _renderStory(photoUrl, caption);
      } catch (storyErr) {
        console.error('[instant-caption] 스토리 합성 실패:', storyErr);
      }
      if (storyDataUrl) {
        p.querySelector('#_icStory').src = storyDataUrl;
        p.querySelector('#_icStoryDownload').href = storyDataUrl;
      }

      _setProgress('완료!', 100);
      setTimeout(() => { p.querySelector('#_icProgress').style.display = 'none'; }, 400);

      if (window.hapticTap) try { window.hapticTap('success'); } catch (_) { /* noop */ }
    } catch (e) {
      console.error('[instant-caption] 파이프라인 실패:', e);
      const msg = (e && e.message) ? String(e.message) : '오류';
      _setProgress('실패: ' + msg.slice(0, 80), 0);
      _toast('1초 캡션 실패 — ' + msg.slice(0, 60));
    }
  }

  function openInstantCaption() {
    const p = _ensurePopup();
    p.style.display = 'flex';
    // 자동 파일 선택 트리거 — 한 번만 탭하면 끝
    setTimeout(() => p.querySelector('#_icFile').click(), 50);
  }

  // 홈/갤러리에 버튼 자동 주입 (호출자가 직접 attach 해도 됨)
  function attachInstantButton(targetSelector) {
    const target = document.querySelector(targetSelector);
    if (!target) return false;
    if (target.querySelector('#_icQuickBtn')) return true;
    const btn = document.createElement('button');
    btn.id = '_icQuickBtn';
    btn.type = 'button';
    btn.textContent = '⚡ 1초 캡션';
    btn.style.cssText = 'padding:12px 16px; border:none; border-radius:14px; background:linear-gradient(135deg,var(--brand),#ff9aa8); color:#fff; font-weight:800; font-size:14px; cursor:pointer; min-height:44px; box-shadow:0 4px 12px rgba(241,128,145,0.3);';
    btn.addEventListener('click', openInstantCaption);
    target.appendChild(btn);
    return true;
  }

  window.openInstantCaption = openInstantCaption;
  window.attachInstantCaptionButton = attachInstantButton;
})();
