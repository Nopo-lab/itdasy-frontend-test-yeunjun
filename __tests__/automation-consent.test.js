/**
 * @jest-environment jsdom
 */
/* 자동화 켜기 = 안내 → 체크 → 승인 기록 → 그다음에야 켜짐.
 *
 * 여기서 잠그는 것 (2026-08-26):
 *   ① 체크박스를 안 누르면 **버튼이 안 눌린다** — "확인" 한 번으로 켜지던 것을 없앴다
 *   ② [사용 시작] 은 서버에 승인을 기록한 **뒤에야** true 를 준다
 *   ③ 승인 기록이 실패하면 false — 화면만 켜지는 일이 없어야 한다
 *   ④ 취소·배경탭·뒤로가기는 전부 false
 *   ⑤ 문구가 실제 동작과 어긋나지 않는다 (자동발송 안 하는 기능에 '자동으로 나갑니다' 금지)
 *   ⑥ consent_type 문자열이 백엔드(services/automation_gate.CONSENT_TYPE)와 같다
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function loadModule() {
  document.body.innerHTML = '';
  delete window.AutomationConsent;
  // eslint-disable-next-line no-new-func
  new Function(read('js/automation-consent.js')).call(window);
  return window.AutomationConsent;
}

let calls;

beforeEach(() => {
  calls = [];
  window.apiUrl = (p) => 'https://api.test' + p;
  window.authHeader = () => ({ Authorization: 'Bearer t' });
  window.apiFetch = jest.fn((url, opts) => {
    calls.push({ url, body: JSON.parse(opts.body) });
    return Promise.resolve({ ok: true, status: 200 });
  });
  window.showToast = jest.fn();
  // rAF — jsdom 은 있지만 즉시 실행시켜 애니메이션 대기를 없앤다
  window.requestAnimationFrame = (fn) => fn();
});

const sheet = () => document.getElementById('automationConsentSheet');
const chk = () => sheet().querySelector('[data-ac="agree"]');
const yes = () => sheet().querySelector('[data-ac="yes"]');
const no = () => sheet().querySelector('[data-ac="no"]');

function check() {
  chk().checked = true;
  chk().dispatchEvent(new window.Event('change', { bubbles: true }));
}

const FEATURES = [
  'automation_dm_autoreply',
  'automation_dm_autosend',
  'automation_dm_quick_reply',
  'automation_comment_autoreply',
];

describe('안내 시트 — 명시적 승인', () => {
  test('열면 체크박스와 비활성 버튼이 있다', async () => {
    const AC = loadModule();
    AC.ask(AC.DM_AUTOREPLY);
    expect(sheet()).toBeTruthy();
    expect(chk()).toBeTruthy();
    expect(yes().disabled).toBe(true);
  });

  test('체크 안 하고 눌러도 켜지지 않는다 — 서버 호출도 없다', async () => {
    const AC = loadModule();
    let settled = false;
    AC.ask(AC.DM_AUTOREPLY).then(() => { settled = true; });
    yes().click();
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(window.apiFetch).not.toHaveBeenCalled();
    expect(sheet()).toBeTruthy();          // 시트도 안 닫힌다
  });

  test('체크하면 버튼이 열리고, 누르면 승인이 서버에 기록된 뒤 true', async () => {
    const AC = loadModule();
    const p = AC.ask(AC.DM_AUTOREPLY);
    check();
    expect(yes().disabled).toBe(false);
    yes().click();
    await expect(p).resolves.toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('/persona/consent');
    expect(calls[0].body).toEqual({
      consent_type: 'automation_dm_autoreply', version: AC.VERSION, agreed: true,
    });
  });

  test('승인 기록이 실패하면 false — 화면만 켜지지 않는다', async () => {
    const AC = loadModule();
    window.apiFetch = jest.fn(() => Promise.resolve({ ok: false, status: 500 }));
    const p = AC.ask(AC.DM_AUTOSEND);
    check();
    yes().click();
    await expect(p).resolves.toBe(false);
    expect(window.showToast).toHaveBeenCalled();
  });

  test('네트워크가 끊겨도 false (예외를 삼키고 켜지 않는다)', async () => {
    const AC = loadModule();
    window.apiFetch = jest.fn(() => Promise.reject(new Error('offline')));
    const p = AC.ask(AC.DM_AUTOSEND);
    check();
    yes().click();
    await expect(p).resolves.toBe(false);
  });

  test('취소 / 배경 탭 / 뒤로가기 는 전부 false', async () => {
    const AC = loadModule();

    let p = AC.ask(AC.DM_AUTOREPLY);
    no().click();
    await expect(p).resolves.toBe(false);

    p = AC.ask(AC.DM_AUTOREPLY);
    sheet().click();                       // 배경(오버레이) 자체를 탭
    await expect(p).resolves.toBe(false);

    const backs = {};
    window._registerSheet = (id, fn) => { backs[id] = fn; };
    p = AC.ask(AC.DM_AUTOREPLY);
    backs.automationConsentSheet();        // 안드로이드 뒤로가기
    await expect(p).resolves.toBe(false);
    delete window._registerSheet;
  });

  test('뒤로가기 레지스트리에 등록한다 — 빠뜨리면 안드로이드에서 앱이 꺼진다', () => {
    const AC = loadModule();
    window._registerSheet = jest.fn();
    window._markSheetOpen = jest.fn();
    AC.ask(AC.DM_AUTOREPLY);
    expect(window._registerSheet).toHaveBeenCalledWith('automationConsentSheet', expect.any(Function));
    expect(window._markSheetOpen).toHaveBeenCalledWith('automationConsentSheet');
    delete window._registerSheet; delete window._markSheetOpen;
  });

  test('두 번 열어도 시트는 하나 (겹쳐 뜨지 않는다)', () => {
    const AC = loadModule();
    AC.ask(AC.DM_AUTOREPLY);
    AC.ask(AC.DM_AUTOSEND);
    expect(document.querySelectorAll('#automationConsentSheet')).toHaveLength(1);
  });

  test('모르는 feature 는 시트를 안 띄우고 false', async () => {
    const AC = loadModule();
    await expect(AC.ask('automation_made_up')).resolves.toBe(false);
    expect(sheet()).toBeNull();
  });
});

describe('문구 — 실제 동작과 어긋나지 않는다', () => {
  test('4종 전부 안내가 있다', () => {
    const AC = loadModule();
    FEATURES.forEach((f) => {
      const c = AC.FEATURES[f];
      expect(c).toBeTruthy();
      expect(c.uses.length).toBeGreaterThan(0);   // 무엇을 보는지
      expect(c.notes.length).toBeGreaterThan(0);  // 알아야 할 것
      expect(typeof c.send.ok).toBe('boolean');   // 자동으로 나가는가
    });
  });

  test('초안·댓글은 "자동 발송 안 함", 자동발송·버튼안내는 "발송함" 으로 적혀 있다', () => {
    const AC = loadModule();
    // 근거: 초안은 status=pending_confirm 로만 쌓이고, 댓글 답글은 원장이 [보내기] 를 눌러야 나간다
    expect(AC.FEATURES.automation_dm_autoreply.send.ok).toBe(true);
    expect(AC.FEATURES.automation_comment_autoreply.send.ok).toBe(true);
    // 근거: dm_autosend / dm_menu 는 실제로 Graph API 로 메시지를 보낸다
    expect(AC.FEATURES.automation_dm_autosend.send.ok).toBe(false);
    expect(AC.FEATURES.automation_dm_quick_reply.send.ok).toBe(false);
  });

  test('자동 발송 안 하는 기능의 안내에 "바로 나갑니다" 류가 없다', () => {
    const AC = loadModule();
    ['automation_dm_autoreply', 'automation_comment_autoreply'].forEach((f) => {
      const blob = [AC.FEATURES[f].lead, AC.FEATURES[f].send.text].join(' ');
      expect(blob).not.toMatch(/확인 없이/);
      expect(blob).toMatch(/바로 나가지 않|자동으로 달리지 않/);
    });
  });

  test('버튼안내는 AI 사용량을 쓴다고 적지 않는다 (LLM 을 안 거친다)', () => {
    const AC = loadModule();
    const blob = AC.FEATURES.automation_dm_quick_reply.notes.join(' ');
    expect(blob).toMatch(/AI 사용량 안 들어/);
  });
});

/* 백엔드 레포는 **옆에 있을 때만** 읽는다.
 *
 * 🔴 [2026-08-27] 이 검사가 배포를 죽였다. `../itdasy_backend-test/...` 를 무조건 읽는데
 *   CI 는 프론트 레포만 체크아웃한다 → ENOENT → jest 실패 → Pages 배포 중단.
 *   내 로컬은 두 레포가 나란히 있어서 통과했다 — **폴더 배치 덕에 통과하던 테스트**다.
 *
 *   그렇다고 검사를 지우면 안 된다. consent_type·version 이 서버와 어긋나면 원장이
 *   승인을 해도 403 이 난다(문자열 하나 틀리면 조용히 그렇게 된다). 그래서 남기되,
 *   백엔드가 없는 환경에서는 **건너뛴다.** 있는 곳(로컬·모노레포 체크아웃)에서는 그대로 잠근다.
 */
