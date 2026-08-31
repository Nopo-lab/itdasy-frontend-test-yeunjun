/* ─────────────────────────────────────────────────────────────
   비포/애프터 자동 감지 배너 (#4 · 2026-04-20)

   같은 customer_id 로 2장+ 포트폴리오 사진이 쌓이면
   대시보드 열릴 때 '전후 비교 만들래요?' 자동 제안 배너 1개 노출.
   탭 시 사진 편집기의 Before/After 비교 화면으로 연결.

   공개:
   - AutoBA.scanAndSuggest()  → Promise<{pair?, count}>
   - AutoBA.getBanner()       → DOM 삽입용 HTMLElement | null
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const CACHE_KEY = 'itdasy_autoba_dismissed_v1';
  const API_PATHS = { portfolio: '/portfolio' };

  function _apiUrl(key) {
    if (!window.API || !API_PATHS[key]) throw new Error('no-api');
    return new URL(API_PATHS[key], window.API).toString();
  }

  async function _apiGet(key) {
    if (!window.API || !window.authHeader) throw new Error('no-auth');
    const res = await fetch(_apiUrl(key), { headers: window.authHeader() });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  }

  function _loadDismissed() {
    try { return new Set(JSON.parse(localStorage.getItem(CACHE_KEY) || '[]')); }
    catch (err) {
      console.warn('[AutoBA] 닫은 제안 목록 불러오기 실패', err);
      return new Set();
    }
  }
  function _saveDismissed(set) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify([...set])); }
    catch (err) { console.warn('[AutoBA] 닫은 제안 목록 저장 실패', err); }
  }

  /**
   * /portfolio 조회 후 customer_id 별로 묶어 "가장 최근 2장이 다른 날 촬영"인 pair 반환.
   * 이미 dismiss 한 고객은 제외.
   */
  async function scanAndSuggest() {
    let items = [];
    try {
      const d = await _apiGet('portfolio');
      items = Array.isArray(d) ? d : (d.items || []);
    } catch (err) {
      console.warn('[AutoBA] 전후 사진 후보 불러오기 실패', err);
      return { pair: null, count: 0 };
    }

    if (!items.length) return { pair: null, count: 0 };

    const dismissed = _loadDismissed();
    const byCustomer = new Map();
    for (const it of items) {
      if (!it.customer_id) continue;
      if (dismissed.has(String(it.customer_id))) continue;
      if (!byCustomer.has(it.customer_id)) byCustomer.set(it.customer_id, []);
      byCustomer.get(it.customer_id).push(it);
    }

    let best = null;
    for (const [cid, arr] of byCustomer.entries()) {
      if (arr.length < 2) continue;
      const sorted = arr.slice().sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      const [latest, prev] = sorted;
      const t1 = new Date(latest.created_at || 0).getTime();
      const t2 = new Date(prev.created_at || 0).getTime();
      if (!t1 || !t2) continue;
      const daysApart = Math.abs(t1 - t2) / 86400000;
      // 같은 날이면 전·후 사진 아님. 1일 이상 떨어진 pair 만.
      if (daysApart < 1) continue;
      const score = 1 / (daysApart + 1);  // 너무 먼 pair 도 감점
      if (!best || score > best.score) {
        best = {
          score,
          customer_id: cid,
          customer_name: latest.customer_name || prev.customer_name || null,
          before: prev,
          after: latest,
        };
      }
    }
    return { pair: best, count: byCustomer.size };
  }

  function _esc(s) { return window._esc(s); } /* [2026-06-11] 중복 제거 — app-core 정본 위임 */

  /**
   * 배너 DOM 요소 반환. scanAndSuggest 후 pair 가 있을 때만.
   * 사용자가 '만들기' 클릭하면 사진 편집기 B/A 비교로 연결.
   */
  async function getBanner() {
    const { pair } = await scanAndSuggest();
    if (!pair) return null;
    const el = document.createElement('div');
    el.style.cssText = 'margin-bottom:14px;padding:14px;background:linear-gradient(135deg,rgba(255,107,157,0.12),rgba(213,138,149,0.04));border-radius:14px;border:1px solid rgba(213,138,149,0.2);display:flex;gap:10px;align-items:center;';
    el.innerHTML = `
      <div style="display:flex;gap:-8px;flex-shrink:0;">
        ${pair.before.image_url ? `<img src="${_esc(pair.before.image_url)}" alt="시술 전 사진" loading="lazy" decoding="async" style="width:44px;height:44px;border-radius:10px;object-fit:cover;border:2px solid #fff;">` : ''}
        ${pair.after.image_url ? `<img src="${_esc(pair.after.image_url)}" alt="시술 후 사진" loading="lazy" decoding="async" style="width:44px;height:44px;border-radius:10px;object-fit:cover;border:2px solid #fff;margin-left:-10px;">` : ''}
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:12px;font-weight:800;margin-bottom:2px;">${pair.customer_name ? _esc(window.withHonorific(pair.customer_name)) + ' ' : ''}비포·애프터 카드?</div>
        <div style="font-size:11px;color:#888;line-height:1.4;">같은 고객 사진 2장 감지 — 바로 전후 비교 이미지로 만들기</div>
      </div>
      <button data-auto-ba="make" style="padding:8px 14px;border:none;border-radius:10px;background:linear-gradient(135deg,var(--brand),var(--brand-strong));color:#fff;cursor:pointer;font-weight:800;font-size:12px;flex-shrink:0;">만들기</button>
      <button class="ss-close" data-auto-ba="dismiss" style="background:transparent;border:none;color:var(--text-subtle);font-size:18px;cursor:pointer;flex-shrink:0;" aria-label="닫기"><svg class="ic" width="18" height="18" aria-hidden="true"><use href="#ic-x"/></svg></button>
    `;
    el.querySelector('[data-auto-ba="make"]').addEventListener('click', () => {
      if (window.hapticMedium) window.hapticMedium();
      _openBAWithPair(pair);
    });
    el.querySelector('[data-auto-ba="dismiss"]').addEventListener('click', () => {
      const s = _loadDismissed();
      s.add(String(pair.customer_id));
      _saveDismissed(s);
      el.remove();
    });
    return el;
  }

  function _openBAWithPair(pair) {
    if (!pair || !pair.after || !pair.after.image_url) return;
    // [2026-07-22] 옛 PhotoEditor 'ba' 탭 제거 → 현재 작업실 전후 레이아웃(cat:'ba')으로.
    //   before/after 두 장을 그대로 넘겨서 레이아웃이 알아서 배치 — setSecondImage 수동 주입 불필요.
    if (!window.WorkspaceFlow || typeof window.WorkspaceFlow.command !== 'function') {
      if (window.showToast) window.showToast('작업실을 여는 중이에요. 잠시 후 다시 눌러주세요');
      return;
    }
    const urls = [];
    if (pair.before && pair.before.image_url) urls.push(pair.before.image_url);
    urls.push(pair.after.image_url);
    window.WorkspaceFlow.command({ type: 'open', cat: 'ba', photoUrls: urls });
    if (window.showToast) window.showToast('전후 카드를 만들 준비가 됐어요');
  }

  // [2026-07-22] _loadBeforeImage 제거 — 옛 PhotoEditorBA 슬라이더에 before 를 수동 주입하던 헬퍼.
  //   이제 before/after 두 장을 작업실 전후 레이아웃에 그대로 넘겨서 필요 없어짐.

  window.AutoBA = { scanAndSuggest, getBanner };
})();
