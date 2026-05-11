/* 가격표 사진 업로드 → ServiceTemplate 일괄 등록
   사용:
     window.openPricelistUpload()  — 모달 열기
   동작:
     사진 선택 → /services/import-pricelist → 결과 카드 표시
     사장님이 검토 후 "이대로 저장" or "수정 후 저장"
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
    let sheet = document.getElementById('pricelistSheet');
    if (sheet) return sheet;
    sheet = document.createElement('div');
    sheet.id = 'pricelistSheet';
    sheet.style.cssText = 'position:fixed;inset:0;z-index:9990;background:rgba(0,0,0,0.5);display:none;align-items:flex-end;justify-content:center;';
    sheet.innerHTML = `
      <div id="pricelistCard" style="width:100%;max-width:520px;background:#fff;border-radius:20px 20px 0 0;max-height:92vh;overflow-y:auto;padding:18px 18px max(18px,env(safe-area-inset-bottom));">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
          <strong style="font-size:17px;">가격표 사진으로 일괄 등록</strong>
          <button id="plClose" aria-label="닫기" style="margin-left:auto;background:none;border:none;font-size:22px;cursor:pointer;line-height:1;">×</button>
        </div>
        <div style="font-size:12px;color:#777;line-height:1.55;margin-bottom:14px;">
          샵 가격표 사진 한 장만 올려주세요. AI 가 시술명·가격을 인식해서 자동 등록해요.<br>
          이후 챗봇에 <span style="background:#FAF5FF;color:#5B21B6;padding:1px 6px;border-radius:6px;font-weight:600;">"강연준 다운펌, 디자인컷"</span> 만 적어도 합산 매출 등록 제안돼요.
        </div>

        <div id="plUploadArea" style="border:2px dashed #DDD6FE;border-radius:14px;padding:30px 16px;text-align:center;background:#FAF5FF;cursor:pointer;">
          <div style="font-size:34px;margin-bottom:6px;">📷</div>
          <div style="font-size:14px;font-weight:700;color:#5B21B6;margin-bottom:4px;">탭해서 사진 선택</div>
          <div style="font-size:11px;color:#888;">JPG · PNG · 6MB 이하</div>
          <input id="plFile" type="file" accept="image/*" style="display:none;">
        </div>

        <div id="plProgress" style="display:none;text-align:center;padding:30px 0;">
          <div class="pl-spin" style="display:inline-block;width:40px;height:40px;border:4px solid #DDD6FE;border-top-color:#7C3AED;border-radius:50%;animation:plspin 0.8s linear infinite;"></div>
          <div style="margin-top:12px;font-size:13px;color:#555;">AI 가 가격표 읽는 중… (5~15초)</div>
        </div>

        <div id="plResult" style="display:none;margin-top:14px;"></div>
      </div>
      <style>@keyframes plspin{to{transform:rotate(360deg)}}</style>
    `;
    document.body.appendChild(sheet);
    sheet.addEventListener('click', (e) => { if (e.target === sheet) close(); });
    sheet.querySelector('#plClose').addEventListener('click', close);

    const upArea = sheet.querySelector('#plUploadArea');
    const fileInp = sheet.querySelector('#plFile');
    upArea.addEventListener('click', () => fileInp.click());
    fileInp.addEventListener('change', (e) => {
      const f = e.target.files?.[0];
      e.target.value = '';
      if (!f) return;
      _upload(f);
    });
    return sheet;
  }

  function open() {
    const sheet = _ensureSheet();
    sheet.querySelector('#plUploadArea').style.display = 'block';
    sheet.querySelector('#plProgress').style.display = 'none';
    sheet.querySelector('#plResult').style.display = 'none';
    sheet.querySelector('#plResult').innerHTML = '';
    const card = sheet.querySelector('#pricelistCard') || sheet.firstElementChild;
    if (window.SheetAnim) window.SheetAnim.open(sheet, card);
    else sheet.style.display = 'flex';
  }
  function close() {
    const sheet = document.getElementById('pricelistSheet');
    if (!sheet) return;
    const card = sheet.querySelector('#pricelistCard') || sheet.firstElementChild;
    if (window.SheetAnim) window.SheetAnim.close(sheet, card);
    else sheet.style.display = 'none';
  }

  async function _upload(file) {
    const sheet = document.getElementById('pricelistSheet');
    if (!sheet) return;
    const upArea = sheet.querySelector('#plUploadArea');
    const progress = sheet.querySelector('#plProgress');
    const resultBox = sheet.querySelector('#plResult');
    upArea.style.display = 'none';
    progress.style.display = 'block';
    resultBox.style.display = 'none';

    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(window.API + '/services/import-pricelist', {
        method: 'POST',
        headers: window.authHeader(),
        body: fd,
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.detail || ('HTTP ' + res.status));

      const items = d.items || [];
      const inserted = d.inserted || 0;
      const updated = d.updated || 0;
      const skipped = (d.skipped_medical_ad || 0) + (d.skipped_other || 0);

      progress.style.display = 'none';
      resultBox.style.display = 'block';
      resultBox.innerHTML = `
        <div style="padding:14px;background:linear-gradient(135deg,#F0FDF4,#DCFCE7);border-radius:14px;margin-bottom:12px;">
          <div style="font-size:15px;font-weight:800;color:#166534;margin-bottom:4px;">${items.length}개 시술 등록 완료</div>
          <div style="font-size:12px;color:#16653480;">신규 ${inserted}개 · 업데이트 ${updated}개${skipped ? ` · 제외 ${skipped}개` : ''}</div>
        </div>
        <div style="font-size:12px;color:var(--text-muted);font-weight:600;margin-bottom:8px;">등록된 시술</div>
        <div style="max-height:280px;overflow-y:auto;border:1px solid #f0f0f0;border-radius:10px;">
          ${items.map(s => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-bottom:1px solid #f5f5f5;">
              <div>
                <div style="font-size:13px;font-weight:600;color:#333;">${_esc(s.name)}</div>
                <div style="font-size:10px;color:#888;margin-top:2px;">${_esc(s.category)} · ${s.default_duration_min || 60}분</div>
              </div>
              <div style="font-size:14px;font-weight:700;color:#7C3AED;">${_krw(s.default_price)}</div>
            </div>
          `).join('')}
        </div>
        <div style="display:flex;gap:8px;margin-top:14px;">
          <button id="plDone" style="flex:1;padding:14px;border:none;background:linear-gradient(135deg,#7C3AED,#A78BFA);color:#fff;border-radius:12px;font-weight:800;cursor:pointer;font-size:14px;">완료</button>
          <button id="plMore" style="flex:1;padding:14px;border:1px solid #ddd;background:#fff;color:#555;border-radius:12px;font-weight:700;cursor:pointer;font-size:14px;">사진 한 장 더</button>
        </div>
      `;
      try {
        sessionStorage.removeItem('pv_cache::service');
        window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'service_pricelist' } }));
      } catch (_e) { void _e; }
      resultBox.querySelector('#plDone').addEventListener('click', close);
      resultBox.querySelector('#plMore').addEventListener('click', () => {
        upArea.style.display = 'block';
        resultBox.style.display = 'none';
      });
      if (window.Fun && window.Fun.celebrate) {
        try { window.Fun.celebrate(`시술 ${items.length}개 등록`, { emojis: ['💅','✨','🌷','💖'], count: 12 }); } catch (_e) { void _e; }
      } else if (window.showToast) {
        window.showToast(`${items.length}개 시술 등록`);
      }
    } catch (e) {
      progress.style.display = 'none';
      upArea.style.display = 'block';
      resultBox.style.display = 'block';
      resultBox.innerHTML = `<div style="padding:14px;background:#FEF2F2;border:1px solid #FECACA;border-radius:12px;color:#991B1B;font-size:13px;line-height:1.5;">${_esc(e.message || '인식 실패')}<br><span style="font-size:11px;color:#991B1B80;">사진이 흐리거나 가격표가 아닌 것 같아요. 더 선명한 사진으로 다시 시도해 주세요.</span></div>`;
    }
  }

  window.openPricelistUpload = open;
  window.closePricelistUpload = close;
})();