const BACKEND_DIR = path.join(ROOT, '..', 'itdasy_backend-test', 'backend');
const hasBackend = fs.existsSync(path.join(BACKEND_DIR, 'services', 'automation_gate.py'));
const withBackend = hasBackend ? test : test.skip;

describe('백엔드와의 계약', () => {
  withBackend('consent_type 문자열이 automation_gate 와 같다', () => {
    const AC = loadModule();
    const py = fs.readFileSync(path.join(BACKEND_DIR, 'services', 'automation_gate.py'), 'utf8');
    FEATURES.forEach((f) => {
      expect(AC.FEATURES[f]).toBeTruthy();
      expect(py).toContain(`"${f}"`);
    });
    // 버전도 같아야 한다 — 다르면 서버가 승인을 인정하지 않아 403 이 난다
    expect(py).toContain(`CONSENT_VERSION = "${AC.VERSION}"`);
  });

  withBackend('백엔드 Literal 화이트리스트에 4종이 다 있다', () => {
    const AC = loadModule();
    const py = fs.readFileSync(path.join(BACKEND_DIR, 'schemas', 'persona.py'), 'utf8');
    FEATURES.forEach((f) => expect(py).toContain(`"${f}"`));
    expect(AC.VERSION).toBeTruthy();
  });

  test('프론트 쪽 consent_type 상수는 백엔드 유무와 무관하게 고정', () => {
    // 위 두 검사가 CI 에서 건너뛰어지므로, 문자열 자체는 여기서 항상 잠근다.
    const AC = loadModule();
    expect(AC.DM_AUTOREPLY).toBe('automation_dm_autoreply');
    expect(AC.DM_AUTOSEND).toBe('automation_dm_autosend');
    expect(AC.DM_QUICK_REPLY).toBe('automation_dm_quick_reply');
    expect(AC.COMMENT_AUTOREPLY).toBe('automation_comment_autoreply');
    expect(AC.VERSION).toBe('v1');
    FEATURES.forEach((f) => expect(AC.FEATURES[f]).toBeTruthy());
  });
});

