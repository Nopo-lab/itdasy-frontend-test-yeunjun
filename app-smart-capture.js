/* 스마트 캡처 임포트 — 카톡 캡처 + 명함 (E3 + E4 · 2026-04-30)
   사용:
     window.openSmartCapture()             — 모달 열기 (mode 선택)
     window.openSmartCapture('kakao')      — 카톡 캡처 모드 직접
     window.openSmartCapture('card')       — 명함 모드 직접
*/
(function () {
  'use strict';

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }
  function _krw(n) { return Number(n || 0).toLocaleString('ko-KR') + '원'; }

  function _ensureSheet() {
    let sheet = document.getElementById('smartCaptureSheet');
    if (sheet) return sheet;
    sheet = document.createElement('div');
    sheet.id = 'smartCaptureSheet';
    sheet.style.cssText = 'position:fixed;inset:0;z-index:9990;background:rgba(0,0,0,0.5);display:none;align-items:flex-end;justify-content:center;';
    const _ic = (id, size = 26) => `<svg width="${size}" height="${size}" aria-hidden="true"><use href="#${id}"/></svg>`;
    sheet.innerHTML = `
      <div id="scCard" style="width:100%;max-width:540px;background:#fff;border-radius:20px 20px 0 0;max-height:92vh;overflow-y:auto;padding:18px 18px max(18px,env(safe-area-inset-bottom));">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
          <span style="display:inline-flex;align-items:center;color:#7C3AED;">${_ic('ic-image-plus', 20)}</span>
          <strong id="scTitle" style="font-size:17px;">스마트 캡처</strong>
          <button id="scClose" aria-label="닫기" style="margin-left:auto;background:none;border:none;cursor:pointer;color:#888;display:inline-flex;align-items:center;">${_ic('ic-x', 18)}</button>
        </div>
        <div id="scModePick" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:14px;">
          <button data-mode="kakao" class="sc-mode-btn" style="padding:18px 8px;border:2px solid #FBBF24;border-radius:14px;background:linear-gradient(135deg,#FFFBEB,#FEF3C7);cursor:pointer;text-align:center;">
            <div style="color:#92400E;margin-bottom:8px;display:inline-flex;">${_ic('ic-message-square', 28)}</div>
            <div style="font-size:13px;font-weight:800;color:#92400E;">카톡 캡처</div>
            <div style="font-size:10px;color:#92400E80;margin-top:3px;">예약·매출·후기 자동 추출</div>
          </button>
          <button data-mode="card" class="sc-mode-btn" style="padding:18px 8px;border:2px solid #DDD6FE;border-radius:14px;background:linear-gradient(135deg,#FAF5FF,#F3E8FF);cursor:pointer;text-align:center;">
            <div style="color:#5B21B6;margin-bottom:8px;display:inline-flex;">${_ic('ic-credit-card', 28)}</div>
            <div style="font-size:13px;font-weight:800;color:#5B21B6;">명함</div>
            <div style="font-size:10px;color:#5B21B680;margin-top:3px;">사진 1장 → 고객 등록</div>
          </button>
          <button data-mode="inventory_order" class="sc-mode-btn" style="padding:18px 8px;border:2px solid #6EE7B7;border-radius:14px;background:linear-gradient(135deg,#ECFDF5,#D1FAE5);cursor:pointer;text-align:center;">
            <div style="color:#065F46;margin-bottom:8px;display:inline-flex;">${_ic('ic-dollar-sign', 28)}</div>
            <div style="font-size:13px;font-weight:800;color:#065F46;">가격표 OCR</div>
            <div style="font-size:10px;color:#065F4680;margin-top:3px;">발주서·영수증 자동 입력</div>
          </button>
        </div>
        <div id="scWorkArea" style="display:none;"></div>
      </div>
    `;
    document.body.appendChild(sheet);
    sheet.addEventListener('click', (e) => { if (e.target === sheet) close(); });
    sheet.querySelector('#scClose').addEventListener('click', close);
    sheet.querySelectorAll('.sc-mode-btn').forEach(b => {
      b.addEventListener('click', () => _setMode(b.dataset.mode));
    });
    return sheet;
  }

  let _mode = null;

  function open(initialMode) {
    const sheet = _ensureSheet();
    _mode = null;
    sheet.querySelector('#scModePick').style.display = 'grid';
    sheet.querySelector('#scWorkArea').style.display = 'none';
    sheet.querySelector('#scWorkArea').innerHTML = '';
    sheet.querySelector('#scTitle').textContent = '스마트 캡처';
    const card = sheet.querySelector('#scCard');
    if (window.SheetAnim) window.SheetAnim.open(sheet, card);
    else sheet.style.display = 'flex';
    if (initialMode) _setMode(initialMode);
  }
  function close() {
    const sheet = document.getElementById('smartCaptureSheet');
    if (!sheet) return;
    const card = sheet.querySelector('#scCard');
    if (window.SheetAnim) window.SheetAnim.close(sheet, card);
    else sheet.style.display = 'none';
  }

  function _setMode(mode) {
    // [QA #10] 가격표/영수증 OCR — app-receipt-scan.js 의 inventory_order 모드로 위임.
    if (mode === 'inventory_order') {
      close();
      try {
        const fn = window.openInventoryOrderScan;
        if (typeof fn === 'function') fn();
        else if (typeof window.openReceiptScan === 'function') window.openReceiptScan('inventory_order');
      } catch (_e) { /* ignore */ }
      return;
    }
    _mode = mode;
    const sheet = document.getElementById('smartCaptureSheet');
    if (!sheet) return;
    sheet.querySelector('#scModePick').style.display = 'none';
    sheet.querySelector('#scTitle').textContent = mode === 'kakao' ? '카톡 캡처 → 자동 등록' : '명함 → 고객 등록';
    const work = sheet.querySelector('#scWorkArea');
    work.style.display = 'block';
    const _ic = (id, size = 26) => `<svg width="${size}" height="${size}" aria-hidden="true"><use href="#${id}"/></svg>`;
    const isKakao = mode === 'kakao';
    work.innerHTML = `
      <div id="scUpload" style="border:2px dashed ${isKakao ? '#FBBF24' : '#DDD6FE'};border-radius:14px;padding:30px 16px;text-align:center;background:${isKakao ? '#FFFBEB' : '#FAF5FF'};cursor:pointer;transition:all 0.2s;">
        <div style="color:${isKakao ? '#92400E' : '#5B21B6'};margin-bottom:8px;display:inline-flex;">${_ic(isKakao ? 'ic-message-square' : 'ic-camera', 36)}</div>
        <div style="font-size:14px;font-weight:700;color:${isKakao ? '#92400E' : '#5B21B6'};margin-bottom:4px;">탭해서 사진 선택</div>
        <div style="font-size:11px;color:#888;">${isKakao ? '카카오톡 채팅 캡처' : '명함 정면 사진'}</div>
        <input id="scFile" type="file" accept="image/*" style="display:none;">
      </div>
      <div id="scProgress" style="display:none;text-align:center;padding:30px 0;">
        <div style="display:inline-block;width:36px;height:36px;border:4px solid #DDD6FE;border-top-color:#7C3AED;border-radius:50%;animation:plspin 0.8s linear infinite;"></div>
        <div style="margin-top:10px;font-size:13px;color:#555;">AI 가 인식 중… (5~12초)</div>
      </div>
      <div id="scResult" style="display:none;margin-top:14px;"></div>
    `;
    work.querySelector('#scUpload').addEventListener('click', () => work.querySelector('#scFile').click());
    work.querySelector('#scFile').addEventListener('change', (e) => {
      const f = e.target.files?.[0];
      e.target.value = '';
      if (!f) return;
      _upload(f);
    });
  }

  async function _upload(file) {
    const work = document.getElementById('scWorkArea');
    if (!work) return;
    const upArea = work.querySelector('#scUpload');
    const progress = work.querySelector('#scProgress');
    const resultBox = work.querySelector('#scResult');
    upArea.style.display = 'none';
    progress.style.display = 'block';
    resultBox.style.display = 'none';
    try {
      if (_mode === 'kakao') {
        await _uploadKakao(file, resultBox, progress);
      } else {
        await _uploadCard(file, resultBox, progress);
      }
    } catch (e) {
      progress.style.display = 'none';
      upArea.style.display = 'block';
      resultBox.style.display = 'block';
      resultBox.innerHTML = `<div style="padding:14px;background:#FEF2F2;border:1px solid #FECACA;border-radius:12px;color:#991B1B;font-size:13px;line-height:1.5;">${_esc(e.message || '인식 실패')}</div>`;
    }
  }

  async function _uploadKakao(file, resultBox, progress) {
    const fd = new FormData();
    fd.append('image', file);
    fd.append('kind', 'kakao_chat');
    const res = await fetch(window.API + '/imports/smart/image', {
      method: 'POST',
      headers: window.authHeader(),
      body: fd,
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.detail || ('HTTP ' + res.status));
    const items = (d.items || []);
    if (!items.length) {
      throw new Error('카톡에서 추출할 정보가 없어요. 다른 캡처를 시도해 주세요.');
    }
    progress.style.display = 'none';
    resultBox.style.display = 'block';
    const _ic2 = (id, size = 14) => `<svg width="${size}" height="${size}" aria-hidden="true"><use href="#${id}"/></svg>`;
    const typeIcon = { customer: 'ic-user', booking: 'ic-calendar', revenue: 'ic-dollar-sign', review: 'ic-star' };
    const typeLabel = { customer: '고객', booking: '예약', revenue: '매출', review: '후기' };
    const typeColor = { customer: '#1E40AF', booking: '#15803D', revenue: '#B45309', review: '#9D174D' };
    resultBox.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;padding:12px 14px;background:#F0FDF4;border-radius:12px;margin-bottom:12px;font-size:13px;font-weight:700;color:#166534;">
        <span style="display:inline-flex;align-items:center;">${_ic2('ic-check-circle', 16)}</span>
        ${items.length}건 인식 완료 (검토 후 등록)
      </div>
      <div id="scKakaoList" style="max-height:340px;overflow-y:auto;">
        ${items.map((it, idx) => `
          <label style="display:flex;align-items:flex-start;gap:8px;padding:10px;background:#FAFAFA;border-radius:10px;margin-bottom:6px;cursor:pointer;">
            <input type="checkbox" data-idx="${idx}" checked style="margin-top:2px;flex-shrink:0;">
            <div style="flex:1;font-size:12px;line-height:1.5;">
              <div style="display:inline-flex;align-items:center;gap:5px;font-weight:700;color:${typeColor[it.type] || '#5B21B6'};margin-bottom:3px;">
                ${_ic2(typeIcon[it.type] || 'ic-sparkles', 13)}
                <span>${typeLabel[it.type] || '?'}</span>
              </div>
              ${it.name ? `<div>이름: <strong>${_esc(it.name)}</strong></div>` : ''}
              ${it.phone ? `<div>전화: ${_esc(it.phone)}</div>` : ''}
              ${it.starts_at ? `<div>시간: ${_esc(it.starts_at)}</div>` : ''}
              ${it.service_name ? `<div>시술: ${_esc(it.service_name)}</div>` : ''}
              ${it.amount ? `<div>금액: <strong>${_krw(it.amount)}</strong></div>` : ''}
              ${it.rating ? `<div style="display:inline-flex;align-items:center;gap:2px;color:#F59E0B;">${'<i class=\"ph-duotone ph-star\" style=\"font-size:12px;\" aria-hidden=\"true\"></i>'.repeat(it.rating)}</div>` : ''}
              ${it.comment ? `<div style="color:#555;">${_esc(it.comment)}</div>` : ''}
              ${it.memo ? `<div style="color:#888;font-size:11px;">${_esc(it.memo)}</div>` : ''}
            </div>
          </label>
        `).join('')}
      </div>
      <button id="scKakaoCommit" style="width:100%;margin-top:14px;padding:14px;border:none;border-radius:12px;background:linear-gradient(135deg,#FEE500,#FACC15);color:#3F2C00;font-weight:800;font-size:14px;cursor:pointer;">선택한 항목 등록</button>
    `;
    resultBox.querySelector('#scKakaoCommit').addEventListener('click', async () => {
      const checked = Array.from(resultBox.querySelectorAll('input[data-idx]:checked')).map(c => parseInt(c.dataset.idx, 10));
      const selected = checked.map(i => items[i]).filter(Boolean);
      if (!selected.length) {
        if (window.showToast) window.showToast('등록할 항목 선택해 주세요');
        return;
      }
      try {
        const cm = await fetch(window.API + '/imports/smart/commit', {
          method: 'POST',
          headers: { ...window.authHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: 'kakao_chat', items: selected }),
        });
        const cd = await cm.json().catch(() => ({}));
        if (!cm.ok) throw new Error(cd.detail || ('HTTP ' + cm.status));
        if (window.showToast) window.showToast(`${cd.imported}건 등록 (실패 ${cd.failed}건)`);
        try {
          ['pv_cache::customer','pv_cache::booking','pv_cache::revenue','pv_cache::nps'].forEach(k => sessionStorage.removeItem(k));
          window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'kakao_import' } }));
        } catch (_e) { void _e; }
        close();
      } catch (e) {
        if (window.showToast) window.showToast('등록 실패: ' + e.message);
      }
    });
  }

  async function _uploadCard(file, resultBox, progress) {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(window.API + '/customers/import-business-card', {
      method: 'POST',
      headers: window.authHeader(),
      body: fd,
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.detail || ('HTTP ' + res.status));
    progress.style.display = 'none';
    resultBox.style.display = 'block';
    const c = d.candidate || {};
    if (d.duplicate) {
      resultBox.innerHTML = `
        <div style="padding:14px;background:#FEF3C7;border:1px solid #FDE68A;border-radius:12px;color:#92400E;font-size:13px;line-height:1.5;margin-bottom:12px;">
          같은 이름·전화 고객이 이미 있어요: <strong>${_esc(d.existing_name)}</strong> (${_esc(d.existing_phone || '전화 없음')})
        </div>
        <button id="scCardClose" style="width:100%;padding:13px;border:1px solid #ddd;background:#fff;color:#555;border-radius:12px;font-weight:700;cursor:pointer;">확인</button>
      `;
      resultBox.querySelector('#scCardClose').addEventListener('click', close);
      return;
    }
    resultBox.innerHTML = `
      <div style="padding:14px;background:#FAF5FF;border:1px solid #DDD6FE;border-radius:12px;margin-bottom:12px;">
        <div style="display:inline-flex;align-items:center;gap:6px;font-size:13px;color:#5B21B6;font-weight:700;margin-bottom:8px;"><i class="ph-duotone ph-sparkle" aria-hidden="true"></i>인식 결과 (검토 후 등록)</div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <label style="font-size:11px;color:var(--text-muted);">이름 <input id="scCardName" value="${_esc(c.name || '')}" style="width:100%;margin-top:3px;padding:9px;border:1px solid #ddd;border-radius:8px;font-size:13px;"></label>
          <label style="font-size:11px;color:var(--text-muted);">전화 <input id="scCardPhone" value="${_esc(c.phone || '')}" style="width:100%;margin-top:3px;padding:9px;border:1px solid #ddd;border-radius:8px;font-size:13px;"></label>
          <label style="font-size:11px;color:var(--text-muted);">메모 <textarea id="scCardMemo" rows="2" style="width:100%;margin-top:3px;padding:9px;border:1px solid #ddd;border-radius:8px;font-size:12px;resize:none;">${_esc(c.memo || '')}${c.company ? `\n회사: ${c.company}` : ''}${c.role ? `\n직책: ${c.role}` : ''}${c.email ? `\n이메일: ${c.email}` : ''}</textarea></label>
        </div>
        <div style="font-size:10px;color:#888;margin-top:6px;">신뢰도 ${Math.round((d.confidence || 0) * 100)}%</div>
      </div>
      <button id="scCardSave" style="width:100%;padding:14px;border:none;border-radius:12px;background:linear-gradient(135deg,#7C3AED,#A78BFA);color:#fff;font-weight:800;font-size:14px;cursor:pointer;">고객 등록</button>
    `;
    resultBox.querySelector('#scCardSave').addEventListener('click', async () => {
      const name = resultBox.querySelector('#scCardName').value.trim();
      const phone = resultBox.querySelector('#scCardPhone').value.trim();
      const memo = resultBox.querySelector('#scCardMemo').value.trim();
      if (!name) {
        if (window.showToast) window.showToast('이름은 필수예요');
        return;
      }
      try {
        const cr = await fetch(window.API + '/customers', {
          method: 'POST',
          headers: { ...window.authHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, phone: phone || null, memo: memo || null, tags: [] }),
        });
        if (!cr.ok) {
          const ed = await cr.json().catch(() => ({}));
          throw new Error(typeof ed.detail === 'string' ? ed.detail : ('HTTP ' + cr.status));
        }
        if (window.showToast) window.showToast('고객 등록 완료');
        try {
          sessionStorage.removeItem('pv_cache::customer');
          window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'card_import' } }));
        } catch (_e) { void _e; }
        close();
      } catch (e) {
        if (window.showToast) window.showToast('등록 실패: ' + e.message);
      }
    });
  }

  window.openSmartCapture = open;
  window.closeSmartCapture = close;
})();
