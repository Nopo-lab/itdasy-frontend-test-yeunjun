/* ─────────────────────────────────────────────────────────────
   영상 합성 UI (Phase 3.3 + Phase 4 확장 · 2026-04-20)

   모드 2종:
   - beforeafter: 2장 + 자막 + 전환 선택
   - sequence:    3~6장 순차 + 각 컷 자막

   공통:
   - AI 문구 제안 (/video/caption-suggest)
   - 전환 효과 선택 (fade/slide/wipe/radial)
   - hold/transition 슬라이더
   - 결과 미리보기 + 다운로드 + 인스타 이어편집 공유
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const MAX_IMAGES = 6;
  const TEXT_MAX = 40;

  let _capabilityChecked = false;
  let _capability = { ffmpeg: false, korean_font: false, transitions: ['fade'], max_sequence_images: 6 };
  let _mode = 'beforeafter';        // 'beforeafter' | 'sequence'
  let _slots = [];                  // [{ file, url, caption }]
  let _transition = 'fade';
  let _hold = 1.2;
  let _trans = 0.6;
  let _lastBlob = null;             // 생성된 MP4 blob (Instagram 공유용)

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
  }

  async function _checkCapability() {
    if (_capabilityChecked) return _capability;
    try {
      const res = await fetch(window.API + '/video/capability', { headers: window.authHeader() });
      if (res.ok) {
        _capability = { ..._capability, ...(await res.json()) };
      }
    } catch (_) { /* ignore */ }
    _capabilityChecked = true;
    return _capability;
  }

  function _ensureSheet() {
    let sheet = document.getElementById('videoSheet');
    if (sheet) return sheet;
    sheet = document.createElement('div');
    sheet.id = 'videoSheet';
    sheet.style.cssText = 'position:fixed;inset:0;z-index:9998;display:none;flex-direction:column;';
    sheet.classList.add('dt-overlay');
    sheet.innerHTML = `
      <header class="dt-hdr">
        <button class="dt-back" onclick="closeVideo()" aria-label="뒤로"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></button>
        <h1 class="dt-title">영상 만들기</h1>
        <span id="videoBadge" style="font-size:10px;padding:2px 6px;border-radius:4px;"></span>
      </header>
      <div class="dt-body" id="videoBody"></div>
    `;
    document.body.appendChild(sheet);
    return sheet;
  }

  function _renderServerOff() {
    document.getElementById('videoBody').innerHTML = `
      <div style="padding:40px 20px;text-align:center;color:#888;">
        <div style="font-size:40px;margin-bottom:10px;">🎬</div>
        <div style="font-size:14px;line-height:1.5;">서버 영상 엔진(ffmpeg)이 아직 준비되지 않았어요.<br>배포 환경이 완료되면 바로 사용할 수 있어요.</div>
      </div>`;
  }

  function _modeSwitcher() {
    return `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:12px;padding:4px;background:rgba(0,0,0,0.04);border-radius:10px;">
        <button data-mode="beforeafter" style="padding:10px;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:700;background:${_mode === 'beforeafter' ? 'var(--accent,#F18091)' : 'transparent'};color:${_mode === 'beforeafter' ? '#fff' : '#555'};">🔄 비포·애프터</button>
        <button data-mode="sequence" style="padding:10px;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:700;background:${_mode === 'sequence' ? 'var(--accent,#F18091)' : 'transparent'};color:${_mode === 'sequence' ? '#fff' : '#555'};">🎞 여러 컷 (~${MAX_IMAGES})</button>
      </div>
    `;
  }

  function _slotCard(i) {
    const slot = _slots[i];
    const isBa = _mode === 'beforeafter';
    const label = isBa ? (i === 0 ? 'BEFORE' : 'AFTER') : `${i + 1}컷`;
    const empty = !slot || !slot.url;
    return `
      <div style="margin-bottom:10px;">
        <label data-slot-index="${i}" style="display:flex;gap:10px;align-items:center;padding:10px;border:2px dashed ${empty ? '#ddd' : 'transparent'};border-radius:12px;cursor:pointer;background:${empty ? 'transparent' : '#fff'};box-shadow:${empty ? 'none' : '0 1px 3px rgba(0,0,0,0.06)'}">
          <input type="file" accept="image/*" hidden data-slot-input="${i}" />
          <div style="width:68px;height:68px;border-radius:10px;flex-shrink:0;${empty ? 'background:rgba(0,0,0,0.03);display:flex;align-items:center;justify-content:center;' : ''}${slot?.url ? `background:center/cover url('${slot.url}')` : ''}">
            ${empty ? '<span style="font-size:22px;color:#ccc;">＋</span>' : ''}
          </div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:11px;color:#888;font-weight:700;margin-bottom:4px;">${label}</div>
            ${empty ? '<div style="font-size:12px;color:#aaa;">탭해서 사진 선택</div>' : `
              <input data-slot-caption="${i}" value="${_esc(slot.caption || '')}" maxlength="${TEXT_MAX}" placeholder="자막 (예: ${label})" style="width:100%;padding:6px 8px;border:1px solid #eee;border-radius:6px;font-size:12px;" />
            `}
          </div>
          ${slot?.url && _mode === 'sequence' && _slots.length > 2 ? `<button type="button" data-slot-remove="${i}" style="background:none;border:none;color:#c00;font-size:16px;cursor:pointer;padding:4px;">🗑</button>` : ''}
        </label>
      </div>
    `;
  }

  function _slotsBlock() {
    const count = _mode === 'beforeafter' ? 2 : Math.max(_slots.length, 3);
    // 배열 길이 맞춤
    while (_slots.length < count) _slots.push({ file: null, url: null, caption: '' });
    if (_mode === 'beforeafter' && _slots.length > 2) _slots = _slots.slice(0, 2);

    const slotsHtml = Array.from({ length: count }, (_, i) => _slotCard(i)).join('');
    const addBtn = _mode === 'sequence' && _slots.length < MAX_IMAGES
      ? `<button data-slot-add style="width:100%;padding:10px;border:2px dashed #ddd;border-radius:10px;background:transparent;color:#888;cursor:pointer;font-size:12px;margin-bottom:10px;">＋ 컷 추가 (${_slots.length}/${MAX_IMAGES})</button>`
      : '';
    return slotsHtml + addBtn;
  }

  function _optionsBlock() {
    const trans = _capability.transitions || ['fade'];
    const tLabel = { fade: '💫 페이드', slide: '➡️ 슬라이드', wipe: '◐ 와이프', radial: '🌀 원형' };
    return `
      <div style="padding:12px;background:#fff;border-radius:12px;margin-bottom:12px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
        <div style="font-size:12px;font-weight:700;color:#555;margin-bottom:8px;">전환 효과</div>
        <div style="display:grid;grid-template-columns:repeat(${trans.length},1fr);gap:6px;margin-bottom:12px;">
          ${trans.map(t => `
            <button data-trans="${t}" style="padding:8px 4px;border:1px solid ${_transition === t ? 'var(--accent,#F18091)' : '#ddd'};border-radius:8px;background:${_transition === t ? 'rgba(241,128,145,0.1)' : '#fff'};color:${_transition === t ? 'var(--accent,#F18091)' : '#555'};font-size:11px;font-weight:700;cursor:pointer;">${tLabel[t] || t}</button>
          `).join('')}
        </div>
        <div style="display:flex;gap:10px;align-items:baseline;margin-bottom:6px;">
          <span style="font-size:11px;color:#666;flex:1;">정지 <b id="vHoldLabel">${_hold}</b>초</span>
          <span style="font-size:11px;color:#666;flex:1;">전환 <b id="vTransLabel">${_trans}</b>초</span>
        </div>
        <input id="vHold" type="range" min="0.4" max="3.0" step="0.1" value="${_hold}" style="width:100%;margin-bottom:4px;" />
        <input id="vTrans" type="range" min="0.2" max="2.0" step="0.1" value="${_trans}" style="width:100%;" />
      </div>
    `;
  }

  function _aiSuggestBlock() {
    return `
      <button data-ai-suggest style="width:100%;padding:10px;border:1px solid rgba(241,128,145,0.3);border-radius:10px;background:rgba(241,128,145,0.05);color:var(--accent,#F18091);cursor:pointer;font-size:12px;font-weight:700;margin-bottom:12px;">
        ✨ AI 자막 추천 받기
      </button>
    `;
  }

  function _generateButton() {
    const ready = _slots.filter(s => s.file).length >= 2;
    return `
      <button id="vGenerate" ${ready ? '' : 'disabled'} style="width:100%;padding:13px;border:none;border-radius:10px;background:${ready ? 'linear-gradient(135deg,#F18091,#D95F70)' : '#ddd'};color:${ready ? '#fff' : '#888'};font-weight:800;cursor:${ready ? 'pointer' : 'not-allowed'};font-size:15px;">${ready ? '🎬 영상 만들기' : '📸 사진 ' + (_mode === 'beforeafter' ? '2장' : '2~6장') + ' 선택'}</button>
      <div id="vStatus" style="margin-top:10px;min-height:20px;font-size:12px;color:#888;text-align:center;"></div>
    `;
  }

  function _render() {
    const body = document.getElementById('videoBody');
    if (!body) return;
    body.innerHTML = `
      ${_modeSwitcher()}
      ${_slotsBlock()}
      ${_optionsBlock()}
      ${_aiSuggestBlock()}
      ${_generateButton()}
    `;
    _bindRender();
  }

  function _bindRender() {
    const body = document.getElementById('videoBody');
    if (!body) return;

    // 모드 스위치
    body.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
      const m = b.dataset.mode;
      if (m !== _mode) {
        _mode = m;
        _slots = _mode === 'beforeafter' ? [{}, {}] : [{}, {}, {}];
        _render();
      }
    }));

    // 파일 선택
    body.querySelectorAll('[data-slot-input]').forEach(inp => {
      inp.addEventListener('change', (e) => {
        const i = parseInt(inp.dataset.slotInput, 10);
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        if (file.size > 8 * 1024 * 1024) {
          if (window.showToast) window.showToast('8MB 초과 사진은 사용할 수 없어요');
          return;
        }
        _slots[i] = { file, url: URL.createObjectURL(file), caption: _slots[i]?.caption || '' };
        _render();
      });
    });

    // 자막 입력
    body.querySelectorAll('[data-slot-caption]').forEach(inp => {
      inp.addEventListener('input', () => {
        const i = parseInt(inp.dataset.slotCaption, 10);
        if (_slots[i]) _slots[i].caption = inp.value.slice(0, TEXT_MAX);
      });
    });

    // 슬롯 제거
    body.querySelectorAll('[data-slot-remove]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const i = parseInt(btn.dataset.slotRemove, 10);
        _slots.splice(i, 1);
        _render();
      });
    });

    // 슬롯 추가
    const addBtn = body.querySelector('[data-slot-add]');
    if (addBtn) addBtn.addEventListener('click', () => {
      if (_slots.length < MAX_IMAGES) {
        _slots.push({ file: null, url: null, caption: '' });
        _render();
      }
    });

    // 전환 선택
    body.querySelectorAll('[data-trans]').forEach(b => b.addEventListener('click', () => {
      _transition = b.dataset.trans;
      _render();
    }));

    // 슬라이더
    const holdEl = body.querySelector('#vHold');
    const transEl = body.querySelector('#vTrans');
    if (holdEl) holdEl.addEventListener('input', () => {
      _hold = parseFloat(holdEl.value);
      body.querySelector('#vHoldLabel').textContent = _hold;
    });
    if (transEl) transEl.addEventListener('input', () => {
      _trans = parseFloat(transEl.value);
      body.querySelector('#vTransLabel').textContent = _trans;
    });

    // AI 제안
    const aiBtn = body.querySelector('[data-ai-suggest]');
    if (aiBtn) aiBtn.addEventListener('click', _aiSuggest);

    // 생성 버튼
    const gen = body.querySelector('#vGenerate');
    if (gen) gen.addEventListener('click', _generate);
  }

  async function _aiSuggest() {
    const status = document.getElementById('vStatus');
    status.textContent = 'AI 자막 추천 중…';
    try {
      const res = await fetch(window.API + '/video/caption-suggest', {
        method: 'POST',
        headers: { ...window.authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: _mode, service_name: localStorage.getItem('shop_type') || null }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const d = await res.json();
      const sugs = d.suggestions || [];
      if (!sugs.length) { status.textContent = '제안을 받지 못했어요'; return; }

      // 첫 번째 제안을 자동 적용
      const s = sugs[0];
      if (_mode === 'beforeafter' && s.before !== undefined) {
        if (_slots[0]) _slots[0].caption = s.before || '';
        if (_slots[1]) _slots[1].caption = s.after || '';
      } else if (_mode === 'sequence' && s.sequence) {
        s.sequence.slice(0, _slots.length).forEach((c, i) => { if (_slots[i]) _slots[i].caption = c || ''; });
      }
      status.textContent = d.ai_used ? '✨ AI 추천 적용됨 — 편집 가능' : '💡 기본 추천 적용됨';
      if (window.hapticLight) window.hapticLight();
      _render();
    } catch (e) {
      status.textContent = 'AI 제안 실패: ' + e.message;
    }
  }

  async function _generate() {
    const ready = _slots.filter(s => s.file).length >= 2;
    if (!ready) return;
    const btn = document.getElementById('vGenerate');
    const status = document.getElementById('vStatus');
    btn.disabled = true;
    btn.textContent = '생성 중…';
    status.textContent = '서버에서 합성 중 (최대 90초)';

    const fd = new FormData();
    fd.append('hold_seconds', _hold);
    fd.append('transition_seconds', _trans);
    fd.append('transition', _transition);

    let url;
    try {
      if (_mode === 'beforeafter') {
        fd.append('before', _slots[0].file);
        fd.append('after', _slots[1].file);
        fd.append('before_text', _slots[0].caption || '');
        fd.append('after_text', _slots[1].caption || '');
        url = window.API + '/video/beforeafter';
      } else {
        const files = _slots.filter(s => s.file);
        files.forEach(s => fd.append('images', s.file));
        fd.append('captions', files.map(s => s.caption || '').join('|'));
        url = window.API + '/video/sequence';
      }
      const res = await fetch(url, { method: 'POST', headers: window.authHeader(), body: fd });
      if (res.status === 501) {
        status.textContent = '서버 ffmpeg 미설치';
        btn.disabled = false;
        btn.textContent = '다시 시도';
        return;
      }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      _lastBlob = await res.blob();
      const objUrl = URL.createObjectURL(_lastBlob);
      status.innerHTML = `
        <video src="${objUrl}" controls autoplay loop style="width:100%;max-height:360px;border-radius:12px;margin-top:8px;"></video>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;">
          <a href="${objUrl}" download="video_${Date.now()}.mp4" style="padding:10px;background:#fff;border:1px solid #ddd;border-radius:8px;color:#555;text-decoration:none;font-weight:700;font-size:13px;text-align:center;">📥 MP4 저장</a>
          <button data-share-ig style="padding:10px;background:linear-gradient(135deg,#833AB4,#FD1D1D);border:none;border-radius:8px;color:#fff;font-weight:700;font-size:13px;cursor:pointer;">🎵 인스타로 이어편집</button>
        </div>
        <div style="font-size:11px;color:#888;text-align:center;margin-top:8px;">인스타 공유 → 릴스에서 BGM·스티커 추가하세요</div>
      `;
      btn.disabled = false;
      btn.textContent = '🎬 다시 만들기';
      if (window.hapticSuccess) window.hapticSuccess();
      const igBtn = status.querySelector('[data-share-ig]');
      if (igBtn) igBtn.addEventListener('click', _shareToInstagram);
    } catch (e) {
      console.warn('[video] 실패:', e);
      status.textContent = '실패: ' + e.message;
      btn.disabled = false;
      btn.textContent = '🎬 영상 만들기';
    }
  }

  async function _shareToInstagram() {
    if (!_lastBlob) return;
    const fileName = `itdasy_${Date.now()}.mp4`;
    const file = new File([_lastBlob], fileName, { type: 'video/mp4' });

    // Capacitor 네이티브 경로 — base64 저장 후 Share 플러그인
    if (window.Capacitor?.isNativePlatform?.()) {
      try {
        const { Filesystem, Directory } = window.Capacitor.Plugins;
        const { Share } = window.Capacitor.Plugins;
        if (Filesystem && Share) {
          const reader = new FileReader();
          reader.onload = async () => {
            const base64 = reader.result.split(',')[1];
            const saved = await Filesystem.writeFile({
              path: fileName,
              data: base64,
              directory: Directory.Cache,
              recursive: true,
            });
            await Share.share({
              title: '잇데이에서 만든 영상',
              url: saved.uri,
              dialogTitle: '인스타그램에 공유',
            });
          };
          reader.readAsDataURL(_lastBlob);
          return;
        }
      } catch (e) {
        console.warn('[share] native 실패, web 폴백:', e);
      }
    }

    // 웹: navigator.share 지원 시
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: '잇데이 영상' });
        return;
      } catch (_) { /* web share failed — fall through to download */ }
    }

    // 최후 폴백 — 다운로드 후 안내
    const url = URL.createObjectURL(_lastBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    if (window.showToast) window.showToast('영상 저장됨 — 인스타 앱에서 이어서 편집하세요');
  }

  window.openVideo = async function () {
    _ensureSheet();
    const vSheet = document.getElementById('videoSheet');
    vSheet.style.display = 'flex';
    vSheet.classList.add('dt-shown');
    document.body.style.overflow = 'hidden';

    const badge = document.getElementById('videoBadge');
    const body = document.getElementById('videoBody');
    body.innerHTML = '<div class="dt-loading">서버 확인 중…</div>';

    const cap = await _checkCapability();
    _transition = (cap.transitions && cap.transitions[0]) || 'fade';
    if (cap.ffmpeg) {
      badge.style.cssText += 'background:rgba(76,175,80,0.15);color:#388e3c;';
      badge.textContent = cap.korean_font ? '준비됨 · 한글' : '준비됨 · 영문만';
    } else {
      badge.style.cssText += 'background:rgba(255,193,7,0.2);color:#f57c00;';
      badge.textContent = '준비중';
      _renderServerOff();
      return;
    }

    _slots = [{}, {}];
    _mode = 'beforeafter';
    _lastBlob = null;
    _render();
  };

  window.closeVideo = function () {
    const sheet = document.getElementById('videoSheet');
    if (sheet) { sheet.style.display = 'none'; sheet.classList.remove('dt-shown'); }
    document.body.style.overflow = '';
  };

  window.Video = {
    checkCapability: _checkCapability,
    get isReady() { return _capability.ffmpeg; },
  };
})();