describe('토글이 승인 없이 켜지지 않는다 (소스 계약)', () => {
  test('app-dm-menu 의 3개 토글이 전부 승인 절차를 거친다', () => {
    const src = read('app-dm-menu.js');
    ['DM_QUICK_REPLY', 'DM_AUTOREPLY', 'DM_AUTOSEND'].forEach((k) => {
      expect(src).toContain(`_consentThenApply(_AC().${k}`);
    });
    // 옛 시트(확인 버튼 하나로 켜지던 것)는 지웠다 — 정의도 호출도 없어야 한다
    //   (주석에 이름이 남는 건 괜찮다. 왜 지웠는지가 적혀 있어야 다시 안 생긴다.)
    expect(src).not.toMatch(/function _askQuickReplyConsent/);
    expect(src).not.toMatch(/function _askAutosendConsent/);
    expect(src).not.toMatch(/_askQuickReplyConsent\(/);
    expect(src).not.toMatch(/_askAutosendConsent\(/);
  });

  test('app-dm-menu 가 승인 모듈 없이 켜지 않는다 (안전한 쪽으로 실패)', () => {
    const src = read('app-dm-menu.js');
    const m = src.match(/function _consentThenApply\([\s\S]*?\n  \}/);
    expect(m).toBeTruthy();
    expect(m[0]).toMatch(/typeof ac\.ask !== 'function'/);
    expect(m[0]).toMatch(/if \(ok\) apply\(\)/);       // 승인 못 받으면 apply 안 함
  });

  test('댓글 큐 기본값이 꺼짐이고, 저장값도 명시적 true 만 켜짐으로 읽는다', () => {
    const src = read('app-comment-reply-queue.js');
    expect(src).toMatch(/var def = \{ enabled: false,/);
    expect(src).toMatch(/enabled: s\.enabled === true/);
    expect(src).not.toMatch(/enabled: s\.enabled !== false/);
  });

  test('댓글 큐 마스터 토글이 승인 시트를 거친다', () => {
    const src = read('app-comment-reply-queue.js');
    expect(src).toMatch(/_ac\.ask\(_ac\.COMMENT_AUTOREPLY\)/);
  });

  test('index.html 이 승인 모듈을 app-dm-menu 보다 먼저 로드한다', () => {
    const html = read('index.html');
    // ⚠️ 그냥 indexOf('app-dm-menu.js') 하면 **본문 주석**이 먼저 걸린다(실측 150441).
    //   비교해야 하는 건 <script> 태그의 순서다.
    const a = html.indexOf('<script src="js/automation-consent.js');
    const b = html.indexOf('<script src="app-dm-menu.js');
    expect(a).toBeGreaterThan(-1);
    expect(a).toBeLessThan(b);
    // 새 파일은 `?v=` 를 손으로 붙여야 배포 자동 범프 대상이 된다 (CLAUDE.md)
    expect(html).toMatch(/js\/automation-consent\.js\?v=/);
  });
});
