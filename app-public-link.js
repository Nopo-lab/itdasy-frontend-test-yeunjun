/* Phase 8 C3 — 온라인 예약 공개 페이지 슬러그 관리 */
(function () {
  'use strict';

  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch])); }

  async function _genSlug() {
    const res = await fetch(window.API + '/public/book/admin/slug', {
      method: 'POST',
      headers: window.authHeader(),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  }

  async function _toggle(enabled) {
    const res = await fetch(window.API + '/public/book/admin/toggle?enabled=' + (enabled ? 'true' : 'false'), {
      method: 'POST',
      headers: window.authHeader(),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  }

  function _buildUrl(slug) {
    // HTML 페이지 — 고객이 브라우저로 방문하면 예약 UI 렌더
    return window.API + '/public/book/' + slug + '/page';
  }

  function _renderBody(body, slug, enabled, url) {
    body.innerHTML = `
      <div style="padding:14px;background:#FAFAFA;border-radius:12px;margin-bottom:14px;">
        <div style="font-size:11px;color:#888;margin-bottom:6px;">내 예약 링크</div>
        <div id="pb-url" style="font-family:monospace;font-size:12px;word-break:break-all;background:#fff;border:1px solid #eee;padding:10px;border-radius:8px;">${_esc(url)}</div>
      </div>

      <label style="display:flex;align-items:center;justify-content:space-between;padding:14px;background:#FAFAFA;border-radius:12px;margin-bottom:14px;cursor:pointer;">
        <div>
          <div style="font-weight:700;font-size:14px;">공개 예약 받기</div>
          <div style="font-size:11px;color:#888;margin-top:2px;">OFF 시 링크 접근해도 예약 불가</div>
        </div>
        <input id="pb-enabled" type="checkbox" ${enabled ? 'checked' : ''} style="width:20px;height:20px;">
      </label>

      <div style="display:flex;gap:8px;">
        <button id="pb-copy" style="flex:1;padding:12px;border:1px solid #ddd;background:#fff;border-radius:10px;font-weight:700;cursor:pointer;">복사</button>
        <button id="pb-share" style="flex:1;padding:12px;border:none;background:linear-gradient(135deg,var(--brand),var(--brand-strong));color:#fff;border-radius:10px;font-weight:800;cursor:pointer;">공유</button>
      </div>

      <div style="padding:14px;background:#FFFBEA;border-radius:10px;margin-top:14px;border:1px solid #FDE68A;">
        <div style="font-size:12px;font-weight:700;color:#B45309;margin-bottom:4px;">활용 팁</div>
        <div style="font-size:11px;color:var(--text-muted);line-height:1.6;">
          · 인스타 프로필 "웹사이트" 자리에 붙여넣기<br>
          · 카톡 채널 홈 "링크" 로 추가<br>
          · 명함 QR 코드 생성
        </div>
      </div>
    `;
  }

  function _bindBody(body, url) {
    body.querySelector('#pb-copy').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(url); if (window.showToast) window.showToast('복사했어요 📋'); }
      catch (_e) { if (window.showToast) window.showToast('복사 실패'); }
    });

    body.querySelector('#pb-share').addEventListener('click', async () => {
      if (navigator.share) {
        try {
          await navigator.share({ title: '예약하기', text: '원하는 시간에 바로 예약하실 수 있어요 🎀', url });
        } catch (_e) { /* 사용자 취소는 정상 */ }
      } else {
        if (window.showToast) window.showToast('공유 미지원 — 복사 후 붙여넣기');
      }
    });

    body.querySelector('#pb-enabled').addEventListener('change', async (e) => {
      try {
        await _toggle(e.target.checked);
        if (window.showToast) window.showToast(e.target.checked ? '공개 ON' : '공개 OFF');
      } catch (_e) {
        if (window.showToast) window.showToast('변경 실패');
        e.target.checked = !e.target.checked;
      }
    });
  }

  async function openPublicBookingSettings() {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9400;background:rgba(0,0,0,0.5);display:flex;align-items:flex-end;justify-content:center;';
    overlay.innerHTML = `
      <div style="width:100%;max-width:480px;background:#fff;border-radius:24px 24px 0 0;padding:24px 20px;max-height:88vh;overflow-y:auto;">
        <div style="width:36px;height:4px;background:#e0e0e0;border-radius:2px;margin:0 auto 18px;"></div>
        <strong style="font-size:17px;">🔗 온라인 예약 링크</strong>
        <div style="font-size:12px;color:#888;margin-top:4px;margin-bottom:18px;">인스타 프로필·카톡 채널에 링크 걸면 고객이 직접 예약</div>
        <div class="pb-body">
          <div style="padding:40px;text-align:center;color:var(--text-subtle);">불러오는 중…</div>
        </div>
        <button class="pb-close" style="margin-top:20px;width:100%;padding:13px;border:1px solid #ddd;background:#fff;border-radius:10px;font-weight:700;cursor:pointer;">닫기</button>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('.pb-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    const body = overlay.querySelector('.pb-body');
    try {
      const info = await _genSlug();
      const url = _buildUrl(info.slug);
      _renderBody(body, info.slug, info.enabled, url);
      _bindBody(body, url);
    } catch (e) {
      body.innerHTML = `<div style="padding:40px;text-align:center;color:#c00;">오류: ${_esc(e.message)}</div>`;
    }
  }

  window.openPublicBookingSettings = openPublicBookingSettings;
})();
