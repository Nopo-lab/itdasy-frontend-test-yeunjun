/* 고객 AI 브리핑 카드 — P1-5
   2026-05-17 v167 · 뷰티업GPT 초고도화
   설계 문서: ~/.claude/plans/zesty-snacking-clarke.md §7

   원장님이 고객 상세를 열거나 예약 직전에 "이 분 어떤 분이었지" 1초 회상을 돕는 카드.

   API 우선순위:
     1) GET /customers/{id}/ai-brief (백엔드 신규, P1 예정) — LLM 요약 + 예측 포함
     2) 없으면 호출자가 가진 dashboard 페이로드(d)로 클라이언트 컴퓨트
     3) 그것도 없으면 GET /customers/{id}/dashboard 별도 호출 후 컴퓨트

   사용:
     CustomerAIBrief.render('cdAiBriefMount', customerId, { dashboardData?: d });

   카드 구성:
     • 한 줄 요약 (마지막 방문일 + 평균 주기 + 최근 시술 + 가격)
     • 예측 (다음 방문 예상 · 리터치 권장일)
     • 메모 (있을 때만)
     • CustomerChips 상위 3개 */
(function () {
  'use strict';

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
  }

  function _krwShort(n) {
    const v = +n || 0;
    if (v >= 10000) return (v / 10000).toFixed(v % 10000 === 0 ? 0 : 1) + '만원';
    return v.toLocaleString('ko-KR') + '원';
  }

  function _daysBetween(iso, ref) {
    if (!iso) return null;
    const a = new Date(iso).getTime();
    if (isNaN(a)) return null;
    return Math.floor(((ref || new Date()).getTime() - a) / 86400000);
  }

  function _addDays(iso, days) {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function _dateShort(iso) {
    if (!iso) return '—';
    return iso.slice(5, 10).replace('-', '/');
  }

  // 시술명별 리터치 권장 주기 (일). 없으면 평균 cycle 사용.
  const RETOUCH_DAYS = {
    '붙임머리': 35, '익스텐션': 35,
    '속눈썹': 21, '래쉬리프트': 35, '연장': 21,
    '네일': 21, '젤네일': 21,
    '반영구': 42, '눈썹': 42,
    '컷': 42, '염색': 56, '펌': 56,
  };

  function _guessRetouchDays(serviceName, fallbackDays) {
    if (!serviceName) return fallbackDays;
    const key = Object.keys(RETOUCH_DAYS).find(k => serviceName.includes(k));
    return key ? RETOUCH_DAYS[key] : fallbackDays;
  }

  // dashboard 페이로드 또는 단순 customer로부터 brief 모델 추출.
  function _computeBrief(d) {
    const c = (d && d.customer) || d || {};
    const revenues = (d && d.recent_revenues) || [];
    const last = revenues[0] || null;
    const avgWeeks = +c.avg_cycle_weeks || 0;
    const avgDays = avgWeeks > 0 ? avgWeeks * 7 : null;
    const lastVisit = c.last_visit_at || (last && last.recorded_at);
    const lastDays = _daysBetween(lastVisit);

    // 다음 방문 예상 · 리터치 권장
    const nextExpectedAt = (lastVisit && avgDays) ? _addDays(lastVisit, avgDays) : null;
    const retouchDays = _guessRetouchDays(last && last.service_name, avgDays);
    const retouchDueAt = lastVisit && retouchDays ? _addDays(lastVisit, retouchDays) : null;

    return {
      name: c.name || '',
      lastDays, lastVisit,
      avgWeeks,
      lastService: last && last.service_name,
      lastAmount: last && last.amount,
      memo: c.memo || '',
      nextExpectedAt, retouchDueAt,
    };
  }

  function _renderSummaryLine(b) {
    const parts = [];
    if (b.lastDays !== null) {
      const cycle = b.avgWeeks ? ' (평균 ' + b.avgWeeks + '주 주기)' : '';
      parts.push('마지막 방문 ' + b.lastDays + '일 전' + cycle);
    } else {
      parts.push('아직 방문 기록이 없어요');
    }
    if (b.lastService) {
      const amt = b.lastAmount ? ' ' + _krwShort(b.lastAmount) : '';
      parts.push(_esc(b.lastService) + amt);
    }
    return parts.join(' · ');
  }

  function _renderPredictionLine(b) {
    const out = [];
    if (b.nextExpectedAt) {
      out.push('<span class="cd-ai-brief__pred-chip">다음 방문 예상: ' + _dateShort(b.nextExpectedAt) + '</span>');
    }
    if (b.retouchDueAt) {
      out.push('<span class="cd-ai-brief__pred-chip">리터치 권장: ' + _dateShort(b.retouchDueAt) + '</span>');
    }
    return out.join(' ');
  }

  function _renderCard(b, customer) {
    const summary = _renderSummaryLine(b);
    const prediction = _renderPredictionLine(b);
    const memo = b.memo ? '<div class="cd-ai-brief__memo">' + _esc(b.memo.slice(0, 100)) + '</div>' : '';
    const chips = (window.CustomerChips && typeof window.CustomerChips.renderTopN === 'function')
      ? window.CustomerChips.renderTopN(customer, 3) : '';
    const chipsBlock = chips ? '<div class="cd-ai-brief__chips">' + chips + '</div>' : '';

    return ''
      + '<section class="cd-ai-brief">'
      + '  <div class="cd-ai-brief__head">'
      + '    <svg width="14" height="14" aria-hidden="true" style="vertical-align:-2px;"><use href="#ic-sparkles"/></svg>'
      + '    <strong>AI 브리핑</strong>'
      + '  </div>'
      + '  <div class="cd-ai-brief__summary">' + summary + '</div>'
      + (prediction ? '  <div class="cd-ai-brief__prediction">' + prediction + '</div>' : '')
      + memo
      + chipsBlock
      + '</section>';
  }

  function _renderSkeleton() {
    return '<section class="cd-ai-brief cd-ai-brief--loading">'
      + '<div class="cd-ai-brief__head"><strong>AI 브리핑</strong></div>'
      + '<div class="cd-ai-brief__summary" style="opacity:.4;">불러오는 중…</div>'
      + '</section>';
  }

  async function _tryServerBrief(customerId) {
    if (!window.API || !window.authHeader) return null;
    try {
      const res = await fetch(window.API + '/customers/' + encodeURIComponent(customerId) + '/ai-brief', {
        headers: window.authHeader(),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (_e) { return null; }
  }

  // 백엔드 브리핑 응답을 카드 모델로 변환. 미정 필드는 클라이언트 폴백 값으로 채움.
  function _normalizeServerBrief(server, fallbackBrief, customer) {
    if (!server || typeof server !== 'object') return null;
    const s = server.customer || customer || {};
    const p = server.prediction || {};
    return {
      name: s.name || fallbackBrief.name,
      lastDays: typeof p.days_since_visit === 'number' ? p.days_since_visit : fallbackBrief.lastDays,
      lastVisit: s.last_visit_at || fallbackBrief.lastVisit,
      avgWeeks: +s.avg_cycle_weeks || fallbackBrief.avgWeeks,
      lastService: s.last_service || fallbackBrief.lastService,
      lastAmount: s.last_amount || fallbackBrief.lastAmount,
      memo: s.memo || fallbackBrief.memo,
      nextExpectedAt: p.next_expected_at || fallbackBrief.nextExpectedAt,
      retouchDueAt: p.retouch_due_at || fallbackBrief.retouchDueAt,
    };
  }

  async function _render(containerId, customerId, opts) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = _renderSkeleton();

    const dashboardData = (opts && opts.dashboardData) || null;
    const fallbackBrief = _computeBrief(dashboardData);
    const customer = (dashboardData && dashboardData.customer) || (opts && opts.customer) || { id: customerId };

    // 백엔드 시도 — 없으면 폴백.
    const server = await _tryServerBrief(customerId);
    const brief = _normalizeServerBrief(server, fallbackBrief, customer) || fallbackBrief;

    if (!brief.name && !brief.lastVisit && !brief.memo) {
      // 정말 보여줄 게 없으면 카드 자체를 숨김.
      container.innerHTML = '';
      return;
    }
    container.innerHTML = _renderCard(brief, customer);
  }

  // 스타일 1회 주입 (전용 CSS 파일 만들지 않고 모듈 내부 보관).
  if (typeof document !== 'undefined' && !document.getElementById('cd-ai-brief-style')) {
    const st = document.createElement('style');
    st.id = 'cd-ai-brief-style';
    st.textContent = ''
      + '.cd-ai-brief{margin:0 0 14px;padding:12px 14px;'
      + 'background:linear-gradient(135deg,rgba(241,128,145,.08),rgba(167,139,250,.06));'
      + 'border:1px solid rgba(241,128,145,.20);border-radius:14px;}'
      + '.cd-ai-brief__head{display:flex;align-items:center;gap:6px;margin-bottom:8px;color:var(--brand-strong,#a04050);font-size:12px;letter-spacing:.3px;}'
      + '.cd-ai-brief__summary{font-size:13px;color:#333;line-height:1.5;}'
      + '.cd-ai-brief__prediction{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;}'
      + '.cd-ai-brief__pred-chip{display:inline-block;padding:3px 8px;'
      + 'background:rgba(255,255,255,.7);color:#666;border:1px solid rgba(0,0,0,.05);'
      + 'border-radius:999px;font-size:11px;font-weight:500;}'
      + '.cd-ai-brief__memo{margin-top:8px;padding:8px 10px;background:rgba(255,255,255,.55);'
      + 'border-left:3px solid rgba(241,128,145,.4);border-radius:6px;font-size:11px;color:#555;line-height:1.4;}'
      + '.cd-ai-brief__chips{margin-top:10px;display:flex;flex-wrap:wrap;gap:6px;}'
      + '.cd-ai-brief__chips .cust-chip{margin-left:0;}';
    document.head.appendChild(st);
  }

  window.CustomerAIBrief = { render: _render };
})();
