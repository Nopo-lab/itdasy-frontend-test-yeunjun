/* ─────────────────────────────────────────────────────────────
   AI 임포트 위저드 (Phase 6.3 Lane D · 2026-04-21)

   플로우:
     1) 업로드 → /imports/ai/analyze
     2) 매핑 확인 (AI 제안 → 사용자 수정 가능)
     3) 없는 항목(extras) 처리 방식 선택 (메모 병합/태그/무시)
     4) 중복 행 정책 선택 (덮어쓰기/건너뛰기/새로 추가)
     5) 반영 → /imports/ai/commit → 결과 요약

   전역:
     window.ImportWizard.open({ file, kind, onDone })
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const API = () => window.API || '';
  const AUTH = () => (window.authHeader ? window.authHeader() : {});
  const OVERLAY = 'import-wizard-overlay';

  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch])); }

  const KIND_TARGETS = {
    customer: [
      ['name',     '이름 (필수)'],
      ['phone',    '전화번호'],
      ['memo',     '메모'],
      ['birthday', '생일'],
      ['tags',     '태그'],
    ],
    revenue: [
      ['amount',        '금액 (필수)'],
      ['method',        '결제 수단'],
      ['service_name',  '시술명'],
      ['customer_name', '고객 이름'],
      ['memo',          '메모'],
      ['recorded_at',   '결제 일시'],
    ],
    booking: [
      ['customer_name', '고객 이름'],
      ['service_name',  '시술'],
      ['starts_at',     '시작 시간 (필수)'],
      ['duration_min',  '소요 분'],
      ['memo',          '메모'],
    ],
  };

  let state = { file: null, kind: null, analysis: null, mapping: {}, extras: {}, dup: {}, customFields: [], onDone: null };

  // 분석 시작 시각 — ETA 계산용 (얼마나 진행됐는지 % + 남은 초)
  let _analyzeStartedAt = 0;

  // ── 임시 상태 localStorage 백업 (T-352) ─────────────────
  // BE 재시작/크래시·네트워크 일시 장애·앱 종료 시에도 매핑·중복 정책이 날아가지 않도록.
  // 파일 원본(Blob)은 저장 불가 — analysis(서버 파싱 결과) 는 저장해서 재업로드 없이 이어하기.
  const LS_KEY = 'itdasy_import_wizard_v1';
  const LS_EXPIRY_MS = 30 * 60 * 1000; // 30분 — 더 이상 오래되면 자동 폐기

  function _saveState() {
    try {
      const snap = {
        kind: state.kind,
        analysis: state.analysis,
        mapping: state.mapping,
        extras: state.extras,
        dup: state.dup,
        customFields: state.customFields || [],
        step: state._step || 2,
        saved_at: Date.now(),
      };
      localStorage.setItem(LS_KEY, JSON.stringify(snap));
    } catch (e) { /* quota/parse 에러 무시 */ }
  }

  function _loadState() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      const snap = JSON.parse(raw);
      if (!snap || !snap.analysis) return null;
      if (Date.now() - (snap.saved_at || 0) > LS_EXPIRY_MS) {
        localStorage.removeItem(LS_KEY);
        return null;
      }
      return snap;
    } catch (e) { return null; }
  }

  function _clearState() {
    try { localStorage.removeItem(LS_KEY); } catch (e) { void 0; }
  }

  function _close() {
    const o = document.getElementById(OVERLAY);
    if (o) o.remove();
    document.body.style.overflow = '';
  }

  const STEPS = ['파일 선택', '항목 짝지어주기', '미리보기', '완료'];

  // pct (0~100) 와 etaSec 옵션 — 진행 단계 내부에 가로 바 + % 표시
  function _progressDots(activeIdx, pct, etaSec) {
    const showBar = typeof pct === 'number' && pct >= 0;
    const barPct = Math.max(0, Math.min(100, pct || 0));
    const etaText = (etaSec != null && etaSec > 0)
      ? (etaSec < 60 ? `약 ${Math.ceil(etaSec)}초 남음` : `약 ${Math.ceil(etaSec / 60)}분 남음`)
      : '';
    return `<div style="padding:14px 20px 10px;border-bottom:1px solid var(--border,#eee);">
      <div style="display:flex;align-items:center;gap:0;">
      ${STEPS.map((label, i) => `
        <div style="display:flex;align-items:center;flex:1;min-width:0;">
          <div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
            <div style="width:24px;height:24px;border-radius:50%;border:2px solid ${i < activeIdx ? 'var(--brand,var(--brand))' : i === activeIdx ? 'var(--brand,var(--brand))' : 'var(--border-strong,#ddd)'};background:${i < activeIdx ? 'var(--brand,var(--brand))' : i === activeIdx ? 'var(--brand-bg,#FEF4F5)' : 'transparent'};display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:${i < activeIdx ? '#fff' : i === activeIdx ? 'var(--brand,var(--brand))' : 'var(--text-subtle,#bbb)'};">${i < activeIdx ? '<i class="ph-duotone ph-check" style="font-size:11px" aria-hidden="true"></i>' : i + 1}</div>
            <div style="font-size:10px;font-weight:700;color:${i === activeIdx ? 'var(--brand,var(--brand))' : 'var(--text-subtle,#aaa)'};white-space:nowrap;">${label}</div>
          </div>
          ${i < STEPS.length - 1 ? `<div style="flex:1;height:2px;background:${i < activeIdx ? 'var(--brand,var(--brand))' : 'var(--border,#eee)'};margin:0 4px;margin-bottom:16px;"></div>` : ''}
        </div>
      `).join('')}
      </div>
      ${showBar ? `
        <div style="margin-top:10px;">
          <div style="height:6px;background:var(--border,#eee);border-radius:100px;overflow:hidden;">
            <div style="height:100%;width:${barPct}%;background:linear-gradient(90deg,var(--brand,var(--brand)),#FFA8B6);transition:width 0.3s ease;border-radius:100px;"></div>
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:4px;font-size:10.5px;color:var(--text-subtle,#888);">
            <span style="font-weight:700;">${barPct}%</span>
            <span>${etaText}</span>
          </div>
        </div>
      ` : ''}
    </div>`;
  }

  function _shell(innerHtml, stepIdx, pct, etaSec) {
    const idx = typeof stepIdx === 'number' ? stepIdx : 0;
    const o = document.createElement('div');
    o.id = OVERLAY;
    o.style.cssText = `position:fixed;inset:0;z-index:10000;background:rgba(20,8,16,0.78);display:flex;align-items:center;justify-content:center;padding:16px;animation:pvFadeIn 0.2s ease;`;
    o.innerHTML = `
      <div style="width:100%;max-width:600px;max-height:92vh;background:var(--surface,#fff);border-radius:20px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.3);animation:pvSlideUp 0.3s cubic-bezier(0.22,1,0.36,1);">
        <div style="display:flex;align-items:center;padding:14px 18px 0;border-bottom:none;">
          <div style="font-size:15px;font-weight:900;color:var(--text,#222);flex:1;">AI 엑셀 자동 정리</div>
          <button id="iw-close" aria-label="닫기" style="width:32px;height:32px;border:none;border-radius:10px;background:var(--surface-raised,#eee);cursor:pointer;color:var(--text,#555);display:flex;align-items:center;justify-content:center;"><i class="ph-duotone ph-x" aria-hidden="true"></i></button>
        </div>
        ${_progressDots(idx, pct, etaSec)}
        <div id="iw-body" style="flex:1;overflow:auto;padding:18px;">${innerHtml}</div>
      </div>
    `;
    const existing = document.getElementById(OVERLAY);
    if (existing) existing.remove();
    document.body.appendChild(o);
    document.body.style.overflow = 'hidden';
    o.querySelector('#iw-close').addEventListener('click', _close);
  }

  // Step 1: 파일 선택 (drop zone)
  function _showStep1() {
    const uploadSvg = `<i class="ph-duotone ph-cloud-arrow-up" style="font-size:40px" aria-hidden="true"></i>`;
    _shell(`
      <div style="text-align:center;padding:8px 0 16px;">
        <div style="font-size:13px;color:var(--text-subtle,#666);margin-bottom:12px;line-height:1.6;">엑셀 파일만 올려주세요. AI가 알아서 정리해요.<br><span style="color:var(--text-subtle,#999);font-size:11.5px;">보통 30초~2분 정도 걸려요.</span></div>
        <div id="iw-dropzone" style="border:2px dashed var(--border-strong,#d0d0d0);border-radius:16px;padding:40px 20px;cursor:pointer;transition:border-color 0.15s;background:var(--surface-raised,#fafafa);">
          <div style="color:var(--text-subtle,#aaa);margin-bottom:12px;">${uploadSvg}</div>
          <div style="font-size:15px;font-weight:800;color:var(--text,#222);margin-bottom:6px;">엑셀 / CSV 파일을 여기에 놓거나</div>
          <button id="iw-file-pick" style="padding:10px 24px;background:var(--brand,var(--brand));color:#fff;border:none;border-radius:100px;font-weight:800;font-size:13px;cursor:pointer;margin-top:4px;">파일 고르기</button>
          <input type="file" id="iw-file-input" accept=".csv,.xlsx,.xls" style="display:none;" />
          <div style="margin-top:12px;font-size:11px;color:var(--text-subtle,#aaa);">CSV · XLSX · XLS 지원 · 손님/예약/매출 정보</div>
        </div>
        ${state.file ? `<div style="margin-top:14px;padding:10px 16px;background:var(--surface-raised,#f2f2f2);border-radius:10px;display:flex;align-items:center;gap:10px;text-align:left;">
          <i class="ph-duotone ph-file-text" style="font-size:18px" aria-hidden="true"></i>
          <div style="flex:1;font-size:12.5px;font-weight:700;color:var(--text,#333);">${_esc(state.file.name)}</div>
          <button id="iw-start" style="padding:8px 18px;background:var(--brand,var(--brand));color:#fff;border:none;border-radius:100px;font-weight:800;font-size:12px;cursor:pointer;">정리 시작</button>
        </div>` : ''}
      </div>
    `, 0);
    const zone = document.getElementById('iw-dropzone');
    const fileInput = document.getElementById('iw-file-input');
    document.getElementById('iw-file-pick')?.addEventListener('click', () => fileInput.click());
    fileInput?.addEventListener('change', (e) => { const f = e.target.files[0]; if (f) { state.file = f; _showStep1(); } });
    zone?.addEventListener('dragover', (e) => { e.preventDefault(); zone.style.borderColor = 'var(--brand,var(--brand))'; });
    zone?.addEventListener('dragleave', () => { zone.style.borderColor = ''; });
    zone?.addEventListener('drop', (e) => { e.preventDefault(); zone.style.borderColor = ''; const f = e.dataTransfer.files[0]; if (f) { state.file = f; _showStep1(); } });
    document.getElementById('iw-start')?.addEventListener('click', _analyze);
  }

  // pct/eta 받아서 진행 바를 헤더에 표시
  function _showLoading(pct, etaSec, message) {
    const msg = message || 'AI가 엑셀을 읽고 있어요…';
    _shell(`
      <div style="padding:40px 20px;text-align:center;">
        <div style="width:48px;height:48px;border:4px solid #eee;border-top-color:var(--brand,var(--brand));border-radius:50%;margin:0 auto 16px;animation:pvSpin 0.8s linear infinite;"></div>
        <div style="font-size:14px;font-weight:700;color:var(--text,#333);margin-bottom:6px;">${_esc(msg)}</div>
        <div style="font-size:12px;color:var(--text-subtle,#888);line-height:1.6;">엑셀 항목을 잇데이 항목과 자동으로 짝지어줘요.<br>잠깐만 기다려주세요.</div>
      </div>
    `, 1, pct, etaSec);
  }

  async function _analyze() {
    _analyzeStartedAt = Date.now();
    _showLoading(2, null, 'AI가 엑셀을 읽고 있어요…');

    // ETA 보간 — 분석은 보통 30~120초. 시간 경과에 따라 % 가 점진적으로 올라가게 (실제 응답 도착 전까지).
    const expected = 60; // 초 (대략)
    const ticker = setInterval(() => {
      const elapsed = (Date.now() - _analyzeStartedAt) / 1000;
      const pct = Math.min(95, Math.round(2 + (elapsed / expected) * 90));
      const eta = Math.max(1, expected - elapsed);
      _showLoading(pct, eta, 'AI가 엑셀을 읽고 있어요…');
    }, 1500);

    try {
      const fd = new FormData();
      fd.append('file', state.file);
      fd.append('kind', state.kind);
      const auth = AUTH();
      delete auth['Content-Type'];
      const res = await fetch(API() + '/imports/ai/analyze', { method: 'POST', headers: auth, body: fd });
      clearInterval(ticker);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || '분석 실패');
      state.analysis = data;
      state.mapping = { ...(data.ai_mapping || {}) };
      state.extras = {};
      state.customFields = []; // 새 분석 → 기존 사용자 정의 컬럼 초기화
      (data.extras || []).forEach(e => { state.extras[e.column] = e.suggest || 'skip'; });
      state.dup = { default: 'skip' };
      state._step = 2;
      _saveState();
      _showStep2();
    } catch (e) {
      clearInterval(ticker);
      _shell(`
        <div style="padding:30px;text-align:center;">
          <div style="color:#c62828;font-size:14px;margin-bottom:12px;font-weight:700;">잠시 문제가 생겼어요</div>
          <div style="font-size:12px;color:#888;margin-bottom:14px;">${_esc(e.message)}</div>
          <button id="iw-retry" style="padding:10px 18px;background:var(--brand,var(--brand));color:#fff;border:none;border-radius:10px;font-weight:800;cursor:pointer;">다시 시도</button>
        </div>`, 1);
      document.getElementById('iw-retry')?.addEventListener('click', _analyze);
    }
  }

  // Step 2: 항목 짝지어주기 (매핑) + 사용자 정의 컬럼 추가 가능
  function _showStep2() {
    const a = state.analysis;
    const headers = a.headers || [];
    const kindFields = KIND_TARGETS[state.kind] || [];
    const customFields = state.customFields || [];
    const conf = a.ai_confidence || {};

    const renderMapRow = (field, label, isCustom) => {
      const current = state.mapping[field] || '';
      const c = conf[field];
      const confBadge = (!isCustom && c != null) ? `<span style="font-size:10px;padding:2px 7px;border-radius:100px;background:${c >= 0.7 ? '#E8F5E9' : c >= 0.4 ? '#FFF3E0' : '#FFEBEE'};color:${c >= 0.7 ? '#2E7D32' : c >= 0.4 ? '#E68A00' : '#C62828'};font-weight:700;">${Math.round(c*100)}%</span>` : '';
      const options = ['<option value="">(짝짓지 않음)</option>'].concat(
        headers.map(h => `<option value="${_esc(h)}" ${h === current ? 'selected' : ''}>${_esc(h)}</option>`)
      ).join('');
      const removeBtn = isCustom ? `<button data-remove-custom="${_esc(field)}" style="margin-left:6px;padding:4px 8px;border:none;background:#FFEBEE;color:#C62828;border-radius:6px;font-size:10px;font-weight:700;cursor:pointer;">삭제</button>` : '';
      return `
        <div style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:${isCustom ? '#F3E5F5' : 'var(--surface,#fff)'};border:1px solid ${isCustom ? '#CE93D8' : 'var(--border,#eee)'};border-radius:10px;margin-bottom:6px;">
          <div style="flex:1;min-width:0;">
            <div style="font-size:12.5px;font-weight:700;color:var(--text,#333);">${_esc(label)}${isCustom ? ' <span style="font-size:10px;color:#7B1FA2;">새 항목</span>' : ''}</div>
          </div>
          <select data-map-field="${_esc(field)}" style="padding:6px 10px;border:1px solid var(--border-strong,#ddd);border-radius:8px;font-size:12px;background:var(--surface,#fff);color:var(--text,#333);">${options}</select>
          ${confBadge}
          ${removeBtn}
        </div>`;
    };

    const mappingRows = [
      ...kindFields.map(([f, l]) => renderMapRow(f, l, false)),
      ...customFields.map(cf => renderMapRow(cf.field, cf.label, true)),
    ].join('');

    const extras = a.extras || [];
    const extrasRows = extras.length ? extras.map(e => `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:#FFF9F2;border:1px solid #FFE0CC;border-radius:8px;margin-bottom:5px;">
        <div style="flex:1;min-width:0;font-size:12px;color:#333;"><strong>${_esc(e.column)}</strong> <span style="color:#888;font-size:11px;">— ${_esc(e.reason || '')}</span></div>
        <select data-extra="${_esc(e.column)}" style="padding:6px 8px;border:1px solid #ddd;border-radius:7px;font-size:11.5px;">
          <option value="memo" ${state.extras[e.column]==='memo' ? 'selected':''}>메모로 합치기</option>
          <option value="tags" ${state.extras[e.column]==='tags' ? 'selected':''}>태그로</option>
          <option value="custom" ${state.extras[e.column]==='custom' ? 'selected':''}>새 항목으로</option>
          <option value="skip" ${state.extras[e.column]==='skip' ? 'selected':''}>버리기</option>
        </select>
      </div>`).join('') : '';

    _shell(`
      <div style="font-size:13px;color:#555;margin-bottom:14px;line-height:1.6;">
        AI가 <strong>${a.total_rows}건</strong>을 찾았어요.<br>
        엑셀 항목을 잇데이 항목과 짝지어주세요. <span style="color:var(--text-subtle,#888);font-size:11.5px;">(AI 가 자동 추천한 게 맞으면 그대로 두세요)</span>
      </div>

      <div style="margin-bottom:16px;">
        <div style="font-size:11px;letter-spacing:0.5px;color:#888;font-weight:800;margin-bottom:8px;">엑셀 항목 ↔ 잇데이 항목</div>
        ${mappingRows}
        <button id="iw-add-custom" style="width:100%;margin-top:6px;padding:10px;background:var(--surface-raised,#fafafa);border:1px dashed var(--border-strong,#ccc);border-radius:10px;font-size:12px;font-weight:700;color:var(--brand,var(--brand));cursor:pointer;">+ 잇데이에 없는 항목 새로 만들기</button>
      </div>

      ${extras.length ? `
      <div style="margin-bottom:16px;">
        <div style="font-size:11px;letter-spacing:0.5px;color:#E68A00;font-weight:800;margin-bottom:8px;">잇데이에 없는 엑셀 항목 (${extras.length}개) — 어떻게 처리할까요?</div>
        ${extrasRows}
      </div>` : ''}

      <div style="display:flex;gap:8px;justify-content:space-between;margin-top:14px;">
        <button id="iw-back" style="padding:10px 16px;background:var(--surface-raised,#eee);border:none;border-radius:10px;font-weight:700;cursor:pointer;color:var(--text,#333);">← 이전</button>
        <button id="iw-next" style="padding:10px 20px;background:var(--brand,var(--brand));color:#fff;border:none;border-radius:10px;font-weight:800;cursor:pointer;">다음 →</button>
      </div>
    `, 1);

    document.querySelectorAll('[data-map-field]').forEach(sel => {
      sel.addEventListener('change', (e) => {
        const field = e.target.getAttribute('data-map-field');
        state.mapping[field] = e.target.value;
        _saveState();
      });
    });
    document.querySelectorAll('[data-extra]').forEach(sel => {
      sel.addEventListener('change', (e) => {
        const col = e.target.getAttribute('data-extra');
        state.extras[col] = e.target.value;
        _saveState();
      });
    });
    document.querySelectorAll('[data-remove-custom]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const f = e.target.getAttribute('data-remove-custom');
        state.customFields = (state.customFields || []).filter(cf => cf.field !== f);
        delete state.mapping[f];
        _saveState();
        _showStep2();
      });
    });
    document.getElementById('iw-add-custom').addEventListener('click', () => {
      const label = (window.prompt('새 항목 이름을 입력해주세요 (예: 휴대폰 뒷자리)') || '').trim();
      if (!label) return;
      // 영문 field key — 한글 라벨에서 안전한 식별자 생성
      const field = 'custom_' + Math.random().toString(36).slice(2, 9);
      state.customFields = [...(state.customFields || []), { field, label }];
      _saveState();
      _showStep2();
    });
    document.getElementById('iw-back').addEventListener('click', () => { _clearState(); _close(); });
    document.getElementById('iw-next').addEventListener('click', () => { state._step = 3; _saveState(); _showStep3(); });
  }

  // Step 3: 미리보기 — 처음 3행 + 중복 일괄 정책 선택
  function _showStep3() {
    const a = state.analysis;
    const previewRows = (a.preview_rows || a.sample_rows || []).slice(0, 3);
    const mappedFields = Object.entries(state.mapping).filter(([, col]) => col);
    const customLabelMap = Object.fromEntries((state.customFields || []).map(cf => [cf.field, cf.label]));

    const cardsHtml = previewRows.length ? previewRows.map((row, i) => `
      <div style="background:var(--surface-raised,#fafafa);border:1px solid var(--border,#eee);border-radius:12px;padding:12px 14px;">
        <div style="font-size:10px;font-weight:800;color:var(--text-subtle,#aaa);margin-bottom:8px;">${i + 1}번째 줄</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;">
          ${mappedFields.map(([field, col]) => {
            const label = customLabelMap[field] || (KIND_TARGETS[state.kind]||[]).find(k => k[0] === field)?.[1] || field;
            return `<div><div style="font-size:10px;color:var(--text-subtle,#888);margin-bottom:2px;">${_esc(label)}</div>
              <div style="font-size:12.5px;font-weight:700;color:var(--text,#222);">${_esc(String(row[col] ?? '—'))}</div></div>`;
          }).join('')}
        </div>
      </div>
    `).join('') : `<div style="padding:24px;text-align:center;color:var(--text-subtle,#aaa);font-size:13px;">미리보기 정보가 없어요</div>`;

    const dupCount = (a.duplicates || []).length;
    const dupBlock = dupCount > 0 ? `
      <div style="margin-top:14px;padding:12px;background:#FFF9F2;border:1px solid #FFE0CC;border-radius:10px;">
        <div style="font-size:12px;color:#7A4500;font-weight:700;margin-bottom:8px;">이미 등록된 ${dupCount}건 — 어떻게 할까요?</div>
        <div style="display:flex;gap:6px;">
          ${[['skip','건너뛰기'],['overwrite','덮어쓰기'],['new_row','새로 추가']].map(([p, l]) => `
            <button data-bulk="${p}" style="flex:1;padding:8px;background:${state.dup.default===p ? 'var(--brand,var(--brand))' : '#fff'};color:${state.dup.default===p ? '#fff' : '#555'};border:1px solid ${state.dup.default===p ? 'var(--brand,var(--brand))' : '#ddd'};border-radius:7px;font-size:11.5px;font-weight:700;cursor:pointer;">${l}</button>
          `).join('')}
        </div>
      </div>` : '';

    _shell(`
      <div style="font-size:13px;color:var(--text-subtle,#555);margin-bottom:12px;line-height:1.6;">
        총 <strong>${a.total_rows || '?'}건</strong> 중 처음 3건이에요. 이대로 잇데이에 넣을까요?
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:8px;">${cardsHtml}</div>
      ${dupBlock}
      <div style="display:flex;gap:8px;justify-content:space-between;margin-top:16px;">
        <button id="iw-back" style="padding:10px 16px;background:var(--surface-raised,#eee);border:none;border-radius:10px;font-weight:700;cursor:pointer;color:var(--text,#333);">← 이전</button>
        <button id="iw-commit" style="padding:10px 20px;background:var(--brand,var(--brand));color:#fff;border:none;border-radius:10px;font-weight:800;cursor:pointer;">잇데이에 넣기 →</button>
      </div>
    `, 2);

    document.querySelectorAll('[data-bulk]').forEach(b => {
      b.addEventListener('click', (e) => {
        const p = e.target.getAttribute('data-bulk');
        state.dup = { default: p };
        _saveState();
        _showStep3();
      });
    });
    document.getElementById('iw-back').addEventListener('click', () => { state._step = 2; _saveState(); _showStep2(); });
    document.getElementById('iw-commit').addEventListener('click', _commit);
  }

  // Step 4: 잇데이에 넣기 + 결과
  async function _commit() {
    const startedAt = Date.now();
    _shell(`
      <div style="padding:40px 20px;text-align:center;">
        <div style="width:48px;height:48px;border:4px solid var(--border,#eee);border-top-color:var(--brand,var(--brand));border-radius:50%;margin:0 auto 16px;animation:pvSpin 0.8s linear infinite;"></div>
        <div style="font-size:14px;font-weight:700;color:var(--text,#333);margin-bottom:6px;">잇데이에 넣고 있어요…</div>
        <div style="font-size:12px;color:var(--text-subtle,#888);">잠깐만 기다려주세요.</div>
      </div>
    `, 3, 5, null);

    // 진행률 보간 — commit 은 import 양에 비례 (보통 5~30초)
    const expected = Math.min(30, Math.max(5, Math.round((state.analysis?.total_rows || 50) * 0.3)));
    const ticker = setInterval(() => {
      const elapsed = (Date.now() - startedAt) / 1000;
      const pct = Math.min(95, Math.round(5 + (elapsed / expected) * 90));
      const eta = Math.max(1, expected - elapsed);
      _shell(`
        <div style="padding:40px 20px;text-align:center;">
          <div style="width:48px;height:48px;border:4px solid var(--border,#eee);border-top-color:var(--brand,var(--brand));border-radius:50%;margin:0 auto 16px;animation:pvSpin 0.8s linear infinite;"></div>
          <div style="font-size:14px;font-weight:700;color:var(--text,#333);margin-bottom:6px;">잇데이에 넣고 있어요…</div>
          <div style="font-size:12px;color:var(--text-subtle,#888);">잠깐만 기다려주세요.</div>
        </div>
      `, 3, pct, eta);
    }, 1500);

    try {
      const res = await fetch(API() + '/imports/ai/commit', {
        method: 'POST',
        headers: { ...AUTH(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: state.analysis.job_id,
          mapping: state.mapping,
          extras_action: state.extras,
          dup_policy: state.dup,
          custom_fields: (state.customFields || []).map(cf => ({ field: cf.field, label: cf.label })),
        }),
      });
      clearInterval(ticker);
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || '반영 실패');
      _clearState(); // 성공 시 저장본 폐기
      _showDone(d);
    } catch (e) {
      clearInterval(ticker);
      _saveState(); // 실패해도 매핑·정책은 보존 → 사용자 재시도 혹은 나중에 이어하기
      _shell(`
        <div style="padding:30px;text-align:center;">
          <div style="color:#c62828;font-size:14px;margin-bottom:12px;font-weight:700;">잇데이에 넣다가 멈췄어요</div>
          <div style="font-size:12px;color:#888;margin-bottom:8px;">${_esc(e.message)}</div>
          <div style="font-size:11.5px;color:#888;margin-bottom:14px;line-height:1.6;">
            지금까지 설정은 자동으로 저장됐어요.<br>다시 시도하거나, 나중에 다시 열어도 이어할 수 있어요.
          </div>
          <button id="iw-retry" style="padding:10px 18px;background:var(--brand,var(--brand));color:#fff;border:none;border-radius:10px;font-weight:800;cursor:pointer;">다시 시도</button>
        </div>`, 3);
      document.getElementById('iw-retry')?.addEventListener('click', _commit);
    }
  }

  function _showDone(d) {
    _shell(`
      <div style="padding:8px 0;">
        <div class="banner banner--info" role="status" style="margin-bottom:16px;border-radius:12px;">
          <span style="flex:1;font-size:13.5px;font-weight:800;">반영 완료</span>
          <span style="font-size:12px;opacity:0.85;">
            추가 ${d.imported || 0}건 · 덮어씀 ${d.overwritten || 0}건 · 건너뜀 ${d.skipped || 0}건${d.failed ? ` · 실패 ${d.failed}건` : ''}
          </span>
        </div>
        ${d.errors && d.errors.length ? `
          <details style="padding:10px 14px;background:#FFEBEE;border-radius:10px;font-size:11.5px;color:#C62828;margin-bottom:14px;">
            <summary style="cursor:pointer;font-weight:700;">실패 상세</summary>
            <div style="margin-top:6px;white-space:pre-wrap;">${_esc(d.errors.join('\n'))}</div>
          </details>` : ''}
        <button id="iw-close-done" style="width:100%;padding:13px;background:var(--brand,var(--brand));color:#fff;border:none;border-radius:12px;font-weight:800;font-size:14px;cursor:pointer;">닫기</button>
      </div>
    `, 3);
    document.getElementById('iw-close-done').addEventListener('click', () => {
      _close();
      if (typeof state.onDone === 'function') state.onDone(d);
    });
  }

  function _showResumePrompt(snap, newContext) {
    const kindLabel = ({ customer: '손님', revenue: '매출', booking: '예약' }[snap.kind] || snap.kind) + ' 정리';
    const ageMin = Math.max(1, Math.round((Date.now() - snap.saved_at) / 60000));
    _shell(`
      <div style="padding:26px 20px;">
        <div style="font-size:17px;font-weight:900;color:#222;margin-bottom:8px;">하던 작업 이어하기</div>
        <div style="font-size:13px;color:#555;line-height:1.7;margin-bottom:14px;">
          ${ageMin}분 전 진행하던 <strong>${_esc(kindLabel)}</strong>가 남아있어요.<br>
          ${snap.step || 2}단계까지 진행했고, 설정은 그대로 복원돼요.
        </div>
        <div style="display:flex;gap:8px;">
          <button id="iw-discard" style="flex:1;padding:12px;background:#eee;border:none;border-radius:10px;font-weight:700;cursor:pointer;">새로 시작</button>
          <button id="iw-resume" style="flex:2;padding:12px;background:linear-gradient(135deg,var(--brand),var(--brand-strong));color:#fff;border:none;border-radius:10px;font-weight:800;cursor:pointer;">이어하기 →</button>
        </div>
      </div>
    `, 0);
    document.getElementById('iw-resume').addEventListener('click', () => {
      state = {
        file: null,
        kind: snap.kind,
        analysis: snap.analysis,
        mapping: snap.mapping || {},
        extras: snap.extras || {},
        dup: snap.dup || { default: 'skip' },
        customFields: snap.customFields || [],
        onDone: newContext.onDone || null,
        _step: snap.step || 2,
      };
      if ((snap.step || 2) >= 3) _showStep3(); else _showStep2();
    });
    document.getElementById('iw-discard').addEventListener('click', () => {
      _clearState();
      if (newContext.file && newContext.kind) {
        state = { file: newContext.file, kind: newContext.kind, analysis: null, mapping: {}, extras: {}, dup: {}, customFields: [], onDone: newContext.onDone };
        _analyze();
      } else {
        _close();
      }
    });
  }

  function open({ file, kind, onDone }) {
    // 이전 미완료 상태 있으면 이어하기 프롬프트 먼저 (같은 kind 이거나 파일 없이 호출된 경우)
    const snap = _loadState();
    if (snap && (!kind || snap.kind === kind)) {
      _showResumePrompt(snap, { file, kind, onDone });
      return;
    }
    state = { file, kind, analysis: null, mapping: {}, extras: {}, dup: {}, customFields: [], onDone };
    _analyze();
  }

  function hasPending() { return !!_loadState(); }
  function discard() { _clearState(); }

  window.ImportWizard = { open, close: _close, hasPending, discard };
})();
