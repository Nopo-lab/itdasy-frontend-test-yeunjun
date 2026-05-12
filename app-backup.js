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
  function _haptic() { try { window.hapticLight && window.hapticLight(); } catch (_e) { void _e; } }

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
          <i class="ph-duotone ph-arrow-left" aria-hidden="true"></i>
        </button>
        <div class="ss-title">백업 · 로그아웃</div>
      </header>
      <div class="ss-body">
        <div class="ss-card">
          <div class="ss-card-tt">데이터 내보내기</div>
          <div class="ss-card-sub">고객·예약·매출·재고·지출 전체를 한 번에 받으세요. PIPA·GDPR 준수 — 민감정보(토큰·비밀번호·결제)는 제외돼요.</div>
          <div class="ss-list-it" data-bk-export="full-zip" style="cursor:pointer">
            <div class="ic"><i class="ph-duotone ph-archive" aria-hidden="true"></i></div>
            <div class="meta">
              <div class="t1">전체 데이터 ZIP (CSV)</div>
              <div class="t2">고객·예약·매출·재고 · UTF-8 BOM (Excel 한글)</div>
            </div>
            <i class="ph-duotone ph-download-simple" aria-hidden="true"></i>
          </div>
          <div class="ss-list-it" data-bk-export="full-json" style="cursor:pointer">
            <div class="ic"><i class="ph-duotone ph-file-code" aria-hidden="true"></i></div>
            <div class="meta">
              <div class="t1">전체 데이터 JSON</div>
              <div class="t2">전체 구조·메타데이터 포함 · 다른 시스템 이관용</div>
            </div>
            <i class="ph-duotone ph-download-simple" aria-hidden="true"></i>
          </div>
          <div class="ss-list-it" data-bk-export="revenue" style="cursor:pointer">
            <div class="ic"><i class="ph-duotone ph-trend-up" aria-hidden="true"></i></div>
            <div class="meta">
              <div class="t1">매출 데이터만 CSV</div>
              <div class="t2">최근 12개월 매출 내역</div>
            </div>
            <i class="ph-duotone ph-download-simple" aria-hidden="true"></i>
          </div>
          <div class="ss-list-it" data-bk-export="customers" style="cursor:pointer">
            <div class="ic"><i class="ph-duotone ph-users" aria-hidden="true"></i></div>
            <div class="meta">
              <div class="t1">고객 데이터만 CSV</div>
              <div class="t2">고객 목록·메모·시술 이력</div>
            </div>
            <i class="ph-duotone ph-download-simple" aria-hidden="true"></i>
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
            style="color:var(--text-subtle);margin-top:8px;font-size:12px;">
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
    // [2026-05-12 QA #12] 전체 ZIP / JSON 은 백엔드 /data-export 엔드포인트 위임 (PIPA 호환).
    if (kind === 'full-zip' || kind === 'full-json') {
      const endpoint = kind === 'full-zip' ? '/data-export/csv' : '/data-export/json';
      const filename = (kind === 'full-zip' ? `itdasy_full_${_today()}.zip` : `itdasy_full_${_today()}.json`);
      _toast('전체 데이터 받아오는 중... 잠시 걸릴 수 있어요');
      try {
        const res = await fetch(_api() + endpoint, { headers: { ..._auth() } });
        if (!res.ok) {
          let detail = '';
          try { const j = await res.json(); detail = j.detail || ''; } catch (_e) { void _e; }
          _toast('내보내기 실패 — ' + (detail || ('HTTP ' + res.status)));
          return;
        }
        const blob = await res.blob();
        _downloadBlob(blob, filename);
        _toast('내보내기 완료 (' + filename + ')');
      } catch (e) {
        _toast('내보내기 실패 — ' + (e && e.message || ''));
      }
      return;
    }
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

  function _downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { try { document.body.removeChild(a); URL.revokeObjectURL(url); } catch (_e) { void _e; } }, 100);
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
    setTimeout(() => { try { document.body.removeChild(a); URL.revokeObjectURL(url); } catch (_e) { void _e; } }, 100);
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
