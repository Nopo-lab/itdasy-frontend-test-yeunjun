/* app-caption-prefill.js — 사진 편집기 → 캡션 자동 prefill (§10 P2-10)
 * 의존: window.PhotoEditor (외부 비침투), window.openCaptionScenarioPopup
 *
 * 동작:
 *  1) PhotoEditor.open / openFromAction 호출을 wrapping → 시술명·가격·샵명 stash
 *  2) #peNextStepsModal 의 "캡션 만들기" 버튼 (data-pe-ns="caption") 클릭을 capture 단계에서 감지
 *      → localStorage 'caption_prefill' 키에 prefill 텍스트 저장
 *  3) captionText 가 채워질 때 (MutationObserver + 입력 이벤트) prefill 을 첫 줄에 한 번 prepend
 *
 * CLAUDE.md "시나리오 팝업 본문 불가침" — 시나리오 팝업의 흐름은 그대로. 결과 textarea 만 prepend.
 *
 * 공개 (선택):
 *   window.CaptionPrefill.set(text)      → localStorage 에 prefill 저장
 *   window.CaptionPrefill.clear()
 *   window.CaptionPrefill.consume()      → 한 번 읽고 비움
 */
(function () {
  'use strict';

  const KEY = 'caption_prefill';
  const FLAG = 'data-caption-prefilled';

  function _set(text) {
    const t = String(text == null ? '' : text).trim();
    if (!t) return false;
    try { localStorage.setItem(KEY, t); return true; }
    catch (_e) { return false; }
  }
  function _get() {
    try { return localStorage.getItem(KEY) || ''; } catch (_e) { return ''; }
  }
  function _clear() {
    try { localStorage.removeItem(KEY); } catch (_e) { void _e; }
  }
  function _consume() {
    const v = _get();
    _clear();
    return v;
  }

  function _fmtPrice(n) {
    const num = Number(n);
    if (!isFinite(num) || num <= 0) return '';
    if (num >= 10000) {
      const man = num / 10000;
      return (man % 1 === 0 ? man.toFixed(0) : man.toFixed(1)) + '만원';
    }
    return num.toLocaleString('ko-KR') + '원';
  }

  // ── PhotoEditor.open wrapping — 시술명·가격 stash ────
  let _lastOpenOpts = null;

  function _wrapPhotoEditor() {
    const PE = window.PhotoEditor;
    if (!PE || PE.__captionPrefillWrapped) return false;
    PE.__captionPrefillWrapped = true;

    const origOpen = PE.open;
    const origOpenFromAction = PE.openFromAction;
    if (typeof origOpen === 'function') {
      PE.open = function (opts) {
        try { _lastOpenOpts = opts || null; } catch (_e) { void _e; }
        return origOpen.apply(this, arguments);
      };
    }
    if (typeof origOpenFromAction === 'function') {
      PE.openFromAction = function (payload) {
        try {
          _lastOpenOpts = {
            serviceName: payload && (payload.service_name || payload.serviceName) || '',
            price: payload && +payload.price || 0,
          };
        } catch (_e) { void _e; }
        return origOpenFromAction.apply(this, arguments);
      };
    }
    return true;
  }

  // PhotoEditor 가 늦게 로드될 수도 있어서 폴링.
  (function _waitForPe() {
    if (_wrapPhotoEditor()) return;
    let tries = 0;
    const iv = setInterval(() => {
      if (_wrapPhotoEditor() || ++tries > 60) clearInterval(iv);
    }, 100);
  })();

  // ── 다음스텝 모달 "캡션 만들기" 버튼 capture ──────────
  // photo-editor.js 가 modified 인 상태라 직접 수정 안 함.
  // document 레벨 capture 단계 클릭 핸들러로 가로채서 prefill 만 set 한 뒤
  // photo-editor 의 자체 핸들러(모달 제거 + openCaptionScenarioPopup 호출) 가 그대로 진행되게 둠.
  document.addEventListener('click', function (e) {
    const btn = e.target.closest('#peNextStepsModal [data-pe-ns="caption"]');
    if (!btn) return;
    // prefill 후보 만들기
    const opts = _lastOpenOpts || {};
    const service = (opts.serviceName || opts.service_name || '').trim();
    const priceTxt = _fmtPrice(opts.price || 0);
    const parts = [];
    if (service) parts.push(service);
    if (priceTxt) parts.push(priceTxt);
    const prefill = parts.join(' · ');
    if (prefill) _set(prefill);
  }, true); // capture

  // ── captionText 채워질 때 한 번 prepend ──────────────
  // caption.js 가 textarea.value 를 직접 할당하므로 input/change 이벤트가 안 뜸 →
  // MutationObserver 로 textarea 가 추가될 때까지 기다린 뒤, 부모 트리 변경 감지로 채워짐 시점 잡기.
  // value 변경은 DOM mutation 안 일어남 → setTimeout polling 으로 보강.
  let _watching = false;
  function _maybeApplyPrefill() {
    const ta = document.getElementById('captionText');
    if (!ta) return false;
    if (ta.hasAttribute(FLAG)) return false; // 이미 적용
    const prefill = _get();
    if (!prefill) return false;
    const cur = ta.value || '';
    // caption 결과 도착 시점: 비어있지 않고 길이 > 5
    if (!cur || cur.length < 5) return false;
    // 이미 prefill 줄을 포함하면 skip
    if (cur.indexOf(prefill) === 0) {
      ta.setAttribute(FLAG, '1');
      _clear();
      return true;
    }
    ta.value = prefill + '\n\n' + cur;
    ta.setAttribute(FLAG, '1');
    // textarea auto-grow 가 있으면 트리거
    try {
      if (typeof window._capAutoGrow === 'function') window._capAutoGrow(ta);
      const ev = new Event('input', { bubbles: true });
      ta.dispatchEvent(ev);
    } catch (_e) { void _e; }
    _clear();
    return true;
  }

  function _startCaptionWatcher() {
    if (_watching) return;
    _watching = true;
    // body 에 mutation observer — captionText 가 새로 생기거나 화면 전환될 때.
    const mo = new MutationObserver(() => { _maybeApplyPrefill(); });
    try { mo.observe(document.body, { childList: true, subtree: true }); }
    catch (_e) { void _e; }
    // value 변경은 mutation 안 잡힘 → 짧은 폴링 (prefill 있을 때만 활성).
    setInterval(() => {
      const has = !!_get();
      if (has) _maybeApplyPrefill();
    }, 500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _startCaptionWatcher, { once: true });
  } else {
    _startCaptionWatcher();
  }

  window.CaptionPrefill = {
    set: _set,
    get: _get,
    clear: _clear,
    consume: _consume,
  };
})();
