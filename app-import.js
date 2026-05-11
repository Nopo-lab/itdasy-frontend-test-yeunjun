/* ─────────────────────────────────────────────────────────────
   경쟁사 데이터 임포트 (Phase 3.6 · 2026-04-20)

   엔드포인트:
   - POST /imports/preview   multipart(file, kind)  → {job_id, columns, sample_rows, detected_mapping, ...}
   - POST /imports/commit    {job_id, mapping}      → {imported, failed, errors}
   - GET  /imports/jobs

   플로우: 파일 드롭 → 자동 매핑 → 매핑 확인 UI → 반영 → 결과 리포트
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const KIND_LABELS = {
    customer: { icon: '👥', title: '고객 명단' },
    revenue:  { icon: '💰', title: '매출 내역' },
    booking:  { icon: '📅', title: '예약 일정' },
  };

  const FIELD_LABELS = {
    name: '이름', phone: '연락처', memo: '메모', tags: '태그', birthday: '생일(MM-DD)',
    amount: '금액', method: '결제수단', service_name: '서비스', customer_name: '고객명',
    recorded_at: '결제 일시', starts_at: '시작 시간', ends_at: '종료 시간',
  };

  let _currentKind = null;
  let _preview = null;

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
  }

  function _ensureSheet() {
    let sheet = document.getElementById('importSheet');
    if (sheet) return sheet;
    sheet = document.createElement('div');
    sheet.id = 'importSheet';
    sheet.style.cssText = 'position:fixed;inset:0;z-index:9998;display:none;background:rgba(0,0,0,0.4);';
    sheet.innerHTML = `
      <div style="position:absolute;inset:auto 0 0 0;background:var(--bg,#fff);border-radius:20px 20px 0 0;max-height:90vh;display:flex;flex-direction:column;padding:16px;padding-bottom:max(16px,env(safe-area-inset-bottom));">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
          <strong style="font-size:18px;">다른 앱에서 가져오기</strong>
          <button onclick="closeImport()" style="margin-left:auto;background:none;border:none;font-size:20px;cursor:pointer;" aria-label="닫기">✕</button>
        </div>
        <div id="importBody" style="flex:1;overflow-y:auto;"></div>
      </div>
    `;
    document.body.appendChild(sheet);
    sheet.addEventListener('click', (e) => { if (e.target === sheet) closeImport(); });
    return sheet;
  }

  function _renderKindPicker() {
    const body = document.getElementById('importBody');
    body.innerHTML = `
      <div style="padding:4px;">
        <div style="font-size:12px;color:#888;line-height:1.5;margin-bottom:12px;">
          이전에 쓰시던 관리 앱에서 엑셀·CSV 로 내보낸 파일을 올리면 잇데이로 한 번에 가져와요.<br>
          <span style="color:#c00;">사용자 본인 데이터에 한함. 고객 개인정보 처리 동의 필수.</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr;gap:10px;">
          ${Object.entries(KIND_LABELS).map(([k, v]) => `
            <button data-kind="${k}" style="padding:16px;border:1px solid #ddd;border-radius:12px;background:#fff;cursor:pointer;text-align:left;display:flex;align-items:center;gap:12px;">
              <span style="font-size:28px;">${v.icon}</span>
              <div>
                <strong style="font-size:15px;display:block;">${v.title}</strong>
                <span style="font-size:11px;color:#888;">CSV · XLSX 파일 업로드</span>
              </div>
            </button>
          `).join('')}
        </div>
        <div style="margin-top:16px;padding:10px;background:#fafafa;border-radius:8px;font-size:11px;color:var(--text-muted);line-height:1.6;">
          <strong>지원 포맷</strong><br>
          · CSV (UTF-8 / CP949 / EUC-KR 자동 감지)<br>
          · Excel (.xlsx, .xlsm)<br>
          · 최대 10MB, 한 번에 수천 건 가능
        </div>
      </div>
    `;
    body.querySelectorAll('[data-kind]').forEach(btn => btn.addEventListener('click', () => {
      _currentKind = btn.dataset.kind;
      _renderDropZone();
    }));
  }

  function _renderDropZone() {
    const body = document.getElementById('importBody');
    const label = KIND_LABELS[_currentKind];
    const smartEnabled = _currentKind !== 'booking';  // 예약은 아직 스마트 지원 X

    body.innerHTML = `
      <div style="padding:4px;">
        <button onclick="window._importBack()" style="background:none;border:none;font-size:13px;color:#888;margin-bottom:10px;cursor:pointer;">← 종류 선택</button>
        <div style="padding:6px 10px;background:rgba(241,128,145,0.1);border-radius:8px;font-size:13px;margin-bottom:12px;">
          ${label.icon} <strong>${label.title}</strong> 가져오기
        </div>

        <!-- 입력 방식 탭 -->
        <div style="display:grid;grid-template-columns:repeat(${smartEnabled ? 3 : 1},1fr);gap:6px;padding:4px;background:rgba(0,0,0,0.04);border-radius:10px;margin-bottom:12px;">
          <button data-imp-src="file" class="imp-src-btn" style="padding:10px 6px;border:none;border-radius:8px;cursor:pointer;font-size:11px;font-weight:700;background:#fff;color:var(--accent,var(--brand));">📄 파일</button>
          ${smartEnabled ? `<button data-imp-src="photo" class="imp-src-btn" style="padding:10px 6px;border:none;border-radius:8px;cursor:pointer;font-size:11px;font-weight:700;background:transparent;color:#555;">사진 OCR</button>` : ''}
          ${smartEnabled ? `<button data-imp-src="text" class="imp-src-btn" style="padding:10px 6px;border:none;border-radius:8px;cursor:pointer;font-size:11px;font-weight:700;background:transparent;color:#555;">붙여넣기</button>` : ''}
        </div>

        <div id="importSourcePanel"></div>
        <div id="importStatus" style="margin-top:12px;font-size:12px;color:var(--text-muted);text-align:center;"></div>
      </div>
    `;

    body.querySelectorAll('[data-imp-src]').forEach(btn => btn.addEventListener('click', () => {
      body.querySelectorAll('[data-imp-src]').forEach(b => {
        b.style.background = 'transparent';
        b.style.color = '#555';
      });
      btn.style.background = '#fff';
      btn.style.color = 'var(--accent,var(--brand))';
      _renderSourcePanel(btn.dataset.impSrc);
    }));
    _renderSourcePanel('file');
  }

  function _renderSourcePanel(src) {
    const panel = document.getElementById('importSourcePanel');
    if (!panel) return;
    if (src === 'file') {
      panel.innerHTML = `
        <label style="display:block;">
          <input type="file" accept=".csv,.xlsx,.xlsm,.xls,text/csv,text/plain,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream" hidden id="importFile" />
          <div style="border:2px dashed #ccc;border-radius:12px;padding:36px 16px;text-align:center;cursor:pointer;">
            <div style="font-size:32px;margin-bottom:8px;">📥</div>
            <div style="font-size:14px;color:var(--text-muted);">CSV·엑셀 파일을 탭하세요</div>
            <div style="font-size:10px;color:var(--text-subtle);margin-top:4px;">CSV · XLSX · 최대 10MB</div>
          </div>
        </label>
        <div style="font-size:10px;color:var(--text-subtle);margin-top:8px;line-height:1.6;padding:0 4px;">
          아이폰·카톡으로 받은 엑셀이 .zip 으로 뜨면 그대로 선택하세요. 자동 변환됩니다.
        </div>
      `;
      panel.querySelector('#importFile').addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) _uploadPreview(file);
      });
    } else if (src === 'photo') {
      panel.innerHTML = `
        <label style="display:block;">
          <input type="file" accept="image/*" capture="environment" hidden id="importPhotoFile" />
          <div style="border:2px dashed #FFB347;border-radius:12px;padding:36px 16px;text-align:center;cursor:pointer;background:rgba(255,179,71,0.05);">
            <div style="font-size:32px;margin-bottom:8px;">📸</div>
            <div style="font-size:14px;color:var(--text-muted);font-weight:700;">스크린샷·사진 업로드</div>
            <div style="font-size:10px;color:var(--text-subtle);margin-top:4px;">이전 앱 화면 그대로 찍어 올리세요</div>
          </div>
        </label>
        <div style="font-size:10px;color:var(--text-subtle);margin-top:8px;line-height:1.6;padding:0 4px;">
          <b>AI Vision</b> 이 화면에서 고객 목록/매출을 자동 추출해요. 2~3초 소요.
        </div>
      `;
      panel.querySelector('#importPhotoFile').addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) _uploadPhotoOcr(file);
      });
    } else if (src === 'text') {
      panel.innerHTML = `
        <div style="margin-bottom:8px;font-size:12px;color:var(--text-muted);">카카오톡·메모장에서 복사한 내용을 붙여넣으세요.</div>
        <textarea id="importPasteText" rows="8" placeholder="예)\n김지연 010-1234-5678 VIP\n박소영 010-2345-6789\n..." style="width:100%;padding:10px;border:1px solid #ddd;border-radius:10px;font-family:inherit;resize:vertical;font-size:12px;"></textarea>
        <button id="importPasteParse" style="width:100%;margin-top:10px;padding:12px;border:none;border-radius:10px;background:var(--accent,var(--brand));color:#fff;font-weight:800;cursor:pointer;font-size:14px;">텍스트에서 추출하기</button>
      `;
      panel.querySelector('#importPasteParse').addEventListener('click', _parsePastedText);
    }
  }

  // ── 스마트 임포트: 사진 OCR ─────────────────────────────
  async function _uploadPhotoOcr(file) {
    const status = document.getElementById('importStatus');
    status.textContent = '이미지 최적화 중…';
    const compressed = (typeof window.compressImageForUpload === 'function')
      ? await window.compressImageForUpload(file)
      : file;
    status.textContent = 'AI 가 화면을 읽는 중… (2~3초)';
    const fd = new FormData();
    fd.append('image', compressed);
    fd.append('kind', _currentKind);
    try {
      const res = await fetch(window.API + '/imports/smart/image', {
        method: 'POST', headers: window.authHeader(), body: fd,
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const d = await res.json();
      if (!d.items || !d.items.length) {
        status.textContent = '추출된 항목이 없어요. 더 선명한 화면으로 다시 찍어 주세요.';
        return;
      }
      status.textContent = '';
      _renderSmartReview(d.items);
    } catch (e) {
      status.textContent = 'OCR 실패: ' + (window._humanError ? window._humanError(e) : e.message);
    }
  }

  // ── 스마트 임포트: 카톡·메모 텍스트 파싱 ───────────────
  async function _parsePastedText() {
    const text = document.getElementById('importPasteText').value.trim();
    if (!text || text.length < 2) {
      if (window.showToast) window.showToast('텍스트를 먼저 붙여넣어 주세요');
      return;
    }
    const status = document.getElementById('importStatus');
    status.textContent = '텍스트에서 추출 중…';
    try {
      const res = await fetch(window.API + '/imports/smart/text', {
        method: 'POST',
        headers: { ...window.authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, kind: _currentKind }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const d = await res.json();
      if (!d.items || !d.items.length) {
        status.textContent = '추출된 항목이 없어요. 이름+연락처 형식으로 다시 시도해 주세요.';
        return;
      }
      status.textContent = '';
      _renderSmartReview(d.items);
    } catch (e) {
      status.textContent = '실패: ' + (window._humanError ? window._humanError(e) : e.message);
    }
  }

  function _renderSmartReview(items) {
    const body = document.getElementById('importBody');
    const kind = _currentKind;
    const cols = kind === 'customer' ? ['name', 'phone', 'memo'] : ['amount', 'customer_name', 'service_name', 'method'];
    const colLabels = { name: '이름', phone: '연락처', memo: '메모', amount: '금액', customer_name: '고객', service_name: '시술', method: '결제' };

    body.innerHTML = `
      <div style="padding:4px;">
        <button onclick="window._importBack()" style="background:none;border:none;font-size:13px;color:#888;margin-bottom:10px;cursor:pointer;">← 다시 선택</button>
        <div style="padding:10px 12px;background:linear-gradient(135deg,rgba(76,175,80,0.08),rgba(76,175,80,0.02));border-radius:10px;margin-bottom:10px;">
          <strong style="font-size:13px;color:#388e3c;">${items.length}건 추출됨</strong>
          <div style="font-size:11px;color:var(--text-muted);margin-top:3px;">체크된 항목만 저장돼요. 잘못된 항목은 선택 해제.</div>
        </div>
        <div style="max-height:280px;overflow-y:auto;background:#fff;border-radius:10px;border:1px solid rgba(0,0,0,0.06);">
          ${items.map((it, i) => `
            <label style="display:flex;align-items:center;gap:10px;padding:10px 12px;${i>0?'border-top:1px solid rgba(0,0,0,0.05);':''}cursor:pointer;">
              <input type="checkbox" data-smart-idx="${i}" checked style="width:18px;height:18px;accent-color:var(--accent,var(--brand));" />
              <div style="flex:1;min-width:0;font-size:12px;">
                ${cols.map(c => `<span style="color:${it[c]?'#222':'#bbb'};margin-right:8px;">${_esc(it[c] != null && it[c] !== '' ? (c === 'amount' ? (+it[c]).toLocaleString('ko-KR')+'원' : it[c]) : '—')}</span>`).join('')}
              </div>
            </label>
          `).join('')}
        </div>
        <button id="smartCommit" style="width:100%;margin-top:12px;padding:13px;border:none;border-radius:10px;background:linear-gradient(135deg,var(--brand),var(--brand-strong));color:#fff;font-weight:800;cursor:pointer;font-size:14px;">선택한 항목 저장 ✓</button>
      </div>
    `;

    body.querySelector('#smartCommit').addEventListener('click', async () => {
      const checked = body.querySelectorAll('input[type="checkbox"]:checked');
      const picks = [];
      checked.forEach(cb => {
        const idx = parseInt(cb.dataset.smartIdx, 10);
        if (items[idx]) picks.push(items[idx]);
      });
      if (!picks.length) {
        if (window.showToast) window.showToast('항목을 하나 이상 선택하세요');
        return;
      }
      const btn = body.querySelector('#smartCommit');
      btn.disabled = true; btn.textContent = '저장 중…';
      try {
        const res = await fetch(window.API + '/imports/smart/commit', {
          method: 'POST',
          headers: { ...window.authHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind, items: picks }),
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const d = await res.json();
        _renderReport(d);
        if (window.hapticSuccess) window.hapticSuccess();
      } catch (e) {
        btn.disabled = false; btn.textContent = '다시 시도';
        if (window.showToast) window.showToast('저장 실패: ' + (window._humanError ? window._humanError(e) : e.message));
      }
    });
  }

  async function _uploadPreview(file) {
    const status = document.getElementById('importStatus');
    status.textContent = '업로드 중…';

    // iOS / 카카오톡 다운로드 시 xlsx 가 .zip 로 내려오는 케이스 자동 처리
    // xlsx 는 실제로 ZIP 컨테이너라 MIME 이 zip 으로 뜨는 경우 많음
    let effective = file;
    const nameL = (file.name || '').toLowerCase();
    if (nameL.endsWith('.zip') || file.type === 'application/zip') {
      if (confirm('파일이 .zip 으로 인식됐어요.\nxlsx 파일이면 이름만 바꿔 업로드할까요?\n(아니오를 누르면 그대로 업로드 — 엑셀 파일만 처리 가능)')) {
        const newName = file.name.replace(/\.zip$/i, '.xlsx') || (file.name + '.xlsx');
        effective = new File([file], newName, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        status.textContent = `${newName} 로 변환해서 업로드 중…`;
      }
    }

    const fd = new FormData();
    fd.append('file', effective);
    fd.append('kind', _currentKind);
    try {
      const res = await fetch(window.API + '/imports/preview', {
        method: 'POST',
        headers: window.authHeader(),
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || ('HTTP ' + res.status));
      }
      _preview = await res.json();
      _renderMappingUI();
    } catch (e) {
      status.textContent = '실패: ' + (window._humanError ? window._humanError(e) : e.message);
    }
  }

  function _renderMappingUI() {
    const body = document.getElementById('importBody');
    const p = _preview;
    const label = KIND_LABELS[_currentKind];
    const fields = p.available_fields || [];
    const mapping = { ...(p.detected_mapping || {}) };

    body.innerHTML = `
      <div style="padding:4px;">
        <button onclick="window._importBack()" style="background:none;border:none;font-size:13px;color:#888;margin-bottom:10px;cursor:pointer;">← 파일 다시</button>
        <div style="padding:10px;background:linear-gradient(135deg,rgba(241,128,145,0.08),rgba(241,128,145,0.02));border-radius:10px;margin-bottom:12px;">
          <div style="font-size:13px;font-weight:700;">${label.icon} ${_esc(p.file_name)} — ${p.total_rows}건 감지</div>
          <div style="font-size:11px;color:#888;margin-top:4px;">아래에서 파일의 컬럼을 잇데이 필드에 연결해 주세요. 자동 매핑된 건 그대로 둬도 돼요.</div>
        </div>
        <div id="importMappingList"></div>
        <div id="importMissing" style="margin-top:10px;font-size:12px;"></div>
        <div style="margin-top:12px;padding:10px;background:#fafafa;border-radius:8px;">
          <div style="font-size:12px;font-weight:700;margin-bottom:6px;">샘플 (앞 ${(p.sample_rows||[]).length}건)</div>
          <div style="overflow-x:auto;max-height:140px;">
            <table style="font-size:11px;border-collapse:collapse;width:100%;">
              <thead><tr>${p.columns.map(c => `<th style="padding:4px 6px;background:#eee;border:1px solid #ddd;white-space:nowrap;">${_esc(c)}</th>`).join('')}</tr></thead>
              <tbody>
                ${(p.sample_rows||[]).slice(0, 5).map(r => `
                  <tr>${p.columns.map(c => `<td style="padding:4px 6px;border:1px solid #eee;white-space:nowrap;max-width:140px;overflow:hidden;text-overflow:ellipsis;">${_esc(r[c])}</td>`).join('')}</tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
        <button id="importCommitBtn" style="width:100%;margin-top:14px;padding:12px;border:none;border-radius:8px;background:var(--accent,var(--brand));color:#fff;font-weight:700;cursor:pointer;font-size:15px;">${p.total_rows}건 가져오기</button>
      </div>
    `;

    const mapList = body.querySelector('#importMappingList');
    const optionsHtml = [
      '<option value="">(미사용)</option>',
      ...p.columns.map(c => `<option value="${_esc(c)}">${_esc(c)}</option>`),
    ].join('');

    mapList.innerHTML = fields.map(f => {
      const isRequired = (p.required_fields || []).includes(f);
      const current = mapping[f] || '';
      return `
        <div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #f0f0f0;">
          <div style="flex:1;font-size:13px;">
            ${_esc(FIELD_LABELS[f] || f)}
            ${isRequired ? '<span style="color:#c00;font-size:11px;"> *</span>' : ''}
          </div>
          <select data-map-field="${f}" style="flex:1;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:12px;">
            ${optionsHtml.replace(`value="${_esc(current)}"`, `value="${_esc(current)}" selected`)}
          </select>
        </div>
      `;
    }).join('');

    const updateMissing = () => {
      const selected = {};
      mapList.querySelectorAll('[data-map-field]').forEach(sel => {
        const v = sel.value;
        if (v) selected[sel.dataset.mapField] = v;
      });
      const missing = (p.required_fields || []).filter(f => !selected[f]);
      const missingEl = body.querySelector('#importMissing');
      const btn = body.querySelector('#importCommitBtn');
      if (missing.length) {
        missingEl.innerHTML = `<span style="color:#c00;">필수 필드 누락: ${missing.map(f => FIELD_LABELS[f] || f).join(', ')}</span>`;
        btn.disabled = true;
        btn.style.background = '#ddd'; btn.style.color = '#888'; btn.style.cursor = 'not-allowed';
      } else {
        missingEl.innerHTML = '<span style="color:#388e3c;">✓ 필수 필드 모두 연결됨</span>';
        btn.disabled = false;
        btn.style.background = 'var(--accent,var(--brand))'; btn.style.color = '#fff'; btn.style.cursor = 'pointer';
      }
    };
    mapList.querySelectorAll('[data-map-field]').forEach(sel => sel.addEventListener('change', updateMissing));
    updateMissing();

    body.querySelector('#importCommitBtn').addEventListener('click', async () => {
      const finalMapping = {};
      mapList.querySelectorAll('[data-map-field]').forEach(sel => {
        if (sel.value) finalMapping[sel.dataset.mapField] = sel.value;
      });
      await _commit(finalMapping);
    });
  }

  async function _commit(mapping) {
    const btn = document.getElementById('importCommitBtn');
    btn.disabled = true;
    btn.textContent = '반영 중…';
    try {
      const res = await fetch(window.API + '/imports/commit', {
        method: 'POST',
        headers: { ...window.authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: _preview.job_id, mapping }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || ('HTTP ' + res.status));
      }
      const d = await res.json();
      _renderReport(d);
      if (window.hapticSuccess) window.hapticSuccess();
    } catch (e) {
      btn.disabled = false;
      btn.textContent = '다시 시도';
      if (window.showToast) window.showToast('실패: ' + (window._humanError ? window._humanError(e) : e.message));
    }
  }

  function _renderReport(d) {
    const body = document.getElementById('importBody');
    body.innerHTML = `
      <div style="padding:4px;">
        <div style="padding:20px;background:linear-gradient(135deg,rgba(76,175,80,0.08),rgba(76,175,80,0.02));border-radius:12px;text-align:center;margin-bottom:14px;">
          <div style="font-size:36px;margin-bottom:6px;">✨</div>
          <div style="font-size:22px;font-weight:800;color:#388e3c;">${d.imported}건 가져왔어요</div>
          ${d.failed > 0 ? `<div style="font-size:12px;color:#888;margin-top:4px;">건너뜀 ${d.failed}건 (형식 오류)</div>` : ''}
        </div>
        ${(d.errors && d.errors.length) ? `
          <details style="margin-bottom:12px;padding:10px;background:#fff8e1;border-radius:8px;">
            <summary style="cursor:pointer;font-size:12px;color:#f57c00;">건너뛴 ${d.errors.length}건 보기</summary>
            <div style="margin-top:8px;font-size:11px;color:var(--text-muted);line-height:1.5;max-height:180px;overflow-y:auto;">
              ${d.errors.map(e => `<div>${_esc(e)}</div>`).join('')}
            </div>
          </details>
        ` : ''}
        <button onclick="window._importBack()" style="width:100%;padding:12px;border:none;border-radius:8px;background:var(--accent,var(--brand));color:#fff;font-weight:700;cursor:pointer;font-size:15px;">다른 종류 가져오기</button>
        <button onclick="closeImport()" style="width:100%;margin-top:8px;padding:10px;border:1px solid #ddd;border-radius:8px;background:#fff;cursor:pointer;font-size:13px;">닫기</button>
      </div>
    `;
  }

  window._importBack = function () {
    _preview = null;
    _currentKind = null;
    _renderKindPicker();
  };

  window.openImport = function () {
    _ensureSheet();
    document.getElementById('importSheet').style.display = 'block';
    document.body.style.overflow = 'hidden';
    _preview = null;
    _currentKind = null;
    _renderKindPicker();
  };

  window.closeImport = function () {
    const sheet = document.getElementById('importSheet');
    if (sheet) sheet.style.display = 'none';
    document.body.style.overflow = '';
  };
})();
