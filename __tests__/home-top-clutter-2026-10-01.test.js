/** @jest-environment jsdom */
/* [2026-10-01] 홈 상단을 가리던 두 가지 — 원장 지적("AI 권한이 위에 쳐 있고 인스타 연동 팝업 뜨고").
 *
 *  1) 인스타 미연동이면 전면 홍보 카드(#homePreConnect)가 홈(#homePostConnect)을 **통째로 대체**했고,
 *     '나중에 할게요' 상태(localStorage 'itdasy_ipc_dismissed')를 로그아웃이 지워 재로그인마다 다시 떴다
 *     (감사 flow-home-daily-retention-02). → 홈은 항상 보이고, 안내는 한 줄 띠(#ipcMiniBar) + ✕ 뿐.
 *     닫음은 계정별 키('itdasy_ipc_dismissed:<uid>')로 기억하고 로그아웃 정리에서 보존한다.
 *  2) AI 동의 카드는 결정 전 큰 카드, '필수 기능만' 뒤에도 접힌 카드로 **영구히** 상단에 남았다.
 *     → 기본은 한 줄 요약(+자세히/나중에), '나중에'는 7일 숨김(배너도 조용히), 결정 뒤엔 숨김,
 *       설정/AI 기능에서 열면(force) 전체 안내문으로 펼친다.
 *  3) 쿠키/오류진단 배너 8초 안전장치가 카드가 떠 있어도 또 떴다(감사 flow-account-firstrun-03) → _cardHandled.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const html = read('index.html');
const ai = read('js/ai-consent-home.js');
const cookie = read('app-cookie-consent.js');
const ig = read('app-instagram.js');
const core = read('app-core.js');

function response(payload, ok = true, status = 200) { return { ok, status, json: async () => payload }; }

function mountConsent(status) {
  const start = html.indexOf('<section id="aiConsentHomeCard"');
  const end = html.indexOf('</section>', start) + '</section>'.length;
  document.body.innerHTML = html.slice(start, end);
  window.getToken = jest.fn(() => 'jwt-a');
  window.getMyUserId = jest.fn(() => 7);
  window.showToast = jest.fn();
  window.itdasyConsent = { deferToCombined: jest.fn(), releaseDeferred: jest.fn(), grant: jest.fn(), deny: jest.fn() };
  window.apiFetch = jest.fn().mockResolvedValue(response({ status: status || { pipa_collect: false, ai_processing: false, all_agreed: false } }));
  window.eval(ai);
  return document.getElementById('aiConsentHomeCard');
}

describe('AI 동의 카드 — 한 줄 요약이 기본, 결정·나중에 뒤엔 홈에 안 남는다', () => {
  beforeEach(() => { localStorage.clear(); delete window.AiConsentHome; });

  test('결정 전: needs(한 줄) 상태로 뜨고, 전체 안내문·동의 버튼은 접혀 있다(마크업 계약)', async () => {
    const card = mountConsent();
    await window.AiConsentHome.refresh({ force: true });
    expect(card.hidden).toBe(false);
    expect(card.dataset.state).toBe('needs');
    expect(card.querySelector('[data-ai-consent-brief]')).toBeTruthy();
    expect(card.querySelector('[data-ai-consent-action="expand"]')).toBeTruthy();
    expect(card.querySelector('[data-ai-consent-action="later"]')).toBeTruthy();
    // 동의 버튼·전체 안내문은 data-ai-consent-full 로 묶여 needs 에서 CSS 로 숨는다
    for (const el of card.querySelectorAll('[data-ai-consent-full]')) expect(el).toBeTruthy();
    expect(card.querySelector('[data-ai-consent-action="all"]').closest('[data-ai-consent-full]')).toBeTruthy();
    expect(card.querySelector('[data-ai-consent-copy]').hasAttribute('data-ai-consent-full')).toBe(true);
    const css = read('style-home.css');
    expect(css).toMatch(/\.ai-consent-home\[data-state="needs"\] \[data-ai-consent-full\] \{ display: none !important; \}/);
    expect(css).toMatch(/\.ai-consent-home:not\(\[data-state="needs"\]\) \[data-ai-consent-brief\]/);
    expect(window.itdasyConsent.deferToCombined).toHaveBeenCalled();
  });

  test('[자세히 보고 설정] → needs-open 으로 펼친다(동의는 안내문을 본 뒤에)', async () => {
    const card = mountConsent();
    await window.AiConsentHome.refresh({ force: true });
    card.querySelector('[data-ai-consent-action="expand"]').click();
    expect(card.hidden).toBe(false);
    expect(card.dataset.state).toBe('needs-open');
    expect(card.querySelector('[data-ai-consent-action="all"]').textContent).toBe('전체 동의');
  });

  test('[나중에] → 7일 숨김(계정별) + 쿠키/오류진단 동의는 배너에 돌려준다(영영 못 받는 일 없음) + 다음 refresh 에도 숨김', async () => {
    const card = mountConsent();
    await window.AiConsentHome.refresh({ force: true });
    window.itdasyConsent.releaseDeferred.mockClear();
    card.querySelector('[data-ai-consent-action="later"]').click();
    expect(card.hidden).toBe(true);
    const until = Number(localStorage.getItem('itdasy_ai_consent_later_v1:7'));
    expect(until).toBeGreaterThan(Date.now() + 6 * 24 * 3600 * 1000);
    // 리뷰 지적: '나중에' 가 배너까지 침묵시키면 _cardHandled 때문에 8초 안전장치도 안 돌아 7일간 동의를 못 받는다 → 배너는 돌려준다
    expect(window.itdasyConsent.releaseDeferred).toHaveBeenCalledTimes(1);
    expect(window.showToast).toHaveBeenCalledWith(expect.stringContaining('설정'));
    await window.AiConsentHome.refresh({ force: true });
    expect(card.hidden).toBe(true);
  });

  test('나중에 숨긴 동안에도 AI 기능/설정에서 open({force}) 하면 전체 안내문으로 뜬다', async () => {
    const card = mountConsent();
    localStorage.setItem('itdasy_ai_consent_later_v1:7', String(Date.now() + 1000000));
    await window.AiConsentHome.refresh({ force: true });
    expect(card.hidden).toBe(true);
    await window.AiConsentHome.open({ force: true });
    expect(card.hidden).toBe(false);
    expect(card.dataset.state).toBe('needs-open');
  });

  test('7일이 지나면 다시 한 줄 요약으로 돌아온다', async () => {
    const card = mountConsent();
    localStorage.setItem('itdasy_ai_consent_later_v1:7', String(Date.now() - 1));
    await window.AiConsentHome.refresh({ force: true });
    expect(card.hidden).toBe(false);
    expect(card.dataset.state).toBe('needs');
  });

  test("'필수 기능만' 을 이미 고른 계정은 홈에 카드가 없다 (force 열기만 partial 로 보임)", async () => {
    const card = mountConsent({ pipa_collect: true, ai_processing: false, all_agreed: false });
    localStorage.setItem('itdasy_ai_consent_decision_v1:7', 'partial');
    await window.AiConsentHome.refresh({ force: true });
    expect(card.hidden).toBe(true);
    await window.AiConsentHome.open({ force: true });
    expect(card.dataset.state).toBe('partial');
    expect(card.querySelector('[data-ai-consent-action="all"]').textContent).toBe('AI 기능 켜기');
  });

  test('전체 동의한 계정은 그대로 숨김', async () => {
    const card = mountConsent({ pipa_collect: true, ai_processing: true, all_agreed: true });
    await window.AiConsentHome.refresh({ force: true });
    expect(card.hidden).toBe(true);
  });
});

describe('쿠키/오류진단 배너 — 카드가 받고 있으면 8초 안전장치가 또 띄우지 않는다', () => {
  test('소스 계약: deferToCombined 가 _cardHandled 를 켜고, 타이머는 그걸 본다', () => {
    expect(cookie).toMatch(/deferToCombined\(\) \{ _deferred = true; _cardHandled = true;/);
    expect(cookie).toMatch(/if \(_deferred && !_cardHandled && !_get\(\)\.state\)/);
    expect(cookie).toMatch(/_cardHandled = false;\s*\n\s*if \(!_get\(\)\.state\) _injectBanner\(\);/);
  });

  test('배너는 작게·탭바 위에 앉고, 설정 하위화면이 열려 있으면 숨는다(저장 버튼 가림 방지)', () => {
    expect(cookie).toMatch(/document\.querySelector\('\.tab-bar'\)/);
    expect(cookie).toMatch(/bottom:\$\{tabH \? tabH \+ 'px' : '0'\}/);
    // 탭바가 늦게 올라와도(슬라이드 인) 다시 재서 올려 앉힌다
    expect(cookie).toMatch(/\[0, 400, 1200, 2500\]\.forEach\(\(ms\) => setTimeout\(_placeAboveTabBar, ms\)\)/);
    expect(cookie).toMatch(/body:has\(\.subscreen-overlay\.is-open\) #itdasyCookieBanner \{ display: none !important; \}/);
    expect(cookie).toMatch(/min-height:40px/);
    expect(cookie).not.toMatch(/padding:16px 18px/);
  });

  test('실행: 로그인 + 카드 존재 → 카드가 deferToCombined → 8초 뒤 배너 없음 / 카드가 침묵하면 배너 있음', () => {
    jest.useFakeTimers();
    try {
      for (const cardSpeaks of [true, false]) {
        localStorage.clear();
        document.body.innerHTML = '<section id="aiConsentHomeCard" hidden></section>';
        window.getToken = () => 'jwt';
        delete window.itdasyConsent;
        window.eval(cookie);
        if (cardSpeaks) window.itdasyConsent.deferToCombined();
        jest.advanceTimersByTime(8100);
        const banner = document.getElementById("itdasyCookieBanner");
        if (cardSpeaks) expect(banner).toBeNull();
        else expect(banner).not.toBeNull();
      }
    } finally { jest.useRealTimers(); }
  });
});

describe('인스타 미연동 홈 — 전면 홍보 카드 대신 한 줄 띠, 홈은 항상 보인다', () => {
  test('index.html: #homePreConnect 영구 숨김 · #homePostConnect 기본 flex · 띠에 연결/닫기 버튼 2개', () => {
    expect(html).toMatch(/#homePreConnect \{ display: none !important; \}/);
    expect(html).toMatch(/#homePostConnect \{ display: flex; \}/);
    expect(html).not.toMatch(/html\.ig-connected-cache #homePostConnect \{ display: flex; \}/);
    const bar = html.slice(html.indexOf('id="ipcMiniBar"'), html.indexOf('id="ipcMiniBar"') + 1600);
    expect(bar).toMatch(/class="ipc-mini-bar-main" data-static-action="connect-instagram"/);
    expect(bar).toMatch(/class="ipc-mini-bar-close" data-static-action="dismiss-ipc"/);
    expect(html).toMatch(/'dismiss-ipc': \(\) => call\('_dismissIpcCard'\)/);
    const css = read('css/screens/home-pre-connect.css');
    expect(css).toMatch(/\.ipc-mini-bar-close \{[^}]*width: 44px; height: 44px;/);
    expect(css).toMatch(/\.ipc-mini-bar-main \{[^}]*min-height: 44px;/);
  });

  test('app-instagram.js: 어떤 경로도 #homePreConnect 를 다시 켜지 않고, 미연동이면 띠만(닫음은 계정별 키)', () => {
    expect(ig).not.toMatch(/homePreConnect'\)\.style\.display = 'flex'/);
    expect(ig).not.toMatch(/homePostConnect'\)\.style\.display = 'none'/);
    expect(ig).toMatch(/_setIpcMiniBar\(!_ipcDismissed\(\)\);/);
    expect(ig).toMatch(/function _ipcDismissKey\(\)[\s\S]{0,400}'itdasy_ipc_dismissed:' \+ uid/);
    // 닫기 핸들러는 띠만 끄고 다른 카드(전면·가이드)를 대신 띄우지 않는다
    const dismiss = ig.slice(ig.indexOf('function _dismissIpcCard()'), ig.indexOf('window._dismissIpcCard'));
    expect(dismiss).toMatch(/_setIpcMiniBar\(false\)/);
    expect(dismiss).not.toMatch(/homeStartGuide|_syncStartGuide|homePostConnect/);
    // 623px '사진으로 시작' 가이드도 자동 노출하지 않는다
    const guide = ig.slice(ig.indexOf('function _syncStartGuide()'), ig.indexOf('window._syncStartGuide'));
    expect(guide).toMatch(/el\.style\.display = 'none';/);
    expect(guide).not.toMatch(/'block'/);
  });

  test('app-instagram.js 실행: 미연동 + 닫지 않음 → 띠 보임 / ✕ → 띠 숨김 + 계정별 키 / 재실행에도 숨김', () => {
    document.body.innerHTML = '<div id="ipcMiniBar" style="display:none"></div><div id="homeStartGuide" style="display:none"></div>';
    window.getMyUserId = () => 42;
    localStorage.clear();
    const ctx = {};
    const fnSrc = ig.slice(ig.indexOf('function _ipcDismissKey()'), ig.indexOf('// [2026-05-08 28차 2단계] 잇비 카드 닫기 핸들러'))
      + ig.slice(ig.indexOf('function _dismissIpcCard()'), ig.indexOf('window._dismissIpcCard = _dismissIpcCard;'));
    window.showToast = jest.fn();
    window.eval(fnSrc + '\n;window.__t = { _ipcDismissed, _setIpcMiniBar, _dismissIpcCard, _forgetIpcDismissed };');
    const t = window.__t;
    t._setIpcMiniBar(!t._ipcDismissed());
    expect(document.getElementById('ipcMiniBar').style.display).toBe('flex');
    t._dismissIpcCard();
    expect(document.getElementById('ipcMiniBar').style.display).toBe('none');
    expect(localStorage.getItem('itdasy_ipc_dismissed:42')).toBe('1');
    t._setIpcMiniBar(!t._ipcDismissed());
    expect(document.getElementById('ipcMiniBar').style.display).toBe('none');
    t._forgetIpcDismissed();
    expect(t._ipcDismissed()).toBe(false);
    void ctx;
  });

  test('app-core.js 로그아웃 정리가 계정별 닫음 키를 보존한다', () => {
    expect(core).toMatch(/const _USER_KEEP_KEY_PREFIXES = \['itdasy_ipc_dismissed:'\];/);
    expect(core).toMatch(/if \(_USER_KEEP_KEY_PREFIXES\.some\(p => k\.startsWith\(p\)\)\) return;/);
    // 실행: 정리 함수만 떼어 돌린다
    const start = core.indexOf('function _purgeUserScopedStorage()');
    const end = core.indexOf('window._purgeUserScopedStorage = _purgeUserScopedStorage;');
    const consts = ['_USER_KEY_PREFIXES', '_USER_KEEP_KEY_PREFIXES', '_USER_KEY_EXACT'].map((name) => {
      const i = core.indexOf(`const ${name} =`);
      return core.slice(i, core.indexOf(';', i) + 1);
    }).join('\n');
    localStorage.clear();
    localStorage.setItem('itdasy_ipc_dismissed:42', '1');
    localStorage.setItem('itdasy_latest_analysis', '{}');
    const sandbox = { localStorage, sessionStorage, Object, console, _clearAllSWRCache: () => {}, _USER_KEY_KEEP: new Set(), _ENV_TOKEN_KEYS: new Set(), _TOKEN_BLOCKED_KEY: 'x' };
    const vm = require('vm');
    vm.runInNewContext(consts + '\n' + core.slice(start, end) + '\n_purgeUserScopedStorage();', sandbox);
    expect(localStorage.getItem('itdasy_ipc_dismissed:42')).toBe('1');
    expect(localStorage.getItem('itdasy_latest_analysis')).toBeNull();
  });
});
