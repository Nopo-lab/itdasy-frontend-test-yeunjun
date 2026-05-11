/* ─────────────────────────────────────────────────────────────
   AI 킬러 위젯 (Phase 6.3 Lane F · 2026-04-21)
   쿠폰 카드 제거 (2026-04-24) → 안부 초안만 유지

   대시보드 상단에 "매일 열게 만드는" AI 위젯:
   1. 🔔 오늘 위험 신호 요약 (브리핑)
   2. ⚠️ 매출 이상 감지 (전월 대비 + AI 코멘트)
   3. 💝 안부 메시지 초안 (이탈 임박 단골)
   4. 📅 비는 슬롯 감지
   5. 📈 오늘 집중할 3가지

   전역:
     window.KillerWidgets.render(containerId)
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const API = () => window.API || '';
  const AUTH = () => (window.authHeader ? window.authHeader() : {});
  const HAS_AUTH = () => {
    try { return !!(window.authHeader && window.authHeader().Authorization); }
    catch (_e) { return false; }
  };

  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch])); }

  // [2026-04-30] SWR 캐시 추가 — 즉시 렌더 + 백그라운드 갱신
  const _BRIEF_CACHE_KEY = 'pv_cache::ai_brief';
  const _BRIEF_TTL_MS = 5 * 60 * 1000; // 5분
  function _readBriefCache() {
    try {
      const raw = sessionStorage.getItem(_BRIEF_CACHE_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (Date.now() - obj.t > _BRIEF_TTL_MS) return null;
      return obj.d;
    } catch (_e) { return null; }
  }
  function _writeBriefCache(data) {
    try { sessionStorage.setItem(_BRIEF_CACHE_KEY, JSON.stringify({ t: Date.now(), d: data })); }
    catch (_e) { /* quota — 무시 */ }
  }

  async function _fetchBrief(useCache = true) {
    if (!HAS_AUTH()) return null;
    if (useCache) {
      const cached = _readBriefCache();
      if (cached) {
        // 백그라운드 갱신 (다음 호출용) — 응답 기다리지 않음
        fetch(API() + '/assistant/brief', { headers: AUTH() })
          .then(r => r.ok ? r.json() : null)
          .then(d => d && _writeBriefCache(d))
          .catch(() => { /* ignore */ });
        return cached;
      }
    }
    try {
      const res = await fetch(API() + '/assistant/brief', { headers: AUTH() });
      if (!res.ok) return null;
      const d = await res.json();
      _writeBriefCache(d);
      return d;
    } catch (e) { return null; }
  }

  function _riskColor(pct) {
    if (pct == null) return '#888';
    if (pct <= -10) return '#D32F2F';
    if (pct >= 10) return '#2E7D32';
    return '#888';
  }

  function _arrow(pct) {
    if (pct == null) return '→';
    if (pct >= 10) return '↗';
    if (pct <= -10) return '↘';
    return '→';
  }

  function _renderWidgets(brief) {
    if (!brief) {
      return `<div style="padding:20px;color:var(--text-subtle);font-size:13px;text-align:center;">AI 위젯 데이터를 불러오지 못했어요. 잠시 후 다시 시도해주세요.</div>`;
    }
    const alertCount = brief.alert_count || 0;
    const todayCount = (brief.today_bookings || []).length;
    const atRisk = brief.at_risk || [];
    const lowStock = brief.low_stock || [];
    const birthdays = brief.birthdays_this_week || [];
    const emptySlots = brief.empty_slots || [];

    // T-330 — 아침 한 줄 요약 (가장 위)
    const thisMonth = brief.this_month_total || 0;
    const prevMonth = brief.prev_month_total || 0;
    const momPctNum = brief.mom_delta_pct;
    const momSign = momPctNum == null ? '' : (momPctNum >= 0 ? ' +' : ' ');
    const headline = `
      <div class="kw-card" style="background:linear-gradient(135deg,#1A1B26 0%,#2D1A2E 55%,var(--brand-strong) 150%);color:#fff;padding:20px 18px;border-radius:20px;margin-bottom:12px;box-shadow:0 10px 30px rgba(217,95,112,0.2);position:relative;overflow:hidden;">
        <div style="position:absolute;top:-40px;right:-40px;width:180px;height:180px;border-radius:50%;background:rgba(255,255,255,0.04);"></div>
        <div style="font-size:10.5px;letter-spacing:2.5px;opacity:0.65;font-weight:800;margin-bottom:8px;">🌅 ${_timeGreet()}</div>
        <div style="font-size:17px;line-height:1.55;font-weight:800;position:relative;z-index:1;">
          ${thisMonth > 0 ? `이번 달 <strong style="color:#FFD87A;">${_money(thisMonth)}</strong>${momPctNum != null ? ` <span style="color:${momPctNum>=0?'#86EFAC':'#FDA4AF'};font-size:13px;">(전월${momSign}${momPctNum}%)</span>` : ''}<br>` : ''}
          📅 오늘 예약 <strong>${todayCount}건</strong>${atRisk.length ? ` · ⚠️ 이탈 위험 <strong>${atRisk.length}</strong>` : ''}${birthdays.length ? ` · 🎂 생일 <strong>${birthdays.length}</strong>` : ''}
        </div>
      </div>`;

    // 1. 오늘 위험 신호
    const widget1 = `
      <div class="kw-card" style="background:linear-gradient(135deg,var(--brand),var(--brand-strong));color:#fff;padding:18px;border-radius:18px;margin-bottom:12px;box-shadow:0 6px 20px rgba(241,128,145,0.3);">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
          <div style="font-size:11px;letter-spacing:2px;opacity:0.85;font-weight:800;">🔔 오늘 한눈에</div>
          ${alertCount > 0 ? `<div style="background:rgba(255,255,255,0.25);padding:3px 10px;border-radius:100px;font-size:11px;font-weight:800;">알림 ${alertCount}</div>` : ''}
        </div>
        <div style="font-size:14.5px;line-height:1.75;font-weight:700;">
          📅 오늘 예약 <strong>${todayCount}건</strong>${atRisk.length ? ` · 중 이탈 위험 <strong>${atRisk.filter(a => (brief.today_bookings || []).some(b => b.customer_name === a.name)).length}명</strong>` : ''}<br>
          🎂 이번 주 생일 <strong>${birthdays.length}명</strong> · 📦 재고 부족 <strong>${lowStock.length}종</strong>
        </div>
        <div style="margin-top:12px;font-size:11.5px;opacity:0.85;">${atRisk.length ? `이탈 위험: ${atRisk.slice(0,3).map(a=>_esc(a.name)).join(', ')}${atRisk.length>3 ? ' 외' : ''}` : '오늘 큰 이슈 없어요'}</div>
      </div>`;

    // 2. 매출 이상 감지
    const momPct = brief.mom_delta_pct;
    const widget2 = `
      <div class="kw-card" style="background:#fff;padding:16px;border-radius:16px;margin-bottom:10px;box-shadow:0 2px 10px rgba(0,0,0,0.04);">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
          <div style="font-size:11px;letter-spacing:1.5px;color:var(--text-muted);font-weight:800;">⚠️ 매출 흐름</div>
          ${momPct != null ? `<div style="color:${_riskColor(momPct)};font-weight:900;font-size:16px;">${_arrow(momPct)} ${momPct > 0 ? '+' : ''}${momPct}%</div>` : ''}
        </div>
        <div style="font-size:13px;color:#222;line-height:1.5;">
          이번달 <strong>${(brief.this_month_total || 0).toLocaleString()}원</strong> · 전월 <strong>${(brief.prev_month_total || 0).toLocaleString()}원</strong>
        </div>
        <button data-kw-insight style="margin-top:10px;padding:8px 14px;background:#f5f5f5;border:none;border-radius:8px;font-size:12px;color:#555;font-weight:700;cursor:pointer;">🤖 AI 코멘트 받기</button>
        <div id="kw-insight-result" style="margin-top:10px;font-size:12px;color:#555;line-height:1.55;display:none;"></div>
      </div>`;

    // 3. 안부 초안 (쿠폰 기능 제거 2026-04-24)
    const widget3 = atRisk.length ? `
      <div class="kw-card" style="background:linear-gradient(135deg,#FFF4E6,#FFE8D6);padding:16px;border-radius:16px;margin-bottom:10px;border:1px solid rgba(255,138,92,0.2);">
        <div style="font-size:11px;letter-spacing:1.5px;color:#E68A00;font-weight:800;margin-bottom:8px;">💝 이탈 위험 단골 ${atRisk.length}명</div>
        <div style="font-size:12.5px;color:#333;line-height:1.5;margin-bottom:10px;">
          ${atRisk.slice(0,3).map(a => `<strong>${_esc(a.name)}</strong>(${a.days_since_last}일 전)`).join(' · ')}
        </div>
        <button data-kw-draft style="padding:9px 14px;background:linear-gradient(135deg,#FF8A5C,#FFB347);color:#fff;border:none;border-radius:10px;font-size:12.5px;font-weight:800;cursor:pointer;box-shadow:0 2px 8px rgba(255,138,92,0.3);">
          📋 안부 문자 초안 만들기
        </button>
      </div>` : '';

    // 4. 비는 슬롯
    const widget4 = emptySlots.length ? `
      <div class="kw-card" style="background:#fff;padding:14px 16px;border-radius:14px;margin-bottom:10px;box-shadow:0 1px 4px rgba(0,0,0,0.04);display:flex;align-items:center;gap:10px;">
        <div style="font-size:20px;">📅</div>
        <div style="flex:1;">
          <div style="font-size:11px;color:#888;font-weight:700;margin-bottom:2px;">오늘 비는 슬롯</div>
          <div style="font-size:13px;color:#222;">${emptySlots.map(s => `${s.from}~${s.to} (${s.gap_min}분)`).join(' · ')}</div>
        </div>
      </div>` : '';

    // 5. 오늘 집중
    const widget5 = `
      <div class="kw-card" style="background:linear-gradient(135deg,#E8F4F1,#D1EDE5);padding:14px 16px;border-radius:14px;margin-bottom:12px;">
        <div style="font-size:11px;letter-spacing:1.5px;color:#2B8C7E;font-weight:800;margin-bottom:6px;">📈 AI 추천</div>
        <button data-kw-focus style="padding:9px 14px;background:#fff;border:1px solid #2B8C7E;border-radius:10px;font-size:12.5px;color:#2B8C7E;font-weight:800;cursor:pointer;">
          🤖 오늘 집중할 3가지 받기
        </button>
        <div id="kw-focus-result" style="margin-top:10px;font-size:12.5px;color:#333;line-height:1.55;display:none;"></div>
      </div>`;

    // T-333 — 매출 목표 게이지
    const goal = brief.monthly_goal || 0;
    const progress = goal > 0 ? Math.min(100, Math.round(thisMonth / goal * 100)) : 0;
    const widgetGoal = goal > 0 ? `
      <div class="kw-card" style="background:#fff;padding:16px;border-radius:16px;margin-bottom:10px;box-shadow:0 2px 10px rgba(0,0,0,0.04);">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
          <div style="font-size:11px;letter-spacing:1.5px;color:var(--text-muted);font-weight:800;">🎯 이번 달 목표</div>
          <div style="font-weight:900;font-size:14px;color:#222;">${progress}%</div>
        </div>
        <div style="height:10px;background:#f0f0f0;border-radius:100px;overflow:hidden;position:relative;">
          <div style="height:100%;background:linear-gradient(90deg,var(--brand),#FFB347);width:${progress}%;border-radius:100px;transition:width 1.2s cubic-bezier(0.2,0.9,0.3,1);box-shadow:0 0 10px rgba(241,128,145,0.45);"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11.5px;color:var(--text-muted);margin-top:8px;">
          <span>${_money(thisMonth)}</span>
          <span>${_money(goal)}</span>
        </div>
      </div>` : `
      <div class="kw-card" style="background:#FAFAFA;padding:14px 16px;border-radius:14px;margin-bottom:10px;border:1px dashed #ddd;text-align:center;">
        <div style="font-size:12px;color:#888;margin-bottom:6px;">🎯 이번 달 매출 목표를 설정해 보세요</div>
        <button data-kw-setgoal style="padding:6px 14px;background:var(--brand);color:#fff;border:none;border-radius:8px;font-size:11.5px;font-weight:800;cursor:pointer;">목표 설정</button>
      </div>`;

    // T-331 — 아낀 시간·돈 카운터
    const savedMin = _computeSavedMinutes(brief);
    const widgetSaved = `
      <div class="kw-card" style="background:linear-gradient(135deg,#E8F4F1,#D1EDE5);padding:14px 16px;border-radius:14px;margin-bottom:10px;display:flex;align-items:center;gap:12px;">
        <div style="font-size:24px;">⏱</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:11px;color:#2B8C7E;font-weight:800;letter-spacing:1px;margin-bottom:3px;">잇데이가 아껴드린</div>
          <div style="font-size:15px;color:#1B5E56;font-weight:900;line-height:1.35;">
            ⏱ ${Math.round(savedMin/60)}시간 · 💰 ${_money(brief.total_fee_tracked || 0)} 수수료 투명화
          </div>
        </div>
      </div>`;

    // T-336 — 연속 기록 뱃지
    const streakHtml = _renderStreak();

    return headline + widget1 + widgetGoal + widgetSaved + streakHtml + widget2 + widget3 + widget4 + widget5;
  }

  function _money(n) { return (n || 0).toLocaleString('ko-KR') + '원'; }
  function _timeGreet() {
    const h = new Date().getHours();
    return h < 6 ? '새벽 브리핑' : h < 12 ? '오늘의 브리핑' : h < 18 ? '오후 브리핑' : h < 22 ? '저녁 정리' : '밤 브리핑';
  }
  function _computeSavedMinutes(brief) {
    // 휴리스틱: 매출/예약 건수당 2분 절약 추정
    const m = brief.this_month_total ? 2 : 0;  // placeholder; 실제로는 revenue count 기반
    return (brief.alert_count || 0) * 3 + m * 30;
  }

  function _renderStreak() {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const logRaw = localStorage.getItem('itdasy_access_log') || '[]';
      let log = JSON.parse(logRaw);
      if (!Array.isArray(log)) log = [];
      if (!log.includes(today)) log.push(today);
      log = log.slice(-60);
      localStorage.setItem('itdasy_access_log', JSON.stringify(log));
      let streak = 0;
      for (let i = 0; i < 60; i++) {
        const d = new Date(); d.setDate(d.getDate() - i);
        if (log.includes(d.toISOString().slice(0, 10))) streak++;
        else if (i > 0) break;
      }
      if (streak < 2) return '';
      const emoji = streak >= 30 ? '🏆' : streak >= 14 ? '💎' : streak >= 7 ? '🔥' : '✨';
      return `
        <div class="kw-card" style="background:linear-gradient(135deg,#FFF4E6,#FFE8D6);padding:10px 14px;border-radius:12px;margin-bottom:10px;display:flex;align-items:center;gap:10px;">
          <div style="font-size:20px;">${emoji}</div>
          <div style="flex:1;font-size:13px;color:#7A3E00;font-weight:800;">${streak}일 연속 접속 중!${streak >= 7 ? ' 꾸준히 잘하고 계세요 💕' : ''}</div>
        </div>`;
    } catch (_) { return ''; }
  }

  async function _askAI(question) {
    try {
      const res = await fetch(API() + '/assistant/ask', {
        method: 'POST',
        headers: { ...AUTH(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) { return null; }
  }

  function _bindWidgets() {
    document.querySelectorAll('[data-kw-insight]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const out = document.getElementById('kw-insight-result');
        if (!out) return;
        btn.disabled = true; btn.textContent = '분석 중…';
        const d = await _askAI('이번 달 매출 전월 대비 어때? 왜 그래? 3문장 이내로 알려줘');
        out.style.display = 'block';
        out.textContent = (d && d.answer) || '분석 실패';
        btn.disabled = false; btn.textContent = '🤖 AI 코멘트 받기';
      });
    });
    document.querySelectorAll('[data-kw-draft]').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true; btn.textContent = '초안 만드는 중…';
        // 백엔드 bulk API로 고객별 개인화 초안 생성 시도
        let bulkDrafts = null;
        try {
          const brief = await _fetchBrief();
          const atRisk = brief?.at_risk || [];
          if (atRisk.length > 0) {
            // 고객 ID가 있으면 bulk API 사용
            const ids = atRisk.slice(0, 5).map(a => a.customer_id).filter(Boolean);
            if (ids.length > 0) {
              const res = await fetch(API() + '/retention/bulk-message-draft', {
                method: 'POST',
                headers: { ...AUTH(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ customer_ids: ids, tone: '친근한' }),
              });
              if (res.ok) {
                const data = await res.json();
                bulkDrafts = data.items || [];
              }
            }
          }
        } catch (e) { console.warn('[kw] bulk draft 실패:', e); }

        // bulk API 실패 시 기존 펴백 (AI 프롬프트 개선)
        if (!bulkDrafts || bulkDrafts.length === 0) {
          const d = await _askAI('이탈 위험 단골 3명에게 보낼 안부 문자 초안을 써줘.\n\n규칙:\n- 핵심 메시지(안부 인사, 재방문 유도)는 모든 고객 동일\n- 고객별로 OOO고객님 이름, 마지막 시술 내용, 마지막 방문 시기만 달라지게\n- 각 메시지 80자 이상 200자 이내\n- 빈 줄 없이 고객별로 나눠서 써줘\n- 이모지 1~2개, 부담 없는 톤');
          btn.disabled = false; btn.textContent = '📋 안부 문자 초안 만들기';
          if (!d || !d.answer) { if (window.showToast) window.showToast('초안 생성 실패'); return; }
          _showSmsDraftModal(d.answer, null);
          return;
        }

        btn.disabled = false; btn.textContent = '📋 안부 문자 초안 만들기';
        _showSmsDraftModal(null, bulkDrafts);
      });
    });
    document.querySelectorAll('[data-kw-setgoal]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const v = prompt('이번 달 매출 목표 (원, 숫자만 — 예: 5000000)', '5000000');
        if (!v) return;
        const n = parseInt(String(v).replace(/[^0-9]/g, ''));
        if (!n || n <= 0) return;
        try {
          const res = await fetch(API() + '/shop/settings', {
            method: 'PUT',
            headers: { ...AUTH(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ monthly_goal: n }),
          });
          if (!res.ok) throw new Error('저장 실패');
          if (window.showToast) window.showToast('✅ 목표 저장됨');
          if (typeof render === 'function') render('dashKiller');
        } catch (e) { if (window.showToast) window.showToast('실패: ' + (window._humanError ? window._humanError(e) : e.message)); }
      });
    });
    document.querySelectorAll('[data-kw-focus]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const out = document.getElementById('kw-focus-result');
        if (!out) return;
        btn.disabled = true; btn.textContent = '찾는 중…';
        const d = await _askAI('오늘 집중해야 할 3가지 행동을 bullet 으로 간단히 알려줘. 근거는 한 줄씩만.');
        out.style.display = 'block';
        out.textContent = (d && d.answer) || '분석 실패';
        btn.disabled = false; btn.textContent = '🤖 오늘 집중할 3가지 받기';
      });
    });
  }

  // SMS 프리필 모달 — 원장님이 직접 기본 메시지 앱에서 발송
  async function _getAtRiskPhones() {
    if (!HAS_AUTH()) return [];
    try {
      const brief = await _fetchBrief();
      const atRiskNames = (brief?.at_risk || []).map(a => a.name);
      const res = await fetch(API() + '/customers', { headers: AUTH() });
      if (!res.ok) return [];
      const { items = [] } = await res.json();
      return items.filter(c => atRiskNames.includes(c.name) && c.phone)
        .map(c => ({ name: c.name, phone: c.phone }));
    } catch (e) { return []; }
  }

  function _showSmsDraftModal(draftText, bulkDrafts) {
    const id = 'kw-sms-overlay';
    const existing = document.getElementById(id);
    if (existing) existing.remove();
    const o = document.createElement('div');
    o.id = id;
    o.style.cssText = `position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.72);display:flex;align-items:center;justify-content:center;padding:16px;animation:pvFadeIn 0.2s ease;`;

    const hasBulk = bulkDrafts && bulkDrafts.length > 0;

    o.innerHTML = `
      <div style="width:100%;max-width:420px;background:#fff;border-radius:20px;padding:20px;box-shadow:0 20px 60px rgba(0,0,0,0.3);max-height:85vh;overflow-y:auto;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
          <div style="font-size:15px;font-weight:900;">📋 안부 문자 초안</div>
          <button id="kw-sms-close" style="width:30px;height:30px;border:none;border-radius:10px;background:#eee;cursor:pointer;">✕</button>
        </div>
        ${hasBulk ? `
          <div style="font-size:11.5px;color:#888;margin-bottom:12px;line-height:1.5;">
            💡 <strong>고객별 맞춤 초안</strong>이 준비됐어요. 각 고객 이름과 시술 정보에 맞게 조금씩 다르게 만들었어요.
          </div>
          <div id="kw-bulk-drafts" style="display:flex;flex-direction:column;gap:10px;"></div>
        ` : `
          <textarea id="kw-sms-text" style="width:100%;min-height:140px;padding:12px;border:1px solid #ddd;border-radius:10px;font-size:13px;font-family:inherit;resize:vertical;line-height:1.55;">${(draftText || '').replace(/</g,'&lt;')}</textarea>
        `}
        <div style="margin-top:10px;font-size:11.5px;color:#888;line-height:1.5;">
          💡 <strong>발송자는 원장님 본인</strong>입니다. 버튼 탭 → 기본 메시지 앱이 열리고 내용이 채워져요. 원장님이 보낼지 선택하세요.
        </div>
        ${!hasBulk ? `
          <div id="kw-sms-list" style="margin-top:14px;max-height:240px;overflow:auto;"></div>
          <div style="display:flex;gap:8px;margin-top:10px;">
            <button id="kw-sms-copy" style="flex:1;padding:10px;border:1px solid #eee;border-radius:10px;background:#fff;font-weight:700;cursor:pointer;font-size:12.5px;">📄 전체 복사</button>
            <button id="kw-sms-cancel" style="padding:10px 14px;border:1px solid #eee;border-radius:10px;background:#fafafa;cursor:pointer;font-size:12.5px;">닫기</button>
          </div>
        ` : `
          <div style="display:flex;gap:8px;margin-top:14px;">
            <button id="kw-sms-copyall" style="flex:1;padding:10px;border:1px solid #eee;border-radius:10px;background:#fff;font-weight:700;cursor:pointer;font-size:12.5px;">📄 전체 복사</button>
            <button id="kw-sms-cancel" style="padding:10px 14px;border:1px solid #eee;border-radius:10px;background:#fafafa;cursor:pointer;font-size:12.5px;">닫기</button>
          </div>
        `}
      </div>
    `;
    document.body.appendChild(o);
    o.addEventListener('click', (e) => { if (e.target === o) o.remove(); });
    o.querySelector('#kw-sms-close').addEventListener('click', () => o.remove());
    o.querySelector('#kw-sms-cancel').addEventListener('click', () => o.remove());

    // 고객별 bulk 초안 모드
    if (hasBulk) {
      const container = o.querySelector('#kw-bulk-drafts');
      bulkDrafts.forEach(item => {
        const card = document.createElement('div');
        card.style.cssText = 'padding:14px;border:1px solid #F9D6DC;border-radius:14px;background:#FEF4F5;';
        card.innerHTML = `
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
            <strong style="font-size:14px;flex:1;">${_esc(item.name)}</strong>
            ${item.phone ? `<span style="font-size:11px;color:#888;">${_esc(item.phone)}</span>` : '<span style="font-size:11px;color:#ccc;">연락처 없음</span>'}
          </div>
          <textarea class="kw-draft-text" style="width:100%;min-height:80px;padding:10px;border:1px solid #eee;border-radius:8px;font-size:12.5px;font-family:inherit;resize:vertical;line-height:1.55;">${_esc(item.draft_text || '')}</textarea>
          <div style="display:flex;gap:6px;margin-top:8px;">
            <button class="kw-draft-copy" style="flex:1;padding:8px;border:1px solid #eee;border-radius:8px;background:#fff;font-size:11.5px;cursor:pointer;font-weight:700;">📄 복사</button>
            ${item.phone ? `<button class="kw-draft-sms" data-phone="${_esc(item.phone)}" style="flex:1;padding:8px;background:linear-gradient(135deg,var(--brand),#E96A7E);color:#fff;border:none;border-radius:8px;font-size:11.5px;cursor:pointer;font-weight:700;">📨 문자 열기</button>` : ''}
          </div>
        `;
        container.appendChild(card);

        card.querySelector('.kw-draft-copy').addEventListener('click', async () => {
          try {
            const txt = card.querySelector('.kw-draft-text').value;
            await navigator.clipboard.writeText(txt);
            if (window.showToast) window.showToast(`✅ ${item.name}님 초안 복사됨`);
          } catch (e) { /* ignore */ }
        });
        card.querySelector('.kw-draft-sms')?.addEventListener('click', () => {
          const phone = item.phone;
          const msg = encodeURIComponent(card.querySelector('.kw-draft-text').value);
          const ua = navigator.userAgent;
          const url = /iPhone|iPad|iOS/.test(ua) ? `sms:${phone}&body=${msg}` : `sms:${phone}?body=${msg}`;
          window.location.href = url;
        });
      });

      o.querySelector('#kw-sms-copyall')?.addEventListener('click', async () => {
        try {
          const all = bulkDrafts.map(d => `[받는 사람: ${d.name}]\n${d.draft_text}`).join('\n\n---\n\n');
          await navigator.clipboard.writeText(all);
          if (window.showToast) window.showToast('✅ 전체 초안 복사됨');
        } catch (e) { /* ignore */ }
      });
      return;
    }

    // 전체 복사 (기존 단일 초안 모드)
    o.querySelector('#kw-sms-copy')?.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(document.getElementById('kw-sms-text').value); if (window.showToast) window.showToast('✅ 복사됨'); } catch(e) { /* ignore */ }
    });

    // 대상 고객 리스트 로드 → 각 전화번호로 SMS 링크 생성
    _getAtRiskPhones().then(phones => {
      const list = o.querySelector('#kw-sms-list');
      if (!list) return;
      if (!phones.length) {
        list.innerHTML = `<div style="padding:14px;text-align:center;font-size:12px;color:var(--text-subtle);">전화번호 등록된 이탈 위험 고객이 없어요. 전체 복사 후 직접 보내주세요.</div>`;
        return;
      }
      list.innerHTML = `<div style="font-size:11px;color:#888;margin-bottom:8px;font-weight:700;">대상 ${phones.length}명 — 각 버튼 탭 시 해당 번호로 문자 열립니다</div>` +
        phones.map(p => `
          <button data-kw-sms-to="${p.phone}" style="display:flex;align-items:center;gap:8px;width:100%;margin-bottom:6px;padding:10px 12px;background:#FEF4F5;border:1px solid #F9D6DC;border-radius:10px;cursor:pointer;font-size:12.5px;color:#333;text-align:left;">
            <span style="font-weight:800;flex:1;">${p.name}</span>
            <span style="color:#888;font-size:11px;">${p.phone}</span>
            <span style="color:var(--brand-strong);font-weight:800;">📨 문자 열기</span>
          </button>`).join('');
      list.querySelectorAll('[data-kw-sms-to]').forEach(b => {
        b.addEventListener('click', () => {
          const phone = b.getAttribute('data-kw-sms-to');
          const msg = encodeURIComponent(document.getElementById('kw-sms-text').value);
          const ua = navigator.userAgent;
          const url = /iPhone|iPad|iOS/.test(ua) ? `sms:${phone}&body=${msg}` : `sms:${phone}?body=${msg}`;
          window.location.href = url;
        });
      });
    });
  }

  const ORDER_KEY = 'itdasy_widget_order_v1';
  function _loadOrder() { try { return JSON.parse(localStorage.getItem(ORDER_KEY) || '[]'); } catch(e){ return []; } }
  function _saveOrder(arr) { try { localStorage.setItem(ORDER_KEY, JSON.stringify(arr)); } catch(e){ /* ignore */ } }

  function _applyOrder(container) {
    const order = _loadOrder();
    if (!order.length) return;
    const children = Array.from(container.querySelectorAll('.kw-card'));
    const keyed = {};
    children.forEach((c, i) => { keyed[c.dataset.widget || String(i)] = c; });
    order.forEach(k => { if (keyed[k]) container.appendChild(keyed[k]); });
  }

  function _enableDrag(container) {
    if (!container || container.dataset.dragBound) return;
    container.dataset.dragBound = '1';
    let dragEl = null;
    container.querySelectorAll('.kw-card').forEach((el, idx) => {
      const key = `w${idx}`;
      el.dataset.widget = key;
      el.setAttribute('draggable', 'true');
      el.addEventListener('dragstart', (e) => {
        dragEl = el; el.style.opacity = '0.5';
        try { e.dataTransfer.effectAllowed = 'move'; } catch(_){ /* ignore */ }
      });
      el.addEventListener('dragend', () => {
        if (dragEl) dragEl.style.opacity = '';
        dragEl = null;
        // 저장
        const order = Array.from(container.querySelectorAll('.kw-card')).map(c => c.dataset.widget);
        _saveOrder(order);
      });
      el.addEventListener('dragover', (e) => { e.preventDefault(); });
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        if (!dragEl || dragEl === el) return;
        const rect = el.getBoundingClientRect();
        const before = (e.clientY - rect.top) < rect.height / 2;
        container.insertBefore(dragEl, before ? el : el.nextSibling);
      });
    });
  }

  // 마지막 render 컨테이너들 — data-changed 시 즉시 재렌더용
  const _lastRendered = { full: null, row: null };

  async function render(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    _lastRendered.full = containerId;
    el.innerHTML = `<div style="padding:16px 0;color:var(--text-subtle);font-size:12px;">AI 브리핑 불러오는 중…</div>`;
    const brief = await _fetchBrief();
    el.innerHTML = _renderWidgets(brief);
    _bindWidgets();
    _applyOrder(el);
    _enableDrag(el);
  }

  // P1 — 홈 탭 가로 스크롤 카드 5종
  function _rowCard(icCls, icSvg, tag, tagCls, t, s, cta) {
    return `<button class="kw" type="button">
      <div class="kw-top">
        <div class="kw-ic ${icCls}">${icSvg}</div>
        <span class="kw-tag ${tagCls}">${_esc(tag)}</span>
      </div>
      <p class="kw-t">${_esc(t)}</p>
      <p class="kw-s">${_esc(s)}</p>
      <div class="kw-foot"><span>${_esc(cta)}</span><i class="ph-duotone ph-caret-right" style="font-size:12px" aria-hidden="true"></i></div>
    </button>`;
  }

  function _buildRowCards(brief) {
    if (!brief) {
      return `<div style="padding:8px 4px;color:var(--text-subtle);font-size:12px;">데이터를 불러오지 못했어요</div>`;
    }
    const atRisk = brief.at_risk || [];
    const momPct = brief.mom_delta_pct;
    const emptySlots = brief.empty_slots || [];
    const alertSvg = `<i class="ph-duotone ph-warning" style="font-size:18px" aria-hidden="true"></i>`;
    const trendSvg = `<i class="ph-duotone ph-trend-up" style="font-size:18px" aria-hidden="true"></i>`;
    const clockSvg = `<i class="ph-duotone ph-clock" style="font-size:18px" aria-hidden="true"></i>`;
    const focusSvg = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`;

    const c1 = _rowCard('warn', alertSvg, '위험', 'warn',
      atRisk.length ? `이탈 임박 ${atRisk.length}명` : '이탈 위험 없음',
      atRisk.length ? atRisk.slice(0, 2).map(a => _esc(a.name)).join(', ') + (atRisk.length > 2 ? ' 외' : '') : '모든 고객 방문 정상이에요',
      '지금 보내기');
    const c2 = _rowCard(momPct != null && momPct >= 10 ? 'ok' : '', trendSvg,
      '매출', momPct != null && momPct >= 10 ? 'ok' : '',
      momPct != null ? `이번 주 매출 ${momPct >= 0 ? '+' : ''}${momPct}%` : '매출 집계 중',
      brief.this_month_total ? (brief.this_month_total).toLocaleString('ko-KR') + '원 누적' : '데이터 없음',
      '포스트 만들기');
    // 쿠폰 카드 c3 제거 (2026-04-24)
    const c4 = _rowCard('', clockSvg, '빈슬롯', '',
      emptySlots.length ? `${emptySlots[0].from || '—'}~${emptySlots[0].to || '—'} 비어요` : '빈 슬롯 없음',
      emptySlots.length ? `${emptySlots.length}개 슬롯 · 단골에게 알려봐요` : '오늘 일정이 꽉 찼어요',
      '메시지 보내기');
    const c5 = _rowCard('', focusSvg, '집중', '',
      '오늘 꼭 할 3가지',
      '캡션 만들기 · 예약 확인 · 재료 체크',
      'AI에게 묻기');

    return c1 + c2 + c4 + c5;
  }

  async function renderRow(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    _lastRendered.row = containerId;
    const brief = await _fetchBrief();
    el.innerHTML = _buildRowCards(brief);
    if (window.renderHomeHeroCard) window.renderHomeHeroCard(brief);
  }

  window.KillerWidgets = { render, renderRow };

  // [2026-04-26] 매출/예약/재고 추가 시 brief 재페치 → 이번달 누적·MoM 즉시 반영
  if (typeof window !== 'undefined' && !window._killerWidgetsDataListenerInit) {
    window._killerWidgetsDataListenerInit = true;
    window.addEventListener('itdasy:data-changed', async () => {
      // 홈 탭이 활성일 때만 재렌더 (불필요 fetch 방지)
      const homeTab = document.getElementById('tab-home');
      if (!homeTab || !homeTab.classList.contains('active')) return;
      try {
        if (_lastRendered.row) await renderRow(_lastRendered.row);
        if (_lastRendered.full) await render(_lastRendered.full);
      } catch (_e) { void _e; }
    });
  }
})();
