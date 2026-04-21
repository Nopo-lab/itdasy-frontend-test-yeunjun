/* ─────────────────────────────────────────────────────────────
   사장님 대시보드 (2026-04-20)

   한 화면에서 샵 운영 전부 보이고 바로 진입 가능:
   - 히어로 요약 4 카드 (오늘매출·이번달매출·고객수·예정예약)
   - 이번 달 주간 매출 SVG 바차트
   - AI 인사이트 (재방문 임박 / 매출 예측 / 쿠폰 제안)
   - 퀵 액션 9 타일 (고객/예약/매출/재고/NPS/네이버리뷰/영상/임포트/AI인사이트)
   - 최근 활동 타임라인 (매출·예약 통합)

   데이터 소스 병렬 호출 → 실패 graceful degrade.
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
  }
  function _formatKRW(n) {
    return (+n || 0).toLocaleString('ko-KR') + '원';
  }
  function _formatKRWShort(n) {
    const v = +n || 0;
    if (v >= 10000) return Math.round(v / 1000) / 10 + '만';
    if (v >= 1000) return Math.round(v / 100) / 10 + '천';
    return v.toLocaleString('ko-KR');
  }
  function _relativeDays(iso) {
    if (!iso) return '';
    const diff = (Date.now() - new Date(iso).getTime()) / 86400000;
    if (diff < 0.04) return '방금';
    if (diff < 1) return Math.round(diff * 24) + '시간 전';
    if (diff < 7) return Math.round(diff) + '일 전';
    if (diff < 30) return Math.round(diff / 7) + '주 전';
    return Math.round(diff / 30) + '개월 전';
  }

  // T-326 — sessionStorage 캐시 (1분 내 재호출 즉시 반환, 네트워크 로딩 지연 해소)
  const _CACHE_TTL = 60 * 1000;
  function _cacheKey(path) { return 'dash_cache::' + path; }
  function _getCached(path) {
    try {
      const raw = sessionStorage.getItem(_cacheKey(path));
      if (!raw) return null;
      const { t, v } = JSON.parse(raw);
      if (Date.now() - t > _CACHE_TTL) return null;
      return v;
    } catch (_) { return null; }
  }
  function _setCached(path, v) {
    try { sessionStorage.setItem(_cacheKey(path), JSON.stringify({ t: Date.now(), v })); } catch(_){}
  }

  async function _apiGet(path, opts) {
    if (!window.API || !window.authHeader) throw new Error('no-auth');
    const auth = window.authHeader();
    if (!auth?.Authorization) throw new Error('no-token');
    const cached = (opts && opts.force) ? null : _getCached(path);
    if (cached) return cached;
    const res = await fetch(window.API + path, { headers: auth });
    if (res.status === 404 || res.status === 501) throw new Error('endpoint-missing');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    _setCached(path, data);
    return data;
  }

  // ── 시트 DOM ──────────────────────────────────────────
  function _ensureSheet() {
    let sheet = document.getElementById('dashboardSheet');
    if (sheet) return sheet;
    sheet = document.createElement('div');
    sheet.id = 'dashboardSheet';
    sheet.style.cssText = 'position:fixed;inset:0;z-index:9998;display:none;background:linear-gradient(180deg,#F8F5F7 0%,#F2F4F6 100%);';
    sheet.innerHTML = `
      <style>
        @keyframes dashShine { 0%{background-position:0% 50%} 100%{background-position:200% 50%} }
        .dash-hero-h {
          background:linear-gradient(110deg,#F18091 0%,#FF9AA8 40%,#FFC3C8 55%,#F18091 100%);
          background-size:200% auto;
          animation:dashShine 12s linear infinite;
          -webkit-background-clip:text;background-clip:text;
          -webkit-text-fill-color:transparent;
        }
        .dash-glow { filter:drop-shadow(0 6px 16px rgba(241,128,145,0.35)); }
        #dashBody::-webkit-scrollbar { width:0; }
      </style>
      <div style="height:100%;display:flex;flex-direction:column;padding-top:max(12px,env(safe-area-inset-top));background:linear-gradient(180deg,#FAF7F8 0%,#F5F5F7 60%);">
        <header style="display:flex;align-items:center;gap:12px;padding:16px 20px 10px;">
          <div class="dash-glow" style="width:44px;height:44px;border-radius:14px;background:linear-gradient(135deg,#F18091,#D95F70);display:flex;align-items:center;justify-content:center;font-size:22px;color:#fff;">✨</div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:11px;color:#888;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-bottom:3px;">ITDASY</div>
            <div id="dashGreet" class="dash-hero-h" style="font-size:20px;font-weight:900;line-height:1.15;letter-spacing:-0.4px;">안녕하세요, 원장님 👋</div>
          </div>
          <button id="dashBell" style="position:relative;width:40px;height:40px;border-radius:14px;background:#fff;border:1px solid #eee;font-size:16px;cursor:pointer;margin-right:4px;box-shadow:0 2px 6px rgba(0,0,0,0.04);" aria-label="알림">
            🔔
            <span id="dashBellBadge" style="display:none;position:absolute;top:-4px;right:-4px;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:#F18091;color:#fff;font-size:10px;font-weight:800;display:none;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(241,128,145,0.4);">0</span>
          </button>
          <button onclick="closeDashboard()" style="width:40px;height:40px;border-radius:14px;background:#fff;border:1px solid #eee;font-size:16px;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,0.04);" aria-label="닫기">✕</button>
        </header>
        <div id="dashBody" style="flex:1;overflow-y:auto;padding:8px 16px 24px;padding-bottom:max(80px,env(safe-area-inset-bottom));"></div>
        <!-- 스토리 자동 생성 FAB -->
        <button id="dashStoryFab" aria-label="스토리 만들기"
                style="position:absolute;right:18px;bottom:calc(156px + env(safe-area-inset-bottom));width:48px;height:48px;border-radius:50%;border:none;background:linear-gradient(135deg,#FFD700,#FFA500);color:#fff;font-size:20px;cursor:pointer;box-shadow:0 6px 20px rgba(255,179,71,0.4);z-index:2;">
          ✨
        </button>
        <!-- AI 비서 FAB -->
        <button id="dashAssistantFab" aria-label="AI 비서"
                style="position:absolute;right:18px;bottom:calc(92px + env(safe-area-inset-bottom));width:52px;height:52px;border-radius:50%;border:none;background:linear-gradient(135deg,#A78BFA,#8B5CF6);color:#fff;font-size:22px;cursor:pointer;box-shadow:0 6px 20px rgba(139,92,246,0.35);z-index:2;">
          🤖
        </button>
        <!-- 음성 빠른 기록 FAB -->
        <button id="dashVoiceFab" aria-label="음성 기록"
                style="position:absolute;right:18px;bottom:calc(22px + env(safe-area-inset-bottom));width:60px;height:60px;border-radius:50%;border:none;background:linear-gradient(135deg,#F18091,#D95F70);color:#fff;font-size:26px;cursor:pointer;box-shadow:0 6px 20px rgba(241,128,145,0.45);z-index:2;">
          🎤
        </button>
      </div>
    `;
    document.body.appendChild(sheet);
    const fab = sheet.querySelector('#dashVoiceFab');
    if (fab) fab.addEventListener('click', () => {
      if (window.hapticMedium) window.hapticMedium();
      if (typeof window.openVoice === 'function') window.openVoice();
    });
    const bell = sheet.querySelector('#dashBell');
    if (bell) bell.addEventListener('click', () => {
      if (window.hapticLight) window.hapticLight();
      if (typeof window.openNotifications === 'function') window.openNotifications();
    });
    const asst = sheet.querySelector('#dashAssistantFab');
    if (asst) asst.addEventListener('click', () => {
      if (window.hapticMedium) window.hapticMedium();
      if (typeof window.openAssistant === 'function') window.openAssistant();
    });
    const story = sheet.querySelector('#dashStoryFab');
    if (story) story.addEventListener('click', () => {
      if (window.hapticMedium) window.hapticMedium();
      if (typeof window.openStory === 'function') window.openStory();
    });
    return sheet;
  }

  // ── 섹션 렌더러 ───────────────────────────────────────
  function _heroCards(stats, weeklyHistory) {
    // 지난 주 동일 요일 대비 delta
    const thisWeek = (weeklyHistory && weeklyHistory.length) ? weeklyHistory[weeklyHistory.length - 1].amount : 0;
    const lastWeek = (weeklyHistory && weeklyHistory.length > 1) ? weeklyHistory[weeklyHistory.length - 2].amount : 0;
    const deltaPct = lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : 0;
    const deltaColor = deltaPct >= 5 ? '#388e3c' : deltaPct <= -5 ? '#dc3545' : '#888';
    const deltaArrow = deltaPct > 5 ? '↗' : deltaPct < -5 ? '↘' : '→';

    const cards = [
      { key: 'today',    icon: '💰', label: '오늘 매출',  value: stats.today_amount,    format: 'krw',  sub: `${stats.today_count || 0}건 기록`, color: '#F18091,#D95F70', pvTab: 'revenue' },
      { key: 'month',    icon: '📈', label: '이번 달',    value: stats.month_amount,    format: 'krw',  sub: '누적 매출',                       color: '#FFB347,#FF8A5C', pvTab: 'revenue' },
      { key: 'customer', icon: '👥', label: '고객',       value: stats.customer_count,  format: 'unit', unit: '명', sub: '등록된 고객',           color: '#4ECDC4,#44A08D', pvTab: 'customer' },
      { key: 'booking',  icon: '📅', label: '예정 예약',  value: stats.upcoming_bookings, format: 'unit', unit: '건', sub: '다가오는 일정',       color: '#A78BFA,#8B5CF6', pvTab: 'booking' },
    ];

    const cardHtml = cards.map((c, i) => `
      <div class="dash-hero-card" style="padding:18px 16px 16px;border-radius:20px;background:linear-gradient(180deg,#ffffff 0%,#fbfbfd 100%);box-shadow:0 6px 24px rgba(0,0,0,0.05), 0 1px 3px rgba(0,0,0,0.04);position:relative;overflow:hidden;transition:transform 0.15s cubic-bezier(0.2,0.9,0.3,1), box-shadow 0.15s;border:1px solid rgba(0,0,0,0.03);">
        <div style="position:absolute;top:-22px;right:-22px;width:96px;height:96px;border-radius:50%;background:linear-gradient(135deg,${c.color});opacity:0.14;filter:blur(4px);"></div>
        <div style="position:absolute;top:-14px;right:10px;width:24px;height:60px;background:linear-gradient(180deg,rgba(255,255,255,0.5),transparent);transform:rotate(25deg);"></div>
        <button data-pv-open="${c.pvTab}" title="크게 보기 + 빠른 입력" aria-label="확대" style="position:absolute;top:10px;right:10px;width:28px;height:28px;border:none;border-radius:9px;background:rgba(255,255,255,0.92);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);cursor:pointer;font-size:12px;color:#555;display:flex;align-items:center;justify-content:center;z-index:2;box-shadow:0 2px 6px rgba(0,0,0,0.1);transition:all 0.15s;">⛶</button>
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;position:relative;">
          <span style="font-size:15px;">${c.icon}</span>
          <span style="font-size:11px;color:#888;font-weight:800;letter-spacing:-0.2px;">${c.label}</span>
        </div>
        <div class="dash-count" data-value="${c.value ?? 0}" data-format="${c.format}" data-unit="${c.unit || ''}" style="font-size:28px;font-weight:900;color:#1a1a1a;line-height:1.05;letter-spacing:-0.8px;">—</div>
        <div style="font-size:10.5px;color:#999;margin-top:6px;font-weight:600;">${_esc(c.sub)}</div>
      </div>
    `).join('');

    const weekCompare = thisWeek > 0 || lastWeek > 0 ? `
      <div style="padding:14px 16px;border-radius:16px;background:linear-gradient(135deg,rgba(241,128,145,0.08),rgba(241,128,145,0.02));margin-bottom:14px;display:flex;align-items:center;gap:12px;">
        <div style="width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,#F18091,#D95F70);display:flex;align-items:center;justify-content:center;color:#fff;font-size:20px;flex-shrink:0;">${deltaArrow}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:11px;color:#666;margin-bottom:3px;">이번 주 vs 지난 주</div>
          <div style="display:flex;align-items:baseline;gap:6px;">
            <strong style="font-size:18px;color:${deltaColor};">${deltaPct > 0 ? '+' : ''}${deltaPct}%</strong>
            <span style="font-size:11px;color:#888;">${_formatKRWShort(thisWeek)} / ${_formatKRWShort(lastWeek)}</span>
          </div>
        </div>
      </div>
    ` : '';

    return `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">${cardHtml}</div>
      ${weekCompare}
    `;
  }

  // 숫자 카운트업 애니메이션
  function _animateCounts(root) {
    const els = root.querySelectorAll('.dash-count');
    els.forEach(el => {
      const target = parseFloat(el.dataset.value) || 0;
      const fmt = el.dataset.format || 'unit';
      const unit = el.dataset.unit || '';
      if (target === 0) {
        el.textContent = fmt === 'krw' ? '0원' : `0${unit}`;
        return;
      }
      const duration = 700;
      const start = performance.now();
      function step(now) {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);  // easeOutCubic
        const cur = target * eased;
        el.textContent = fmt === 'krw' ? _formatKRWShort(cur) : `${Math.round(cur)}${unit}`;
        if (t < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
  }

  function _monthChart(weekly) {
    // weekly: [{week_start, amount}, ...] (8주)
    if (!weekly || !weekly.length) {
      return `<div style="padding:14px;background:#fff;border-radius:16px;box-shadow:0 2px 8px rgba(0,0,0,0.05);margin-bottom:14px;text-align:center;color:#aaa;font-size:12px;">매출 데이터가 쌓이면 그래프가 나와요</div>`;
    }
    const max = Math.max(1, ...weekly.map(w => w.amount));
    const W = 320, H = 100, padL = 6, padR = 6, padB = 16;
    const innerW = W - padL - padR;
    const barW = innerW / weekly.length;
    const bars = weekly.map((w, i) => {
      const bh = w.amount > 0 ? Math.max(2, (H - padB - 4) * (w.amount / max)) : 2;
      const x = padL + i * barW + 2;
      const y = H - padB - bh;
      const isLast = i === weekly.length - 1;
      return `<rect x="${x}" y="${y}" width="${Math.max(3, barW - 4)}" height="${bh}" rx="3" fill="${isLast ? 'url(#dashGrad)' : 'rgba(241,128,145,0.35)'}"/>`;
    }).join('');
    const labels = weekly.map((w, i) => {
      if (i % 2 !== 0) return '';
      const d = new Date(w.week_start);
      return `<text x="${padL + i * barW + barW / 2}" y="${H - 3}" font-size="9" fill="#aaa" text-anchor="middle">${d.getMonth() + 1}/${d.getDate()}</text>`;
    }).join('');
    return `
      <div style="padding:14px 14px 8px;border-radius:16px;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,0.05);margin-bottom:14px;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
          <span style="font-size:14px;">📊</span>
          <strong style="font-size:13px;">최근 8주 매출 추이</strong>
          <span style="margin-left:auto;font-size:10px;color:#888;">가장 진한 막대 = 이번 주</span>
        </div>
        <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:${H}px;" preserveAspectRatio="none">
          <defs>
            <linearGradient id="dashGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#F18091"/>
              <stop offset="100%" stop-color="#D95F70"/>
            </linearGradient>
          </defs>
          ${bars}${labels}
        </svg>
      </div>
    `;
  }

  function _insightsSection(ret, fc, cp) {
    const cards = [];
    if (ret && (ret.items || []).length) {
      const s = ret.summary;
      cards.push(`
        <div data-ins="retention" style="padding:12px;background:linear-gradient(135deg,rgba(220,53,69,0.06),rgba(220,53,69,0.01));border-radius:14px;border:1px solid rgba(220,53,69,0.1);cursor:pointer;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
            <span style="font-size:16px;">💝</span>
            <strong style="font-size:12px;">이탈 임박</strong>
          </div>
          <div style="font-size:22px;font-weight:900;color:#dc3545;line-height:1.1;">${s.at_risk + s.lost}<span style="font-size:11px;color:#888;margin-left:3px;font-weight:400;">명</span></div>
          <div style="font-size:10px;color:#666;margin-top:3px;">재방문 필요</div>
        </div>
      `);
    }
    if (fc && fc.has_data) {
      const color = fc.delta_pct >= 5 ? '#388e3c' : fc.delta_pct <= -5 ? '#dc3545' : '#666';
      const arrow = fc.delta_pct > 5 ? '↗' : fc.delta_pct < -5 ? '↘' : '→';
      cards.push(`
        <div data-ins="forecast" style="padding:12px;background:linear-gradient(135deg,rgba(241,128,145,0.08),rgba(241,128,145,0.02));border-radius:14px;border:1px solid rgba(241,128,145,0.15);cursor:pointer;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
            <span style="font-size:16px;">📈</span>
            <strong style="font-size:12px;">이번 주 예상</strong>
          </div>
          <div style="font-size:18px;font-weight:900;color:var(--accent,#F18091);line-height:1.1;">${_formatKRWShort(fc.predicted_week)}</div>
          <div style="font-size:10px;color:${color};margin-top:3px;font-weight:700;">${arrow} ${fc.delta_pct > 0 ? '+' : ''}${fc.delta_pct}%</div>
        </div>
      `);
    }
    if (cp && cp.has_suggestion) {
      cards.push(`
        <div data-ins="coupon" style="padding:12px;background:linear-gradient(135deg,rgba(76,175,80,0.08),rgba(76,175,80,0.02));border-radius:14px;border:1px solid rgba(76,175,80,0.15);cursor:pointer;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
            <span style="font-size:16px;">🎟</span>
            <strong style="font-size:12px;">쿠폰 추천</strong>
          </div>
          <div style="font-size:18px;font-weight:900;color:#388e3c;line-height:1.1;">${_esc(cp.slow_day.label)}요일</div>
          <div style="font-size:10px;color:#666;margin-top:3px;font-weight:700;">${cp.discount_pct}% 할인 제안</div>
        </div>
      `);
    }
    if (!cards.length) return '';
    return `
      <div style="margin-bottom:14px;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;padding:0 4px;">
          <span style="font-size:14px;">✨</span>
          <strong style="font-size:13px;">AI 인사이트</strong>
          <button data-open="insights" style="margin-left:auto;background:none;border:none;font-size:11px;color:var(--accent,#F18091);cursor:pointer;font-weight:700;">전체 보기 →</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(${cards.length},1fr);gap:8px;">
          ${cards.join('')}
        </div>
      </div>
    `;
  }

  // 최근 매출에서 자주 쓴 시술·금액 조합 상위 5개
  function _topServicePresets(revenues) {
    if (!revenues || !revenues.length) return [];
    const map = new Map();
    for (const r of revenues) {
      const key = (r.service_name || '').trim();
      if (!key) continue;
      const item = map.get(key) || { service_name: key, amounts: [], method_count: {}, freq: 0 };
      item.amounts.push(r.amount || 0);
      item.method_count[r.method] = (item.method_count[r.method] || 0) + 1;
      item.freq += 1;
      map.set(key, item);
    }
    return [...map.values()]
      .sort((a, b) => b.freq - a.freq)
      .slice(0, 5)
      .map(i => {
        const sorted = i.amounts.slice().sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        const topMethod = Object.entries(i.method_count).sort((a, b) => b[1] - a[1])[0]?.[0] || 'card';
        return { service_name: i.service_name, amount: median, method: topMethod, freq: i.freq };
      });
  }

  function _quickRevenueSection(revenues) {
    const presets = _topServicePresets(revenues);
    _lastPresets = presets;
    if (!presets.length) {
      return `
        <div style="margin-bottom:14px;padding:16px;background:linear-gradient(135deg,rgba(241,128,145,0.08),rgba(241,128,145,0.02));border-radius:14px;border:1px dashed rgba(241,128,145,0.3);text-align:center;">
          <div style="font-size:14px;margin-bottom:4px;">⚡</div>
          <div style="font-size:12px;color:#666;line-height:1.5;">자주 쓰는 시술을 몇 번 기록하면<br>여기 <b>원탭 매출 버튼</b>이 자동으로 생겨요.</div>
          <button data-quick="openVoice" style="margin-top:10px;padding:9px 18px;border:none;border-radius:10px;background:linear-gradient(135deg,#F18091,#D95F70);color:#fff;font-weight:800;font-size:12px;cursor:pointer;">🎤 음성으로 시작하기</button>
        </div>
      `;
    }
    return `
      <div style="margin-bottom:14px;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;padding:0 4px;">
          <span style="font-size:14px;">⚡</span>
          <strong style="font-size:13px;">자주 쓴 시술 · 원탭 매출</strong>
        </div>
        <div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;-webkit-overflow-scrolling:touch;">
          ${presets.map((p, i) => `
            <button data-preset-idx="${i}" style="flex-shrink:0;padding:12px;border:1px solid rgba(0,0,0,0.06);border-radius:14px;background:#fff;cursor:pointer;text-align:left;min-width:130px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
              <div style="font-size:9px;color:#888;margin-bottom:4px;">${p.freq}회 기록</div>
              <div style="font-size:12px;font-weight:700;color:#222;margin-bottom:4px;">${_esc(p.service_name)}</div>
              <div style="font-size:14px;font-weight:900;color:var(--accent,#F18091);">${_formatKRWShort(p.amount)}</div>
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }

  async function _quickRevenueSubmit(preset) {
    if (!window.API || !window.authHeader) return;
    const payload = {
      amount: preset.amount,
      method: preset.method || 'card',
      service_name: preset.service_name,
    };
    try {
      const res = await fetch(window.API + '/revenue', {
        method: 'POST',
        headers: { ...window.authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      if (window.hapticSuccess) window.hapticSuccess();
      if (window.showToast) window.showToast(`✨ ${preset.service_name} ${preset.amount.toLocaleString('ko-KR')}원 기록!`);
      if (window.Dashboard?.refresh) window.Dashboard.refresh(true);
    } catch (e) {
      if (window.showToast) window.showToast('실패: ' + e.message);
    }
  }

  function _quickActionsGrid() {
    // T-328: 샵 운영 메뉴 그리드 제거 → 파워뷰 단일 진입점
    return `
      <div style="margin-bottom:14px;">
        <button data-pv-open="customer" style="width:100%;padding:18px;border:none;border-radius:16px;background:linear-gradient(135deg,#F18091,#D95F70);color:#fff;cursor:pointer;box-shadow:0 6px 20px rgba(241,128,145,0.35);display:flex;align-items:center;gap:14px;text-align:left;transition:transform 0.1s;">
          <div style="font-size:28px;">⛶</div>
          <div style="flex:1;">
            <div style="font-size:15px;font-weight:900;letter-spacing:-0.3px;margin-bottom:2px;">파워뷰 열기</div>
            <div style="font-size:11px;opacity:0.85;line-height:1.5;">고객 · 예약 · 매출 · 재고 · NPS · 시술 · 기타 전부 한 화면</div>
          </div>
          <div style="font-size:20px;opacity:0.7;">→</div>
        </button>
      </div>
    `;
  }

  function _recentActivity(revenues, bookings) {
    const items = [];
    (revenues || []).slice(0, 6).forEach(r => {
      items.push({
        kind: 'revenue',
        icon: '💰',
        time: r.recorded_at,
        title: _formatKRW(r.amount) + (r.service_name ? ` · ${r.service_name}` : ''),
        sub: r.customer_name || r.method || '',
      });
    });
    (bookings || []).slice(0, 4).forEach(b => {
      items.push({
        kind: 'booking',
        icon: '📅',
        time: b.starts_at,
        title: (b.service_name || '예약'),
        sub: (b.customer_name || '') + ' · ' + (new Date(b.starts_at).toLocaleDateString('ko-KR')),
      });
    });
    items.sort((a, b) => new Date(b.time) - new Date(a.time));
    const top = items.slice(0, 8);
    if (!top.length) {
      return `
        <div style="margin-bottom:14px;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;padding:0 4px;">
            <span style="font-size:14px;">🕐</span>
            <strong style="font-size:13px;">최근 활동</strong>
          </div>
          <div style="padding:18px;background:#fff;border-radius:14px;box-shadow:0 1px 3px rgba(0,0,0,0.04);text-align:center;color:#aaa;font-size:12px;">
            기록이 쌓이면 여기 나와요
          </div>
        </div>
      `;
    }
    return `
      <div style="margin-bottom:14px;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;padding:0 4px;">
          <span style="font-size:14px;">🕐</span>
          <strong style="font-size:13px;">최근 활동</strong>
        </div>
        <div style="background:#fff;border-radius:14px;box-shadow:0 1px 3px rgba(0,0,0,0.04);overflow:hidden;">
          ${top.map((it, i) => `
            <div style="display:flex;gap:10px;align-items:center;padding:11px 14px;${i > 0 ? 'border-top:1px solid rgba(0,0,0,0.05);' : ''}">
              <div style="width:36px;height:36px;border-radius:10px;background:rgba(241,128,145,0.08);display:flex;align-items:center;justify-content:center;font-size:16px;">${it.icon}</div>
              <div style="flex:1;min-width:0;">
                <div style="font-size:13px;font-weight:700;color:#222;">${_esc(it.title)}</div>
                <div style="font-size:10px;color:#999;margin-top:2px;">${_esc(it.sub)}</div>
              </div>
              <div style="font-size:10px;color:#bbb;white-space:nowrap;">${_relativeDays(it.time)}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // ── 집계 로직 ──────────────────────────────────────────
  function _aggregateStats(monthRows, todayRows, customersCount, bookings) {
    const today_amount = (todayRows || []).reduce((s, r) => s + (r.amount || 0), 0);
    const today_count = (todayRows || []).length;
    const month_amount = (monthRows || []).reduce((s, r) => s + (r.amount || 0), 0);
    const now = Date.now();
    const upcoming_bookings = (bookings || []).filter(b => new Date(b.starts_at).getTime() >= now).length;
    return {
      today_amount,
      today_count,
      month_amount,
      customer_count: customersCount,
      upcoming_bookings,
    };
  }

  // 현재 대시보드 렌더에 쓰인 preset 저장 (bind 시 재활용)
  let _lastPresets = [];

  function _bindEvents() {
    const sheet = document.getElementById('dashboardSheet');
    if (!sheet) return;
    sheet.querySelectorAll('[data-preset-idx]').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = parseInt(btn.dataset.presetIdx, 10);
        const preset = _lastPresets[i];
        if (!preset) return;
        if (!confirm(`${preset.service_name} ${preset.amount.toLocaleString('ko-KR')}원 — 지금 매출로 기록할까요?`)) return;
        _quickRevenueSubmit(preset);
      });
    });
    sheet.querySelectorAll('[data-quick]').forEach(btn => {
      btn.addEventListener('click', () => {
        const fn = btn.dataset.quick;
        if (typeof window[fn] === 'function') {
          if (window.hapticLight) window.hapticLight();
          window[fn]();
        }
      });
    });
    sheet.querySelectorAll('[data-ins]').forEach(el => {
      el.addEventListener('click', () => {
        if (typeof window.openInsights === 'function') window.openInsights();
      });
    });
    const seeAll = sheet.querySelector('[data-open="insights"]');
    if (seeAll) seeAll.addEventListener('click', () => {
      if (typeof window.openInsights === 'function') window.openInsights();
    });
    // Phase 6 C11 — 카드별 확대(파워뷰) 버튼
    sheet.querySelectorAll('[data-pv-open]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.hapticLight) window.hapticLight();
        const tab = btn.getAttribute('data-pv-open');
        if (typeof window.openPowerView === 'function') window.openPowerView(tab);
      });
    });
  }

  function _renderLoading() {
    const body = document.getElementById('dashBody');
    if (!body) return;
    body.innerHTML = `
      <div>
        <style>
          @keyframes dashShimmer { 0% { background-position: -400px 0; } 100% { background-position: 400px 0; } }
          .dash-skel { background: linear-gradient(90deg, #f0f0f0 0%, #f8f8f8 40%, #f0f0f0 80%); background-size: 800px 100%; animation: dashShimmer 1.4s infinite linear; border-radius: 12px; }
        </style>
        <!-- 오늘 브리핑 스켈레톤 -->
        <div class="dash-skel" style="height:128px;margin-bottom:14px;"></div>
        <!-- 히어로 4카드 스켈레톤 -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">
          ${[0,1,2,3].map(() => '<div class="dash-skel" style="height:100px;"></div>').join('')}
        </div>
        <!-- 차트 스켈레톤 -->
        <div class="dash-skel" style="height:130px;margin-bottom:14px;"></div>
        <!-- AI 인사이트 스켈레톤 -->
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:14px;">
          ${[0,1,2].map(() => '<div class="dash-skel" style="height:86px;"></div>').join('')}
        </div>
        <!-- 메뉴 9타일 -->
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
          ${[0,1,2,3,4,5,6,7,8].map(() => '<div class="dash-skel" style="height:70px;"></div>').join('')}
        </div>
      </div>
    `;
  }

  // ── 5분 메모리 캐시 + 백그라운드 prefetch ──────────────────
  const _cache = {};
  const _TTL = 5 * 60 * 1000;  // 5분

  async function _cachedGet(path) {
    const hit = _cache[path];
    if (hit && (Date.now() - hit.ts) < _TTL) return hit.data;
    try {
      const data = await _apiGet(path);
      _cache[path] = { ts: Date.now(), data };
      return data;
    } catch (e) {
      if (hit) return hit.data;  // 실패하면 stale 이라도 반환
      throw e;
    }
  }

  // 앱 부팅 시점에 미리 한 번 (유휴 타이밍)
  async function prefetch() {
    const paths = ['/revenue?period=month', '/revenue?period=today', '/customers', '/bookings', '/retention/at-risk', '/revenue/forecast', '/coupons/suggest', '/today/brief'];
    await Promise.all(paths.map(p => _cachedGet(p).catch(() => null)));
  }
  // 외부 노출 — 부팅 훅에서 호출
  window.Dashboard = window.Dashboard || {};
  window.Dashboard.prefetch = prefetch;

  async function _loadAndRender() {
    const body = document.getElementById('dashBody');
    if (!body) return;
    _renderLoading();

    // 병렬 + 캐시 — 실패는 모두 graceful degrade
    const [monthRev, todayRev, custList, bookList, ret, fc, cp] = await Promise.all([
      _cachedGet('/revenue?period=month').catch(() => ({ items: [] })),
      _cachedGet('/revenue?period=today').catch(() => ({ items: [] })),
      _cachedGet('/customers').catch(() => ({ total: 0 })),
      _cachedGet('/bookings').catch(() => ({ items: [] })),
      _cachedGet('/retention/at-risk').catch(() => null),
      _cachedGet('/revenue/forecast').catch(() => null),
      _cachedGet('/coupons/suggest').catch(() => null),
    ]);

    const stats = _aggregateStats(
      monthRev.items || [],
      todayRev.items || [],
      custList.total != null ? custList.total : (custList.items || []).length,
      bookList.items || [],
    );

    // 주간 history 는 forecast.history 재활용 (8주)
    const weekly = (fc && fc.history) ? fc.history : [];

    // 고객 대시보드 진입 전에 고객 이름 가져오기 위해 reverse lookup 필요하진 않음
    body.innerHTML = `
      <div id="dashKiller"></div>
      <div id="dashToday"></div>
      <div id="dashAutoBA"></div>
      <div id="dashBirthday"></div>
      ${_heroCards(stats, weekly)}
      ${_monthChart(weekly)}
      ${_insightsSection(ret, fc, cp)}
      ${_quickRevenueSection(monthRev.items)}
      ${_quickActionsGrid()}
      ${_recentActivity(monthRev.items, bookList.items)}
      <div style="font-size:10px;color:#bbb;text-align:center;padding:10px;">AI 인사이트는 최근 8주 데이터로 매번 새로 계산돼요</div>
    `;
    _bindEvents();
    _animateCounts(body);

    // Phase 6.3 Lane F — AI 킬러 위젯
    if (window.KillerWidgets && typeof window.KillerWidgets.render === 'function') {
      window.KillerWidgets.render('dashKiller').catch(() => {});
    }

    // 오늘의 브리핑 카드 (#킬러 1) — dashToday 슬롯
    if (window.TodayBrief && typeof window.TodayBrief.render === 'function') {
      window.TodayBrief.render('dashToday').catch(() => {});
    }

    // 생일 자동 카드 (#킬러 2) — dashBirthday 슬롯
    if (window.Birthday && typeof window.Birthday.render === 'function') {
      window.Birthday.render('dashBirthday').catch(() => {});
    }

    // 비포/애프터 자동 감지 배너 (#4) — 있을 때만 삽입
    if (window.AutoBA && typeof window.AutoBA.getBanner === 'function') {
      window.AutoBA.getBanner().then(banner => {
        const slot = document.getElementById('dashAutoBA');
        if (banner && slot) slot.appendChild(banner);
      }).catch(() => {});
    }
  }

  window.openDashboard = async function () {
    const sheet = _ensureSheet();
    sheet.style.display = 'block';
    document.body.style.overflow = 'hidden';
    // 인사말 — 시간대별
    const h = new Date().getHours();
    const greet = h < 6 ? '새벽 수고 많으세요' : h < 12 ? '좋은 아침이에요' : h < 14 ? '점심 맛있게 드셨어요?' : h < 18 ? '오후도 화이팅' : h < 22 ? '오늘도 고생하셨어요' : '편히 쉬세요';
    const greetEl = sheet.querySelector('#dashGreet');
    if (greetEl) greetEl.textContent = greet;
    await _loadAndRender();
  };

  window.closeDashboard = function () {
    const sheet = document.getElementById('dashboardSheet');
    if (sheet) sheet.style.display = 'none';
    document.body.style.overflow = '';
  };

  // 부팅 시 토큰 있으면 유휴 순간에 prefetch (페이지 로딩 영향 없게 requestIdleCallback)
  function _schedulePrefetch() {
    const hasToken = () => {
      if (typeof window.authHeader === 'function') {
        const h = window.authHeader();
        return !!(h && h.Authorization);
      }
      return false;
    };
    const run = () => { if (hasToken()) prefetch().catch(() => {}); };
    if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 3000 });
    else setTimeout(run, 1200);
  }
  if (document.readyState === 'complete' || document.readyState === 'interactive') _schedulePrefetch();
  else document.addEventListener('DOMContentLoaded', _schedulePrefetch);

  window.Dashboard = {
    refresh: async function (force) {
      if (force) { for (const k in _cache) delete _cache[k]; }
      return _loadAndRender();
    },
    prefetch,
  };
})();
