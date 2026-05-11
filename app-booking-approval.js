/* Phase 8 C3 — 온라인 예약 선입금 승인 리스트
   입금 확인 후 [승인] 누르면 실제 캘린더 반영. [거절] 누르면 취소.
*/
(function () {
  'use strict';

  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch])); }
  function _fmt(s) {
    if (!s) return '';
    const d = new Date(s);
    if (isNaN(d)) return s;
    return `${String(d.getMonth() + 1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }

  async function _api(path, opts = {}) {
    const res = await fetch(window.API + path, {
      headers: { ...window.authHeader() },
      ...opts,
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  }

  let _overlay = null;

  async function _reload() {
    if (!_overlay) return;
    const body = _overlay.querySelector('.ba-body');
    body.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-subtle);">불러오는 중…</div>';
    try {
      const d = await _api('/public/book/admin/pending');
      if (!d.items.length) {
        body.innerHTML = `
          <div style="padding:40px 20px;text-align:center;">
            <div style="font-size:40px;">✨</div>
            <div style="font-size:13px;color:var(--text-muted);margin-top:10px;">입금 대기 중인 예약 없음</div>
            <div style="font-size:11px;color:var(--text-subtle);margin-top:4px;">고객이 예약 링크에서 신청하면 여기 표시돼요</div>
          </div>`;
        return;
      }
      body.innerHTML = d.items.map(b => {
        const memo = (b.memo || '').replace('[온라인 예약]', '').trim();
        return `
        <div style="background:#fff;border:1px solid #FDE68A;border-radius:12px;padding:14px;margin-bottom:10px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
            <strong style="font-size:14px;">${_esc(b.customer_name)}</strong>
            <span style="font-size:10px;color:#B45309;background:#FFFBEA;padding:2px 6px;border-radius:100px;font-weight:700;">입금 대기</span>
            <span style="margin-left:auto;font-size:11px;color:var(--text-muted);">${_fmt(b.starts_at)}</span>
          </div>
          <div style="font-size:12px;color:var(--text-muted);">${_esc(b.service_name || '시술')}</div>
          ${memo ? `<div style="font-size:11px;color:#888;margin-top:4px;">${_esc(memo)}</div>` : ''}
          <div style="margin-top:10px;display:flex;gap:6px;">
            <button data-approve="${b.id}" style="flex:2;padding:10px;background:linear-gradient(135deg,var(--brand),var(--brand-strong));color:#fff;border:none;border-radius:8px;font-weight:800;font-size:12px;cursor:pointer;">입금 확인 · 승인</button>
            <button data-reject="${b.id}" style="flex:1;padding:10px;background:#fff;color:#c00;border:1px solid #fcc;border-radius:8px;font-weight:700;font-size:12px;cursor:pointer;">거절</button>
          </div>
        </div>`;
      }).join('');
      body.querySelectorAll('[data-approve]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('입금 확인했나요? 승인 시 캘린더에 반영됩니다.')) return;
          btn.disabled = true;
          try {
            await _api('/public/book/admin/bookings/' + btn.dataset.approve + '/approve', { method: 'POST' });
            if (window.showToast) window.showToast('예약 확정');
            try { sessionStorage.removeItem('pv_cache::booking'); } catch (_e) { /* ignore */ }
            await _reload();
          } catch (e) {
            if (window.showToast) window.showToast('실패: ' + (window._humanError ? window._humanError(e) : e.message));
            btn.disabled = false;
          }
        });
      });
      body.querySelectorAll('[data-reject]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('거절할까요? 고객에겐 별도 연락 필요.')) return;
          btn.disabled = true;
          try {
            await _api('/public/book/admin/bookings/' + btn.dataset.reject + '/reject', { method: 'POST' });
            if (window.showToast) window.showToast('🗑 거절됨');
            await _reload();
          } catch (e) {
            if (window.showToast) window.showToast('실패: ' + (window._humanError ? window._humanError(e) : e.message));
            btn.disabled = false;
          }
        });
      });
    } catch (e) {
      body.innerHTML = `<div style="padding:40px;color:#c00;text-align:center;">오류: ${_esc(e.message)}</div>`;
    }
  }

  async function openBookingApproval() {
    _overlay = document.createElement('div');
    _overlay.style.cssText = 'position:fixed;inset:0;z-index:9400;background:rgba(0,0,0,0.5);display:flex;align-items:flex-end;justify-content:center;';
    _overlay.innerHTML = `
      <div style="width:100%;max-width:520px;background:#fafafa;border-radius:24px 24px 0 0;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;">
        <div style="padding:18px 20px 12px;background:#fff;border-bottom:1px solid #eee;">
          <div style="width:36px;height:4px;background:#e0e0e0;border-radius:2px;margin:0 auto 14px;"></div>
          <div style="display:flex;align-items:center;gap:8px;">
            <strong style="font-size:17px;">입금 대기 예약</strong>
            <button class="ba-close" style="margin-left:auto;background:none;border:none;font-size:18px;color:#888;cursor:pointer;">✕</button>
          </div>
          <div style="font-size:11px;color:#888;margin-top:6px;">입금 확인 후 "승인" 탭 → 캘린더 반영. 미입금은 "거절".</div>
        </div>
        <div class="ba-body" style="flex:1;overflow-y:auto;padding:14px;"></div>
      </div>`;
    document.body.appendChild(_overlay);
    _overlay.querySelector('.ba-close').addEventListener('click', () => { _overlay.remove(); _overlay = null; });
    _overlay.addEventListener('click', e => { if (e.target === _overlay) { _overlay.remove(); _overlay = null; } });
    await _reload();
  }

  window.openBookingApproval = openBookingApproval;
})();
