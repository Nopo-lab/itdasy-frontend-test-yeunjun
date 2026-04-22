/**
 * 데이터 포터빌리티 (GDPR Art. 20 / CCPA / PIPA 제35조)
 *
 * 기능:
 *  - /data-export/summary 로 건수 미리보기
 *  - /data-export/json 또는 /data-export/csv 다운로드
 *  - 인증 토큰을 fetch + Blob 으로 받아 다운로드 트리거
 */
(function () {
  function _base() {
    return (typeof API_BASE !== 'undefined') ? API_BASE : '';
  }
  function _token() {
    return (typeof getToken === 'function') ? getToken() : localStorage.getItem('itdasy_token::staging');
  }

  function _ensureModal() {
    if (document.getElementById('dataExportModal')) return;
    const html = `
      <div id="dataExportModal" style="display:none;position:fixed;inset:0;z-index:9850;background:rgba(0,0,0,0.55);align-items:center;justify-content:center;padding:20px;">
        <div style="background:#fff;border-radius:16px;max-width:460px;width:100%;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.25);">
          <div style="padding:18px 20px 12px;background:linear-gradient(135deg,#ecfdf5,#d1fae5);border-bottom:1px solid #a7f3d0;">
            <div style="font-size:18px;font-weight:800;color:#065f46;letter-spacing:-0.3px;">📦 내 데이터 내보내기</div>
            <div style="font-size:12px;color:#064e3b;margin-top:4px;line-height:1.55;">GDPR Art. 20 / CCPA / PIPA — 내가 입력한 모든 데이터를 기계 판독 가능 형식으로 다운로드합니다.</div>
          </div>
          <div style="padding:16px 20px;">
            <div id="__dx_summary" style="background:#f7f7f9;padding:12px 14px;border-radius:10px;font-size:12.5px;line-height:1.8;color:#333;margin-bottom:14px;min-height:80px;">
              <span style="color:#888;">집계 중...</span>
            </div>
            <div style="font-size:12px;color:#666;line-height:1.6;margin-bottom:10px;">
              포함: 회원·샵·고객·예약·매출·재고·NPS·포트폴리오·동의 기록·결제 내역.<br>
              제외: 비밀번호·토큰·제3자(Apple/Google/Meta) 보유 데이터.
            </div>
            <div id="__dx_error" style="display:none;margin-top:8px;font-size:12px;color:#b00020;"></div>
          </div>
          <div style="display:flex;gap:8px;padding:0 20px 20px;flex-wrap:wrap;">
            <button type="button" onclick="closeDataExport()" style="flex:1;min-width:100px;padding:12px;border-radius:10px;border:1px solid #ddd;background:#fff;color:#555;font-size:13px;font-weight:600;cursor:pointer;">취소</button>
            <button type="button" id="__dx_csv" style="flex:1;min-width:120px;padding:12px;border-radius:10px;border:none;background:linear-gradient(135deg,#10b981,#059669);color:#fff;font-size:13px;font-weight:700;cursor:pointer;">⬇ CSV(zip)</button>
            <button type="button" id="__dx_json" style="flex:1;min-width:120px;padding:12px;border-radius:10px;border:none;background:linear-gradient(135deg,#3b82f6,#2563eb);color:#fff;font-size:13px;font-weight:700;cursor:pointer;">⬇ JSON</button>
          </div>
        </div>
      </div>`;
    const wrap = document.createElement('div');
    wrap.innerHTML = html;
    document.body.appendChild(wrap.firstElementChild);

    document.getElementById('__dx_csv').addEventListener('click', () => _download('csv'));
    document.getElementById('__dx_json').addEventListener('click', () => _download('json'));
  }

  async function _loadSummary() {
    const box = document.getElementById('__dx_summary');
    try {
      const res = await fetch(`${_base()}/data-export/summary`, {
        headers: { 'Authorization': `Bearer ${_token()}` },
      });
      if (!res.ok) throw new Error(`(${res.status})`);
      const data = await res.json();
      box.innerHTML = `
        • 고객: <strong>${data.customers || 0}</strong>명<br>
        • 예약: <strong>${data.bookings || 0}</strong>건<br>
        • 매출: <strong>${data.revenue_records || 0}</strong>건<br>
        • 재고: <strong>${data.inventory || 0}</strong>항목<br>
        • NPS: <strong>${data.nps_records || 0}</strong>건<br>
        • 포트폴리오: <strong>${data.portfolio || 0}</strong>장<br>
        • 과거 게시글: <strong>${data.past_posts || 0}</strong>건
      `;
    } catch (e) {
      box.innerHTML = `<span style="color:#b00020;">집계 실패 — 네트워크를 확인해 주세요.</span>`;
    }
  }

  async function _download(fmt) {
    const err = document.getElementById('__dx_error');
    err.style.display = 'none';
    const btns = ['__dx_csv','__dx_json'].map(id => document.getElementById(id));
    btns.forEach(b => { if (b) b.disabled = true; });
    try {
      const res = await fetch(`${_base()}/data-export/${fmt}`, {
        headers: { 'Authorization': `Bearer ${_token()}` },
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || `다운로드 실패 (${res.status})`);
      }
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') || '';
      const match = cd.match(/filename="?([^";]+)"?/);
      const filename = (match && match[1]) || (`itdasy_export.${fmt === 'csv' ? 'zip' : 'json'}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
      closeDataExport();
    } catch (e) {
      err.textContent = e.message || '다운로드 중 오류';
      err.style.display = 'block';
    } finally {
      btns.forEach(b => { if (b) b.disabled = false; });
    }
  }

  window.openDataExport = function () {
    _ensureModal();
    document.getElementById('dataExportModal').style.display = 'flex';
    const err = document.getElementById('__dx_error'); if (err) err.style.display = 'none';
    _loadSummary();
  };
  window.closeDataExport = function () {
    const m = document.getElementById('dataExportModal');
    if (m) m.style.display = 'none';
  };
})();
