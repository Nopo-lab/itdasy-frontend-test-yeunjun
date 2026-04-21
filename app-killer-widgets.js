/* ─────────────────────────────────────────────────────────────
   AI 킬러 위젯 (Phase 6.3 Lane F · 2026-04-21)

   대시보드 상단에 "매일 열게 만드는" AI 위젯 5종:
   1. 🔔 오늘 위험 신호 요약 (브리핑)
   2. ⚠️ 매출 이상 감지 (전월 대비 + AI 코멘트)
   3. 💝 쿠폰/안부 메시지 초안 생성
   4. 📅 비는 슬롯 감지
   5. 📈 오늘 집중할 3가지

   전역:
     window.KillerWidgets.render(containerId)
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const API = () => window.API || '';
  const AUTH = () => (window.authHeader ? window.authHeader() : {});

  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch])); }

  async function _fetchBrief() {
    try {
      const res = await fetch(API() + '/assistant/brief', { headers: AUTH() });
      if (!res.ok) return null;
      return await res.json();
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
      return `<div style="padding:20px;color:#999;font-size:13px;text-align:center;">AI 위젯 데이터를 불러오지 못했어요. 잠시 후 다시 시도해주세요.</div>`;
    }
    const alertCount = brief.alert_count || 0;
    const todayCount = (brief.today_bookings || []).length;
    const atRisk = brief.at_risk || [];
    const lowStock = brief.low_stock || [];
    const birthdays = brief.birthdays_this_week || [];
    const emptySlots = brief.empty_slots || [];

    // 1. 오늘 위험 신호
    const widget1 = `
      <div class="kw-card" style="background:linear-gradient(135deg,#F18091,#D95F70);color:#fff;padding:18px;border-radius:18px;margin-bottom:12px;box-shadow:0 6px 20px rgba(241,128,145,0.3);">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
          <div style="font-size:11px;letter-spacing:2px;opacity:0.85;font-weight:800;">🔔 오늘 한눈에</div>
          ${alertCount > 0 ? `<div style="background:rgba(255,255,255,0.25);padding:3px 10px;border-radius:100px;font-size:11px;font-weight:800;">알림 ${alertCount}</div>` : ''}
        </div>
        <div style="font-size:14.5px;line-height:1.75;font-weight:700;">
          📅 오늘 예약 <strong>${todayCount}건</strong>${atRisk.length ? ` · 중 이탈 위험 <strong>${atRisk.filter(a => (brief.today_bookings || []).some(b => b.customer_name === a.name)).length}명</strong>` : ''}<br>
          🎂 이번 주 생일 <strong>${birthdays.length}명</strong> · 📦 재고 부족 <strong>${lowStock.length}종</strong>
        </div>
        <div style="margin-top:12px;font-size:11.5px;opacity:0.85;">${atRisk.length ? `이탈 위험: ${atRisk.slice(0,3).map(a=>_esc(a.name)).join(', ')}${atRisk.length>3 ? ' 외' : ''}` : '오늘 큰 이슈 없어요 ✨'}</div>
      </div>`;

    // 2. 매출 이상 감지
    const momPct = brief.mom_delta_pct;
    const widget2 = `
      <div class="kw-card" style="background:#fff;padding:16px;border-radius:16px;margin-bottom:10px;box-shadow:0 2px 10px rgba(0,0,0,0.04);">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
          <div style="font-size:11px;letter-spacing:1.5px;color:#666;font-weight:800;">⚠️ 매출 흐름</div>
          ${momPct != null ? `<div style="color:${_riskColor(momPct)};font-weight:900;font-size:16px;">${_arrow(momPct)} ${momPct > 0 ? '+' : ''}${momPct}%</div>` : ''}
        </div>
        <div style="font-size:13px;color:#222;line-height:1.5;">
          이번달 <strong>${(brief.this_month_total || 0).toLocaleString()}원</strong> · 전월 <strong>${(brief.prev_month_total || 0).toLocaleString()}원</strong>
        </div>
        <button data-kw-insight style="margin-top:10px;padding:8px 14px;background:#f5f5f5;border:none;border-radius:8px;font-size:12px;color:#555;font-weight:700;cursor:pointer;">🤖 AI 코멘트 받기</button>
        <div id="kw-insight-result" style="margin-top:10px;font-size:12px;color:#555;line-height:1.55;display:none;"></div>
      </div>`;

    // 3. 쿠폰/안부 초안
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

    return widget1 + widget2 + widget3 + widget4 + widget5;
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
        const d = await _askAI('이탈 위험 단골 3명에게 보낼 안부 문자 초안 써줘. 단순하고 부담없게.');
        btn.disabled = false; btn.textContent = '📋 안부 문자 초안 만들기';
        if (d && d.answer) {
          if (navigator.clipboard) {
            try { await navigator.clipboard.writeText(d.answer); if (window.showToast) window.showToast('✅ 초안 복사됨 — 카톡에 붙여넣으세요'); } catch(e) {}
          }
          alert('초안:\n\n' + d.answer);
        } else {
          if (window.showToast) window.showToast('초안 생성 실패');
        }
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

  async function render(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = `<div style="padding:16px 0;color:#aaa;font-size:12px;">AI 브리핑 불러오는 중…</div>`;
    const brief = await _fetchBrief();
    el.innerHTML = _renderWidgets(brief);
    _bindWidgets();
  }

  window.KillerWidgets = { render };
})();
