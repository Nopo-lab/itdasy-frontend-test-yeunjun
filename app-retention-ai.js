/* Phase 9 P5 — at-risk customer surface */
(function () {
  'use strict';

  function _esc(s) { return window._esc(s); } /* [2026-06-11] 중복 제거 — app-core 정본 위임 */

  function _toast(msg) {
    if (window.showToast) window.showToast(msg);
  }
  function _money(n) {
    const v = Number(n) || 0;
    if (v <= 0) return '';
    return v >= 10000 ? Math.round(v / 10000) + '만원' : v.toLocaleString('ko-KR') + '원';
  }
  function _clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function _days(iso) {
    const t = iso ? new Date(iso).getTime() : 0;
    if (!t) return 0;
    return Math.max(0, Math.floor((Date.now() - t) / 86400000));
  }
  function _brand() {
    const bk = (window.BrandKit && typeof window.BrandKit.get === 'function') ? window.BrandKit.get() : {};
    return {
      tone: String(bk.brand_tone || '').trim(),
      booking: String(bk.booking_phrase || '').trim(),
      forbidden: String(bk.forbidden_words || '').split(/[,，\n]/).map(v => v.trim()).filter(Boolean),
    };
  }

  function _ensure() {
    let el = document.getElementById('retentionSheet');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'retentionSheet';
    el.className = 'p9-sheet';
    el.style.display = 'none';
    el.innerHTML = `
      <div class="p9-sheet__body" role="dialog" aria-modal="true">
        <div class="p9-sheet__head">
          <div class="p9-sheet__title">위험 고객</div>
          <button type="button" class="p9-sheet__close ss-close" data-rt-close aria-label="닫기"><svg class="ic" width="18" height="18" aria-hidden="true"><use href="#ic-x"/></svg></button>
        </div>
        <div id="rtList"></div>
      </div>`;
    document.body.appendChild(el);
    el.addEventListener('click', _onClick);
    return el;
  }

  async function _fetchAtRisk() {
    const res = await apiFetch('/retention/at-risk', { headers: window.authHeader() });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    return data.items || data.customers || [];
  }

  function _fallbackItems() {
    const cached = window.CustomerCache?.read ? window.CustomerCache.read({ minItems: 1 }) : null;
    const items = cached?.items || cached?.data || [];
    const now = Date.now();
    return items.filter(c => {
      const raw = c.last_visit_at || c.last_visit || c.updated_at || c.created_at;
      const t = raw ? new Date(raw).getTime() : 0;
      return !t || now - t > 90 * 24 * 3600 * 1000;
    }).slice(0, 20);
  }

  function _catalog() {
    try {
      const raw = window._serviceTemplatesCache || JSON.parse(localStorage.getItem('itdasy_service_templates_cache') || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch (_e) { return []; }
  }

  function _serviceMeta(name) {
    const target = String(name || '').trim();
    if (!target) return null;
    return _catalog().find(s => String(s.name || '').trim() === target) || null;
  }

  function _shopDefaultCycle() {
    try {
      const raw = localStorage.getItem('shop_type') || localStorage.getItem('itdasy_shop_type') || '';
      if (/네일|nail/i.test(raw)) return 28;
      if (/속눈썹|lash|eye/i.test(raw)) return 28;
      if (/피부|skin/i.test(raw)) return 21;
      if (/왁싱|wax|브로우|brow/i.test(raw)) return 35;
      if (/헤어|hair|미용/i.test(raw)) return 42;
    } catch (_e) { void _e; }
    return 35;
  }

  function _rowTime(r) {
    return new Date(r.recorded_at || r.created_at || r.visited_at || r.date || 0).getTime();
  }

  function _recentRows(rows) {
    return (rows || []).filter(Boolean).slice().sort((a, b) => _rowTime(b) - _rowTime(a));
  }

  function _median(nums) {
    const arr = nums.filter(n => n > 0).sort((a, b) => a - b);
    if (!arr.length) return 0;
    return arr[Math.floor(arr.length / 2)];
  }

  function _intervalDays(rows) {
    const times = _recentRows(rows).map(_rowTime).filter(Boolean);
    const gaps = [];
    for (let i = 0; i < times.length - 1; i++) gaps.push(Math.round((times[i] - times[i + 1]) / 86400000));
    return _median(gaps);
  }

  function _serviceProfile(rows, fallback) {
    const map = {};
    _recentRows(rows).forEach((r, i) => {
      const name = String((r && r.service_name) || '').trim();
      if (!name) return;
      if (!map[name]) map[name] = { name, count: 0, weight: 0, amounts: [] };
      map[name].count += 1;
      map[name].weight += 1 / (i + 1);
      if (+r.amount > 0) map[name].amounts.push(+r.amount);
    });
    const best = Object.values(map).sort((a, b) => b.weight - a.weight)[0];
    if (best) return best;
    return { name: fallback || '지난 시술', count: 0, weight: 0, amounts: [] };
  }

  function _avgTicket(rows, fallback, service) {
    const same = (rows || []).filter(r => !service || r.service_name === service);
    const source = same.length ? same : (rows || []);
    const amounts = source.map(r => Number(r && r.amount) || 0).filter(Boolean).slice(0, 8);
    const fallbackN = Number(fallback) || 0;
    if (!amounts.length) return fallbackN;
    return Math.round(amounts.reduce((a, b) => a + b, 0) / amounts.length);
  }

  async function _dashboard(item) {
    const id = item.customer_id || item.id;
    if (!id || !window.apiFetch || !window.authHeader) return null;
    const res = await window.apiFetch('/customers/' + encodeURIComponent(id) + '/dashboard', { headers: window.authHeader() });
    if (!res || !res.ok) return null;
    return await res.json();
  }

  function _confidence(rows, cycle, avg, service) {
    let score = 15;
    score += Math.min(30, (rows || []).length * 8);
    if (cycle) score += 20;
    if (avg) score += 20;
    if (service && service !== '지난 시술') score += 15;
    return _clamp(score, 20, 100);
  }

  function _probability(days, cycle, visitCount, confidence) {
    const ratio = cycle ? days / cycle : 1;
    let p = 0.18 + Math.min(0.38, Math.max(0, ratio - 0.75) * 0.28);
    if (ratio >= 1.1) p += 0.12;
    if (ratio >= 1.6) p -= 0.08;
    if (visitCount >= 3) p += 0.08;
    if (visitCount >= 8) p += 0.06;
    p += (confidence - 50) / 500;
    return _clamp(p, 0.12, 0.78);
  }

  function _segment(days, cycle, service) {
    if (!cycle) return '기록 보강';
    const ratio = days / cycle;
    if (ratio >= 1.8) return '휴면 복귀';
    if (/리터치|retouch/i.test(service || '') || (ratio >= 0.9 && ratio < 1.35)) return '리터치 타이밍';
    if (ratio >= 1.35) return '재방문 타이밍';
    return '곧 챙길 고객';
  }

  function _cycle(item, dashboard, customer, rows, service) {
    const meta = _serviceMeta(service);
    const fromItem = Number(item.avg_interval_days) || 0;
    const fromDashboard = Number(dashboard?.retention?.avg_interval_days) || 0;
    const fromCustomer = Number(customer.avg_cycle_weeks) ? Math.round(Number(customer.avg_cycle_weeks) * 7) : 0;
    const fromRows = _intervalDays(rows);
    const fromService = Number(meta?.retouch_period_days) || 0;
    return Math.round(fromItem || fromDashboard || fromCustomer || fromRows || fromService || _shopDefaultCycle());
  }

  function _opportunity(item, dashboard) {
    const d = dashboard || {};
    const c = d.customer || item || {};
    const stats = d.stats || {};
    const rows = _recentRows(d.recent_revenues || []);
    const serviceProfile = _serviceProfile(rows, item.last_service || item.service_name);
    const service = serviceProfile.name;
    const days = Number(item.days_since_last) || _days(stats.last_visit_at || c.last_visit_at || item.last_visit_at);
    const cycle = _cycle(item, d, c, rows, service);
    const avg = _avgTicket(rows, item.avg_ticket || stats.avg_ticket || item.amount, service);
    const visitCount = Number(stats.visit_count || c.visit_count || item.visit_count || rows.length) || 0;
    const overdue = cycle > 0 && days > cycle ? days - cycle : 0;
    const confidence = _confidence(rows, cycle, avg, service);
    const probability = _probability(days, cycle, visitCount, confidence);
    const expected = Math.round((avg || 0) * probability);
    const score = _clamp(Math.round(probability * 100 + confidence * 0.25 + (expected / 10000) * 3), 10, 100);
    return { days, cycle, service, avg, overdue, score, probability, expected, confidence,
      segment: _segment(days, cycle, service), visitCount };
  }

  async function _enrich(items) {
    const targets = (items || []).slice(0, 20);
    const enriched = await Promise.all(targets.map(async item => {
      try { return { ...item, __op: _opportunity(item, await _dashboard(item)) }; }
      catch (e) { console.warn('[retention] 고객 기회 계산 실패:', e); return { ...item, __op: _opportunity(item, null) }; }
    }));
    return enriched.sort((a, b) => ((b.__op?.expected || 0) - (a.__op?.expected || 0))
      || ((b.__op?.score || 0) - (a.__op?.score || 0)));
  }

  function _safeDraft(text, brand) {
    let out = String(text || '');
    const policy = window.ItdasyMarketingDraftPolicy;
    if (policy && typeof policy.sanitize === 'function') out = policy.sanitize(out);
    (brand.forbidden || []).forEach(word => {
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      out = out.replace(new RegExp(escaped, 'g'), '');
    });
    return out.replace(/\s{2,}/g, ' ').trim();
  }

  function _draft(item) {
    const name = item.name || item.customer_name || '고객님';
    const op = item.__op || {};
    const brand = _brand();
    const service = op.service || item.last_service || item.service_name || '지난 시술';
    const when = op.days ? `${op.days}일 정도 지나서` : '시간이 조금 지나서';
    const action = op.segment === '휴면 복귀' ? '오랜만에 상태 확인차'
      : (op.segment === '리터치 타이밍' ? '리터치 시기가 가까워져서' : '재방문 타이밍이라');
    const soft = /친근|따뜻|부드/.test(brand.tone);
    const base = soft
      ? `${name}, 안녕하세요. 지난 ${service} 이후 ${when} ${action} 연락드려요. 필요하시면 편한 시간에 다시 예쁘게 정돈해드릴게요.`
      : `${name}, 지난 ${service} 이후 ${when} ${action} 안내드려요. 편한 시간 알려주시면 일정 도와드릴게요.`;
    return _safeDraft([base, brand.booking].filter(Boolean).join(' '), brand);
  }

  function _reason(item) {
    const op = item.__op || {};
    const bits = [op.segment || '재방문 관리'];
    if (op.days) bits.push('마지막 방문 ' + op.days + '일 전');
    if (op.cycle) bits.push('평균 주기 ' + op.cycle + '일');
    if (op.overdue) bits.push(op.overdue + '일 지남');
    if (op.visitCount) bits.push('방문 ' + op.visitCount + '회');
    return bits.join(' · ') || item.reason || item.risk_reason || '방문 주기가 지났어요';
  }

  function _summary(items) {
    const total = (items || []).reduce((sum, item) => sum + (item.__op?.expected || 0), 0);
    const top = (items || []).filter(item => item.__op?.expected > 0).slice(0, 3);
    if (!total) return '';
    const names = top.map(item => item.name || item.customer_name || '고객').join(' · ');
    return '<div class="p9-sheet__meta">예상 회복 매출 ' + _esc(_money(total))
      + (names ? ' · 먼저 볼 고객 ' + _esc(names) : '') + '</div>';
  }

  function _valueLine(op) {
    const parts = [];
    if (op.expected) parts.push('예상 회복 매출 ' + _money(op.expected));
    if (op.avg) parts.push('객단가 ' + _money(op.avg));
    if (op.probability) parts.push('성사 가능성 ' + Math.round(op.probability * 100) + '%');
    if (op.confidence) parts.push('판단 신뢰도 ' + op.confidence + '%');
    return parts.join(' · ') || '최근 기록이 쌓이면 예상 금액도 보여줘요.';
  }

  function _render(items, offline) {
    const list = document.getElementById('rtList');
    if (!items.length) {
      list.innerHTML = '<div class="p9-sheet__card">지금 챙길 위험 고객이 없어요.</div>';
      return;
    }
    const badge = offline ? '<div class="p9-sheet__meta">서버 대신 저장된 고객 기준으로 보여줘요.</div>' : '';
    list.innerHTML = badge + _summary(items) + items.map(item => {
      const name = item.name || item.customer_name || '고객';
      const op = item.__op || {};
      const id = item.customer_id || item.id || '';
      return `<div class="p9-sheet__card" data-rt-id="${_esc(id)}" data-rt-draft="${_esc(_draft(item))}">
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="font-weight:900;">${_esc(name)}</div>
          <span style="margin-left:auto;font-size:11px;font-weight:900;color:#BC6675;">우선순위 ${op.score || 35}%</span>
        </div>
        <div class="p9-sheet__meta">${_esc(_reason(item))}</div>
        <div style="margin-top:8px;padding:9px 10px;border-radius:10px;background:rgba(213,138,149,.06);border:1px solid rgba(213,138,149,.12);">
          <div style="font-size:12px;font-weight:900;color:#333;">추천 제안: ${_esc(op.segment || '재방문 관리')} · ${_esc(op.service || '재방문 관리')}</div>
          <div style="font-size:11px;color:#777;margin-top:3px;">${_esc(_valueLine(op))}</div>
        </div>
        <div class="p9-sheet__row" style="margin-top:10px;">
          <button type="button" class="p9-sheet__ghost" data-rt-copy>DM 초안 복사</button>
          ${id ? '<button type="button" class="p9-sheet__ghost" data-rt-open>고객 기록</button>' : ''}
        </div>
      </div>`;
    }).join('');
  }

  async function openRetentionAI() {
    const el = _ensure();
    el.style.display = 'flex';
    const list = document.getElementById('rtList');
    if (window.showSkeleton) window.showSkeleton(list, 4);
    try {
      _render(await _enrich(await _fetchAtRisk()), false);
    } catch (e) {
      console.warn('[retention] fetch failed:', e);
      _render(await _enrich(_fallbackItems()), true);
    }
  }

  function closeRetentionAI() {
    const el = document.getElementById('retentionSheet');
    if (el) el.style.display = 'none';
  }

  async function _onClick(e) {
    const el = _ensure();
    if (e.target === el || e.target.closest('[data-rt-close]')) return closeRetentionAI();
    const btn = e.target.closest('[data-rt-copy]');
    const open = e.target.closest('[data-rt-open]');
    if (open) {
      const id = open.closest('[data-rt-id]')?.dataset.rtId || '';
      if (id && typeof window.openCustomerDashboard === 'function') window.openCustomerDashboard(id);
      return;
    }
    if (!btn) return;
    const draft = btn.closest('[data-rt-draft]')?.dataset.rtDraft || '';
    try { await navigator.clipboard.writeText(draft); _toast('DM 초안 복사 완료'); }
    catch (_) { _toast(draft); }
  }

  window.openRetentionAI = openRetentionAI;
  window.closeRetentionAI = closeRetentionAI;
  window.RevenueOpportunityEngine = {
    enrich: _enrich,
    analyze: _opportunity,
    draft: _draft,
    summary: _summary,
  };
})();
