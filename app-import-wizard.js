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

  let state = { file: null, kind: null, analysis: null, mapping: {}, extras: {}, dup: {}, onDone: null };

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
    try { localStorage.removeItem(LS_KEY); } catch(e){}
  }

  function _close() {
    const o = document.getElementById(OVERLAY);
    if (o) o.remove();
    document.body.style.overflow = '';
  }

  const STEPS = ['파일 선택', '열 매핑', '미리보기', '완료'];

  function _progressDots(activeIdx) {
    return `<div style="display:flex;align-items:center;gap:0;padding:14px 20px 10px;border-bottom:1px solid var(--border,#eee);">
      ${STEPS.map((label, i) => `
        <div style="display:flex;align-items:center;flex:1;min-width:0;">
          <div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
            <div style="width:24px;height:24px;border-radius:50%;border:2px solid ${i < activeIdx ? 'var(--brand,#F18091)' : i === activeIdx ? 'var(--brand,#F18091)' : 'var(--border-strong,#ddd)'};background:${i < activeIdx ? 'var(--brand,#F18091)' : i === activeIdx ? 'var(--brand-bg,#FEF4F5)' : 'transparent'};display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:${i < activeIdx ? '#fff' : i === activeIdx ? 'var(--brand,#F18091)' : 'var(--text-subtle,#bbb)'};">${i < activeIdx ? '✓' : i + 1}</div>
            <div style="font-size:10px;font-weight:700;color:${i === activeIdx ? 'var(--brand,#F18091)' : 'var(--text-subtle,#aaa)'};white-space:nowrap;">${label}</div>
          </div>
          ${i < STEPS.length - 1 ? `<div style="flex:1;height:2px;background:${i < activeIdx ? 'var(--brand,#F18091)' : 'var(--border,#eee)'};margin:0 4px;margin-bottom:16px;"></div>` : ''}
        </div>
      `).join('')}
    </div>`;
  }

  function _shell(innerHtml, stepIdx) {
    const o = document.createElement('div');
    o.id = OVERLAY;
    o.style.cssText = `position:fixed;inset:0;z-index:10000;background:rgba(20,8,16,0.65);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:16px;animation:pvFadeIn 0.2s ease;`;
    o.innerHTML = `
      <div style="width:100%;max-width:600px;max-height:92vh;background:var(--surface,#fff);border-radius:20px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.3);animation:pvSlideUp 0.3s cubic-bezier(0.22,1,0.36,1);">
        <div style="display:flex;align-items:center;padding:14px 18px 0;border-bottom:none;">
          <div style="font-size:15px;font-weight:900;color:var(--text,#222);flex:1;">AI 엑셀 임포트</div>
          <button id="iw-close" style="width:32px;height:32px;border:none;border-radius:10px;background:var(--surface-raised,#eee);cursor:pointer;font-size:14px;color:var(--text,#555);">✕</button>
        </div>
        ${_progressDots(stepIdx)}
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
    const uploadSvg = `<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>`;
    _shell(`
      <div style="text-align:center;padding:8px 0 16px;">
        <div id="iw-dropzone" style="border:2px dashed var(--border-strong,#d0d0d0);border-radius:16px;padding:40px 20px;cursor:pointer;transition:border-color 0.15s;background:var(--surface-raised,#fafafa);">
          <div style="color:var(--text-subtle,#aaa);margin-bottom:12px;">${uploadSvg}</div>
          <div style="font-size:15px;font-weight:800;color:var(--text,#222);margin-bottom:6px;">엑셀 / CSV 파일을 여기에 놓거나</div>
          <button id="iw-file-pick" style="padding:10px 24px;background:var(--brand,#F18091);color:#fff;border:none;border-radius:100px;font-weight:800;font-size:13px;cursor:pointer;margin-top:4px;">파일 선택</button>
          <input type="file" id="iw-file-input" accept=".csv,.xlsx,.xls" style="display:none;" />
          <div style="margin-top:12px;font-size:11px;color:var(--text-subtle,#aaa);">CSV · XLSX · XLS 지원 · 고객/예약/매출 탭만 가능</div>
        </div>
        ${state.file ? `<div style="margin-top:14px;padding:10px 16px;background:var(--surface-raised,#f2f2f2);border-radius:10px;display:flex;align-items:center;gap:10px;text-align:left;">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <div style="flex:1;font-size:12.5px;font-weight:700;color:var(--text,#333);">${_esc(state.file.name)}</div>
          <button id="iw-start" style="padding:8px 18px;background:var(--brand,#F18091);color:#fff;border:none;border-radius:100px;font-weight:800;font-size:12px;cursor:pointer;">분석 시작</button>
        </div>` : ''}
      </div>
    `, 0);
    const zone = document.getElementById('iw-dropzone');
    const fileInput = document.getElementById('iw-file-input');
    document.getElementById('iw-file-pick')?.addEventListener('click', () => fileInput.click());
    fileInput?.addEventListener('change', (e) => { const f = e.target.files[0]; if (f) { state.file = f; _showStep1(); } });
    zone?.addEventListener('dragover', (e) => { e.preventDefault(); zone.style.borderColor = 'var(--brand,#F18091)'; });
    zone?.addEventListener('dragleave', () => { zone.style.borderColor = ''; });
    zone?.addEventListener('drop', (e) => { e.preventDefault(); zone.style.borderColor = ''; const f = e.dataTransfer.files[0]; if (f) { state.file = f; _showStep1(); } });
    document.getElementById('iw-start')?.addEventListener('click', _analyze);
  }

  function _showLoading() {
    _shell(`
      <div style="padding:40px 20px;text-align:center;">
        <div style="width:48px;height:48px;border:4px solid #eee;border-top-color:var(--brand,#F18091);border-radius:50%;margin:0 auto 16px;animation:pvSpin 0.8s linear infinite;"></div>
        <div style="font-size:14px;font-weight:700;color:var(--text,#333);margin-bottom:6px;">AI가 엑셀 분석 중…</div>
        <div style="font-size:12px;color:var(--text-subtle,#888);">컬럼명·샘플 데이터를 해석해서 매핑을 제안해요.</div>
      </div>
    `, 1);
  }

  async function _analyze() {
    _showLoading();
    try {
      const fd = new FormData();
      fd.append('file', state.file);
      fd.append('kind', state.kind);
      const auth = AUTH();
      delete auth['Content-Type'];
      const res = await fetch(API() + '/imports/ai/analyze', { method: 'POST', headers: auth, body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || '분석 실패');
      state.analysis = data;
      state.mapping = { ...(data.ai_mapping || {}) };
      state.extras = {};
      (data.extras || []).forEach(e => { state.extras[e.column] = e.suggest || 'skip'; });
      state.dup = { default: 'skip' };
      state._step = 2;
      _saveState();
      _showStep2();
    } catch (e) {
      _shell(`
        <div style="padding:30px;text-align:center;color:#c62828;">
          <div style="font-size:14px;margin-bottom:12px;">❌ ${_esc(e.message)}</div>
          <button id="iw-retry" style="padding:10px 18px;background:var(--brand,#F18091);color:#fff;border:none;border-radius:10px;font-weight:800;cursor:pointer;">다시 시도</button>
        </div>`, 1);
      document.getElementById('iw-retry')?.addEventListener('click', _analyze);
    }
  }

  // Step 2: 매핑 확인
  function _showStep2() {
    const a = state.analysis;
    const headers = a.headers || [];
    const kindFields = KIND_TARGETS[state.kind] || [];
    const conf = a.ai_confidence || {};

    const mappingRows = kindFields.map(([field, label]) => {
      const current = state.mapping[field] || '';
      const c = conf[field];
      const confBadge = c != null ? `<span style="font-size:10px;padding:2px 7px;border-radius:100px;background:${c >= 0.7 ? '#E8F5E9' : c >= 0.4 ? '#FFF3E0' : '#FFEBEE'};color:${c >= 0.7 ? '#2E7D32' : c >= 0.4 ? '#E68A00' : '#C62828'};font-weight:700;">${Math.round(c*100)}%</span>` : '';
      const options = ['<option value="">(매핑 안 함)</option>'].concat(
        headers.map(h => `<option value="${_esc(h)}" ${h === current ? 'selected' : ''}>${_esc(h)}</option>`)
      ).join('');
      return `
        <button class="list-menu__item" style="width:100%;cursor:default;">
          <div class="list-menu__body">
            <div class="list-menu__title" style="font-size:12px;">${_esc(label)}</div>
          </div>
          <select data-map-field="${field}" style="padding:6px 10px;border:1px solid var(--border-strong,#ddd);border-radius:8px;font-size:12px;background:var(--surface,#fff);color:var(--text,#333);">${options}</select>
          ${confBadge}
        </button>`;
    }).join('');

    const extras = a.extras || [];
    const extrasRows = extras.length ? extras.map(e => `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:#FFF9F2;border:1px solid #FFE0CC;border-radius:8px;margin-bottom:5px;">
        <div style="flex:1;font-size:12px;color:#333;"><strong>${_esc(e.column)}</strong> <span style="color:#888;">— ${_esc(e.reason || '')}</span></div>
        <select data-extra="${_esc(e.column)}" style="padding:6px 8px;border:1px solid #ddd;border-radius:7px;font-size:11.5px;">
          <option value="memo" ${state.extras[e.column]==='memo' ? 'selected':''}>메모 병합</option>
          <option value="tags" ${state.extras[e.column]==='tags' ? 'selected':''}>태그로</option>
          <option value="skip" ${state.extras[e.column]==='skip' ? 'selected':''}>무시</option>
        </select>
      </div>`).join('') : '';

    _shell(`
      <div style="font-size:13px;color:#555;margin-bottom:14px;line-height:1.6;">
        AI가 총 <strong>${a.total_rows}행</strong>을 감지했어요. 매핑을 확인·수정해주세요.
      </div>

      <div style="margin-bottom:16px;">
        <div style="font-size:11px;letter-spacing:1px;color:#888;font-weight:800;margin-bottom:8px;">🧭 컬럼 매핑</div>
        ${mappingRows}
      </div>

      ${extras.length ? `
      <div style="margin-bottom:16px;">
        <div style="font-size:11px;letter-spacing:1px;color:#E68A00;font-weight:800;margin-bottom:8px;">🆕 없는 항목 (${extras.length}개) — 어디로 넣을까요?</div>
        ${extrasRows}
      </div>` : ''}

      <div style="display:flex;gap:8px;justify-content:space-between;margin-top:14px;">
        <button id="iw-back" style="padding:10px 16px;background:var(--surface-raised,#eee);border:none;border-radius:10px;font-weight:700;cursor:pointer;color:var(--text,#333);">← 이전</button>
        <button id="iw-next" style="padding:10px 20px;background:var(--brand,#F18091);color:#fff;border:none;border-radius:10px;font-weight:800;cursor:pointer;">다음 →</button>
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
    document.getElementById('iw-back').addEventListener('click', () => { _clearState(); _close(); });
    document.getElementById('iw-next').addEventListener('click', () => { state._step = 3; _saveState(); _showStep3(); });
  }

  // Step 3: 미리보기 (처음 3행)
  function _showPreview() {
    const a = state.analysis;
    const previewRows = (a.preview_rows || a.sample_rows || []).slice(0, 3);
    const mappedFields = Object.entries(state.mapping).filter(([, col]) => col);
    const cardsHtml = previewRows.length ? previewRows.map((row, i) => `
      <div style="background:var(--surface-raised,#fafafa);border:1px solid var(--border,#eee);border-radius:12px;padding:12px 14px;">
        <div style="font-size:10px;font-weight:800;color:var(--text-subtle,#aaa);margin-bottom:8px;">행 ${i + 1}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;">
          ${mappedFields.map(([field, col]) => `
            <div><div style="font-size:10px;color:var(--text-subtle,#888);margin-bottom:2px;">${_esc(col)}</div>
            <div style="font-size:12.5px;font-weight:700;color:var(--text,#222);">${_esc(String(row[col] ?? '—'))}</div></div>
          `).join('')}
        </div>
      </div>
    `).join('') : `<div style="padding:24px;text-align:center;color:var(--text-subtle,#aaa);font-size:13px;">미리보기 데이터 없음</div>`;

    _shell(`
      <div style="font-size:13px;color:var(--text-subtle,#555);margin-bottom:12px;">총 <strong>${a.total_rows || '?'}행</strong> 중 처음 3행 미리보기예요.</div>
      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px;">${cardsHtml}</div>
      <div style="display:flex;gap:8px;justify-content:space-between;">
        <button id="iw-back" style="padding:10px 16px;background:var(--surface-raised,#eee);border:none;border-radius:10px;font-weight:700;cursor:pointer;color:var(--text,#333);">← 이전</button>
        <button id="iw-commit" style="padding:10px 20px;background:var(--brand,#F18091);color:#fff;border:none;border-radius:10px;font-weight:800;cursor:pointer;">반영하기 →</button>
      </div>

      ${dups.length ? `
      <div style="display:flex;gap:6px;padding:8px;background:#F3F4F6;border-radius:10px;margin-bottom:10px;align-items:center;">
        <span style="font-size:11px;color:#555;font-weight:700;margin-right:4px;">전체 일괄:</span>
        ${['skip','overwrite','new_row'].map(p => `
          <button data-bulk="${p}" style="flex:1;padding:6px;background:#fff;border:1px solid #ddd;border-radius:7px;font-size:11px;font-weight:700;color:#555;cursor:pointer;">
            ${p === 'skip' ? '전부 건너뛰기' : p === 'overwrite' ? '전부 덮어쓰기' : '전부 새로 추가'}
          </button>
        `).join('')}
      </div>` : ''}

      <div style="max-height:40vh;overflow:auto;">${rowsHtml}</div>

      <div style="display:flex;gap:8px;justify-content:space-between;margin-top:14px;">
        <button id="iw-back" style="padding:10px 16px;background:#eee;border:none;border-radius:10px;font-weight:700;cursor:pointer;">← 이전</button>
        <button id="iw-commit" style="padding:10px 20px;background:linear-gradient(135deg,#F18091,#D95F70);color:#fff;border:none;border-radius:10px;font-weight:800;cursor:pointer;box-shadow:0 3px 10px rgba(241,128,145,0.3);">반영하기 →</button>
      </div>
    `, '3/4 중복 처리');

    document.querySelectorAll('[data-dup-row]').forEach(r => {
      r.addEventListener('change', (e) => {
        state.dup[String(e.target.getAttribute('data-dup-row'))] = e.target.value;
        _saveState();
      });
    });
    document.querySelectorAll('[data-bulk]').forEach(b => {
      b.addEventListener('click', (e) => {
        const p = e.target.getAttribute('data-bulk');
        state.dup = { default: p };
        (state.analysis.duplicates || []).forEach(d => { state.dup[String(d.row_idx)] = p; });
        _saveState();
        _showStep3();
      });
    });
    document.getElementById('iw-back').addEventListener('click', () => { state._step = 2; _saveState(); _showStep2(); });
    document.getElementById('iw-commit').addEventListener('click', _commit);
  }

  // Step 4: 반영 + 결과
  async function _commit() {
    _shell(`
      <div style="padding:40px 20px;text-align:center;">
        <div style="width:48px;height:48px;border:4px solid var(--border,#eee);border-top-color:var(--brand,#F18091);border-radius:50%;margin:0 auto 16px;animation:pvSpin 0.8s linear infinite;"></div>
        <div style="font-size:14px;font-weight:700;color:var(--text,#333);">반영 중…</div>
      </div>
    `, 3);
    try {
      const res = await fetch(API() + '/imports/ai/commit', {
        method: 'POST',
        headers: { ...AUTH(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: state.analysis.job_id,
          mapping: state.mapping,
          extras_action: state.extras,
          dup_policy: state.dup,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || '반영 실패');
      _clearState(); // 성공 시 저장본 폐기
      _showDone(d);
    } catch (e) {
      _saveState(); // 실패해도 매핑·정책은 보존 → 사용자 재시도 혹은 나중에 이어하기
      _shell(`
        <div style="padding:30px;text-align:center;color:#c62828;">
          <div style="font-size:14px;margin-bottom:12px;">❌ ${_esc(e.message)}</div>
          <div style="font-size:11.5px;color:#888;margin-bottom:14px;line-height:1.6;">
            매핑·정책 설정은 자동으로 저장됐어요.<br>지금 재시도하거나 잠시 뒤 다시 열어도 이어할 수 있습니다.
          </div>
          <button id="iw-retry" style="padding:10px 18px;background:var(--brand,#F18091);color:#fff;border:none;border-radius:10px;font-weight:800;cursor:pointer;">재시도</button>
        </div>`, '오류');
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
        <button id="iw-close-done" style="width:100%;padding:13px;background:var(--brand,#F18091);color:#fff;border:none;border-radius:12px;font-weight:800;font-size:14px;cursor:pointer;">닫기</button>
      </div>
    `, 3);
    document.getElementById('iw-close-done').addEventListener('click', () => {
      _close();
      if (typeof state.onDone === 'function') state.onDone(d);
    });
  }

  function _showResumePrompt(snap, newContext) {
    const kindLabel = ({ customer: '고객', revenue: '매출', booking: '예약' }[snap.kind] || snap.kind) + ' 임포트';
    const ageMin = Math.max(1, Math.round((Date.now() - snap.saved_at) / 60000));
    _shell(`
      <div style="padding:26px 20px;">
        <div style="font-size:17px;font-weight:900;color:#222;margin-bottom:8px;">⏸ 이전 작업 이어하기</div>
        <div style="font-size:13px;color:#555;line-height:1.7;margin-bottom:14px;">
          ${ageMin}분 전에 진행하던 <strong>${_esc(kindLabel)}</strong>가 남아있어요.<br>
          단계: <strong>${snap.step || 2}/4</strong> · 매핑·정책 그대로 복원됩니다.
        </div>
        <div style="display:flex;gap:8px;">
          <button id="iw-discard" style="flex:1;padding:12px;background:#eee;border:none;border-radius:10px;font-weight:700;cursor:pointer;">버리고 새로</button>
          <button id="iw-resume" style="flex:2;padding:12px;background:linear-gradient(135deg,#F18091,#D95F70);color:#fff;border:none;border-radius:10px;font-weight:800;cursor:pointer;">이어하기 →</button>
        </div>
      </div>
    `, '이어하기');
    document.getElementById('iw-resume').addEventListener('click', () => {
      state = {
        file: null,
        kind: snap.kind,
        analysis: snap.analysis,
        mapping: snap.mapping || {},
        extras: snap.extras || {},
        dup: snap.dup || { default: 'skip' },
        onDone: newContext.onDone || null,
        _step: snap.step || 2,
      };
      if ((snap.step || 2) >= 3) _showStep3(); else _showStep2();
    });
    document.getElementById('iw-discard').addEventListener('click', () => {
      _clearState();
      if (newContext.file && newContext.kind) {
        state = { file: newContext.file, kind: newContext.kind, analysis: null, mapping: {}, extras: {}, dup: {}, onDone: newContext.onDone };
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
    state = { file, kind, analysis: null, mapping: {}, extras: {}, dup: {}, onDone };
    _analyze();
  }

  function hasPending() { return !!_loadState(); }
  function discard() { _clearState(); }

  window.ImportWizard = { open, close: _close, hasPending, discard };
})();
