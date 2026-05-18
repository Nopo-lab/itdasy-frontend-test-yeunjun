/* ─────────────────────────────────────────────────────────────
   잇데이 — 피드 그리드 미리보기 (SN-3, Phase 1)
   2026-05-19 v207

   기능:
     • 9칸/12칸 그리드로 내 피드 전체 모습 미리 확인
     • 게시물 순서 드래그 재배치
     • 예약 게시물 + 기존 게시물 합산 뷰
     • 비율/톤 일관성 힌트

   진입: window.SNSGridPreview.open()
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window.SNSGridPreview) return;

  let _gridSize = 9; // 9 or 12
  let _posts = [];
  let _sheetEl = null;

  function _esc(s) { return String(s==null?'':s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
  function _toast(msg) { if (window.showToast) window.showToast(msg); }

  function _loadPosts() {
    _posts = [];
    // SNS 캘린더 게시물
    try {
      const cal = JSON.parse(localStorage.getItem('itdasy_sns_calendar') || '[]');
      cal.forEach(p => { if (p.imageUrl || p.caption) _posts.push(p); });
    } catch (_) { /* ignore */ }
    // 기존 갤러리 사진 (최근)
    try {
      const gallery = JSON.parse(localStorage.getItem('itdasy_gallery_recent') || '[]');
      gallery.forEach((g, i) => {
        _posts.push({ id: 'gal-' + i, imageUrl: g.src || g.url || '', caption: g.caption || '', status: 'published', date: g.date || '' });
      });
    } catch (_) { /* ignore */ }
    // 비어 있으면 플레이스홀더
    if (_posts.length === 0) {
      for (let i = 0; i < _gridSize; i++) {
        _posts.push({ id: 'placeholder-' + i, imageUrl: '', caption: `게시물 ${i+1}`, status: 'draft' });
      }
    }
  }

  function _ensureSheet() {
    if (_sheetEl) return _sheetEl;
    _sheetEl = document.createElement('div');
    _sheetEl.id = 'snsGridSheet';
    _sheetEl.style.cssText = 'position:fixed;inset:0;z-index:9500;background:var(--surface,#fff);display:none;flex-direction:column;overflow-y:auto;';
    document.body.appendChild(_sheetEl);
    return _sheetEl;
  }

  function _render() {
    const sheet = _ensureSheet();
    const shopName = localStorage.getItem('itdasy_shop_name') || localStorage.getItem('shop_name') || '잇데이 스튜디오';
    const handle = localStorage.getItem('itdasy:ig_handle') || shopName.toLowerCase().replace(/\s/g, '');
    const avatarLetter = shopName[0] || '잇';
    const displayPosts = _posts.slice(0, _gridSize);

    sheet.innerHTML = `
      <header style="display:flex;align-items:center;padding:12px 16px;border-bottom:1px solid rgba(0,0,0,0.06);">
        <button onclick="window.SNSGridPreview.close()" style="background:none;border:none;font-size:18px;cursor:pointer;margin-right:12px;">‹</button>
        <div style="font-size:15px;font-weight:800;">📱 피드 그리드 미리보기</div>
        <div style="margin-left:auto;display:flex;gap:6px;">
          <button class="sns-grid-toggle ${_gridSize===9?'on':''}" onclick="window.SNSGridPreview._setSize(9)" style="padding:4px 10px;border-radius:8px;border:1px solid ${_gridSize===9?'var(--accent)':'#ddd'};background:${_gridSize===9?'var(--accent)':'#fff'};color:${_gridSize===9?'#fff':'#666'};font-size:11px;font-weight:700;cursor:pointer;">3×3</button>
          <button class="sns-grid-toggle ${_gridSize===12?'on':''}" onclick="window.SNSGridPreview._setSize(12)" style="padding:4px 10px;border-radius:8px;border:1px solid ${_gridSize===12?'var(--accent)':'#ddd'};background:${_gridSize===12?'var(--accent)':'#fff'};color:${_gridSize===12?'#fff':'#666'};font-size:11px;font-weight:700;cursor:pointer;">4×3</button>
        </div>
      </header>

      <!-- 인스타 프로필 헤더 시뮬레이션 -->
      <div style="padding:16px;display:flex;align-items:center;gap:16px;border-bottom:1px solid rgba(0,0,0,0.04);">
        <div style="width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,var(--accent,#F18091),var(--accent2,#e26a85));display:flex;align-items:center;justify-content:center;color:#fff;font-size:22px;font-weight:800;flex-shrink:0;">${avatarLetter}</div>
        <div style="flex:1;">
          <div style="font-size:15px;font-weight:800;margin-bottom:2px;">${_esc(shopName)}</div>
          <div style="font-size:12px;color:#888;">@${_esc(handle)}</div>
          <div style="display:flex;gap:20px;margin-top:8px;">
            <div style="text-align:center;"><div style="font-size:14px;font-weight:800;">${_posts.length}</div><div style="font-size:10px;color:#888;">게시물</div></div>
            <div style="text-align:center;"><div style="font-size:14px;font-weight:800;">—</div><div style="font-size:10px;color:#888;">팔로워</div></div>
            <div style="text-align:center;"><div style="font-size:14px;font-weight:800;">—</div><div style="font-size:10px;color:#888;">팔로잉</div></div>
          </div>
        </div>
      </div>

      <!-- 그리드 -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:2px;padding:2px;">
        ${displayPosts.map((p, i) => `
          <div class="sns-grid-cell" data-idx="${i}" draggable="true" style="position:relative;aspect-ratio:1;background:${p.imageUrl ? '#000' : '#f5f5f5'};overflow:hidden;cursor:grab;">
            ${p.imageUrl
              ? `<img src="${_esc(p.imageUrl)}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;">`
              : `<div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;">
                  <span style="font-size:20px;">📷</span>
                  <span style="font-size:10px;color:#999;font-weight:600;">${_esc((p.caption||'').slice(0,15))}</span>
                </div>`}
            ${p.status==='scheduled' ? '<div style="position:absolute;top:4px;right:4px;background:rgba(251,191,36,0.9);color:#000;font-size:9px;font-weight:800;padding:2px 6px;border-radius:6px;">⏰ 예약</div>' : ''}
            ${p.status==='draft' ? '<div style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,0.5);color:#fff;font-size:9px;font-weight:700;padding:2px 6px;border-radius:6px;">초안</div>' : ''}
          </div>
        `).join('')}
      </div>

      <!-- 힌트 -->
      <div style="padding:16px;text-align:center;">
        <div style="font-size:12px;color:var(--text3);line-height:1.6;">
          💡 게시물을 길게 눌러 순서를 바꿀 수 있어요<br>
          피드 전체 톤이 일관되면 팔로워 전환율이 높아져요
        </div>
      </div>`;

    sheet.style.display = 'flex';
    _bindDrag(sheet);
  }

  function _bindDrag(sheet) {
    let dragIdx = null;
    sheet.querySelectorAll('.sns-grid-cell').forEach(cell => {
      cell.addEventListener('dragstart', e => {
        dragIdx = +cell.dataset.idx;
        cell.style.opacity = '0.4';
        e.dataTransfer.effectAllowed = 'move';
      });
      cell.addEventListener('dragend', () => { cell.style.opacity = '1'; dragIdx = null; });
      cell.addEventListener('dragover', e => { e.preventDefault(); cell.style.outline = '2px solid var(--accent)'; });
      cell.addEventListener('dragleave', () => { cell.style.outline = ''; });
      cell.addEventListener('drop', e => {
        e.preventDefault();
        cell.style.outline = '';
        const dropIdx = +cell.dataset.idx;
        if (dragIdx !== null && dragIdx !== dropIdx) {
          const moved = _posts.splice(dragIdx, 1)[0];
          _posts.splice(dropIdx, 0, moved);
          _render();
          _toast('순서 변경 완료');
        }
      });
    });
  }

  function _open() {
    _loadPosts();
    _render();
  }
  function _close() {
    if (_sheetEl) _sheetEl.style.display = 'none';
  }
  function _setSize(n) {
    _gridSize = n;
    _render();
  }

  window.SNSGridPreview = { open: _open, close: _close, _setSize };
})();
