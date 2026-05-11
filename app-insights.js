/* ─────────────────────────────────────────────────────────────
   AI 인사이트 대시보드 (Phase 4 · 2026-04-20)
   쿠폰 제안 카드 제거 (2026-04-24)

   한 화면에서 2가지 선제 제안을 통합:
   - GET /retention/at-risk   이탈 임박 고객 리스트
   - GET /revenue/forecast    이번 주 예상 매출 + 추천 액션

   오프라인·미배포 시 안내 카드만 렌더.
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
  }

  async function _apiGet(path) {
    if (!window.API || !window.authHeader) throw new Error('no-auth');
    const auth = window.authHeader();
    if (!auth?.Authorization) throw new Error('no-token');
    const res = await fetch(window.API + path, { headers: auth });
    if (res.status === 404 || res.status === 501) throw new Error('endpoint-missing');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  }

  function _formatKRW(n) {
    return (+n || 0).toLocaleString('ko-KR') + '원';
  }

  function _relativeDays(days) {
    if (days >= 60) return Math.round(days / 30) + '개월';
    if (days >= 14) return Math.round(days / 7) + '주';
    return Math.round(days) + '일';
  }

  // ── UI ──────────────────────────────────────────────────
  function _ensureSheet() {
    let sheet = document.getElementById('insightsSheet');
    if (sheet) return sheet;
    sheet = document.createElement('div');
    sheet.id = 'insightsSheet';
    sheet.style.cssText = 'position:fixed;inset:0;z-index:9998;display:none;background:rgba(0,0,0,0.4);';
    sheet.innerHTML = `
      <div style="position:absolute;inset:auto 0 0 0;background:var(--bg,#fff);border-radius:20px 20px 0 0;max-height:92vh;display:flex;flex-direction:column;padding:16px;padding-bottom:max(16px,env(safe-area-inset-bottom));">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
          <span style="font-size:22px;">✨</span>
          <strong style="font-size:18px;">AI 인사이트</strong>
          <button onclick="closeInsights()" style="margin-left:auto;background:none;border:none;font-size:20px;cursor:pointer;" aria-label="닫기">✕</button>
        </div>
        <div id="insightsBody" style="flex:1;overflow-y:auto;"></div>
      </div>
    `;
    document.body.appendChild(sheet);
    sheet.addEventListener('click', (e) => { if (e.target === sheet) closeInsights(); });
    return sheet;
  }

  function _renderLoading() {
    const body = document.getElementById('insightsBody');
    body.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-subtle);">AI 분석 중…</div>';
  }

  function _retentionCard(data) {
    const items = (data?.items || []).slice(0, 5);
    const allItems = data?.items || [];
    const s = data?.summary || { total: 0, at_risk: 0, lost: 0 };
    if (!items.length) {
      return `
        <div style="padding:16px;background:#fafafa;border-radius:12px;margin-bottom:12px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
            <span style="font-size:18px;">💝</span>
            <strong style="font-size:14px;">이탈 임박 고객</strong>
          </div>
          <div style="font-size:12px;color:#888;">걱정할 고객 없음 · 고객 데이터가 쌓이면 자동으로 감지해요.</div>
        </div>`;
    }
    // Wave D2 — 일괄 초안 버튼에 쓸 ID 리스트 (최대 10)
    const bulkIds = allItems.slice(0, 10).map(c => c.customer_id).filter(Boolean);
    const bulkCount = bulkIds.length;
    return `
      <div style="padding:14px;background:linear-gradient(135deg,rgba(220,53,69,0.06),rgba(220,53,69,0.01));border-radius:12px;margin-bottom:12px;">
        <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:10px;">
          <span style="font-size:18px;">💝</span>
          <strong style="font-size:14px;">이탈 임박 고객</strong>
          <span style="margin-left:auto;font-size:11px;color:#dc3545;font-weight:700;">${s.at_risk + s.lost}명</span>
        </div>
        ${items.map(c => `
          <div style="padding:8px 4px;border-top:1px solid rgba(0,0,0,0.05);">
            <div style="display:flex;align-items:center;gap:6px;">
              <strong style="font-size:13px;">${_esc(c.name)}</strong>
              ${c.phone ? `<span style="font-size:11px;color:#888;">${_esc(c.phone)}</span>` : ''}
              <span style="margin-left:auto;font-size:10px;padding:1px 6px;border-radius:3px;font-weight:700;background:${c.status === 'lost' ? 'rgba(220,53,69,0.15)' : 'rgba(255,193,7,0.2)'};color:${c.status === 'lost' ? '#dc3545' : '#f57c00'};">
                ${c.status === 'lost' ? '이탈' : '임박'}
              </span>
            </div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">
              마지막 방문 ${_relativeDays(c.days_since_last)} 전 · 평균 주기 ${Math.round(c.avg_interval_days)}일 · 방문 ${c.visit_count}회
            </div>
            <div style="margin-top:6px;text-align:right;">
              <button data-draft-cid="${c.customer_id}" data-draft-name="${_esc(c.name)}" data-draft-phone="${_esc(c.phone || '')}"
                      style="padding:5px 10px;font-size:11px;font-weight:700;border:1px solid var(--brand);background:#fff;color:var(--brand-strong);border-radius:100px;cursor:pointer;">
                카톡 초안 만들기
              </button>
            </div>
          </div>
        `).join('')}
        ${allItems.length > 5 ? `<div style="margin-top:8px;font-size:11px;color:#888;text-align:center;">외 ${allItems.length - 5}명</div>` : ''}
        ${bulkCount >= 1 ? `
          <div style="margin-top:12px;padding-top:10px;border-top:1px solid rgba(0,0,0,0.06);">
            <button id="bulkDraftBtn" data-bulk-ids="${bulkIds.join(',')}"
                    style="width:100%;padding:11px 14px;font-size:13px;font-weight:700;border:none;background:linear-gradient(135deg,hsl(350,80%,72%),hsl(350,72%,60%));color:#fff;border-radius:14px;cursor:pointer;box-shadow:0 2px 6px rgba(217,95,112,0.22);">
              ${bulkCount}명에게 안부 문자 초안 일괄 생성
            </button>
            <div style="margin-top:6px;font-size:10.5px;color:var(--text-subtle);text-align:center;line-height:1.4;">
              초안만 준비해요 · 발송은 카톡 공유로 한 명씩 직접 승인
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  // [2026-04-30] 8주 sparkline SVG — predicted 는 점선·하이라이트
  function _sparklineSVG(history, predicted) {
    if (!history || !history.length) return '';
    const W = 220, H = 56, P = 4;
    const allValues = history.map(h => h.amount).concat(predicted ? [predicted] : []);
    const maxV = Math.max(...allValues, 1);
    const stepX = (W - P * 2) / Math.max(history.length - 1 + (predicted ? 1 : 0), 1);
    const ptY = (v) => H - P - (v / maxV) * (H - P * 2);
    const points = history.map((h, i) => `${P + i * stepX},${ptY(h.amount)}`);
    const pathD = 'M ' + points.join(' L ');
    const lastIdx = history.length - 1;
    const lastPt = `${P + lastIdx * stepX},${ptY(history[lastIdx].amount)}`;
    let predDot = '', predLine = '';
    if (predicted != null) {
      const px = P + (lastIdx + 1) * stepX;
      const py = ptY(predicted);
      predLine = `<line x1="${P + lastIdx * stepX}" y1="${ptY(history[lastIdx].amount)}" x2="${px}" y2="${py}" stroke="var(--brand)" stroke-width="2" stroke-dasharray="3 3" />`;
      predDot = `<circle cx="${px}" cy="${py}" r="4" fill="var(--brand)" stroke="#fff" stroke-width="2" />`;
    }
    return `
      <svg width="100%" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="display:block;">
        <defs><linearGradient id="rfFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--brand)" stop-opacity="0.25"/>
          <stop offset="100%" stop-color="var(--brand)" stop-opacity="0"/>
        </linearGradient></defs>
        <path d="${pathD} L ${P + lastIdx * stepX},${H - P} L ${P},${H - P} Z" fill="url(#rfFill)" />
        <path d="${pathD}" fill="none" stroke="var(--brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        ${predLine}
        <circle cx="${lastPt.split(',')[0]}" cy="${lastPt.split(',')[1]}" r="3" fill="var(--brand)" />
        ${predDot}
      </svg>
    `;
  }

  function _forecastCard(data) {
    if (!data?.has_data) {
      return `
        <div style="padding:16px;background:#fafafa;border-radius:12px;margin-bottom:12px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
            <span style="font-size:18px;">📈</span>
            <strong style="font-size:14px;">이번 주 매출 예상</strong>
          </div>
          <div style="font-size:12px;color:#888;">${_esc(data?.action || '데이터가 더 필요해요')}</div>
          ${data?.history && data.history.some(h => h.amount > 0) ? `<div style="margin-top:10px;">${_sparklineSVG(data.history, null)}</div>` : ''}
        </div>`;
    }
    const up = data.delta_pct >= 0;
    const deltaColor = data.delta_pct >= 5 ? '#388e3c' : data.delta_pct <= -5 ? '#dc3545' : '#666';
    const arrow = data.delta_pct > 5 ? '↗' : data.delta_pct < -5 ? '↘' : '→';
    const conf = data.confidence || 'low';
    const confLabel = { high: '높음', medium: '보통', low: '낮음' }[conf] || '';
    const confColor = { high: '#10B981', medium: '#F59E0B', low: '#94A3B8' }[conf] || '#94A3B8';
    return `
      <div style="padding:14px;background:linear-gradient(135deg,rgba(241,128,145,0.08),rgba(241,128,145,0.02));border-radius:12px;margin-bottom:12px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <span style="font-size:18px;">📈</span>
          <strong style="font-size:14px;">이번 주 매출 예상</strong>
          <span style="margin-left:auto;font-size:10px;font-weight:700;color:${confColor};background:${confColor}20;padding:2px 7px;border-radius:99px;">신뢰도 ${confLabel}</span>
        </div>
        <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:8px;">
          <strong style="font-size:26px;color:var(--accent,var(--brand));font-variant-numeric:tabular-nums;">${_formatKRW(data.predicted_week)}</strong>
          <span style="font-size:13px;color:${deltaColor};font-weight:700;">${arrow} ${up ? '+' : ''}${data.delta_pct}%</span>
        </div>
        <div style="margin-bottom:8px;">${_sparklineSVG(data.history || [], data.predicted_week)}</div>
        <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-subtle);margin-bottom:8px;">
          <span>8주 전</span>
          <span>이번 주 누적 ${_formatKRW(data.current_week)}</span>
          <span style="color:var(--brand);font-weight:700;">예측</span>
        </div>
        <div style="font-size:12px;color:#555;line-height:1.5;padding:8px 10px;background:#fff;border-radius:8px;">
          ${_esc(data.action)}
        </div>
      </div>
    `;
  }

  // 쿠폰 제안 카드 제거 (2026-04-24)

  async function _loadAndRender() {
    const body = document.getElementById('insightsBody');
    _renderLoading();
    const [retentionP, forecastP] = [
      _apiGet('/retention/at-risk').catch(() => null),
      _apiGet('/revenue/forecast').catch(() => null),
    ];
    const [ret, fc] = await Promise.all([retentionP, forecastP]);

    if (!ret && !fc) {
      body.innerHTML = `
        <div style="padding:30px 16px;text-align:center;color:var(--text-subtle);font-size:13px;line-height:1.6;">
          <div style="font-size:36px;margin-bottom:10px;">🌱</div>
          아직 분석할 데이터가 부족해요. 고객·매출·예약을 기록하면<br>며칠 뒤부터 AI가 선제 제안을 보여줘요.
        </div>
      `;
      return;
    }

    body.innerHTML = `
      ${_retentionCard(ret)}
      ${_forecastCard(fc)}
      <div style="font-size:11px;color:var(--text-subtle);text-align:center;padding:10px;">
        AI 인사이트는 최근 8주 데이터를 바탕으로 매 요청마다 새로 계산돼요.
      </div>
    `;
  }

  window.openInsights = async function () {
    _ensureSheet();
    document.getElementById('insightsSheet').style.display = 'block';
    document.body.style.overflow = 'hidden';
    await _loadAndRender();
  };

  window.closeInsights = function () {
    const sheet = document.getElementById('insightsSheet');
    if (sheet) sheet.style.display = 'none';
    document.body.style.overflow = '';
  };

  // Phase 8 C4 — AI 카톡 초안 버튼 → POST /retention/{id}/message-draft → navigator.share
  let _draftBound = false;
  function _bindDraftButtons() {
    if (_draftBound) return;
    _draftBound = true;
    document.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-draft-cid]');
      if (!btn) return;
      const cid = btn.getAttribute('data-draft-cid');
      const name = btn.getAttribute('data-draft-name');
      if (!cid) return;
      const original = btn.innerHTML;
      btn.innerHTML = 'AI 작성 중…';
      btn.disabled = true;
      try {
        const res = await fetch(window.API + '/retention/' + cid + '/message-draft', {
          method: 'POST',
          headers: { ...window.authHeader(), 'Content-Type': 'application/json' },
          body: '{}',
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const d = await res.json();
        const msg = d.message || '';
        try { if (navigator.clipboard) await navigator.clipboard.writeText(msg); } catch (_e) { /* ignore */ }
        if (navigator.share) {
          try { await navigator.share({ text: msg, title: name + '님께' }); }
          catch (_e) { /* 사용자 취소 */ }
        }
        if (window.showToast) window.showToast('초안을 복사했어요. 카톡에 붙여넣으세요 📋');
      } catch (err) {
        if (window.showToast) window.showToast('초안 생성 실패: ' + (err.message || ''));
      } finally {
        btn.innerHTML = original;
        btn.disabled = false;
      }
    });
  }
  _bindDraftButtons();

  // ─────────────────────────────────────────────
  // Wave D2 — 1-click 일괄 초안 승인 모달
  // ─────────────────────────────────────────────
  const _bulkState = {
    items: [],        // {customer_id, name, phone, draft_text, done:bool}
    selectedIdx: -1,  // 상세 보기 중인 row
  };

  function _ensureBulkModal() {
    let wrap = document.getElementById('bulkDraftModal');
    if (wrap) return wrap;
    wrap = document.createElement('div');
    wrap.id = 'bulkDraftModal';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:10000;display:none;background:rgba(0,0,0,0.5);';
    wrap.innerHTML = `
      <div style="position:absolute;inset:auto 0 0 0;background:var(--bg,#fff);border-radius:20px 20px 0 0;max-height:92vh;display:flex;flex-direction:column;padding:16px;padding-bottom:max(16px,env(safe-area-inset-bottom));">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
          <span style="font-size:22px;">💝</span>
          <strong style="font-size:17px;">안부 문자 초안</strong>
          <span id="bulkProgress" style="margin-left:auto;font-size:12px;color:#888;font-weight:700;"></span>
          <button id="bulkCloseBtn" style="margin-left:8px;background:none;border:none;font-size:20px;cursor:pointer;" aria-label="닫기">✕</button>
        </div>
        <div style="font-size:11.5px;color:#888;margin-bottom:10px;line-height:1.5;">
          한 명씩 탭해서 문구를 확인하고 [카톡 공유]로 보내세요. 일괄 전송하지 않아요 — 원장님이 직접 승인.
        </div>
        <div id="bulkBody" style="flex:1;overflow-y:auto;"></div>
      </div>
    `;
    document.body.appendChild(wrap);
    wrap.addEventListener('click', (e) => { if (e.target === wrap) _closeBulkModal(); });
    wrap.querySelector('#bulkCloseBtn').addEventListener('click', _closeBulkModal);
    return wrap;
  }

  function _closeBulkModal() {
    const wrap = document.getElementById('bulkDraftModal');
    if (wrap) wrap.style.display = 'none';
    document.body.style.overflow = '';
    _bulkState.selectedIdx = -1;
  }

  function _renderBulkProgress() {
    const el = document.getElementById('bulkProgress');
    if (!el) return;
    const done = _bulkState.items.filter(x => x.done).length;
    el.textContent = `${done}/${_bulkState.items.length} 완료`;
  }

  function _renderBulkList() {
    const body = document.getElementById('bulkBody');
    if (!body) return;
    if (!_bulkState.items.length) {
      body.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-subtle);font-size:13px;">대상 고객이 없어요</div>';
      return;
    }
    body.innerHTML = _bulkState.items.map((it, idx) => {
      const preview = (it.draft_text || '').slice(0, 40) + ((it.draft_text || '').length > 40 ? '…' : '');
      const dim = it.done ? 'opacity:0.45;' : '';
      return `
        <div data-bulk-row="${idx}" style="padding:12px 10px;margin-bottom:8px;border:1px solid hsl(350,40%,92%);border-radius:14px;background:${it.done ? 'hsl(140,40%,97%)' : '#fff'};cursor:pointer;${dim}">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
            <strong style="font-size:13.5px;">${_esc(it.name)}</strong>
            ${it.phone ? `<span style="font-size:11px;color:var(--text-subtle);">${_esc(it.phone)}</span>` : ''}
            <span style="margin-left:auto;font-size:11px;font-weight:700;color:${it.done ? 'hsl(140,50%,40%)' : 'hsl(350,72%,60%)'};">
              ${it.done ? '완료 ✓' : '탭해서 보기 →'}
            </span>
          </div>
          <div style="font-size:12px;color:var(--text-muted);line-height:1.5;">${_esc(preview)}</div>
        </div>
      `;
    }).join('');
    // row 클릭 바인딩
    body.querySelectorAll('[data-bulk-row]').forEach(row => {
      row.addEventListener('click', () => {
        const i = parseInt(row.getAttribute('data-bulk-row'), 10);
        _showBulkDetail(i);
      });
    });
    _renderBulkProgress();
  }

  function _showBulkDetail(idx) {
    const it = _bulkState.items[idx];
    if (!it) return;
    _bulkState.selectedIdx = idx;
    const body = document.getElementById('bulkBody');
    if (!body) return;
    body.innerHTML = `
      <button id="bulkBackBtn" style="background:none;border:none;font-size:13px;color:hsl(350,72%,60%);cursor:pointer;padding:4px 0;margin-bottom:10px;">← 목록으로</button>
      <div style="padding:14px;border:1px solid hsl(350,40%,90%);border-radius:14px;background:linear-gradient(135deg,hsl(350,70%,98%),#fff);margin-bottom:12px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
          <strong style="font-size:14px;">${_esc(it.name)}</strong>
          ${it.phone ? `<span style="font-size:11px;color:#888;">${_esc(it.phone)}</span>` : ''}
          ${it.done ? `<span style="margin-left:auto;font-size:11px;font-weight:700;color:hsl(140,50%,40%);">완료 ✓</span>` : ''}
        </div>
        <div id="bulkDraftText" contenteditable="true" style="font-size:13px;line-height:1.7;color:#333;padding:12px;background:#fff;border:1px solid hsl(350,30%,94%);border-radius:10px;min-height:80px;white-space:pre-wrap;">${_esc(it.draft_text || '')}</div>
        <div style="font-size:10.5px;color:var(--text-subtle);margin-top:6px;">탭해서 문구 수정 가능</div>
      </div>
      <div style="display:flex;gap:8px;">
        <button id="bulkSkipBtn" style="flex:1;padding:12px;font-size:13px;font-weight:700;border:1px solid hsl(0,0%,85%);background:#fff;color:var(--text-muted);border-radius:14px;cursor:pointer;">
          건너뛰기
        </button>
        <button id="bulkShareBtn" style="flex:2;padding:12px;font-size:13.5px;font-weight:700;border:none;background:linear-gradient(135deg,hsl(350,80%,72%),hsl(350,72%,60%));color:#fff;border-radius:14px;cursor:pointer;">
          카톡 공유
        </button>
      </div>
    `;
    body.querySelector('#bulkBackBtn').addEventListener('click', _renderBulkList);
    body.querySelector('#bulkSkipBtn').addEventListener('click', () => {
      _bulkState.items[idx].done = true;
      _renderBulkList();
    });
    body.querySelector('#bulkShareBtn').addEventListener('click', async () => {
      const edited = (body.querySelector('#bulkDraftText')?.innerText || '').trim();
      const msg = edited || it.draft_text || '';
      if (!msg) return;
      // 클립보드 복사 (폴백)
      try { if (navigator.clipboard) await navigator.clipboard.writeText(msg); } catch (_e) { /* ignore */ }
      if (navigator.share) {
        try {
          await navigator.share({ text: msg, title: it.name + '님께' });
          _bulkState.items[idx].done = true;
          if (window.showToast) window.showToast(it.name + '님 완료 ✓');
          _renderBulkList();
          return;
        } catch (_e) {
          // 사용자가 공유 시트 취소 → 완료로 보지 않음 (그대로 둠)
          if (window.showToast) window.showToast('문구를 클립보드에 복사했어요 📋');
          return;
        }
      }
      // navigator.share 미지원 — 복사만 하고 완료 처리
      _bulkState.items[idx].done = true;
      if (window.showToast) window.showToast('클립보드에 복사 · 카톡에 붙여넣기 📋');
      _renderBulkList();
    });
  }

  async function _openBulkModal(ids) {
    _ensureBulkModal();
    const wrap = document.getElementById('bulkDraftModal');
    wrap.style.display = 'block';
    document.body.style.overflow = 'hidden';
    const body = document.getElementById('bulkBody');
    body.innerHTML = `
      <div style="padding:50px 16px;text-align:center;color:#888;font-size:13px;line-height:1.7;">
        <div style="font-size:28px;margin-bottom:10px;">🤖</div>
        AI 가 초안 쓰는 중…<br>
        <span style="font-size:11px;color:var(--text-subtle);">${ids.length}명 분 · 보통 5~15초</span>
      </div>
    `;
    _renderBulkProgress();
    try {
      const _fetch = window.safeFetch || fetch;
      const res = await _fetch(window.API + '/retention/bulk-message-draft', {
        method: 'POST',
        headers: { ...window.authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_ids: ids, tone: '친근한' }),
        timeout: 45000,
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      _bulkState.items = (data.items || []).map(x => ({ ...x, done: false }));
      if (!_bulkState.items.length) {
        body.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-subtle);font-size:13px;">초안을 만들지 못했어요. 잠시 후 다시 시도해주세요.</div>';
        return;
      }
      _renderBulkList();
    } catch (err) {
      const humanMsg = (window._humanError ? window._humanError(err) : (err.message || '오류'));
      body.innerHTML = `<div style="padding:40px 16px;text-align:center;color:#dc3545;font-size:13px;line-height:1.6;">초안 생성 실패<br><span style="font-size:11px;color:#888;">${_esc(humanMsg)}</span></div>`;
    }
  }

  // bulkDraftBtn 클릭 바인딩 (위임)
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('#bulkDraftBtn');
    if (!btn) return;
    const raw = btn.getAttribute('data-bulk-ids') || '';
    const ids = raw.split(',').map(s => parseInt(s, 10)).filter(n => Number.isFinite(n));
    if (!ids.length) return;
    _openBulkModal(ids.slice(0, 10));
  });

  // Wave D3 (2026-04-24) — 챗봇·외부 데이터 변경 감지 → 인사이트 시트 열려 있으면 재로드
  // 이탈 예측·매출 예측은 매출/예약/NPS 데이터에 전부 영향 받음
  if (typeof window !== 'undefined' && !window._insightsDataListenerInit) {
    window._insightsDataListenerInit = true;
    window.addEventListener('itdasy:data-changed', async (e) => {
      const k = (e && e.detail && e.detail.kind) || '';
      if (!k) return;
      // 인사이트에 영향 주는 kind: 매출·예약·NPS·고객·지출 전부
      const affects = ['create_revenue', 'update_revenue', 'create_booking', 'update_booking',
                       'cancel_booking', 'reschedule_booking', 'create_nps', 'create_customer',
                       'update_customer', 'create_expense'];
      if (!affects.includes(k)) return;
      const sheet = document.getElementById('insightsSheet');
      if (sheet && sheet.style.display !== 'none') {
        try { await _loadAndRender(); } catch (_err) { void _err; }
      }
    });
  }
})();
