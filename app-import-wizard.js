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

  function _close() {
    const o = document.getElementById(OVERLAY);
    if (o) o.remove();
    document.body.style.overflow = '';
  }

  function _shell(innerHtml, stepLabel) {
    const o = document.createElement('div');
    o.id = OVERLAY;
    o.style.cssText = `position:fixed;inset:0;z-index:10000;background:rgba(20,8,16,0.65);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:16px;animation:pvFadeIn 0.2s ease;`;
    o.innerHTML = `
      <div style="width:100%;max-width:720px;max-height:92vh;background:#fff;border-radius:20px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.3);animation:pvSlideUp 0.3s cubic-bezier(0.22,1,0.36,1);">
        <div style="display:flex;align-items:center;padding:14px 18px;border-bottom:1px solid #eee;background:#fafafa;">
          <div style="font-size:15px;font-weight:900;color:#222;flex:1;">📥 AI 엑셀 임포트 — ${_esc(stepLabel)}</div>
          <button id="iw-close" style="width:32px;height:32px;border:none;border-radius:10px;background:#eee;cursor:pointer;font-size:14px;">✕</button>
        </div>
        <div id="iw-body" style="flex:1;overflow:auto;padding:18px;">${innerHtml}</div>
      </div>
    `;
    const existing = document.getElementById(OVERLAY);
    if (existing) existing.remove();
    document.body.appendChild(o);
    document.body.style.overflow = 'hidden';
    o.querySelector('#iw-close').addEventListener('click', _close);
  }

  // Step 1: 분석 중 (로딩)
  function _showLoading() {
    _shell(`
      <div style="padding:40px 20px;text-align:center;">
        <div style="width:48px;height:48px;border:4px solid #eee;border-top-color:#F18091;border-radius:50%;margin:0 auto 16px;animation:pvSpin 0.8s linear infinite;"></div>
        <div style="font-size:14px;font-weight:700;color:#333;margin-bottom:6px;">AI가 엑셀 분석 중…</div>
        <div style="font-size:12px;color:#888;">컬럼명·샘플 데이터를 해석해서 매핑을 제안해요.</div>
      </div>
    `, '1/4 분석');
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
      state.dup = { default: 'new_row' };
      _showStep2();
    } catch (e) {
      _shell(`
        <div style="padding:30px;text-align:center;color:#c62828;">
          <div style="font-size:14px;margin-bottom:12px;">❌ ${_esc(e.message)}</div>
          <button id="iw-retry" style="padding:10px 18px;background:#F18091;color:#fff;border:none;border-radius:10px;font-weight:800;cursor:pointer;">다시 시도</button>
        </div>`, '오류');
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
        <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:#fafafa;border-radius:10px;margin-bottom:6px;">
          <div style="flex:0 0 140px;font-size:12.5px;font-weight:700;color:#333;">${_esc(label)}</div>
          <select data-map-field="${field}" style="flex:1;padding:8px 10px;border:1px solid #ddd;border-radius:8px;font-size:12.5px;">${options}</select>
          ${confBadge}
        </div>`;
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
        <button id="iw-back" style="padding:10px 16px;background:#eee;border:none;border-radius:10px;font-weight:700;cursor:pointer;">취소</button>
        <button id="iw-next" style="padding:10px 20px;background:linear-gradient(135deg,#F18091,#D95F70);color:#fff;border:none;border-radius:10px;font-weight:800;cursor:pointer;box-shadow:0 3px 10px rgba(241,128,145,0.3);">다음 →</button>
      </div>
    `, '2/4 매핑');

    document.querySelectorAll('[data-map-field]').forEach(sel => {
      sel.addEventListener('change', (e) => {
        const field = e.target.getAttribute('data-map-field');
        state.mapping[field] = e.target.value;
      });
    });
    document.querySelectorAll('[data-extra]').forEach(sel => {
      sel.addEventListener('change', (e) => {
        const col = e.target.getAttribute('data-extra');
        state.extras[col] = e.target.value;
      });
    });
    document.getElementById('iw-back').addEventListener('click', _close);
    document.getElementById('iw-next').addEventListener('click', _showStep3);
  }

  // Step 3: 중복 정책
  function _showStep3() {
    const a = state.analysis;
    const dups = a.duplicates || [];

    const rowsHtml = dups.length ? dups.slice(0, 50).map(d => {
      const row = d.row_data || {};
      const summary = Object.entries(row).slice(0, 3).map(([k, v]) => `<span style="color:#888;">${_esc(k)}:</span> ${_esc(v)}`).join(' · ');
      const current = state.dup[String(d.row_idx)] || state.dup.default || 'new_row';
      return `
        <div style="padding:10px 12px;background:#fafafa;border-radius:10px;margin-bottom:6px;">
          <div style="font-size:11px;color:#888;margin-bottom:4px;">행 ${d.row_idx}</div>
          <div style="font-size:12.5px;color:#333;margin-bottom:6px;line-height:1.4;">${summary}</div>
          <div style="font-size:11px;color:#D95F70;margin-bottom:8px;">⚠️ 기존: <strong>${_esc(d.existing_name || ('ID ' + d.existing_id))}</strong>${d.existing_phone ? ` (${_esc(d.existing_phone)})` : ''}</div>
          <div style="display:flex;gap:5px;">
            ${['skip','overwrite','new_row'].map(p => `
              <label style="flex:1;cursor:pointer;">
                <input type="radio" name="dup-${d.row_idx}" value="${p}" ${current === p ? 'checked' : ''} data-dup-row="${d.row_idx}" style="display:none;">
                <div class="iw-pol" data-sel="${current === p ? '1' : '0'}" style="padding:7px;text-align:center;border:1.5px solid ${current === p ? '#F18091' : '#ddd'};background:${current === p ? '#FEF4F5' : '#fff'};color:${current === p ? '#D95F70' : '#666'};border-radius:8px;font-size:11px;font-weight:700;transition:all 0.15s;">
                  ${p === 'skip' ? '건너뛰기' : p === 'overwrite' ? '덮어쓰기' : '새로 추가'}
                </div>
              </label>
            `).join('')}
          </div>
        </div>`;
    }).join('') : `<div style="padding:30px;text-align:center;color:#2B8C7E;font-size:13.5px;font-weight:700;">✨ 중복 없음 — 바로 반영할 수 있어요!</div>`;

    _shell(`
      <div style="font-size:13px;color:#555;margin-bottom:14px;line-height:1.6;">
        ${dups.length ? `<strong>${dups.length}개 행</strong>이 기존 데이터와 겹쳐요. 어떻게 처리할까요?` : '중복 감지 결과를 확인하세요.'}
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
      });
    });
    document.querySelectorAll('[data-bulk]').forEach(b => {
      b.addEventListener('click', (e) => {
        const p = e.target.getAttribute('data-bulk');
        state.dup = { default: p };
        (state.analysis.duplicates || []).forEach(d => { state.dup[String(d.row_idx)] = p; });
        _showStep3();
      });
    });
    document.getElementById('iw-back').addEventListener('click', _showStep2);
    document.getElementById('iw-commit').addEventListener('click', _commit);
  }

  // Step 4: 반영 + 결과
  async function _commit() {
    _shell(`
      <div style="padding:40px 20px;text-align:center;">
        <div style="width:48px;height:48px;border:4px solid #eee;border-top-color:#F18091;border-radius:50%;margin:0 auto 16px;animation:pvSpin 0.8s linear infinite;"></div>
        <div style="font-size:14px;font-weight:700;color:#333;">반영 중…</div>
      </div>
    `, '4/4 반영');
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
      _showDone(d);
    } catch (e) {
      _shell(`
        <div style="padding:30px;text-align:center;color:#c62828;">
          <div style="font-size:14px;margin-bottom:12px;">❌ ${_esc(e.message)}</div>
          <button id="iw-retry" style="padding:10px 18px;background:#F18091;color:#fff;border:none;border-radius:10px;font-weight:800;cursor:pointer;">재시도</button>
        </div>`, '오류');
      document.getElementById('iw-retry')?.addEventListener('click', _commit);
    }
  }

  function _showDone(d) {
    _shell(`
      <div style="padding:24px 14px;text-align:center;">
        <div style="font-size:48px;margin-bottom:10px;">✅</div>
        <div style="font-size:17px;font-weight:900;color:#222;margin-bottom:6px;">반영 완료</div>
        <div style="font-size:13px;color:#555;line-height:1.7;margin-bottom:18px;">
          새로 추가 <strong style="color:#2B8C7E;">${d.imported || 0}건</strong> ·
          덮어씀 <strong style="color:#1565C0;">${d.overwritten || 0}건</strong> ·
          건너뜀 <strong style="color:#888;">${d.skipped || 0}건</strong>
          ${d.failed ? ` · 실패 <strong style="color:#C62828;">${d.failed}건</strong>` : ''}
        </div>
        ${d.errors && d.errors.length ? `
          <details style="text-align:left;padding:10px 14px;background:#FFEBEE;border-radius:10px;font-size:11.5px;color:#C62828;margin-bottom:14px;">
            <summary style="cursor:pointer;font-weight:700;">실패 상세</summary>
            <div style="margin-top:6px;white-space:pre-wrap;">${_esc(d.errors.join('\n'))}</div>
          </details>` : ''}
        <button id="iw-close-done" style="padding:12px 30px;background:linear-gradient(135deg,#F18091,#D95F70);color:#fff;border:none;border-radius:12px;font-weight:800;cursor:pointer;box-shadow:0 4px 14px rgba(241,128,145,0.35);">닫기</button>
      </div>
    `, '완료');
    document.getElementById('iw-close-done').addEventListener('click', () => {
      _close();
      if (typeof state.onDone === 'function') state.onDone(d);
    });
  }

  function open({ file, kind, onDone }) {
    state = { file, kind, analysis: null, mapping: {}, extras: {}, dup: {}, onDone };
    _analyze();
  }

  window.ImportWizard = { open, close: _close };
})();
