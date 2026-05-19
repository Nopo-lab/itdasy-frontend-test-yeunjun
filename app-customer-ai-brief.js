/* 고객 AI 브리핑 카드 — P1-5
   2026-05-18 v168 · 캐시 + dedupe + 수동 재분석 (AI 과호출 차단)
   설계 문서: ~/.claude/plans/zesty-snacking-clarke.md §7

   원장님이 고객 상세를 열거나 예약 직전에 "이 분 어떤 분이었지" 1초 회상을 돕는 카드.

   호출 전략 (비용 방어):
     1) sessionStorage 캐시 즉시 표시 (TTL 30분)
     2) sourceFingerprint 일치하면 네트워크 호출 0
     3) fingerprint 다르면 stale 표시 + 백그라운드 fetch (자동 X)
     4) "다시 분석" 버튼 → force=1 강제 재호출 (LLM 재생성)
     5) 같은 customer_id 동시 호출 → in-flight Promise 공유

   API 우선순위:
     1) GET /customers/{id}/ai-brief — LLM 요약 + 예측 포함
     2) 없으면 호출자가 가진 dashboard 페이로드(d)로 클라이언트 컴퓨트
     3) 그것도 없으면 GET /customers/{id}/dashboard 별도 호출 후 컴퓨트

   사용:
     CustomerAIBrief.render('cdAiBriefMount', customerId, { dashboardData?: d });

   카드 구성:
     • 한 줄 요약 (마지막 방문일 + 평균 주기 + 최근 시술 + 가격)
     • 예측 (다음 방문 예상 · 리터치 권장일)
     • 메모 (있을 때만)
     • CustomerChips 상위 3개
     • 우측 상단 ⟳ 수동 재분석 버튼 (stale 시 "정보 업데이트됨" 라벨 동반) */
