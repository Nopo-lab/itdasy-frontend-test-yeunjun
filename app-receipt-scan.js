/* Phase 8 B1 — 영수증 / 쿠팡·네이버 주문내역 OCR 스캔 */
(function () {
  'use strict';

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
  }

  // Wave B8 — 업로드 전 이미지 리사이즈/압축 (모바일 업로드 속도·비용 절감)
  async function compressImageForUpload(file, maxEdge = 1024, quality = 0.85) {
    try {
      if (!file || !file.type || !file.type.startsWith('image/')) return file;
      // HEIC/HEIF 등 브라우저에서 디코딩 불가한 포맷은 원본 반환
      if (/heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name || '')) return file;
      // 500KB 미만은 압축 이득이 적어 스킵
      if (file.size && file.size < 500 * 1024) return file;

      const url = URL.createObjectURL(file);
      const img = await new Promise((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = () => reject(new Error('decode_failed'));
        im.src = url;
      }).catch(() => null);
      URL.revokeObjectURL(url);
      if (!img) return file;

      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (!w || !h) return file;
      const longest = Math.max(w, h);
      const scale = longest > maxEdge ? maxEdge / longest : 1;
      const tw = Math.round(w * scale);
      const th = Math.round(h * scale);

      const canvas = document.createElement('canvas');
      canvas.width = tw;
      canvas.height = th;
      const ctx = canvas.getContext('2d');
      if (!ctx) return file;
      ctx.drawImage(img, 0, 0, tw, th);

      const blob = await new Promise((resolve) => {
        try { canvas.toBlob((b) => resolve(b), 'image/jpeg', quality); }
        catch (_e) { resolve(null); }
      });
      if (!blob) return file;
      // 원본보다 크면 의미 없음 → 원본 사용
      if (blob.size >= file.size) return file;

      const baseName = (file.name || 'upload').replace(/\.[^.]+$/, '') + '.jpg';
      try {
        return new File([blob], baseName, { type: 'image/jpeg', lastModified: Date.now() });
      } catch (_e) {
        // 일부 iOS Safari 구버전: File 생성자 미지원 → Blob 에 name 유사 속성 부여
        blob.name = baseName;
        return blob;
      }
    } catch (_e) {
      return file;
    }
  }
  window.compressImageForUpload = compressImageForUpload;

  // [QA #7] kind 별 "금액 필수" 필드 — 0/null 이면 빨간 테두리 + commit disabled.
  // 백엔드 assistant.py:3674 hard-fail(amount=0 reject) 우회: 프론트에서 사용자 입력 강제.
  const KIND_META = {
    expense: {
      title: '💳 영수증 스캔',
      subtitle: '카페·마트·재료비 영수증을 찍으면 AI가 자동으로 금액·품목 추출',
      fields: ['amount', 'vendor', 'category', 'recorded_at', 'memo'],
      labels: { amount: '금액', vendor: '상호', category: '분류', recorded_at: '결제일', memo: '메모' },
      placeholders: { amount: '50000', vendor: '다이소', category: '재료', recorded_at: '2026-04-23', memo: '젤네일 베이스 3개' },
      requiredNumeric: ['amount'],
    },
    inventory_order: {
      title: '가격표·주문내역 스캔',
      subtitle: '가격표·쿠팡·네이버 주문내역 사진 → AI 가 품목/수량 파싱 → 재고 자동 입고',
      fields: ['item_name', 'quantity', 'unit_price', 'total', 'ordered_at'],
      labels: { item_name: '품목', quantity: '수량', unit_price: '단가', total: '합계', ordered_at: '주문일' },
      placeholders: { item_name: '젤네일 베이스', quantity: '3', unit_price: '12000', total: '36000', ordered_at: '2026-04-23' },
      // unit_price 또는 total 중 하나는 0보다 커야 — 백엔드 hard-fail 방어
      requiredNumericAny: ['unit_price', 'total'],
    },
  };

  function _toInt(v) {
    if (v == null) return 0;
    const n = parseInt(String(v).replace(/[^\d-]/g, ''), 10);
    return Number.isFinite(n) ? n : 0;
  }
  function _itemValid(item, meta) {
    if (Array.isArray(meta.requiredNumeric)) {
      for (const f of meta.requiredNumeric) {
        if (_toInt(item[f]) <= 0) return false;
      }
    }
    if (Array.isArray(meta.requiredNumericAny)) {
      const anyOk = meta.requiredNumericAny.some(f => _toInt(item[f]) > 0);
      if (!anyOk) return false;
    }
    return true;
  }

  async function _uploadImage(file, kind) {
    const compressed = await compressImageForUpload(file);
    const fd = new FormData();
    fd.append('image', compressed);
    fd.append('kind', kind);
    const res = await fetch(window.API + '/imports/smart/image', {
      method: 'POST',
      headers: { Authorization: window.authHeader().Authorization },
      body: fd,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'HTTP ' + res.status);
    }
    return await res.json();
  }

  // Wave C3 — Tesseract.js 실시간 OCR 프리뷰 (체감 대기 시간 단축)
  // - Gemini 호출과 병렬로 로컬 Tesseract 실행 → 2초 안에 러프 텍스트 보여줌
  // - 최종 결과는 항상 Gemini (서버) 응답 사용. Tesseract 는 순수 프리뷰용
  // - iOS Safari 16+ 지원. 구버전 / 실패 시 조용히 skip
  // - 첫 사용 시 korean traineddata ~15MB 다운로드 → 브라우저 캐시. 두 번째부터는 빠름
  const TESSERACT_CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
  let _tesseractLoading = null;

  function _loadTesseract() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (_tesseractLoading) return _tesseractLoading;
    _tesseractLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = TESSERACT_CDN;
      s.async = true;
      s.onload = () => resolve(window.Tesseract || null);
      s.onerror = () => reject(new Error('tesseract_load_failed'));
      document.head.appendChild(s);
    }).catch(() => null);
    return _tesseractLoading;
  }

  // 2초 내에 결과 안 나오면 조용히 포기 (Gemini 가 먼저 돌아오는 경우가 많음)
  async function _runTesseractPreview(fileOrBlob, onText) {
    let worker = null;
    try {
      const Tesseract = await _loadTesseract();
      if (!Tesseract || !Tesseract.createWorker) return;
      // Tesseract v5 createWorker 는 언어를 인자로 받음
      worker = await Tesseract.createWorker('kor+eng');
      const { data } = await worker.recognize(fileOrBlob);
      const text = (data && data.text ? String(data.text) : '').trim();
      if (text && typeof onText === 'function') onText(text);
    } catch (_e) {
      // 조용히 skip — 업로드 흐름 방해 금지
    } finally {
      if (worker) {
        try { await worker.terminate(); } catch (_e) { /* ignore */ }
      }
    }
  }

  function _renderTesseractPreview(body, text) {
    // Gemini 가 이미 돌아와서 프리뷰 자리가 다른 UI 로 교체됐으면 skip
    const holder = body.querySelector('.rs-tess-preview');
    if (!holder) return;
    // 긴 공백·개행 정리, 너무 길면 자르기
    const cleaned = text.replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim().slice(0, 400);
    holder.innerHTML = `
      <div style="margin-top:16px;padding:12px 14px;background:#f4f4f6;border:1px dashed #ccc;border-radius:12px;text-align:left;">
        <div style="font-size:11px;color:#888;margin-bottom:6px;font-weight:700;">미리보기 — AI 가 더 정확하게 정리 중...</div>
        <div style="font-size:12px;color:var(--text-muted);font-style:italic;white-space:pre-wrap;line-height:1.5;max-height:180px;overflow:auto;">${_esc(cleaned)}</div>
      </div>`;
  }

  async function _commit(kind, items) {
    const res = await fetch(window.API + '/imports/smart/commit', {
      method: 'POST',
      headers: { ...window.authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, items }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'HTTP ' + res.status);
    }
    return await res.json();
  }

  function _buildItemHtml(it, idx, fields, labels, placeholders, meta) {
    const reqSet = new Set([
      ...(meta.requiredNumeric || []),
      ...(meta.requiredNumericAny || []),
    ]);
    const itemBad = !_itemValid(it, meta);
    const reqAnyUnmet = Array.isArray(meta.requiredNumericAny)
      && !meta.requiredNumericAny.some(f => _toInt(it[f]) > 0);
    return `
      <div class="rs-item" data-idx="${idx}" style="background:#fff;border:1px solid ${itemBad ? '#fca5a5' : '#eee'};border-radius:12px;padding:12px;margin-bottom:10px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <input type="checkbox" class="rs-ck" data-idx="${idx}" checked style="width:18px;height:18px;flex-shrink:0;">
          <strong style="font-size:12px;color:#888;">#${idx + 1}</strong>
          ${itemBad ? `<span class="rs-warn" style="font-size:11px;color:#dc2626;font-weight:700;">금액 확인 필요</span>` : ''}
          <button class="rs-del" data-idx="${idx}" style="margin-left:auto;background:transparent;border:none;color:var(--text-subtle);cursor:pointer;font-size:13px;">✕</button>
        </div>
        ${fields.map(f => {
          const isReq = reqSet.has(f);
          const numericBad = isReq && _toInt(it[f]) <= 0
            && (
              (meta.requiredNumeric || []).includes(f)
              || ((meta.requiredNumericAny || []).includes(f) && reqAnyUnmet)
            );
          const borderColor = numericBad ? '#fca5a5' : '#ddd';
          const bgColor = numericBad ? '#fef2f2' : '#fff';
          return `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
              <label style="font-size:11px;color:var(--text-muted);min-width:56px;">${_esc(labels[f] || f)}${isReq ? '<span style="color:#dc2626;">*</span>' : ''}</label>
              <input class="rs-fld" data-idx="${idx}" data-field="${f}" type="text"
                     value="${_esc(it[f] == null ? '' : String(it[f]))}"
                     placeholder="${_esc(placeholders[f] || '')}"
                     style="flex:1;padding:7px 10px;border:1px solid ${borderColor};background:${bgColor};border-radius:8px;font-size:13px;">
            </div>
          `;
        }).join('')}
      </div>`;
  }

  function _collectItems(body, items) {
    const selected = [];
    body.querySelectorAll('.rs-item').forEach(row => {
      const idx = parseInt(row.dataset.idx, 10);
      const ck = row.querySelector('.rs-ck');
      if (!ck || !ck.checked) return;
      const item = { ...items[idx] };
      row.querySelectorAll('.rs-fld').forEach(fld => {
        const f = fld.dataset.field;
        const v = fld.value.trim();
        if (['amount', 'quantity', 'unit_price', 'total'].includes(f)) {
          item[f] = v ? parseInt(v.replace(/[^\d-]/g, ''), 10) || 0 : null;
        } else {
          item[f] = v || null;
        }
      });
      selected.push(item);
    });
    return selected;
  }

  async function _doCommit(body, kind, items) {
    const btn = body.querySelector('.rs-commit');
    const selected = _collectItems(body, items);
    if (!selected.length) {
      if (window.showToast) window.showToast('추가할 항목이 없어요');
      return;
    }
    // [QA #7] 마지막 방어선 — 백엔드 hard-fail 우회용 클라 검증.
    const meta = KIND_META[kind];
    const bad = selected.find(it => !_itemValid(it, meta));
    if (bad) {
      if (window.showToast) window.showToast('빨간 칸의 금액을 먼저 입력해주세요');
      return;
    }
    btn.disabled = true;
    btn.innerHTML = '저장 중…';
    try {
      const res = await _commit(kind, selected);
      if (window.showToast) window.showToast(`${res.imported}건 저장${res.failed ? ` · 실패 ${res.failed}` : ''}`);
      if (window.hapticSuccess) window.hapticSuccess();
      body.closest('[id="receiptScanSheet"]')?.remove();
      try { sessionStorage.removeItem('pv_cache::inventory'); } catch (_e) { /* ignore */ }
    } catch (e) {
      if (window.showToast) window.showToast('저장 실패: ' + (e.message || ''));
      btn.disabled = false;
      btn.innerHTML = `${selected.length}개 추가하기`;
    }
  }

  function _renderPreview(overlay, kind, items) {
    const meta = KIND_META[kind];
    const body = overlay.querySelector('.rs-body');

    if (!items.length) {
      body.innerHTML = `
        <div style="padding:40px;text-align:center;color:#888;">
          <div style="font-size:36px;margin-bottom:10px;">🤷</div>
          <div style="font-size:13px;">이미지에서 데이터를 찾지 못했어요</div>
          <div style="font-size:11px;color:var(--text-subtle);margin-top:6px;">영수증이 선명한지 확인해주세요</div>
        </div>`;
      return;
    }

    body.innerHTML = `
      <div style="padding:14px 18px 6px;font-size:12px;color:var(--text-muted);">
        AI 가 <strong>${items.length}개</strong> 항목을 찾았어요. 확인 후 "추가하기" 를 누르세요.
      </div>
      <div class="rs-hint" style="display:none;padding:0 18px 6px;font-size:11px;color:#dc2626;font-weight:600;">
        빨간색 칸은 금액이 0이거나 비어있어요. 직접 입력하면 저장 버튼이 활성화돼요.
      </div>
      <div class="rs-items" style="padding:0 12px;">
        ${items.map((it, idx) => _buildItemHtml(it, idx, meta.fields, meta.labels, meta.placeholders, meta)).join('')}
      </div>
      <div style="padding:14px 16px;display:flex;gap:10px;position:sticky;bottom:0;background:#fafafa;border-top:1px solid #eee;">
        <button class="rs-cancel" style="flex:1;padding:14px;border:1px solid #ddd;background:#fff;border-radius:12px;font-weight:700;cursor:pointer;">취소</button>
        <button class="rs-commit" style="flex:2;padding:14px;border:none;background:linear-gradient(135deg,var(--brand),var(--brand-strong));color:#fff;border-radius:12px;font-weight:800;cursor:pointer;">${items.length}개 추가하기</button>
      </div>
    `;

    // [QA #7] 현재 입력 기준으로 commit 버튼 활성화 여부 재계산.
    const _revalidate = () => {
      const commitBtn = body.querySelector('.rs-commit');
      const hint = body.querySelector('.rs-hint');
      let checkedCnt = 0;
      let badCnt = 0;
      body.querySelectorAll('.rs-item').forEach(row => {
        const idx = parseInt(row.dataset.idx, 10);
        const ck = row.querySelector('.rs-ck');
        if (!ck || !ck.checked) {
          row.style.opacity = '0.5';
          return;
        }
        row.style.opacity = '1';
        checkedCnt += 1;
        // 행 단위 invalid 표시 (입력에 따라 빨강 ↔ 정상 토글).
        const cur = { ...items[idx] };
        row.querySelectorAll('.rs-fld').forEach(fld => {
          cur[fld.dataset.field] = fld.value.trim();
        });
        const bad = !_itemValid(cur, meta);
        if (bad) badCnt += 1;
        row.style.borderColor = bad ? '#fca5a5' : '#eee';
        const warn = row.querySelector('.rs-warn');
        if (warn) warn.style.display = bad ? 'inline' : 'none';
        // 각 필드도 재검증.
        const reqAnyUnmet = Array.isArray(meta.requiredNumericAny)
          && !meta.requiredNumericAny.some(f => _toInt(cur[f]) > 0);
        row.querySelectorAll('.rs-fld').forEach(fld => {
          const f = fld.dataset.field;
          const isReqOne = (meta.requiredNumeric || []).includes(f);
          const isReqAny = (meta.requiredNumericAny || []).includes(f) && reqAnyUnmet;
          const numericBad = (isReqOne || isReqAny) && _toInt(cur[f]) <= 0;
          fld.style.borderColor = numericBad ? '#fca5a5' : '#ddd';
          fld.style.background = numericBad ? '#fef2f2' : '#fff';
        });
      });
      const canCommit = checkedCnt > 0 && badCnt === 0;
      if (commitBtn) {
        commitBtn.disabled = !canCommit;
        commitBtn.style.opacity = canCommit ? '1' : '0.5';
        commitBtn.style.cursor = canCommit ? 'pointer' : 'not-allowed';
        commitBtn.textContent = checkedCnt ? `${checkedCnt}개 추가하기` : '추가할 항목 없음';
      }
      if (hint) hint.style.display = badCnt > 0 ? 'block' : 'none';
    };

    body.querySelectorAll('.rs-del').forEach(btn => {
      btn.addEventListener('click', () => {
        items.splice(parseInt(btn.dataset.idx, 10), 1);
        _renderPreview(overlay, kind, items);
      });
    });
    body.querySelectorAll('.rs-fld').forEach(fld => {
      fld.addEventListener('input', _revalidate);
      fld.addEventListener('change', _revalidate);
    });
    body.querySelectorAll('.rs-ck').forEach(ck => {
      ck.addEventListener('change', _revalidate);
    });
    body.querySelector('.rs-cancel').addEventListener('click', () => overlay.remove());
    body.querySelector('.rs-commit').addEventListener('click', () => {
      const commitBtn = body.querySelector('.rs-commit');
      if (commitBtn && commitBtn.disabled) return;
      _doCommit(body, kind, items);
    });
    _revalidate();
  }

  async function _handleFileChange(e, overlay, kind) {
    const file = e.target.files[0];
    if (!file) return;
    const body = overlay.querySelector('.rs-body');
    body.innerHTML = `
      <div style="padding:40px 20px 20px;text-align:center;">
        <div style="font-size:36px;animation:rs-pulse 1.2s ease-in-out infinite;">🤖</div>
        <div class="rs-progress-label" style="font-size:13px;color:var(--text-muted);margin-top:10px;">이미지 최적화 중…</div>
        <div style="font-size:11px;color:var(--text-subtle);margin-top:4px;">보통 5~15초 걸려요</div>
        <div class="rs-tess-preview"></div>
      </div>
      <style>@keyframes rs-pulse{0%,100%{opacity:.4;}50%{opacity:1;}}</style>`;
    // 압축 후 라벨 교체 (사용자에게 진행 단계 인지시켜 체감 속도 개선)
    setTimeout(() => {
      const lbl = body.querySelector('.rs-progress-label');
      if (lbl) lbl.textContent = 'AI 가 이미지를 읽는 중…';
    }, 400);

    // Wave C3 — Gemini 업로드 와 Tesseract 로컬 OCR 을 병렬 실행.
    // Tesseract 는 순수 체감 속도 개선용 프리뷰. 실패해도 업로드 흐름 유지.
    let compressedForPreview = null;
    try { compressedForPreview = await compressImageForUpload(file); } catch (_e) { compressedForPreview = file; }

    // 압축본이 확보되면 Tesseract 병렬 시작 (2초 후에도 못 오면 어차피 Gemini 가 먼저 돌아옴)
    const tessPromise = _runTesseractPreview(compressedForPreview, (text) => {
      _renderTesseractPreview(body, text);
    });

    try {
      // 압축은 이미 했으므로 _uploadImage 내부 재압축은 캐시가 없어 다시 한 번 수행됨(크기 작음 → 스킵됨).
      // 추후 최적화로 compressed 를 재사용하도록 리팩토링 가능.
      const res = await _uploadImage(file, kind);
      _renderPreview(overlay, kind, res.items || []);
      // Gemini 가 먼저 돌아오면 Tesseract 는 백그라운드에서 마저 돌다 terminate
      tessPromise.catch(() => {});
    } catch (err) {
      body.innerHTML = `
        <div style="padding:40px 20px;text-align:center;color:#c00;">
          <div style="font-size:36px;">😵</div>
          <div style="font-size:13px;margin-top:10px;">OCR 실패: ${_esc(err.message || '')}</div>
        </div>`;
    }
  }

  async function openReceiptScan(kind) {
    kind = kind || 'expense';
    if (!KIND_META[kind]) {
      if (window.showToast) window.showToast('알 수 없는 스캔 종류');
      return;
    }
    const meta = KIND_META[kind];

    const overlay = document.createElement('div');
    overlay.id = 'receiptScanSheet';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9500;background:rgba(0,0,0,0.5);display:flex;align-items:flex-end;justify-content:center;';

    const sheet = document.createElement('div');
    sheet.style.cssText = 'width:100%;max-width:520px;background:#fafafa;border-radius:24px 24px 0 0;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;';
    sheet.innerHTML = `
      <div style="padding:20px 20px 12px;background:#fff;border-bottom:1px solid #eee;">
        <div style="width:36px;height:4px;background:#e0e0e0;border-radius:2px;margin:0 auto 14px;"></div>
        <div style="display:flex;align-items:center;gap:8px;">
          <strong style="font-size:17px;">${meta.title}</strong>
          <button class="rs-close" style="margin-left:auto;background:none;border:none;font-size:20px;color:#888;cursor:pointer;">✕</button>
        </div>
        <div style="font-size:12px;color:#888;margin-top:4px;">${meta.subtitle}</div>
      </div>
      <div class="rs-body" style="flex:1;overflow-y:auto;">
        <div style="padding:40px 20px;text-align:center;">
          <label for="rs-file-input" style="display:inline-block;padding:14px 22px;background:linear-gradient(135deg,var(--brand),var(--brand-strong));color:#fff;border-radius:100px;font-weight:800;cursor:pointer;box-shadow:0 4px 12px rgba(241,128,145,0.3);">
            사진 선택 / 촬영
          </label>
          <input id="rs-file-input" type="file" accept="image/*" style="display:none;">
          <div style="font-size:11px;color:#888;margin-top:14px;">AI 가 이미지에서 자동 추출합니다.</div>
        </div>
      </div>`;
    overlay.appendChild(sheet);
    document.body.appendChild(overlay);

    overlay.querySelector('.rs-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('#rs-file-input').addEventListener('change', (e) => _handleFileChange(e, overlay, kind));
  }

  window.openReceiptScan = openReceiptScan;
  window.openExpenseScan = () => openReceiptScan('expense');
  window.openInventoryOrderScan = () => openReceiptScan('inventory_order');

  // Phase 8 — 통합 선택 UI: 영수증인지 주문내역인지 먼저 고르기
  window.openReceiptScanChooser = function () {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9500;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:20px;padding:24px;max-width:380px;width:90%;">
        <strong style="font-size:17px;">무엇을 스캔할까요?</strong>
        <div style="font-size:12px;color:#888;margin-top:4px;margin-bottom:18px;">AI 가 이미지에서 자동으로 데이터를 추출해요</div>
        <button class="rs-chooser-exp" style="width:100%;padding:14px;border:1.5px solid var(--brand);background:#fff;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:12px;margin-bottom:10px;">
          <span style="font-size:22px;">💳</span>
          <div style="flex:1;text-align:left;">
            <div style="color:var(--brand-strong);">영수증 스캔</div>
            <div style="font-size:11px;color:#888;font-weight:400;margin-top:2px;">카페·마트·재료비 영수증 → 지출 기록</div>
          </div>
        </button>
        <button class="rs-chooser-ord" style="width:100%;padding:14px;border:1.5px solid var(--brand);background:#fff;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:12px;margin-bottom:18px;">
          <span style="font-size:22px;">📦</span>
          <div style="flex:1;text-align:left;">
            <div style="color:var(--brand-strong);">주문내역 스캔</div>
            <div style="font-size:11px;color:#888;font-weight:400;margin-top:2px;">쿠팡·네이버 주문 스크린샷 → 재고 입고</div>
          </div>
        </button>
        <button class="rs-chooser-cancel" style="width:100%;padding:10px;border:1px solid #ddd;background:#fff;border-radius:8px;font-weight:700;cursor:pointer;">닫기</button>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('.rs-chooser-cancel').addEventListener('click', () => overlay.remove());
    overlay.querySelector('.rs-chooser-exp').addEventListener('click', () => { overlay.remove(); openReceiptScan('expense'); });
    overlay.querySelector('.rs-chooser-ord').addEventListener('click', () => { overlay.remove(); openReceiptScan('inventory_order'); });
  };
})();
