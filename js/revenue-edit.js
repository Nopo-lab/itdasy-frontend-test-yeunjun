/* 매출 한 건 인라인 편집 — [버그2]
   행 탭 → 그 행 바로 아래로 편집 패널이 펼쳐진다(팝업·화면이동 없음).
   금액 수정 + 결제수단 변경 + 삭제. 저장=BE PATCH /revenue/{id}, 삭제=DELETE /revenue/{id}
   (window.Revenue.update / window.Revenue.remove — 둘 다 window.apiFetch 인증 사용).
   성공 시 'itdasy:data-changed' 이벤트로 목록·합계 즉시 갱신(app-revenue.js 리스너가 SWR clear+재로드).
   app-revenue.js(1000줄+)에서 분리한 소형 모듈. */
(function () {
  'use strict';

  const METHODS = [
    { k: 'card', label: '카드' },
    { k: 'cash', label: '현금' },
    { k: 'transfer', label: '계좌' },
    { k: 'membership', label: '회원권' },
    { k: 'etc', label: '기타' },
  ];
  // bank_transfer 등 옛 값 정규화 — 하이라이트 매칭용
  function _norm(m) {
    const v = String(m || 'card');
    if (v === 'bank_transfer' || v === 'account') return 'transfer';
    if (v === 'membership_deduct') return 'membership';
    return v;
  }

  const STYLE_ID = 'rv-inline-edit-style';
  function _ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
      .rv-inline-edit{background:var(--surface-2,#F7F8FA);border-radius:14px;padding:14px;margin:2px 0 10px;animation:rvieIn .18s ease}
      @keyframes rvieIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
      .rv-inline-edit .rie-row{display:flex;align-items:center;gap:8px;margin-bottom:12px}
      .rv-inline-edit .rie-l{font-size:13px;font-weight:600;color:var(--text-subtle,#6B7684);width:44px;flex-shrink:0}
      .rv-inline-edit .rie-amt{flex:1;min-width:0;height:42px;padding:0 12px;border:1px solid var(--border,#E5E8EB);border-radius:10px;background:var(--surface,#fff);font-size:16px;font-weight:700;color:var(--text,#191F28);text-align:right;font-family:inherit;outline:none}
      .rv-inline-edit .rie-amt:focus{border-color:var(--brand,#D58A95)}
      .rv-inline-edit .rie-won{font-size:14px;color:var(--text-subtle,#6B7684);flex-shrink:0}
      .rv-inline-edit .rie-methods{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px}
      .rv-inline-edit .rie-m{padding:8px 14px;border:1px solid var(--border,#E5E8EB);border-radius:999px;background:var(--surface,#fff);color:var(--text-subtle,#6B7684);font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;transition:all .12s}
      .rv-inline-edit .rie-m.on{border-color:var(--brand-strong,#BC6675);background:var(--brand-bg,#F7EFF0);color:var(--brand-strong,#BC6675)}
      .rv-inline-edit .rie-actions{display:flex;gap:8px}
      .rv-inline-edit .rie-del{flex:0 0 auto;padding:12px 18px;border:1px solid #EF4444;border-radius:11px;background:var(--surface,#fff);color:#EF4444;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit}
      .rv-inline-edit .rie-save{flex:1;padding:12px;border:none;border-radius:11px;background:var(--brand-strong,#BC6675);color:#fff;font-size:14px;font-weight:800;cursor:pointer;font-family:inherit}
      .rv-inline-edit .rie-save:disabled,.rv-inline-edit .rie-del:disabled,.rv-inline-edit .rie-refund:disabled{opacity:.55;cursor:default}
      .rv-inline-edit .rie-refund{flex:0 0 auto;padding:12px 16px;border:1px solid var(--border,#E5E8EB);border-radius:11px;background:var(--surface,#fff);color:var(--text-subtle,#6B7684);font-size:14px;font-weight:700;cursor:pointer;font-family:inherit}
      .rv-inline-edit .rie-note{font-size:12px;color:var(--text-subtle,#6B7684);line-height:1.5;margin:-4px 0 12px}
      .rv-inline-edit .rie-note b{color:var(--text,#191F28);font-weight:700}`;
    document.head.appendChild(s);
  }

  function closeAll() {
    document.querySelectorAll('.rv-inline-edit').forEach(el => el.remove());
    document.querySelectorAll('[data-rv-editing]').forEach(el => el.removeAttribute('data-rv-editing'));
  }

  function _emitChanged(kind) {
    try { window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind } })); } catch (_e) { void _e; }
  }

  // rowEl: 클릭된 행 요소 · item: {id, amount, method, ...}
  function toggle(rowEl, item) {
    if (!rowEl || !item || item.id == null) return;
    _ensureStyles();
    // 같은 행 재클릭 → 토글 닫기
    const next = rowEl.nextElementSibling;
    if (next && next.classList.contains('rv-inline-edit') && next.dataset.for === String(item.id)) {
      closeAll();
      return;
    }
    closeAll();
    rowEl.setAttribute('data-rv-editing', '1');

    const R = window.Revenue || {};
    const TAG = R.TAG_LABEL || {};
    let method = _norm(item.method);

    const panel = document.createElement('div');
    panel.className = 'rv-inline-edit';
    panel.dataset.for = String(item.id);
    panel.innerHTML = `
      <div class="rie-row">
        <span class="rie-l">금액</span>
        <input type="number" inputmode="numeric" class="rie-amt" value="${Number(item.amount) || 0}" min="0" step="1000" aria-label="금액" />
        <span class="rie-won">원</span>
      </div>
      <div class="rie-methods">
        ${METHODS.map(m => `<button type="button" class="rie-m${m.k === method ? ' on' : ''}" data-m="${m.k}">${TAG[m.k] || m.label}</button>`).join('')}
      </div>
      <div class="rie-note" data-rie-note hidden></div>
      <div class="rie-actions">
        <button type="button" class="rie-del">삭제</button>
        <button type="button" class="rie-refund" data-rie-refund hidden>환불</button>
        <button type="button" class="rie-save">저장</button>
      </div>`;
    rowEl.insertAdjacentElement('afterend', panel);

    const amtInput = panel.querySelector('.rie-amt');
    const saveBtn = panel.querySelector('.rie-save');
    const delBtn = panel.querySelector('.rie-del');
    const refundBtn = panel.querySelector('[data-rie-refund]');
    const noteEl = panel.querySelector('[data-rie-note]');
    let busy = false; // 저장/삭제/환불 연타 방어

    // [매출감사 2026-08-04] 환불 — 삭제와 다르다.
    //   삭제 = 잘못 입력한 걸 없앤다. 그날 받았다는 사실까지 사라진다.
    //   환불 = 실제로 돈을 돌려줬다. 원매출과 환불이 **둘 다** 장부에 남는다.
    //   원장님이 손님에게 돈을 돌려줬는데 삭제를 누르면 그 기록이 없어진다.
    const isRefundRow = Number(item.amount) < 0 || item.refund_of_id != null;
    if (isRefundRow) {
      // 환불 기록 자체는 편집 대상이 아니다(서버도 400 으로 막는다).
      amtInput.disabled = true;
      saveBtn.disabled = true;
      panel.querySelectorAll('.rie-m').forEach(b => { b.disabled = true; });
      noteEl.hidden = false;
      noteEl.innerHTML = '이건 <b>환불 기록</b>이에요. 금액은 바꿀 수 없어요.';
    } else {
      refundBtn.hidden = false;
      // 이미 일부 환불된 매출이면 남은 금액을 먼저 알려준다 — 눌러보고 실패하는 것보다 낫다.
      (async () => {
        try {
          const r = await window.apiFetch('/revenue/' + item.id + '/refunds');
          if (!r.ok) return;
          const d = await r.json();
          if (d.refunded_total > 0) {
            noteEl.hidden = false;
            noteEl.innerHTML = '이미 <b>' + Number(d.refunded_total).toLocaleString('ko-KR')
              + '원</b> 환불했어요. 남은 환불 가능액 <b>'
              + Number(d.refundable).toLocaleString('ko-KR') + '원</b>';
          }
          if (d.refundable <= 0) { refundBtn.disabled = true; refundBtn.textContent = '환불 완료'; }
        } catch (_e) { void _e; }
      })();
    }

    panel.querySelectorAll('.rie-m').forEach(b => b.addEventListener('click', () => {
      method = b.dataset.m;
      panel.querySelectorAll('.rie-m').forEach(x => x.classList.toggle('on', x === b));
    }));

    saveBtn.addEventListener('click', async () => {
      if (busy) return;
      const amount = Math.round(+amtInput.value || 0);
      if (!(amount > 0)) { if (window.showToast) window.showToast('금액을 확인해 주세요'); return; }
      busy = true; saveBtn.disabled = true; delBtn.disabled = true; saveBtn.textContent = '저장 중…';
      try {
        await R.update(item.id, { amount, method });
        if (window.showToast) window.showToast('수정됐어요', 'success');
        closeAll();
        _emitChanged('update_revenue');
      } catch (e) {
        busy = false; saveBtn.disabled = false; delBtn.disabled = false; saveBtn.textContent = '저장';
        if (window.showToast) window.showToast('수정 실패: ' + (e && e.message ? e.message : ''));
      }
    });

    delBtn.addEventListener('click', () => {
      if (busy) return;
      const doDelete = async () => {
        if (busy) return;
        busy = true; delBtn.disabled = true; saveBtn.disabled = true; delBtn.textContent = '삭제 중…';
        try {
          await R.remove(item.id);
          if (window.showToast) window.showToast('삭제됐어요', 'success');
          closeAll();
          _emitChanged('delete_revenue');
        } catch (e) {
          busy = false; delBtn.disabled = false; saveBtn.disabled = false; delBtn.textContent = '삭제';
          if (window.showToast) window.showToast('삭제 실패: ' + (e && e.message ? e.message : ''));
        }
      };
      if (typeof window._inlineConfirm === 'function') window._inlineConfirm('이 매출을 삭제할까요?', doDelete);
      else doDelete();
    });

    refundBtn.addEventListener('click', () => {
      if (busy) return;
      const full = Math.round(Number(item.amount) || 0);
      const doRefund = async () => {
        if (busy) return;
        busy = true;
        refundBtn.disabled = true; saveBtn.disabled = true; delBtn.disabled = true;
        refundBtn.textContent = '환불 중…';
        try {
          // 멱등키 — 타임아웃으로 끊겨 원장님이 다시 눌러도 두 번 환불되지 않는다.
          const txn = 'refund-' + item.id + '-' + Date.now() + '-'
                    + Math.random().toString(36).slice(2, 8);
          const res = await window.apiFetch('/revenue/' + item.id + '/refund', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_txn_id: txn }),
          });
          if (!res.ok) {
            let msg = '';
            try { msg = (await res.json()).detail || ''; } catch (_e) { void _e; }
            throw new Error(msg || ('HTTP ' + res.status));
          }
          if (window.showToast) window.showToast('환불로 기록했어요', 'success');
          closeAll();
          _emitChanged('refund_revenue');
        } catch (e) {
          busy = false;
          refundBtn.disabled = false; saveBtn.disabled = false; delBtn.disabled = false;
          refundBtn.textContent = '환불';
          if (window.showToast) window.showToast(e && e.message ? e.message : '환불 실패');
        }
      };
      const msg = full > 0
        ? full.toLocaleString('ko-KR') + '원을 환불로 기록할까요?\n원래 매출은 그대로 남아요.'
        : '환불로 기록할까요?';
      if (typeof window._inlineConfirm === 'function') window._inlineConfirm(msg, doRefund);
      else doRefund();
    });

    try { panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (_e) { void _e; }
  }

  window.RevenueEdit = { toggle, closeAll };
})();
