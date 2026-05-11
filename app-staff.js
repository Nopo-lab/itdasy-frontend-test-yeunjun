/* 직원 관리 — 미용실 / 대형샵 다중 직원 (W5 Premium 차별화)
   사용:
     window.StaffUI.open()  // 목록 + 추가/편집/삭제
     window.StaffUI.list()  // Promise<Staff[]> — 다른 모듈(예약 폼)에서 직원 선택 옵션
*/
(function () {
  'use strict';

  const API = window.API || '';
  let _cache = null;

  function _emptyStaff() { return { items: [], total: 0, plan_limit: 0, used: 0 }; }
  function _hasAuth() {
    try { return !!(window.authHeader && window.authHeader().Authorization); }
    catch (_e) { return false; }
  }

  function _fetch(method, path, body) {
    const headers = window.authHeader ? window.authHeader() : {};
    if (body) headers['Content-Type'] = 'application/json';
    return fetch(API + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    }).then(async (r) => {
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.detail || ('HTTP ' + r.status));
      return data;
    });
  }

  function _toast(msg, opts) {
    if (typeof window.showToast === 'function') window.showToast(msg, opts);
  }

  const COLORS = ['var(--brand)', '#0288D1', '#F59E0B', '#10B981', '#A78BFA', '#EC4899', '#6366F1', '#EF4444'];
  function _pickColor(idx) { return COLORS[idx % COLORS.length]; }

  async function list(force) {
    if (!_hasAuth()) return _emptyStaff();
    if (_cache && !force) return _cache;
    try {
      const r = await _fetch('GET', '/staff');
      _cache = r;
      // [2026-04-29] 다른 모듈(예약 list 색상 표시)이 동기 접근 가능하도록 글로벌 캐시
      window._staffCache = r;
      return r;
    } catch (e) {
      console.warn('[staff] list 실패:', e.message);
      return _emptyStaff();
    }
  }

  // 앱 진입 시 백그라운드 prefetch — 로그인 후 1회 호출. 예약 화면이 즉시 색상 표시 가능.
  if (typeof window !== 'undefined') {
    window.addEventListener('load', () => {
      setTimeout(() => { try { list(); } catch (_) { /* ignore */ } }, 800);
    });
  }

  function _ensureSheet() {
    let el = document.getElementById('staffSheet');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'staffSheet';
    el.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9000;align-items:flex-end;justify-content:center;';
    el.innerHTML = `
      <div style="background:var(--bg-1,#fff);width:100%;max-width:480px;border-radius:18px 18px 0 0;padding:18px 18px env(safe-area-inset-bottom,16px);max-height:88vh;overflow:auto;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
          <h3 style="font-size:17px;font-weight:700;margin:0;">👥 직원 관리</h3>
          <button id="stClose" style="background:none;border:none;font-size:24px;cursor:pointer;line-height:1;">×</button>
        </div>
        <div id="stPlan" style="font-size:12px;color:var(--text-2,#666);margin-bottom:10px;"></div>
        <div id="stList"></div>
        <div style="margin-top:14px;padding:14px;border:1px dashed var(--border,#e5e5e5);border-radius:12px;">
          <div style="font-weight:700;font-size:13px;margin-bottom:8px;">+ 새 직원</div>
          <input id="stName" type="text" placeholder="이름 (예: 김원장)" maxlength="50" style="width:100%;padding:10px;border:1px solid var(--border,#e5e5e5);border-radius:8px;font-size:14px;margin-bottom:6px;">
          <input id="stRole" type="text" placeholder="역할 (예: 스타일리스트)" maxlength="50" style="width:100%;padding:10px;border:1px solid var(--border,#e5e5e5);border-radius:8px;font-size:14px;margin-bottom:6px;">
          <input id="stPhone" type="tel" placeholder="전화번호 (선택)" maxlength="30" style="width:100%;padding:10px;border:1px solid var(--border,#e5e5e5);border-radius:8px;font-size:14px;margin-bottom:8px;">
          <div id="stColors" style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;"></div>
          <button id="stAdd" style="width:100%;padding:12px;background:linear-gradient(135deg,var(--brand),#FFA8B6);color:#fff;border:none;border-radius:10px;font-weight:700;font-size:14px;cursor:pointer;">추가</button>
        </div>
      </div>
    `;
    document.body.appendChild(el);
    el.addEventListener('click', (e) => {
      if (e.target === el || e.target.id === 'stClose') el.style.display = 'none';
    });
    return el;
  }

  function _renderColors(picked) {
    const wrap = document.getElementById('stColors');
    wrap.innerHTML = COLORS.map((c, i) => `
      <button data-color="${c}" style="width:28px;height:28px;border-radius:50%;background:${c};border:${picked === c ? '3px solid #000' : '1px solid #ccc'};cursor:pointer;" type="button"></button>
    `).join('');
    wrap.querySelectorAll('button').forEach(b => {
      b.addEventListener('click', () => {
        wrap.dataset.color = b.dataset.color;
        _renderColors(b.dataset.color);
      });
    });
    if (!picked && !wrap.dataset.color) wrap.dataset.color = COLORS[0];
  }

  async function open() {
    const sheet = _ensureSheet();
    sheet.style.display = 'flex';
    _renderColors();

    const data = await list(true);
    const items = data.items || [];
    const planTxt = `현재 플랜 한도: ${data.used || 0} / ${data.plan_limit || 0}명${(data.plan_limit || 0) === 0 ? ' · Pro/Premium 업그레이드 필요' : ''}`;
    document.getElementById('stPlan').textContent = planTxt;
    const listBox = document.getElementById('stList');
    if (!items.length) {
      listBox.innerHTML = `<div style="text-align:center;padding:24px 0;color:var(--text-2,#666);font-size:13px;">아직 등록된 직원이 없어요.</div>`;
    } else {
      listBox.innerHTML = items.map((s, i) => `
        <div data-id="${s.id}" style="padding:10px;border:1px solid var(--border,#e5e5e5);border-radius:10px;margin-bottom:8px;display:flex;align-items:center;gap:10px;">
          <span style="width:18px;height:18px;border-radius:50%;background:${s.color || _pickColor(i)};flex-shrink:0;"></span>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:14px;">${(s.name || '').replace(/[<>&"]/g,'')}</div>
            <div style="font-size:11px;color:var(--text-2,#666);">${(s.role || '').replace(/[<>&"]/g,'') || '—'}${s.phone ? ' · ' + s.phone.replace(/[<>&"]/g,'') : ''}</div>
          </div>
          <button class="st-del" data-id="${s.id}" style="background:none;border:1px solid #dc3545;color:#dc3545;padding:6px 10px;border-radius:8px;font-size:12px;cursor:pointer;">삭제</button>
        </div>
      `).join('');
      listBox.querySelectorAll('.st-del').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!confirm('이 직원을 삭제할까요? (예약 기록은 남아있어요)')) return;
          try {
            await _fetch('DELETE', '/staff/' + btn.dataset.id);
            _toast('직원 삭제 완료');
            _cache = null;
            open();
          } catch (e) {
            _toast('삭제 실패: ' + e.message, { error: true });
          }
        });
      });
    }

    const addBtn = document.getElementById('stAdd');
    addBtn.onclick = async () => {
      const name = document.getElementById('stName').value.trim();
      const role = document.getElementById('stRole').value.trim();
      const phone = document.getElementById('stPhone').value.trim();
      const color = document.getElementById('stColors').dataset.color || COLORS[0];
      if (!name) { _toast('이름을 입력해주세요', { error: true }); return; }
      try {
        await _fetch('POST', '/staff', { name, role: role || null, phone: phone || null, color });
        // [2026-04-29] 직원 등록 — 큰 축하 (Premium 사용 시작 마일스톤)
        if (window.Fun && window.Fun.celebrateBig) {
          window.Fun.celebrateBig(`${name}님 합류!`, '👥');
        } else {
          _toast(`${name}님 추가 완료`);
        }
        document.getElementById('stName').value = '';
        document.getElementById('stRole').value = '';
        document.getElementById('stPhone').value = '';
        _cache = null;
        open();
      } catch (e) {
        _toast('추가 실패: ' + e.message, { error: true });
      }
    };
  }

  window.StaffUI = { open, list };
})();
