/* ─────────────────────────────────────────────────────────────
   사진 EXIF → 고객 자동 매핑 (#2 · 2026-04-20)

   사진 촬영 시각(EXIF DateTimeOriginal)을 읽어 그날 예약 조회 →
   "이 사진의 주인공, 혹시 이 고객?" 자동 제안 팝오버.

   외부 라이브러리 없이 JPEG EXIF 수동 파싱 (TIFF Tag 0x9003).
   실패 시 파일 lastModified 폴백.

   공개 API:
   - PhotoMatch.readTakenAt(fileOrDataUrl) → Date | null
   - PhotoMatch.suggestCustomer(takenAt, opts)  → Promise<{id,name} | null>   사용자가 선택/거절
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  // ── EXIF 파싱 (JPEG APP1 / TIFF IFD) ──────────────────
  async function _readExifDate(file) {
    if (!file) return null;
    try {
      const buf = await file.arrayBuffer();
      const view = new DataView(buf);
      if (view.getUint16(0) !== 0xFFD8) return null;  // JPEG SOI
      let offset = 2;
      const len = view.byteLength;
      while (offset < len) {
        if (view.getUint16(offset) !== 0xFFE1) { // APP1 (Exif) 이 아니면 다음 마커로
          offset += 2 + (view.getUint16(offset + 2) || 0);
          continue;
        }
        // Exif 헤더: "Exif\0\0"
        if (view.getUint32(offset + 4) !== 0x45786966 || view.getUint16(offset + 8) !== 0) return null;
        const tiffStart = offset + 10;
        const little = view.getUint16(tiffStart) === 0x4949;
        const firstIFD = view.getUint32(tiffStart + 4, little);
        const ifd0 = tiffStart + firstIFD;
        const numEntries = view.getUint16(ifd0, little);

        // ExifIFD(0x8769) 포인터를 우선 찾고 그 안에서 DateTimeOriginal(0x9003) 탐색
        let exifSubIFD = 0;
        for (let i = 0; i < numEntries; i++) {
          const entry = ifd0 + 2 + i * 12;
          const tag = view.getUint16(entry, little);
          if (tag === 0x8769) exifSubIFD = tiffStart + view.getUint32(entry + 8, little);
        }
        const ifdToScan = exifSubIFD || ifd0;
        const cnt = view.getUint16(ifdToScan, little);
        for (let i = 0; i < cnt; i++) {
          const entry = ifdToScan + 2 + i * 12;
          const tag = view.getUint16(entry, little);
          if (tag !== 0x9003 && tag !== 0x0132 && tag !== 0x9004) continue; // DateTimeOriginal/DateTime/DateTimeDigitized
          const type = view.getUint16(entry + 2, little);
          if (type !== 2) continue;  // ASCII
          const count = view.getUint32(entry + 4, little);
          const valOffset = count > 4 ? tiffStart + view.getUint32(entry + 8, little) : entry + 8;
          let str = '';
          for (let j = 0; j < count - 1 && valOffset + j < len; j++) str += String.fromCharCode(view.getUint8(valOffset + j));
          // "YYYY:MM:DD HH:MM:SS"
          const m = str.match(/^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
          if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
        }
        return null;
      }
    } catch (_) {
      return null;
    }
    return null;
  }

  async function readTakenAt(fileOrBlob) {
    if (!fileOrBlob) return null;
    const exifDate = await _readExifDate(fileOrBlob);
    if (exifDate) return exifDate;
    if (fileOrBlob.lastModified) return new Date(fileOrBlob.lastModified);
    return null;
  }

  // ── 그날 예약 조회 + 매칭 제안 ─────────────────────────
  async function _apiGet(path) {
    if (!window.API || !window.authHeader) throw new Error('no-auth');
    const res = await fetch(window.API + path, { headers: window.authHeader() });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  }

  /**
   * takenAt 과 가장 가까운 시간의 예약(+ 고객)을 찾아서 사용자에게 제안.
   * opts.selectedId: 이미 선택된 고객(바꿀지 확인용)
   * 반환: 사용자가 확정하면 {id, name}, 거절/취소면 null
   */
  async function suggestCustomer(takenAt, opts) {
    opts = opts || {};
    if (!takenAt) return null;
    const t = takenAt.getTime();
    const dayStart = new Date(takenAt); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);

    let bookings = [];
    try {
      const d = await _apiGet(`/bookings?from=${dayStart.toISOString()}&to=${dayEnd.toISOString()}`);
      bookings = d.items || [];
    } catch (_) { return null; }
    if (!bookings.length) return null;

    // 예약 시작시간과 사진 촬영 시간의 절대차 최소
    const ranked = bookings
      .filter(b => b.customer_name || b.customer_id)
      .map(b => ({ b, diff: Math.abs(new Date(b.starts_at).getTime() - t) }))
      .sort((a, b) => a.diff - b.diff);
    if (!ranked.length) return null;

    const candidate = ranked[0];
    // 6시간 초과 차이면 신뢰도 낮음 — 제안 X
    if (candidate.diff > 6 * 3600 * 1000) return null;

    // 이미 같은 고객이면 재확인 필요 없음
    if (opts.selectedId && (candidate.b.customer_id === opts.selectedId)) return null;

    return await _askUser(candidate.b, takenAt);
  }

  function _formatTime(d) {
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }

  function _askUser(booking, takenAt) {
    return new Promise((resolve) => {
      const pop = document.createElement('div');
      pop.style.cssText = 'position:fixed;inset:0;z-index:10002;background:rgba(0,0,0,0.45);display:flex;align-items:flex-end;';
      pop.innerHTML = `
        <div style="width:100%;background:#fff;border-radius:20px 20px 0 0;padding:18px;padding-bottom:max(18px,env(safe-area-inset-bottom));box-shadow:0 -8px 30px rgba(0,0,0,0.15);">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
            <span style="font-size:22px;">🤔</span>
            <strong style="font-size:15px;">혹시 이 고객 맞나요?</strong>
          </div>
          <div style="padding:12px;background:linear-gradient(135deg,rgba(241,128,145,0.1),rgba(241,128,145,0.02));border-radius:12px;margin-bottom:12px;">
            <div style="font-size:11px;color:#888;margin-bottom:4px;">사진 촬영 ${_formatTime(takenAt)}</div>
            <div style="font-size:15px;font-weight:800;color:#222;">${String(booking.customer_name || '').replace(/</g, '&lt;') || '(이름 없음)'}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">
              ${_formatTime(new Date(booking.starts_at))}~${_formatTime(new Date(booking.ends_at))}
              ${booking.service_name ? '· ' + String(booking.service_name).replace(/</g, '&lt;') : ''}
            </div>
          </div>
          <div style="display:flex;gap:8px;">
            <button data-pm-no style="flex:1;padding:12px;border:1px solid #ddd;border-radius:10px;background:#fff;cursor:pointer;color:#555;font-weight:700;">아니요</button>
            <button data-pm-yes style="flex:2;padding:12px;border:none;border-radius:10px;background:linear-gradient(135deg,var(--brand),var(--brand-strong));color:#fff;cursor:pointer;font-weight:800;">네, 맞아요 ✓</button>
          </div>
        </div>
      `;
      document.body.appendChild(pop);
      const close = (val) => { pop.remove(); resolve(val); };
      pop.querySelector('[data-pm-yes]').addEventListener('click', () => {
        if (window.hapticLight) window.hapticLight();
        close({ id: booking.customer_id || null, name: booking.customer_name || null });
      });
      pop.querySelector('[data-pm-no]').addEventListener('click', () => close(null));
      pop.addEventListener('click', (e) => { if (e.target === pop) close(null); });
    });
  }

  window.PhotoMatch = { readTakenAt, suggestCustomer };
})();
