/* ─────────────────────────────────────────────────────────────
   생일/기념일 자동 감지 (킬러 #2 · 2026-04-21)

   대시보드 카드 + 전체 시트 2종:
   - render(containerId): 이번 주 생일자 있으면 배너 카드
   - openBirthday(): 14일 내 생일자 목록 + 축하 메시지 템플릿 복사

   GET /birthdays/upcoming?days=14
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  let _cached = null;

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
  }

  async function _fetch(days) {
    try {
      const res = await fetch(window.API + '/birthdays/upcoming?days=' + (days || 14), { headers: window.authHeader() });
      if (!res.ok) return null;
      return await res.json();
    } catch (_) { return null; }
  }

  function _renderCard(d) {
    const items = d.items || [];
    if (!items.length) return '';
    // 오늘/내일 우선
    const priority = items.slice(0, 3);
    const namesStr = priority.map(i => _esc(i.name)).join(', ');
    const labelLead = items[0].days_until === 0 ? '오늘' : items[0].days_until === 1 ? '내일' : `${items[0].days_until}일 뒤`;

    return `
      <div data-birthday-open style="padding:14px;border-radius:14px;background:linear-gradient(135deg,rgba(139,92,246,0.12),rgba(139,92,246,0.02));border:1px solid rgba(139,92,246,0.25);margin-bottom:14px;display:flex;align-items:center;gap:10px;cursor:pointer;">
        <div style="width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,#A78BFA,#8B5CF6);display:flex;align-items:center;justify-content:center;font-size:22px;color:#fff;flex-shrink:0;">🎂</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:12px;font-weight:800;margin-bottom:2px;color:#6D28D9;">${labelLead} 생일 · ${items.length}명</div>
          <div style="font-size:11px;color:var(--text-muted);line-height:1.4;">${namesStr}${items.length > priority.length ? ` 외 ${items.length - priority.length}명` : ''}</div>
        </div>
        <div style="padding:6px 12px;border-radius:8px;background:#fff;color:#6D28D9;font-size:11px;font-weight:700;">축하하기 →</div>
      </div>
    `;
  }

  function _ensureSheet() {
    let sheet = document.getElementById('birthdaySheet');
    if (sheet) return sheet;
    sheet = document.createElement('div');
    sheet.id = 'birthdaySheet';
    sheet.style.cssText = 'position:fixed;inset:0;z-index:9998;display:none;background:rgba(0,0,0,0.45);';
    sheet.innerHTML = `
      <div style="position:absolute;inset:auto 0 0 0;background:var(--bg,#fff);border-radius:20px 20px 0 0;max-height:90vh;display:flex;flex-direction:column;padding:18px;padding-bottom:max(18px,env(safe-area-inset-bottom));">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
          <span style="font-size:22px;">🎂</span>
          <strong style="font-size:17px;">이번 주·이번 달 생일</strong>
          <button onclick="closeBirthday()" style="margin-left:auto;background:rgba(0,0,0,0.05);border:none;width:32px;height:32px;border-radius:50%;font-size:16px;cursor:pointer;">✕</button>
        </div>
        <div id="bdBody" style="flex:1;overflow-y:auto;"></div>
      </div>
    `;
    document.body.appendChild(sheet);
    sheet.addEventListener('click', (e) => { if (e.target === sheet) closeBirthday(); });
    return sheet;
  }

  function _relativeLabel(rel) {
    if (rel === 0) return '오늘';
    if (rel === 1) return '내일';
    if (rel < 7) return `${rel}일 뒤`;
    return `${rel}일 뒤`;
  }

  function _fillTemplate(tmpl, name) {
    // {pct} 잔여 토큰은 빈 문자열로 치환 (쿠폰 기능 제거 2026-04-24)
    return tmpl.replace('{name}', name || '').replace('{pct}', '');
  }

  async function _copyMessage(name) {
    const tmpl = (_cached?.message_templates || [])[0] || '{name}님, 생신 축하드려요!';
    const msg = _fillTemplate(tmpl, name);
    try {
      await navigator.clipboard.writeText(msg);
      if (window.showToast) window.showToast('메시지 복사됨 — 카톡에 붙여넣으세요');
      if (window.hapticSuccess) window.hapticSuccess();
    } catch (e) {
      prompt('메시지 복사', msg);
    }
  }

  function _renderBody(d) {
    const items = d.items || [];
    const body = document.getElementById('bdBody');
    if (!items.length) {
      body.innerHTML = `
        <div style="padding:40px 20px;text-align:center;color:var(--text-subtle);">
          <div style="font-size:40px;margin-bottom:10px;">🎈</div>
          <div style="font-size:13px;line-height:1.5;">이번 2주 내 생일인 고객이 없어요.<br>고객 등록 시 생일(MM-DD)을 입력해 두면 자동 감지해요.</div>
        </div>
      `;
      return;
    }

    const tmplOptions = d.message_templates || [];
    body.innerHTML = `
      <div style="margin-bottom:14px;padding:12px;background:rgba(139,92,246,0.06);border-radius:12px;">
        <div style="font-size:11px;color:#6D28D9;font-weight:700;margin-bottom:6px;">축하 메시지 팁</div>
        <div style="font-size:11px;color:var(--text-muted);line-height:1.5;">템플릿을 복사해서 카카오톡으로 보내세요. 짧고 따뜻한 한마디면 충분해요.</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        ${items.map(c => `
          <div style="padding:12px;background:#fff;border-radius:12px;border:1px solid rgba(0,0,0,0.06);box-shadow:0 1px 3px rgba(0,0,0,0.04);">
            <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:4px;">
              <strong style="font-size:15px;">${_esc(c.name)}</strong>
              <span style="font-size:11px;color:#8B5CF6;font-weight:700;">${_esc(_relativeLabel(c.days_until))}</span>
              <span style="margin-left:auto;font-size:10px;color:var(--text-subtle);">${_esc(c.birthday)}</span>
            </div>
            <div style="font-size:11px;color:#888;margin-bottom:8px;">${c.phone ? _esc(c.phone) + ' · ' : ''}방문 ${c.visit_count}회</div>
            <div style="display:flex;gap:6px;">
              <button data-copy-msg="${_esc(c.name)}" style="flex:1;padding:9px;border:1px solid rgba(139,92,246,0.3);border-radius:8px;background:rgba(139,92,246,0.05);color:#6D28D9;cursor:pointer;font-weight:700;font-size:12px;">축하 메시지 복사</button>
            </div>
          </div>
        `).join('')}
      </div>
      <div style="margin-top:16px;padding:12px;background:#fafafa;border-radius:10px;font-size:10px;color:#888;line-height:1.6;">
        📌 알림톡 대행사 연동 후에는 <b>자동 발송</b> 가능. 그 전까지는 버튼 한 번 → 카톡 앱에 붙여넣기.
      </div>
    `;
    body.querySelectorAll('[data-copy-msg]').forEach(btn => btn.addEventListener('click', () => _copyMessage(btn.dataset.copyMsg)));
  }

  window.Birthday = {
    async render(containerId) {
      const container = document.getElementById(containerId);
      if (!container) return;
      const d = await _fetch(14);
      if (!d || !(d.items || []).length) return;
      _cached = d;
      container.innerHTML = _renderCard(d);
      container.querySelectorAll('[data-birthday-open]').forEach(el => {
        el.addEventListener('click', () => { if (window.hapticLight) window.hapticLight(); window.openBirthday(); });
      });
    },
  };

  window.openBirthday = async function () {
    _ensureSheet();
    document.getElementById('birthdaySheet').style.display = 'block';
    document.body.style.overflow = 'hidden';
    const body = document.getElementById('bdBody');
    body.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text-subtle);">불러오는 중…</div>';
    _cached = await _fetch(14);
    if (!_cached) {
      body.innerHTML = '<div style="padding:30px;text-align:center;color:#c00;">불러오기 실패</div>';
      return;
    }
    _renderBody(_cached);
  };

  window.closeBirthday = function () {
    const sheet = document.getElementById('birthdaySheet');
    if (sheet) sheet.style.display = 'none';
    document.body.style.overflow = '';
  };
})();
