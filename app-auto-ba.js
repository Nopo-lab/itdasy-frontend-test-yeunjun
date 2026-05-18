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

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
  }

  /**
   * 배너 DOM 요소 반환. scanAndSuggest 후 pair 가 있을 때만.
   * 사용자가 '만들기' 클릭하면 사진 편집기 B/A 비교로 연결.
   */
  async function getBanner() {
    const { pair } = await scanAndSuggest();
    if (!pair) return null;
    const el = document.createElement('div');
    el.style.cssText = 'margin-bottom:14px;padding:14px;background:linear-gradient(135deg,rgba(255,107,157,0.12),rgba(241,128,145,0.04));border-radius:14px;border:1px solid rgba(241,128,145,0.2);display:flex;gap:10px;align-items:center;';
    el.innerHTML = `
      <div style="display:flex;gap:-8px;flex-shrink:0;">
        ${pair.before.image_url ? `<img src="${_esc(pair.before.image_url)}" style="width:44px;height:44px;border-radius:10px;object-fit:cover;border:2px solid #fff;">` : ''}
        ${pair.after.image_url ? `<img src="${_esc(pair.after.image_url)}" style="width:44px;height:44px;border-radius:10px;object-fit:cover;border:2px solid #fff;margin-left:-10px;">` : ''}
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:12px;font-weight:800;margin-bottom:2px;">${pair.customer_name ? _esc(pair.customer_name) + '님 ' : ''}비포·애프터 카드?</div>
        <div style="font-size:10px;color:#888;line-height:1.4;">같은 고객 사진 2장 감지 — 바로 전후 비교 이미지로 만들기</div>
      </div>
      <button data-auto-ba="make" style="padding:8px 14px;border:none;border-radius:10px;background:linear-gradient(135deg,var(--brand),var(--brand-strong));color:#fff;cursor:pointer;font-weight:800;font-size:12px;flex-shrink:0;">만들기</button>
      <button data-auto-ba="dismiss" style="background:none;border:none;color:var(--text-subtle);font-size:18px;cursor:pointer;flex-shrink:0;" aria-label="닫기">✕</button>
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
    if (!window.PhotoEditor || typeof window.PhotoEditor.open !== 'function') {
      if (window.showToast) window.showToast('사진 편집기를 불러오는 중이에요');
      return;
    }
    window.PhotoEditor.open({
      src: pair.after.image_url,
      initial_tab: 'ba',
      customer_id: pair.customer_id,
    });
    _loadBeforeImage(pair.before && pair.before.image_url);
  }

  function _loadBeforeImage(src) {
    if (!src || !window.PhotoEditorBA || typeof window.PhotoEditorBA.setSecondImage !== 'function') {
      if (window.showToast) window.showToast('비교할 사진을 한 장 더 골라주세요');
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      window.PhotoEditorBA.setSecondImage(img);
      if (window.showToast) window.showToast('전후 비교 화면을 열었어요');
    };
    img.onerror = () => {
      if (window.showToast) window.showToast('비교 사진을 불러오지 못했어요');
    };
    img.src = src;
  }

  window.AutoBA = { scanAndSuggest, getBanner };
})();
