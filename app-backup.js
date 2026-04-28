/* ───────────────────────────────────────────────────────────
   app-backup.js — 데이터 백업 / 로그아웃 서브화면
   2026-04-28 신규.
   - 매출·고객 CSV 내보내기 (백엔드 데이터 fetch → blob download)
   - 계정 정보 표시 (이메일, 가입일)
   - 로그아웃 → 기존 window.logout() 호출
   ─────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const ID = 'backupScreen';

  function _api() { return window.API || ''; }
  function _auth() { try { return (window.authHeader && window.authHeader()) || {}; } catch (_) { return {}; } }
  function _toast(m) { if (window.showToast) window.showToast(m); }
  function _haptic() { try { window.hapticLight && window.hapticLight(); } catch (_) {} }

  function _ensureMounted() {
    let el = document.getElementById(ID);
    if (el) return el;
    el = document.createElement('div');
    el.id = ID;
    el.className = 'subscreen-overlay';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `
      <header class="ss-topbar">
        <button type="button" class="ss-back" data-bk-back aria-label="뒤로">
          <svg class="ic" aria-hidden="true"><use href="#ic-arrow-left"/></svg>
        </button>
        <div class="ss-title">백업 · 로그아웃</div>
      </header>
      <div class="ss-body">
        <div class="ss-card">
          <div class="ss-card-tt">데이터 내보내기</div>
          <div class="ss-card-sub">매출·고객 데이터를 CSV 로 받아서 백업하실 수 있어요. 안전을 위해 정기적으로 받아두시는 걸 권장해요.</div>
          <div class="ss-list-it" data-bk-export="revenue" style="cursor:pointer">
            <div class="ic"><svg><use href="#ic-trending-up"/></svg></div>
            <div class="meta">
              <div class="t1">매출 데이터 CSV</div>
              <div class="t2">최근 12개월 매출 내역</div>
            </div>
            <svg class="ic" aria-hidden="true" style="width:16px;height:16px;color:var(--text3,#999)"><use href="#ic-download"/></svg>
          </div>
          <div class="ss-list-it" data-bk-export="customers" style="cursor:pointer">
            <div class="ic"><svg><use href="#ic-users"/></svg></div>
            <div class="meta">
              <div class="t1">고객 데이터 CSV</div>
              <div class="t2">고객 목록·메모·시술 이력</div>
            </div>
            <svg class="ic" aria-hidden="true" style="width:16px;height:16px;color:var(--text3,#999)"><use href="#ic-download"/></svg>
          </div>
        </div>

        <div class="ss-card">
          <div class="ss-card-tt">계정 정보</div>
          <div class="ss-row"><span class="lbl">이메일</span>
            <span class="val" id="bkEmail">—</span></div>
          <div class="ss-row"><span class="lbl">가입일</span>
            <span class="val" id="bkSignedAt">—</span></div>
          <div class="ss-row"><span class="lbl">앱 버전</span>
            <span class="val" id="bkVersion">—</span></div>
        </div>

        <div class="ss-card">
          <div class="ss-card-tt">계정 관리</div>
          <button type="button" class="ss-cta-secondary" data-bk-logout
            style="color:#d32f2f;border-color:rgba(211,47,47,0.3);">
            로그아웃
          </button>
          <button type="button" class="ss-cta-secondary" data-bk-delete
            style="color:#999;margin-top:8px;font-size:12px;">
            계정 삭제 안내
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(el);

    el.addEventListener('click', async (e) => {
      if (e.target.closest('[data-bk-back]')) { closeBackupScreen(); return; }
      const exp = e.target.closest('[data-bk-export]');
      if (exp) { _exportCSV(exp.getAttribute('data-bk-export')); return; }
      if (e.target.closest('[data-bk-logout]')) {
        if (typeof window.logout === 'function') { closeBackupScreen(); window.logout(); }
        else _toast('로그아웃 함수를 찾지 못했어요');
        return;
      }
      if (e.target.closest('[data-bk-delete]')) {
        _toast('계정 삭제는 support@itdasy.com 으로 문의해주세요');
        return;
      }
    });
    return el;
  }

  function _hydrate() {
    const email = (window.__user && window.__user.email)
      || localStorage.getItem('itdasy_email')
      || (typeof window.getUserEmail === 'function' ? window.getUserEmail() : '')
      || '—';
    const joined = (window.__user && window.__user.created_at)
      || localStorage.getItem('itdasy_joined_at') || '—';
    const ver = (window.APP_VERSION) || (window.__app && window.__app.version) || '0.1.0';
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    set('bkEmail', email);
    set('bkSignedAt', joined);
    set('bkVersion', ver);
  }

  // ── CSV 내보내기 ─────────────────────────────────────
  async function _exportCSV(kind) {
    _haptic();
    _toast('데이터 받아오는 중...');
    try {
      let rows = [];
      let header = [];
      let filename = '';
      if (kind === 'revenue') {
        const j = await _fetchJSON('/revenue?period=year').catch(() => ({ items: [] }));
        rows = (j.items || []).map(r => [
          r.date || r.created_at || '',
          r.amount != null ? r.amount : 0,
          r.menu || r.service || '',
          r.channel || '',
          r.customer_name || '',
          r.memo || '',
        ]);
        header = ['날짜', '금액', '시술/메뉴', '채널', '고객', '메모'];
        filename = `itdasy_revenue_${_today()}.csv`;
      } else if (kind === 'customers') {
        const j = await _fetchJSON('/customers').catch(() => ({ items: [] }));
        rows = (j.items || []).map(r => [
          r.name || '', r.phone || '', r.email || '',
          r.last_visit || '', r.visit_count || 0, r.memo || '',
        ]);
        header = ['이름', '전화', '이메일', '최근방문', '방문횟수', '메모'];
        filename = `itdasy_customers_${_today()}.csv`;
      }
      if (rows.length === 0) {
        _toast('내보낼 데이터가 없어요');
        return;
      }
      _downloadCSV(filename, header, rows);
      _toast(rows.length + '건 내보냈어요');
    } catch (e) {
      console.warn('[backup] export error', e);
      _toast('내보내기 실패 — 잠시 후 다시 시도해주세요');
    }
  }

  async function _fetchJSON(path) {
    const res = await fetch(_api() + path, { headers: _auth() });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  function _today() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
  }

  function _downloadCSV(filename, header, rows) {
    const escape = (v) => {
      const s = (v == null ? '' : String(v)).replace(/"/g, '""');
      return /[",\n]/.test(s) ? '"' + s + '"' : s;
    };
    const lines = [header.map(escape).join(',')];
    for (const r of rows) lines.push(r.map(escape).join(','));
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { try { document.body.removeChild(a); URL.revokeObjectURL(url); } catch (_) {} }, 100);
  }

  function openBackupScreen() {
    const el = _ensureMounted();
    _hydrate();
    requestAnimationFrame(() => el.classList.add('is-open'));
    el.setAttribute('aria-hidden', 'false');
    _haptic();
  }
  function closeBackupScreen() {
    const el = document.getElementById(ID);
    if (!el) return;
    el.classList.remove('is-open');
    el.setAttribute('aria-hidden', 'true');
    _haptic();
  }

  window.openBackupScreen = openBackupScreen;
  window.closeBackupScreen = closeBackupScreen;
})();