(function () {
  'use strict';

  // ───────── 캐시 / dedupe 인프라 ─────────
  const TTL = 30 * 60 * 1000; // 30분
  const SS_KEY = (id) => 'aibrief_v1::' + id;
  const _inFlight = new Map();

  function _cacheGet(id) {
    try {
      if (typeof sessionStorage === 'undefined') return null;
      const raw = sessionStorage.getItem(SS_KEY(id));
      if (!raw) return null;
      const o = JSON.parse(raw);
      if (!o || (Date.now() - (+o.cachedAt || 0)) > TTL) return null;
      return o;
    } catch (_e) { return null; }
  }

  function _cacheSet(id, payload, fp) {
    try {
      if (typeof sessionStorage === 'undefined') return;
      sessionStorage.setItem(SS_KEY(id), JSON.stringify({
        payload: payload,
        sourceFingerprint: fp,
        cachedAt: Date.now(),
      }));
    } catch (_e) { void _e; }
  }

  // dashboard 페이로드로 sourceFingerprint 계산 — 백엔드 변경 없이 정합성 추적.
  function _fp(d) {
    const c = (d && d.customer) || {};
    const lastRev = ((d && d.recent_revenues) || [])[0] || {};
    const lastBook = ((d && d.recent_bookings) || [])[0] || {};
    return [
      c.updated_at || '',
      lastRev.recorded_at || '',
      lastBook.starts_at || '',
      ((c.memo || '') + '').length,
    ].join('|');
  }

  // ───────── 유틸 ─────────
  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
  }

  // [2026-05-19] _krwShort 삭제 → formatMoney (format-money.js 공통 유틸)

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
    // [v198] 신규/오늘방문 명시 + 주기를 일수 단위로. 1주 미만 비정상 주기는 표시 안 함.
    if (b.lastDays === null || b.lastDays === undefined) {
      parts.push('신규 고객님이에요');
    } else if (b.lastDays === 0) {
      parts.push('오늘 방문한 고객님이에요');
    } else {
      const avgDays = b.avgWeeks ? Math.round(b.avgWeeks * 7) : 0;
      const cycle = avgDays >= 7 ? ' (평균 ' + avgDays + '일 주기)' : '';
      parts.push('마지막 방문 ' + b.lastDays + '일 전' + cycle);
    }
    if (b.lastService) {
      const amt = b.lastAmount ? ' ' + formatMoney(b.lastAmount) : '';
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

  // 카드 렌더 — stale 표시·재분석 버튼은 head 우측에 통합.
  function _renderCard(b, customer, opts) {
    opts = opts || {};
    const summary = _renderSummaryLine(b);
    const prediction = _renderPredictionLine(b);
    const memo = b.memo ? '<div class="cd-ai-brief__memo">' + _esc(b.memo.slice(0, 100)) + '</div>' : '';
    const chips = (window.CustomerChips && typeof window.CustomerChips.renderTopN === 'function')
      ? window.CustomerChips.renderTopN(customer, 3) : '';
    const chipsBlock = chips ? '<div class="cd-ai-brief__chips">' + chips + '</div>' : '';

    const staleClass = opts.stale ? ' cd-ai-brief--stale' : '';
    const staleBadge = opts.stale
      ? '<span class="cd-ai-brief__stale" title="고객 정보가 바뀌었어요">정보 업데이트됨</span>'
      : '';
    const spinning = opts.refreshing ? ' cd-ai-brief__refresh--spin' : '';
    const refreshBtn = ''
      + '<button type="button" class="cd-ai-brief__refresh' + spinning + '" '
      + 'data-ai-brief-refresh="1" aria-label="다시 분석" title="다시 분석">'
      + '<svg width="13" height="13" aria-hidden="true"><use href="#ic-refresh-cw"/></svg>'
      + '</button>';

    return ''
      + '<section class="cd-ai-brief' + staleClass + '">'
      + '  <div class="cd-ai-brief__head">'
      + '    <span class="cd-ai-brief__head-left">'
      + '      <svg width="14" height="14" aria-hidden="true" style="vertical-align:-2px;"><use href="#ic-sparkles"/></svg>'
      + '      <strong>AI 브리핑</strong>'
      + '    </span>'
      + '    <span class="cd-ai-brief__head-right">'
      + staleBadge
      + refreshBtn
      + '    </span>'
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

  // ───────── 네트워크 (dedupe + force) ─────────
  // [v199] BE 에 /customers/{id}/ai-brief 가 아직 없을 수도 있어서, 404/실패 시
  //        /customers/{id}/dashboard 로 폴백하여 last_service/last_amount 보강.
  async function _tryServerBrief(customerId, force) {
    if (!window.API || !window.authHeader) return null;
    const briefUrl = window.API + '/customers/' + encodeURIComponent(customerId) + '/ai-brief'
      + (force ? '?force=1' : '');
    const dashUrl  = window.API + '/customers/' + encodeURIComponent(customerId) + '/dashboard';

    if (!force && _inFlight.has(customerId)) return _inFlight.get(customerId);

    const p = (async () => {
      try {
        // 1) 원래 ai-brief 시도
        try {
          const res = await fetch(briefUrl, { headers: window.authHeader() });
          if (res.ok) return await res.json();
        } catch (_e) { /* fall through to dashboard */ }
        // 2) 폴백 — dashboard 응답을 ai-brief 모양으로 변환 (last_service 포함)
        const dRes = await fetch(dashUrl, { headers: window.authHeader() });
        if (!dRes.ok) return null;
        const dd = await dRes.json();
        return _dashboardToBriefShape(dd);
      } catch (_e) {
        return null;
      } finally {
        setTimeout(() => _inFlight.delete(customerId), 50);
      }
    })();

    if (!force) _inFlight.set(customerId, p);
    return p;
  }

  // dashboard payload → ai-brief 응답 모양으로 변환. last_service/last_amount/days_since_visit 채움.
  function _dashboardToBriefShape(dd) {
    if (!dd || typeof dd !== 'object') return null;
    const c     = dd.customer || {};
    const stats = dd.stats || {};
    const recent = dd.recent_revenues || [];
    const last  = recent[0] || null;
    const lastVisitAt = stats.last_visit_at || c.last_visit_at || (last && last.recorded_at) || null;
    let daysSince = null;
    if (lastVisitAt) {
      const ms = Date.now() - new Date(lastVisitAt).getTime();
      if (Number.isFinite(ms)) daysSince = Math.max(0, Math.floor(ms / 86400000));
    }
    return {
      customer: Object.assign({}, c, {
        last_visit_at: lastVisitAt,
        avg_cycle_weeks: c.avg_cycle_weeks || 0,
        last_service: last && last.service_name,
        last_amount:  last && last.amount,
      }),
      prediction: { days_since_visit: daysSince },
    };
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

  // 재분석 버튼 클릭 핸들러 바인딩 (카드마다 1회).
  function _bindRefresh(container, customerId, customer, fpNow) {
    if (!container) return;
    const btn = container.querySelector('[data-ai-brief-refresh="1"]');
    if (!btn || btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (btn.classList.contains('cd-ai-brief__refresh--spin')) return; // 중복 클릭 방지
      btn.classList.add('cd-ai-brief__refresh--spin');
      try {
        const server = await _tryServerBrief(customerId, true);
        const fallbackBrief = _computeBrief({ customer: customer });
        const brief = _normalizeServerBrief(server, fallbackBrief, customer) || fallbackBrief;
        if (server) _cacheSet(customerId, server, fpNow);
        container.innerHTML = _renderCard(brief, customer, { stale: false, refreshing: false });
        _bindRefresh(container, customerId, customer, fpNow);
      } catch (_e) {
        btn.classList.remove('cd-ai-brief__refresh--spin');
      }
    });
  }

  // ───────── 메인 렌더 ─────────
  async function _render(containerId, customerId, opts) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const dashboardData = (opts && opts.dashboardData) || null;
    const fallbackBrief = _computeBrief(dashboardData);
    const customer = (dashboardData && dashboardData.customer)
      || (opts && opts.customer)
      || { id: customerId };
    const fpNow = _fp(dashboardData);

    // 1) 캐시 즉시 확인 — 네트워크 호출 전.
    const cached = _cacheGet(customerId);
    let cachedBrief = null;
    let isStale = false;
    if (cached) {
      cachedBrief = _normalizeServerBrief(cached.payload, fallbackBrief, customer);
      isStale = cached.sourceFingerprint !== fpNow;
    }

    if (cachedBrief) {
      // 캐시 hit — 즉시 렌더.
      container.innerHTML = _renderCard(cachedBrief, customer, { stale: isStale });
      _bindRefresh(container, customerId, customer, fpNow);

      // fingerprint 일치 → 네트워크 호출 0. 끝.
      if (!isStale) return;

      // fingerprint 불일치 → 백그라운드 fetch (force 없음).
      // 자동 LLM 재호출이 아니라 캐시된 백엔드 응답 재확인.
      (async () => {
        const server = await _tryServerBrief(customerId, false);
        if (!server) return;
        const brief = _normalizeServerBrief(server, fallbackBrief, customer) || fallbackBrief;
        _cacheSet(customerId, server, fpNow);
        // 카드 다시 그리되 stale 해제.
        container.innerHTML = _renderCard(brief, customer, { stale: false });
        _bindRefresh(container, customerId, customer, fpNow);
      })();
      return;
    }

    // 2) 캐시 없음 → 폴백(또는 스켈레톤) 즉시 렌더 + 백그라운드 fetch.
    const haveSomething = fallbackBrief.name || fallbackBrief.lastVisit || fallbackBrief.memo;
    if (haveSomething) {
      container.innerHTML = _renderCard(fallbackBrief, customer, { stale: false });
      _bindRefresh(container, customerId, customer, fpNow);
    } else {
      container.innerHTML = _renderSkeleton();
    }

    const server = await _tryServerBrief(customerId, false);
    const brief = _normalizeServerBrief(server, fallbackBrief, customer) || fallbackBrief;
    if (server) _cacheSet(customerId, server, fpNow);

    if (!brief.name && !brief.lastVisit && !brief.memo) {
      // 정말 보여줄 게 없으면 카드 자체를 숨김.
      container.innerHTML = '';
      return;
    }
    container.innerHTML = _renderCard(brief, customer, { stale: false });
    _bindRefresh(container, customerId, customer, fpNow);
  }

  // 스타일 1회 주입 (전용 CSS 파일 만들지 않고 모듈 내부 보관).
  if (typeof document !== 'undefined' && !document.getElementById('cd-ai-brief-style')) {
    const st = document.createElement('style');
    st.id = 'cd-ai-brief-style';
    st.textContent = ''
      + '.cd-ai-brief{margin:0 0 14px;padding:12px 14px;'
      + 'background:linear-gradient(135deg,rgba(241,128,145,.08),rgba(167,139,250,.06));'
      + 'border:1px solid rgba(241,128,145,.20);border-radius:14px;}'
      + '.cd-ai-brief--stale{background:linear-gradient(135deg,rgba(241,128,145,.05),rgba(167,139,250,.04));}'
      + '.cd-ai-brief--stale .cd-ai-brief__summary,.cd-ai-brief--stale .cd-ai-brief__memo{color:#888;}'
      + '.cd-ai-brief__head{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:8px;color:var(--brand-strong,#a04050);font-size:12px;letter-spacing:.3px;}'
      + '.cd-ai-brief__head-left{display:inline-flex;align-items:center;gap:6px;}'
      + '.cd-ai-brief__head-right{display:inline-flex;align-items:center;gap:6px;}'
      + '.cd-ai-brief__stale{display:inline-block;padding:2px 7px;background:rgba(241,128,145,.12);color:#a04050;border-radius:999px;font-size:10px;font-weight:500;letter-spacing:0;}'
      + '.cd-ai-brief__refresh{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;background:rgba(255,255,255,.6);border:1px solid rgba(0,0,0,.06);border-radius:999px;color:#a04050;cursor:pointer;transition:background .15s ease,transform .15s ease;}'
      + '.cd-ai-brief__refresh:hover{background:rgba(255,255,255,.95);}'
      + '.cd-ai-brief__refresh:active{transform:scale(.92);}'
      + '.cd-ai-brief__refresh--spin svg{animation:cdAiBriefSpin .8s linear infinite;}'
      + '.cd-ai-brief__refresh--spin{pointer-events:none;opacity:.7;}'
      + '@keyframes cdAiBriefSpin{from{transform:rotate(0)}to{transform:rotate(360deg)}}'
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

  // 테스트·디버깅용 노출.
  window.CustomerAIBrief = {
    render: _render,
    _cacheGet: _cacheGet,
    _cacheSet: _cacheSet,
    _fp: _fp,
    _clearCache: function (id) {
      try {
        if (id) sessionStorage.removeItem(SS_KEY(id));
        else {
          Object.keys(sessionStorage).forEach(k => {
            if (k.indexOf('aibrief_v1::') === 0) sessionStorage.removeItem(k);
          });
        }
      } catch (_e) { void _e; }
    },
  };
})();
