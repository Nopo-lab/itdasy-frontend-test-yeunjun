/* ─────────────────────────────────────────────────────────────
   AI 인스타 스토리 자동 생성 (Phase 5 · 2026-04-21)

   플로우:
   1. 음성 녹음 or 텍스트 입력 → /stories/generate (Gemini)
   2. 결과(headline/sub_text/hashtags/mood) → Canvas 1080x1920 스토리 이미지
   3. [저장] 다운로드 / [인스타 공유] Share API

   mood 에 따라 배경 그라디언트 4종:
   - cozy: 베이지·로즈 · bright: 크림·피치 · chic: 먹·라벤더 · cute: 연핑크·민트
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const MOODS = {
    cozy:   { name: '따뜻', gradient: ['#F5E6D8', '#E8B4A0'], accent: '#7A4A3C' },
    bright: { name: '밝음', gradient: ['#FFF4E6', '#FFD3B6'], accent: '#B85C38' },
    chic:   { name: '시크', gradient: ['#2C2C3E', '#A89CC8'], accent: '#F5F5F5' },
    cute:   { name: '귀여움', gradient: ['#FFDFEC', '#C4E9D7'], accent: '#D96387' },
  };

  let _result = null;
  let _canvas = null;
  let _recognition = null;
  let _interimText = '';

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
  }

  async function _apiPost(path, body) {
    const res = await fetch(window.API + path, {
      method: 'POST',
      headers: { ...window.authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  }

  function _ensureSheet() {
    let sheet = document.getElementById('storySheet');
    if (sheet) return sheet;
    sheet = document.createElement('div');
    sheet.id = 'storySheet';
    sheet.style.cssText = 'position:fixed;inset:0;z-index:9999;display:none;background:rgba(0,0,0,0.55);';
    sheet.innerHTML = `
      <div style="position:absolute;inset:auto 0 0 0;background:var(--bg,#fff);border-radius:20px 20px 0 0;max-height:92vh;display:flex;flex-direction:column;padding:16px;padding-bottom:max(16px,env(safe-area-inset-bottom));">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
          <i class="ph-duotone ph-sparkle" style="font-size:22px;"></i>
          <strong style="font-size:17px;">스토리 자동 만들기</strong>
          <span style="font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(241,128,145,0.15);color:var(--brand-strong);font-weight:700;">AI</span>
          <button onclick="closeStory()" style="margin-left:auto;background:rgba(0,0,0,0.05);border:none;width:32px;height:32px;border-radius:50%;font-size:16px;cursor:pointer;">✕</button>
        </div>
        <div id="storyBody" style="flex:1;overflow-y:auto;"></div>
      </div>
    `;
    document.body.appendChild(sheet);
    sheet.addEventListener('click', (e) => { if (e.target === sheet) closeStory(); });
    return sheet;
  }

  function _renderIntro() {
    document.getElementById('storyBody').innerHTML = `
      <div style="padding:10px 0;">
        <div style="text-align:center;padding:16px 8px;background:linear-gradient(135deg,rgba(241,128,145,0.08),rgba(241,128,145,0.02));border-radius:14px;margin-bottom:16px;">
          <div style="font-size:13px;color:#555;line-height:1.6;">
            <strong>오늘 시술 느낌을 말해 주세요.</strong><br>
            AI 가 스토리용 감성 카드로 만들어드려요.<br>
            <span style="font-size:11px;color:#888;">예: "김지연님 속눈썹 풀세트 너무 잘 나왔어요 💗"</span>
          </div>
        </div>

        <label style="display:block;font-size:12px;color:var(--text-muted);margin-bottom:4px;">짧은 메모</label>
        <textarea id="storyInput" rows="4" maxlength="500" placeholder="오늘 시술 이야기를 편하게…" style="width:100%;padding:12px;border:1px solid #ddd;border-radius:12px;font-family:inherit;resize:vertical;font-size:14px;"></textarea>

        <button id="storyGen" style="width:100%;margin-top:12px;padding:13px;border:none;border-radius:10px;background:linear-gradient(135deg,var(--brand),var(--brand-strong));color:#fff;font-weight:800;cursor:pointer;font-size:15px;">AI 스토리 만들기</button>
      </div>
    `;
    document.getElementById('storyGen').addEventListener('click', _generate);
  }

  function _hasWebSpeech() {
    return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
  }

  function _toggleMic() {
    if (_recognition) { _recognition.stop(); return; }
    if (!_hasWebSpeech()) {
      document.getElementById('storyMicStatus').textContent = '이 기기에서 음성 입력을 지원하지 않아요';
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    _recognition = new SR();
    _recognition.lang = 'ko-KR';
    _recognition.continuous = true;
    _recognition.interimResults = true;
    _interimText = '';
    const input = document.getElementById('storyInput');
    const startingValue = input.value;
    const btn = document.getElementById('storyMicBtn');
    btn.style.background = 'linear-gradient(135deg,#dc3545,#ff6b6b)';
    btn.textContent = '⏹';
    document.getElementById('storyMicStatus').textContent = '듣고 있어요…';
    _recognition.onresult = (e) => {
      let text = '';
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      _interimText = text;
      input.value = startingValue + (startingValue ? ' ' : '') + text;
    };
    _recognition.onerror = () => {};
    _recognition.onend = () => {
      _recognition = null;
      btn.style.background = 'linear-gradient(135deg,var(--brand),var(--brand-strong))';
      btn.textContent = '🎤';
      document.getElementById('storyMicStatus').textContent = _interimText ? '✓ 받아쓰기 완료' : '';
    };
    try { _recognition.start(); } catch (_) { void 0; }
  }

  async function _generate() {
    const text = document.getElementById('storyInput').value.trim();
    if (!text) {
      if (window.showToast) window.showToast('메모를 먼저 입력해 주세요');
      return;
    }
    const btn = document.getElementById('storyGen');
    btn.disabled = true; btn.textContent = 'AI 생성 중…';
    try {
      _result = await _apiPost('/stories/generate', { text });
      _renderResult();
    } catch (e) {
      btn.disabled = false; btn.textContent = 'AI 스토리 만들기';
      if (window.showToast) window.showToast('실패: ' + (window._humanError ? window._humanError(e) : e.message));
    }
  }

  function _renderResult() {
    const r = _result;
    const mood = MOODS[r.mood] || MOODS.cozy;
    document.getElementById('storyBody').innerHTML = `
      <div style="padding:10px 0;">
        <button onclick="window._storyBack()" style="background:none;border:none;font-size:13px;color:#888;margin-bottom:10px;cursor:pointer;">← 다시</button>

        <!-- 미리보기 Canvas — 인스타 스토리 표준 해상도 1080x1920 -->
        <div style="position:relative;max-width:300px;aspect-ratio:9/16;margin:0 auto 14px;border-radius:18px;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,0.18);">
          <canvas id="storyCanvas" width="1080" height="1920" style="width:100%;height:100%;display:block;"></canvas>
        </div>
        <!-- 배경 사진 (선택) -->
        <div style="margin-bottom:10px;display:flex;gap:6px;">
          <label style="flex:1;padding:9px;border:1px dashed #ddd;border-radius:10px;background:#fafafa;text-align:center;font-size:12px;color:#555;cursor:pointer;font-weight:700;">
            배경 사진 올리기
            <input id="storyBgFile" type="file" accept="image/*" style="display:none;" />
          </label>
          <button id="storyBgClear" style="padding:9px 12px;border:1px solid #eee;border-radius:10px;background:#fff;color:#888;cursor:pointer;font-size:12px;">그라디언트로</button>
        </div>

        <!-- 편집 영역 -->
        <div style="padding:12px;background:#fff;border:1px solid rgba(0,0,0,0.06);border-radius:12px;margin-bottom:10px;">
          <label style="display:block;font-size:11px;color:#888;margin-bottom:4px;">헤드라인</label>
          <input id="sfHeadline" value="${_esc(r.headline)}" maxlength="40" style="width:100%;padding:8px;border:1px solid #eee;border-radius:6px;font-size:14px;font-weight:700;margin-bottom:8px;" />
          <label style="display:block;font-size:11px;color:#888;margin-bottom:4px;">서브 텍스트</label>
          <textarea id="sfSub" rows="2" maxlength="80" style="width:100%;padding:8px;border:1px solid #eee;border-radius:6px;font-size:12px;font-family:inherit;resize:vertical;">${_esc(r.sub_text)}</textarea>
        </div>

        <!-- mood 선택 -->
        <div style="margin-bottom:10px;">
          <div style="font-size:11px;color:#888;margin-bottom:6px;">배경 분위기</div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;">
            ${Object.entries(MOODS).map(([k, m]) => `
              <button data-mood="${k}" style="padding:10px 4px;border:2px solid ${r.mood === k ? 'var(--brand)' : 'transparent'};border-radius:10px;background:linear-gradient(135deg,${m.gradient[0]},${m.gradient[1]});color:${m.accent};font-size:11px;font-weight:700;cursor:pointer;">${m.name}</button>
            `).join('')}
          </div>
        </div>

        <!-- 해시태그 -->
        <div style="padding:10px 12px;background:#fafafa;border-radius:10px;margin-bottom:12px;">
          <div style="font-size:11px;color:#888;margin-bottom:4px;">해시태그 (클립보드 복사용)</div>
          <div style="font-size:12px;color:#555;line-height:1.7;">${(r.hashtags || []).map(t => '#' + _esc(t)).join(' ')}</div>
        </div>

        <!-- 액션 버튼 -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <button id="storyDownload" style="padding:12px;border:1px solid #ddd;border-radius:10px;background:#fff;color:#555;font-weight:700;cursor:pointer;font-size:13px;">이미지 저장</button>
          <button id="storyShareIg" style="padding:12px;border:none;border-radius:10px;background:linear-gradient(135deg,#833AB4,#FD1D1D);color:#fff;font-weight:800;cursor:pointer;font-size:13px;">🎀 인스타 공유</button>
        </div>
        <button id="storyCopy" style="width:100%;margin-top:8px;padding:10px;border:1px solid #eee;border-radius:8px;background:transparent;color:#888;font-size:12px;cursor:pointer;">해시태그만 복사</button>
      </div>
    `;

    _canvas = document.getElementById('storyCanvas');
    _drawCanvas();

    document.getElementById('sfHeadline').addEventListener('input', (e) => { _result.headline = e.target.value; _drawCanvas(); });
    document.getElementById('sfSub').addEventListener('input', (e) => { _result.sub_text = e.target.value; _drawCanvas(); });
    document.querySelectorAll('[data-mood]').forEach(btn => btn.addEventListener('click', () => {
      _result.mood = btn.dataset.mood;
      _drawCanvas();
      _renderResult();  // 테두리 강조 업데이트
    }));
    document.getElementById('storyDownload').addEventListener('click', _download);
    document.getElementById('storyShareIg').addEventListener('click', _shareToInstagram);
    document.getElementById('storyCopy').addEventListener('click', _copyHashtags);

    // 배경 사진 업로드
    const bgFile = document.getElementById('storyBgFile');
    if (bgFile) bgFile.addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        const im = new Image();
        im.onload = () => { _bgImage = im; _drawCanvas(); };
        im.src = rd.result;
      };
      rd.readAsDataURL(f);
    });
    const bgClear = document.getElementById('storyBgClear');
    if (bgClear) bgClear.addEventListener('click', () => { _bgImage = null; _drawCanvas(); });
  }

  window._storyBack = _renderIntro;

  let _bgImage = null;  // 사용자가 올린 배경 사진 (HTMLImageElement)

  function _drawCanvas() {
    if (!_canvas) return;
    const ctx = _canvas.getContext('2d');
    const W = _canvas.width, H = _canvas.height;
    const m = MOODS[_result.mood] || MOODS.cozy;

    // 1. 배경 — 사진이 있으면 사진, 없으면 그라디언트
    if (_bgImage && _bgImage.complete) {
      // cover 방식으로 꽉 채우기
      const ir = _bgImage.naturalWidth / _bgImage.naturalHeight;
      const cr = W / H;
      let sx, sy, sw, sh;
      if (ir > cr) {
        sh = _bgImage.naturalHeight;
        sw = sh * cr;
        sx = (_bgImage.naturalWidth - sw) / 2;
        sy = 0;
      } else {
        sw = _bgImage.naturalWidth;
        sh = sw / cr;
        sx = 0;
        sy = (_bgImage.naturalHeight - sh) / 2;
      }
      ctx.drawImage(_bgImage, sx, sy, sw, sh, 0, 0, W, H);
      // 가독성 위한 하단 그라디언트 오버레이
      const vg = ctx.createLinearGradient(0, 0, 0, H);
      vg.addColorStop(0, 'rgba(0,0,0,0.15)');
      vg.addColorStop(0.45, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.6)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
    } else {
      const grad = ctx.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, m.gradient[0]);
      grad.addColorStop(1, m.gradient[1]);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // 블러 원형 장식 (2배 해상도)
      ctx.save();
      ctx.filter = 'blur(40px)';
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = m.accent;
      ctx.beginPath(); ctx.arc(W * 0.85, H * 0.15, 200, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(W * 0.12, H * 0.85, 280, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // 2. 브랜드 로고 배지 — 좌상단
    ctx.save();
    ctx.fillStyle = _bgImage ? 'rgba(255,255,255,0.95)' : (m.accent + 'CC');
    ctx.font = 'bold 42px -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif';
    ctx.textAlign = 'left';
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 12;
    ctx.fillText('🎀 잇데이', 80, 110);
    ctx.restore();

    // 3. 중앙 반투명 카드 (가독성 향상)
    const cardY = H * 0.32;
    const cardH = H * 0.38;
    const cardPad = 70;
    if (_bgImage) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      _roundRect(ctx, cardPad, cardY, W - cardPad * 2, cardH, 30);
      ctx.fill();
      ctx.restore();
    }

    // 4. 헤드라인 — 큰 폰트, 그림자
    const textColor = _bgImage ? '#fff' : m.accent;
    ctx.save();
    ctx.fillStyle = textColor;
    ctx.font = '900 96px -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = _bgImage ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.4)';
    ctx.shadowBlur = 18;
    _wrapText(ctx, _result.headline || '', W / 2, H * 0.44, W - 160, 120);
    ctx.restore();

    // 5. 서브 텍스트 — 중간 폰트
    ctx.save();
    ctx.fillStyle = _bgImage ? 'rgba(255,255,255,0.92)' : (m.accent + 'CC');
    ctx.font = '600 56px -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = _bgImage ? 'rgba(0,0,0,0.4)' : 'transparent';
    ctx.shadowBlur = 10;
    _wrapText(ctx, _result.sub_text || '', W / 2, H * 0.62, W - 240, 76);
    ctx.restore();

    // 6. 해시태그 하단
    ctx.save();
    ctx.fillStyle = _bgImage ? 'rgba(255,255,255,0.78)' : (m.accent + '99');
    ctx.font = '700 42px -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = _bgImage ? 'rgba(0,0,0,0.4)' : 'transparent';
    ctx.shadowBlur = 8;
    const tags = (_result.hashtags || []).slice(0, 4).map(t => '#' + t).join('  ');
    ctx.fillText(tags, W / 2, H - 140);
    ctx.restore();
  }

  function _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function _wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const lines = [];
    (text || '').split('\n').forEach(raw => {
      const chars = raw.split('');
      let line = '';
      for (const c of chars) {
        const test = line + c;
        if (ctx.measureText(test).width > maxWidth && line) {
          lines.push(line);
          line = c;
        } else {
          line = test;
        }
      }
      if (line) lines.push(line);
    });
    const startY = y - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((l, i) => ctx.fillText(l, x, startY + i * lineHeight));
  }

  function _download() {
    _canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `itdasy_story_${Date.now()}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      if (window.hapticSuccess) window.hapticSuccess();
    }, 'image/png', 0.95);
  }

  async function _shareToInstagram() {
    _canvas.toBlob(async (blob) => {
      if (!blob) return;
      const fileName = `itdasy_story_${Date.now()}.png`;
      const file = new File([blob], fileName, { type: 'image/png' });
      if (window.Capacitor?.isNativePlatform?.()) {
        try {
          const { Filesystem, Directory, Share } = window.Capacitor.Plugins;
          if (Filesystem && Share) {
            const reader = new FileReader();
            reader.onload = async () => {
              const base64 = reader.result.split(',')[1];
              const saved = await Filesystem.writeFile({ path: fileName, data: base64, directory: Directory.Cache, recursive: true });
              await Share.share({ title: '잇데이 스토리', url: saved.uri, dialogTitle: '인스타그램에 공유' });
            };
            reader.readAsDataURL(blob);
            return;
          }
        } catch (_) { void 0; }
      }
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: '잇데이 스토리' }); return; } catch (_) { void 0; }
      }
      // 폴백: 다운로드
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = fileName; a.click();
      if (window.showToast) window.showToast('이미지 저장됨 — 인스타 스토리에 올려주세요');
    }, 'image/png', 0.95);
  }

  async function _copyHashtags() {
    const tags = (_result.hashtags || []).map(t => '#' + t).join(' ');
    try {
      await navigator.clipboard.writeText(tags);
      if (window.showToast) window.showToast('해시태그 복사됨');
    } catch (e) { prompt('복사', tags); }
  }

  window.openStory = function () {
    _ensureSheet();
    document.getElementById('storySheet').style.display = 'block';
    document.body.style.overflow = 'hidden';
    _result = null;
    _renderIntro();
  };
  window.closeStory = function () {
    const sheet = document.getElementById('storySheet');
    if (sheet) sheet.style.display = 'none';
    document.body.style.overflow = '';
    try { _recognition?.stop(); } catch (_) { void 0; }
  };
})();
