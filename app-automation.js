/* v1.3 자동 워크플로 UI — 프리셋 원클릭 + 규칙 목록 */
(function () {
  'use strict';

  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch])); }

  async function _api(path, opts = {}) {
    const res = await fetch(window.API + path, {
      headers: { ...window.authHeader(), 'Content-Type': 'application/json' },
      ...opts,
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  }

  function _trigger_desc(trigger, conditions) {
    if (trigger === 'daily_time') return `매일 ${conditions?.time || '?'}`;
    if (trigger === 'low_stock') return '재고 부족 감지 시';
    if (trigger === 'customer_at_risk') return '이탈 고객 감지 시';
    if (trigger === 'booking_cancelled') return '예약 취소 시';
    return trigger;
  }

  function _action_desc(action) {
    return { notify: '알림 발송', draft_message: 'AI 메시지 초안 준비', remind_unrecorded: '매출 미기록 점검' }[action] || action;
  }

  let _overlay = null;

  async function _reload() {
    if (!_overlay) return;
    const body = _overlay.querySelector('.au-body');
    body.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-subtle);">불러오는 중…</div>';
    try {
      const [presets, rules] = await Promise.all([
        _api('/automation/presets'),
        _api('/automation/rules'),
      ]);
      const have = new Set((rules.items || []).map(r => r.name));
      body.innerHTML = `
        <div style="padding:14px 18px 8px;font-size:11px;color:#888;font-weight:700;letter-spacing:.4px;">추천 자동화 — 클릭으로 1초 등록</div>
        <div style="padding:0 14px;">
          ${(presets.presets || []).map(p => `
            <button data-preset="${_esc(p.key)}" style="width:100%;display:flex;align-items:center;gap:10px;padding:12px 14px;margin-bottom:8px;background:#fff;border:1px solid ${have.has(p.name) ? 'var(--brand)' : '#eee'};border-radius:12px;cursor:pointer;text-align:left;">
              <div style="flex:1;">
                <div style="font-size:13px;font-weight:700;">${_esc(p.name)}</div>
                <div style="font-size:11px;color:#888;margin-top:2px;">${_trigger_desc(p.trigger_type, p.conditions)} · ${_action_desc(p.action_type)}</div>
              </div>
              <span style="font-size:11px;color:${have.has(p.name) ? '#2B8C7E' : 'var(--brand-strong)'};font-weight:700;">${have.has(p.name) ? '✓ 사용중' : '+ 등록'}</span>
            </button>
          `).join('')}
        </div>

        <div style="padding:18px 18px 8px;font-size:11px;color:#888;font-weight:700;letter-spacing:.4px;">내 활성 규칙</div>
        <div style="padding:0 14px 20px;">
          ${(rules.items && rules.items.length) ? (rules.items.map(r => `
            <div style="background:#fff;border:1px solid #eee;border-radius:12px;padding:12px;margin-bottom:8px;">
              <div style="display:flex;align-items:center;gap:8px;">
                <strong style="font-size:13px;">${_esc(r.name)}</strong>
                <span style="font-size:10px;color:${r.enabled ? '#2B8C7E' : '#888'};background:${r.enabled ? '#E8F5E9' : '#F2F2F2'};padding:2px 6px;border-radius:100px;font-weight:700;">${r.enabled ? 'ON' : 'OFF'}</span>
                <span style="margin-left:auto;font-size:10px;color:var(--text-subtle);">실행 ${r.fire_count || 0}회</span>
              </div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">${_trigger_desc(r.trigger_type, r.conditions)} → ${_action_desc(r.action_type)}</div>
              <div style="margin-top:8px;display:flex;gap:6px;">
                <button data-toggle="${r.id}" data-enabled="${r.enabled}" style="flex:1;padding:6px;border:1px solid #ddd;background:#fff;border-radius:6px;font-size:11px;cursor:pointer;">${r.enabled ? 'OFF' : 'ON'}</button>
                <button data-del="${r.id}" style="flex:1;padding:6px;border:1px solid #fcc;background:#fff;color:#c00;border-radius:6px;font-size:11px;cursor:pointer;">삭제</button>
              </div>
            </div>
          `).join('')) : '<div style="padding:20px;text-align:center;color:var(--text-subtle);font-size:12px;">아직 활성 규칙 없음</div>'}
        </div>
      `;
      body.querySelectorAll('[data-preset]').forEach(btn => {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          try {
            const r = await _api('/automation/rules/preset/' + btn.dataset.preset, { method: 'POST' });
            if (window.showToast) window.showToast(r.created ? '자동화 등록' : '이미 등록됨');
            await _reload();
          } catch (e) {
            if (window.showToast) window.showToast('실패: ' + (window._humanError ? window._humanError(e) : e.message));
          }
        });
      });
      body.querySelectorAll('[data-toggle]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const cur = btn.dataset.enabled === 'true';
          await _api('/automation/rules/' + btn.dataset.toggle, { method: 'PATCH', body: JSON.stringify({ enabled: !cur }) });
          await _reload();
        });
      });
      body.querySelectorAll('[data-del]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('규칙을 삭제할까요?')) return;
          await _api('/automation/rules/' + btn.dataset.del, { method: 'DELETE' });
          await _reload();
        });
      });
    } catch (e) {
      body.innerHTML = `<div style="padding:40px;color:#c00;text-align:center;">오류: ${_esc(e.message)}</div>`;
    }
  }

  async function openAutomation() {
    _overlay = document.createElement('div');
    _overlay.style.cssText = 'position:fixed;inset:0;z-index:9400;background:rgba(0,0,0,0.5);display:flex;align-items:flex-end;justify-content:center;';
    _overlay.innerHTML = `
      <div style="width:100%;max-width:520px;background:#fafafa;border-radius:24px 24px 0 0;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;">
        <div style="padding:18px 20px 12px;background:#fff;border-bottom:1px solid #eee;">
          <div style="width:36px;height:4px;background:#e0e0e0;border-radius:2px;margin:0 auto 14px;"></div>
          <div style="display:flex;align-items:center;gap:8px;">
            <strong style="font-size:17px;">⚙️ 자동 워크플로</strong>
            <button class="au-close" style="margin-left:auto;background:none;border:none;font-size:18px;color:#888;cursor:pointer;">✕</button>
          </div>
          <div style="font-size:11px;color:#888;margin-top:6px;">AI 가 정해진 시각·조건에 자동으로 알림·메시지 초안 생성</div>
        </div>
        <div class="au-body" style="flex:1;overflow-y:auto;"></div>
      </div>`;
    document.body.appendChild(_overlay);
    _overlay.querySelector('.au-close').addEventListener('click', () => { _overlay.remove(); _overlay = null; });
    _overlay.addEventListener('click', e => { if (e.target === _overlay) { _overlay.remove(); _overlay = null; } });
    await _reload();
  }

  window.openAutomation = openAutomation;
})();
