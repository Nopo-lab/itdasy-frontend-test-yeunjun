/*
 * AI 사용 동의 홈 카드
 *
 * AI 요청이 실패할 때마다 팝업을 띄우지 않는다. 가입 때 선택하지 않은 경우
 * 홈에서 한 번 설명하고, 사용자가 전체 동의 또는 필수 기능만 사용을 고른다.
 * 서버의 동의 기록이 최종 기준이며 localStorage 값은 화면을 덜 반복해서 보여주기
 * 위한 힌트일 뿐이다.
 */
(function aiConsentHome() {
  'use strict';

  const CARD_ID = 'aiConsentHomeCard';
  const DECISION_KEY = 'itdasy_ai_consent_decision_v1';
  const AI_VERSION = '2.0';
  let _status = null;
  let _request = null;
  let _busy = false;
  let _forceOpen = false;
  let _bound = false;

  function _card() { return document.getElementById(CARD_ID); }
  function _token() {
    try { return typeof window.getToken === 'function' ? String(window.getToken() || '') : ''; }
    catch (e) { console.warn('[ai-consent-home] 로그인표 확인 실패:', e); return ''; }
  }
  function _authorization() {
    const token = _token();
    if (!token) return '';
    return /^Bearer\s/i.test(token) ? token : `Bearer ${token}`;
  }
  function _userId() {
    try {
      const id = typeof window.getMyUserId === 'function' ? window.getMyUserId() : null;
      return id == null || Number.isNaN(Number(id)) ? '' : String(id);
    } catch (e) { console.warn('[ai-consent-home] 계정 확인 실패:', e); return ''; }
  }
  function _snapshot() { return { authorization: _authorization(), userId: _userId() }; }
  function _sameAccount(snapshot) {
    const current = _snapshot();
    return !!snapshot.authorization && current.authorization === snapshot.authorization
      && (!snapshot.userId || !current.userId || snapshot.userId === current.userId);
  }
  function _decisionKey(userId) { return userId ? `${DECISION_KEY}:${userId}` : ''; }
  function _readDecision(userId) {
    const key = _decisionKey(userId);
    if (!key) return '';
    try { return localStorage.getItem(key) || ''; }
    catch (e) { console.warn('[ai-consent-home] 설정 읽기 실패:', e); return ''; }
  }
  function _remember(decision, userId) {
    const key = _decisionKey(userId);
    if (!key) return;
    try { localStorage.setItem(key, decision); }
    catch (e) { console.warn('[ai-consent-home] 설정 저장 실패:', e); }
  }
  function _text(selector, value) {
    const el = _card()?.querySelector(selector);
    if (el) el.textContent = value;
  }
  function _buttons(disabled) {
    _card()?.querySelectorAll('[data-ai-consent-action]').forEach((button) => {
      button.disabled = !!disabled;
    });
  }
  function _toast(message) {
    if (typeof window.showToast === 'function') window.showToast(message);
  }
  // [T-915] 쿠키/오류진단 동의를 이 카드가 같이 받는다.
  //   첫 화면에 동의 팝업이 2개 겹쳐 뜨던 걸 하나로 합쳤다(연준님 지적 2026-09-20).
  //   카드가 뜨면 배너를 접고, 카드가 안 뜨기로 하면 배너를 되돌려 준다.
  function _cookieConsent() {
    try { return window.itdasyConsent || null; } catch (e) { return null; }
  }
  function _deferCookieBanner() {
    try { _cookieConsent()?.deferToCombined?.(); }
    catch (e) { console.warn('[ai-consent-home] 배너 접기 실패:', e); }
  }
  function _releaseCookieBanner() {
    try { _cookieConsent()?.releaseDeferred?.(); }
    catch (e) { console.warn('[ai-consent-home] 배너 복귀 실패:', e); }
  }

  function _hide() {
    const card = _card();
    if (card) card.hidden = true;
    // 이 카드가 안 뜨면 쿠키 동의는 원래대로 배너가 받아야 한다.
    _releaseCookieBanner();
  }
  function _show() {
    const card = _card();
    if (card) card.hidden = false;
    _deferCookieBanner();
    return card;
  }

  function _renderLoading() {
    const card = _show();
    if (!card) return;
    card.dataset.state = 'loading';
    _text('[data-ai-consent-title]', 'AI 사용 설정을 확인하는 중이에요');
    _text('[data-ai-consent-copy]', '잠시만 기다려 주세요. 설정을 불러오고 있어요.');
    _text('[data-ai-consent-status]', '');
    _buttons(true);
  }

  function _renderError(message) {
    const card = _show();
    if (!card) return;
    card.dataset.state = 'error';
    _text('[data-ai-consent-title]', 'AI 사용 설정을 불러오지 못했어요');
    _text('[data-ai-consent-copy]', '연결을 확인한 뒤 다시 시도해 주세요. 동의하기 전에는 AI 기능이 실행되지 않아요.');
    _text('[data-ai-consent-status]', message || '잠시 후 다시 시도해 주세요.');
    const all = card.querySelector('[data-ai-consent-action="all"]');
    const partial = card.querySelector('[data-ai-consent-action="partial"]');
    if (all) { all.hidden = false; all.textContent = '다시 시도'; all.dataset.aiConsentAction = 'retry'; }
    if (partial) partial.hidden = true;
    _buttons(false);
  }

  function _renderStatus(status) {
    const card = _card();
    if (!card || !status) return;
    if (status.all_agreed) {
      _hide();
      _forceOpen = false;
      _remember('all', _userId());
      return;
    }

    const compact = !_forceOpen && _readDecision(_userId()) === 'partial';
    _show();
    card.dataset.state = compact ? 'partial' : 'needs';
    _text('[data-ai-consent-title]', compact ? 'AI 기능은 꺼져 있어요' : 'AI 기능을 켜둘까요?');
    _text('[data-ai-consent-copy]', compact
      ? '캡션·사진 설명을 쓰려면 AI 사용 동의를 켜주세요. 동의 전에는 입력 내용이 외부 처리업체로 전송되지 않아요.'
      : '캡션·사진 설명·음성 기능을 쓰면 입력한 내용이 Google Cloud Vertex AI(Gemini) 등 외부 처리업체로 전송됩니다. 앱 오류가 났을 때 원인을 빨리 찾기 위한 진단 정보도 함께 보내요. 처리 목적과 보유기간은 개인정보처리방침에서 확인할 수 있어요.');
    _text('[data-ai-consent-status]', compact ? '현재 설정: 필수 기능만 사용' : '전체 동의하면 AI 기능과 오류 진단을 켜요. 필수 기능만 선택하면 둘 다 꺼져 있어요. 설정에서 언제든 바꿀 수 있어요.');

    const all = card.querySelector('[data-ai-consent-action="all"], [data-ai-consent-action="retry"]');
    const partial = card.querySelector('[data-ai-consent-action="partial"]');
    if (all) {
      all.hidden = false;
      all.textContent = compact ? 'AI 기능 켜기' : '전체 동의';
      all.dataset.aiConsentAction = 'all';
    }
    if (partial) {
      partial.hidden = compact;
      partial.dataset.aiConsentAction = 'partial';
    }
    _buttons(false);
  }

  async function _loadStatus(snapshot) {
    // 캐시 무효화는 쿼리 파라미터(_nc)로 한다. `Cache-Control` 헤더를 붙이면
    // 교차 출처 요청이 CORS 프리플라이트를 타는데, 백엔드 allow_headers 에
    // Cache-Control 이 없어 400 으로 막혀 상태 조회가 항상 실패했다(T-912 회귀).
    const res = await window.apiFetch(`/persona/consent?_nc=${Date.now()}`, {
      method: 'GET',
      headers: { Authorization: snapshot.authorization },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(String(data.detail || `HTTP ${res.status}`));
    const raw = data.status || data;
    return {
      pipa_collect: !!raw.pipa_collect,
      ai_processing: !!raw.ai_processing,
      all_agreed: !!raw.all_agreed || (!!raw.pipa_collect && !!raw.ai_processing),
    };
  }

  async function refresh(options) {
    const opts = options || {};
    if (!_card()) return null;
    const snapshot = _snapshot();
    if (!snapshot.authorization) { _hide(); return null; }
    if (_request && !opts.force) return _request;
    if (opts.reveal) _renderLoading();
    const task = (async () => {
      try {
        const status = await _loadStatus(snapshot);
        if (!_sameAccount(snapshot)) return null;
        _status = status;
        _renderStatus(status);
        return status;
      } catch (e) {
        console.warn('[ai-consent-home] 상태 조회 실패:', e);
        if (_sameAccount(snapshot)) _renderError('상태를 확인하지 못했어요. 다시 시도해 주세요.');
        return null;
      }
    })();
    _request = task;
    try { return await task; }
    finally { if (_request === task) _request = null; }
  }

  async function _save(aiProcessing) {
    if (_busy) return;
    const snapshot = _snapshot();
    if (!snapshot.authorization) { _toast('로그인이 필요해요.'); return; }
    _busy = true;
    _buttons(true);
    try {
      if (!_sameAccount(snapshot)) throw new Error('account_changed');
      const res = await window.apiFetch('/persona/consent', {
        method: 'POST',
        headers: { Authorization: snapshot.authorization, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pipa_collect: true,
          ai_processing: !!aiProcessing,
          versions: { pipa_collect: '1.0', ai_processing: AI_VERSION },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(data.detail || `HTTP ${res.status}`));
      if (!_sameAccount(snapshot)) throw new Error('account_changed');
      _status = { pipa_collect: true, ai_processing: !!aiProcessing, all_agreed: !!aiProcessing };
      _remember(aiProcessing ? 'all' : 'partial', snapshot.userId);
      // [T-915] 합친 동의 — '전체 동의' 는 오류 진단(Sentry)까지, '필수 기능만' 은 둘 다 끈다.
      //   카드 안내문이 두 가지를 모두 적고 있으므로 여기서 같이 반영한다.
      try {
        const cc = _cookieConsent();
        if (cc) { if (aiProcessing) cc.grant(); else cc.deny(); }
      } catch (e) { console.warn('[ai-consent-home] 오류진단 동의 반영 실패:', e); }
      _forceOpen = false;
      _renderStatus(_status);
      _toast(aiProcessing ? 'AI 기능을 켰어요.' : '필수 기능만 사용하도록 설정했어요.');
    } catch (e) {
      console.warn('[ai-consent-home] 동의 저장 실패:', e);
      if (e && e.message === 'account_changed') _toast('계정이 바뀌어 저장을 취소했어요. 다시 시도해 주세요.');
      else { _renderError('저장하지 못했어요. 연결을 확인하고 다시 시도해 주세요.'); _toast('AI 사용 설정을 저장하지 못했어요.'); }
    } finally {
      _busy = false;
      _buttons(false);
    }
  }

  async function open(options) {
    const card = _card();
    if (!card) return false;
    const opts = options || {};
    _forceOpen = !!opts.force;
    if (window.__ITDASY_CURRENT_TAB__ !== 'home' && typeof window.showTab === 'function') {
      try { window.showTab('home'); } catch (e) { console.warn('[ai-consent-home] 홈 이동 실패:', e); }
    }
    _renderLoading();
    await refresh({ force: true, reveal: true });
    setTimeout(() => {
      try { if (!card.hidden) card.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      catch (e) { console.warn('[ai-consent-home] 카드 이동 실패:', e); }
    }, 60);
    return true;
  }

  function _onAction(event) {
    const button = event.target.closest('[data-ai-consent-action]');
    if (!button || !_card()?.contains(button)) return;
    event.preventDefault();
    const action = button.dataset.aiConsentAction;
    if (action === 'all') _save(true);
    else if (action === 'partial') _save(false);
    else if (action === 'retry') refresh({ force: true, reveal: true });
  }

  function _init() {
    if (_bound || !_card()) return;
    _bound = true;
    _card().addEventListener('click', _onAction);
    window.addEventListener('itdasy:session-ready', () => {
      _forceOpen = false;
      refresh({ force: true });
    });
    if (_authorization()) refresh({ force: true });
  }

  window.AiConsentHome = { open, refresh };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _init, { once: true });
  else _init();
})();
