// 스토리 9:16 템플릿 — Canvas 기반 합성 (뷰티샵 원장님 일상 업로드용)
// 입력: 메인 사진 (필수) + 캡션 텍스트 + 선택 스티커
// 출력: 1080x1920 PNG (인스타 스토리 규격)

(function storyTemplate() {
  const W = 1080, H = 1920;

  async function loadImage(src) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = src;
    });
  }

  function drawCoverImage(ctx, img, x, y, w, h) {
    // object-fit: cover 에뮬레이션
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

  function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const lines = [];
    for (const paragraph of text.split('\n')) {
      let line = '';
      for (const ch of paragraph) {
        const test = line + ch;
        if (ctx.measureText(test).width > maxWidth && line) {
          lines.push(line);
          line = ch;
        } else {
          line = test;
        }
      }
      lines.push(line);
    }
    lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight));
    return lines.length * lineHeight;
  }

  async function renderStory({ imageSrc, caption, tagLine, watermark }) {
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    // 배경 그라디언트
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#1a0c10');
    grad.addColorStop(1, '#3d1a22');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // 메인 사진 (상단 60%)
    if (imageSrc) {
      try {
        const img = await loadImage(imageSrc);
        drawCoverImage(ctx, img, 60, 140, W - 120, H * 0.55);
        // 라운드 코너 마스크 (path 클리핑 생략, 단순 border 효과)
        ctx.strokeStyle = 'rgba(241,128,145,0.3)';
        ctx.lineWidth = 4;
        ctx.strokeRect(60, 140, W - 120, H * 0.55);
      } catch(e) {
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(60, 140, W - 120, H * 0.55);
        ctx.fillStyle = '#ffcdd2';
        ctx.font = 'bold 36px Pretendard, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('이미지 로드 실패', W / 2, H * 0.4);
      }
    }

    // 태그라인 (상단)
    if (tagLine) {
      ctx.fillStyle = '#f18091';
      ctx.font = 'bold 36px Pretendard, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(tagLine, W / 2, 80);
    }

    // 캡션 (하단 영역)
    if (caption) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 48px Pretendard, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const textY = 140 + H * 0.55 + 60;
      wrapText(ctx, caption, W / 2, textY, W - 160, 62);
    }

    // 워터마크 (하단 중앙)
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '28px Pretendard, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(watermark || '@itdasy · 잇데이 스튜디오', W / 2, H - 60);

    return canvas.toDataURL('image/png');
  }

  async function openStoryPopup() {
    // 기존 팝업 재사용
    let popup = document.getElementById('_storyPopup');
    if (!popup) {
      popup = document.createElement('div');
      popup.id = '_storyPopup';
      popup.style.cssText = 'display:none; position:fixed; inset:0; z-index:9300; background:rgba(0,0,0,0.7); align-items:flex-end; justify-content:center;';
      popup.innerHTML = `
        <div style="width:100%; max-width:480px; background:#fff; border-radius:24px 24px 0 0; padding:24px 20px calc(32px + env(safe-area-inset-bottom)); max-height:92vh; overflow-y:auto;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
            <div style="font-size:17px; font-weight:800;">📱 스토리 9:16 만들기</div>
            <button id="_storyClose" style="background:none; border:none; font-size:22px; width:44px; height:44px; cursor:pointer; color:#999;">✕</button>
          </div>
          <div style="font-size:12px; color:#666; margin-bottom:16px;">인스타 스토리에 바로 올릴 수 있는 세로 이미지를 만들어드려요 (1080x1920).</div>

          <label style="font-size:12px; color:#555;">사진 (URL 또는 파일 선택)
            <input id="_storyImgUrl" type="url" placeholder="이미지 URL" style="width:100%; margin-top:6px; padding:12px; border:1.5px solid #e0e0e0; border-radius:10px; font-size:14px; box-sizing:border-box; min-height:44px;">
          </label>
          <input id="_storyImgFile" type="file" accept="image/*" style="margin-top:10px; font-size:12px;">

          <label style="font-size:12px; color:#555; display:block; margin-top:14px;">캡션
            <textarea id="_storyCaption" rows="3" placeholder="스토리에 띄울 짧은 문구" style="width:100%; margin-top:6px; padding:12px; border:1.5px solid #e0e0e0; border-radius:10px; font-size:14px; box-sizing:border-box; resize:vertical;"></textarea>
          </label>

          <label style="font-size:12px; color:#555; display:block; margin-top:14px;">상단 태그라인 (선택)
            <input id="_storyTag" type="text" placeholder="예: 오늘의 시술 ✨" style="width:100%; margin-top:6px; padding:12px; border:1.5px solid #e0e0e0; border-radius:10px; font-size:14px; box-sizing:border-box; min-height:44px;">
          </label>

          <button id="_storyRender" style="width:100%; margin-top:16px; padding:14px; border-radius:12px; border:none; background:linear-gradient(135deg,#f18091,#ff9aa8); color:#fff; font-size:14px; font-weight:800; cursor:pointer; min-height:48px;">✨ 만들기</button>

          <div id="_storyPreview" style="margin-top:18px; display:none;">
            <img id="_storyImg" style="width:100%; border-radius:14px; border:1px solid #eee;">
            <div style="display:flex; gap:8px; margin-top:12px;">
              <a id="_storyDownload" download="itdasy-story.png" style="flex:1; text-align:center; padding:12px; border-radius:12px; background:#4caf50; color:#fff; text-decoration:none; font-weight:700; font-size:13px; min-height:44px; display:flex; align-items:center; justify-content:center;">💾 저장</a>
              <button id="_storyShareBtn" style="flex:1; padding:12px; border-radius:12px; border:none; background:#2196f3; color:#fff; font-weight:700; font-size:13px; min-height:44px; cursor:pointer;">📤 공유</button>
            </div>
            <div style="font-size:11px; color:#888; text-align:center; margin-top:8px;">저장 후 인스타 앱에서 스토리로 올리세요</div>
          </div>
        </div>
      `;
      document.body.appendChild(popup);
      popup.addEventListener('click', (e) => { if (e.target === popup) popup.style.display = 'none'; });
      document.getElementById('_storyClose').addEventListener('click', () => popup.style.display = 'none');

      // 파일 선택 → URL로
      document.getElementById('_storyImgFile').addEventListener('change', (e) => {
        const f = e.target.files[0];
        if (f) {
          const reader = new FileReader();
          reader.onload = () => { document.getElementById('_storyImgUrl').value = reader.result; };
          reader.readAsDataURL(f);
        }
      });

      // 만들기
      document.getElementById('_storyRender').addEventListener('click', async () => {
        const btn = document.getElementById('_storyRender');
        btn.disabled = true; btn.textContent = '만드는 중…';
        try {
          const dataUrl = await renderStory({
            imageSrc: document.getElementById('_storyImgUrl').value.trim(),
            caption: document.getElementById('_storyCaption').value.trim(),
            tagLine: document.getElementById('_storyTag').value.trim(),
            watermark: '@itdasy',
          });
          document.getElementById('_storyImg').src = dataUrl;
          document.getElementById('_storyDownload').href = dataUrl;
          document.getElementById('_storyPreview').style.display = 'block';
        } finally {
          btn.disabled = false; btn.textContent = '✨ 다시 만들기';
        }
      });

      // 공유 (Web Share API — 모바일 네이티브 공유 시트)
      document.getElementById('_storyShareBtn').addEventListener('click', async () => {
        const dataUrl = document.getElementById('_storyImg').src;
        if (!dataUrl) return;
        try {
          const blob = await (await fetch(dataUrl)).blob();
          const file = new File([blob], 'itdasy-story.png', { type: 'image/png' });
          if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: '잇데이 스튜디오' });
          } else {
            showToast('이 브라우저는 공유 기능 미지원. 저장 후 인스타 앱에서 올려주세요.');
          }
        } catch(e) { /* user cancelled */ }
      });
    }
    popup.style.display = 'flex';
  }

  window.openStoryPopup = openStoryPopup;
})();
