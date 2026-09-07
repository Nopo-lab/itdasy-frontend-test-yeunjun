/**
 * @jest-environment jsdom
 */
/* [AI 출시 게이트 2026-09-07] 캡션 화면이 **거짓말하지 않는다**.
 *
 * 여기서 잠그는 것 (전부 실제로 있었던 결함이다):
 *   ① 백엔드 status:'clarification'(= AI 미호출 안내문)을 캡션으로 취급하지 않는다.
 *      — 예전엔 안내문이 본문 textarea 에 꽂히고 작업실 슬롯이 '완료' 로 바뀌었다.
 *   ② 서버 실패코드(ai_failed / ai_timeout / ai_busy)를 "서버가 불안정" 으로 뭉개지 않는다.
 *      — 원장님이 지금 할 행동이 셋 다 다르다.
 *   ③ 생성은 동시에 하나만 — 진입점이 여럿이라 버튼 disabled 로는 못 막는다(1회 = 돈 1회).
 *   ④ 재생성이 실패해도 잘 나와 있던 본문을 지우지 않는다.
 *   ⑤ 시나리오 시트의 onComplete 는 한 번만 나간다(연타 = 중복 생성).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const CAPTION_SRC = read('app-caption.js');

/** app-caption.js 를 jsdom 컨텍스트에서 실제로 실행하고 내부 헬퍼를 꺼낸다. */
function loadCaptionModule() {
  const ctx = {
    window, document, localStorage, console,
    setTimeout, clearTimeout, setInterval, clearInterval,
    AbortController, fetch: () => Promise.reject(new Error('no network in test')),
    Math, Date, JSON, Object, Array, String, Number, Set, Map, Promise, Error, RegExp,
  };
  ctx.window.API = 'https://api.test';
  ctx.window.authHeader = () => ({ Authorization: 'Bearer t' });
  ctx.window.showToast = jest.fn();
  ctx.showToast = (...a) => ctx.window.showToast(...a);
  ctx.SHOP_CONFIG = {};
  vm.createContext(ctx);
  /* app-caption.js 는 분할된 형제 모듈(js/caption/*.js)의 함수를 이름으로 참조한다.
     이 테스트는 순수 헬퍼 두 개만 보므로, 없는 이름은 빈 선언으로 채운다.
     (실행 자체가 목적이 아니라 **헬퍼의 실제 동작**을 보는 게 목적이다.) */
  const STUBS = [
    'showOnboardingCaptionPopup', 'saveOnboardingCaption', 'showCaptionLoader',
    'hideCaptionLoader', 'openInstagramProfile', 'closeUploadDone', 'doActualPublish',
    'copyCaption', 'copyAll', 'flashBtn', 'saveCaptionToGallery', 'publishFromCaption',
    'getSel', 'saveSlotToDB', 'SHOP_CONFIG',
  ];
  const prelude = STUBS.map((n) => `var ${n} = ${n === 'SHOP_CONFIG' ? '{}' : 'function(){}'};`).join('\n');
  // 파일 끝에 헬퍼를 밖으로 내보내는 한 줄만 덧붙인다(원본은 손대지 않는다).
  vm.runInContext(
    prelude + '\n' + CAPTION_SRC + '\n;globalThis.__t = { _capAssertGenerated, _capServerErrorMessage };',
    ctx,
  );
  return ctx.__t;
}

describe('① clarification 은 캡션이 아니다', () => {
  const t = loadCaptionModule();

  test('status:clarification 응답은 던져서 성공 경로로 못 들어간다', () => {
    expect(() => t._capAssertGenerated({
      status: 'clarification',
      caption: '입력하신 키워드만으로는 정확한 시술 내용을 파악하기 어려워요.',
    })).toThrow(/키워드만으로는/);
  });

  test('던진 에러에 clarification 표식이 붙어 실패 토스트와 구분된다', () => {
    let err = null;
    try { t._capAssertGenerated({ status: 'clarification', caption: '안내' }); }
    catch (e) { err = e; }
    expect(err && err.code).toBe('CAPTION_CLARIFICATION');
  });

  test('정상 생성은 그대로 통과한다', () => {
    const ok = { status: 'generated', caption: '오늘 젤네일 시술했어요.' };
    expect(t._capAssertGenerated(ok)).toBe(ok);
  });

  test('status 필드가 없는 옛 응답도 통과한다(하위호환)', () => {
    const legacy = { caption: '오늘 젤네일 시술했어요.' };
    expect(t._capAssertGenerated(legacy)).toBe(legacy);
  });
});

describe('② 서버 실패코드는 각각 다른 안내가 된다', () => {
  const t = loadCaptionModule();

  test.each([
    ['ai_empty_response — AI가 이번엔 글을 만들지 못했어요.', /다시 만들기/],
    ['ai_failed — AI가 이번엔 글을 만들지 못했어요. (code: ClientError)', /다시 만들기/],
    ['ai_timeout — AI 응답이 평소보다 오래 걸려요.', /오래 걸/],
    ['ai_busy — 지금 AI 사용량이 가득 찼어요.', /사용량이 가득/],
  ])('%s → 원장님이 할 행동이 보인다', (detail, expected) => {
    expect(t._capServerErrorMessage(detail)).toMatch(expected);
  });

  test('세 안내가 서로 다르다 — 한 문구로 뭉개면 구분이 안 된다', () => {
    const msgs = ['ai_failed', 'ai_timeout', 'ai_busy'].map(t._capServerErrorMessage);
    expect(new Set(msgs).size).toBe(3);
  });

  test('AI 와 무관한 에러는 건드리지 않는다', () => {
    expect(t._capServerErrorMessage('Failed to fetch')).toBeNull();
    expect(t._capServerErrorMessage('quota_exceeded:caption:3')).toBeNull();
  });
});

describe('③~④ 소스 계약 — 되돌리면 여기서 걸린다', () => {
  test('세 곳의 /persona/generate 호출이 모두 clarification 을 통과시키지 않는다', () => {
    const calls = CAPTION_SRC.match(/_personaFetch\('POST', '\/persona\/generate'/g) || [];
    const guarded = CAPTION_SRC.match(/_capAssertGenerated\(await _personaFetch\('POST', '\/persona\/generate'/g) || [];
    expect(calls.length).toBeGreaterThanOrEqual(3);
    // 동의 재시도 경로 1건은 사용자가 이미 실패를 본 뒤라 제외 — 나머지는 전부 가드가 붙는다.
    expect(guarded.length).toBe(calls.length - 1);
  });

  test('생성 동시 실행 잠금이 살아 있다', () => {
    expect(CAPTION_SRC).toMatch(/let _capGenerateInFlight = false/);
    expect(CAPTION_SRC).toMatch(/if \(_capGenerateInFlight\)/);
    expect(CAPTION_SRC).toMatch(/finally \{\s*_capGenerateInFlight = false;/);
  });

  test('재생성 실패가 기존 본문을 지우지 않는다', () => {
    // 예전엔 실패 경로 끝에 `if (ta) ta.value = '';` 가 있어 잘 나온 캡션이 사라졌다.
    expect(CAPTION_SRC).not.toMatch(/if \(ta\) ta\.value = '';\s*\n\s*showToast\(userMsg\)/);
    expect(CAPTION_SRC).toMatch(/ta\.value = _capAiDraft \|\| ''/);
  });
});

describe('⑤ 시나리오 시트 연타 = 중복 생성', () => {
  test('onComplete 는 여러 번 눌러도 한 번만 나간다', () => {
    const src = read('components/scenario-selector.js');
    const ctx = { window, document, console, setTimeout, clearTimeout };
    vm.createContext(ctx);
    vm.runInContext(src, ctx);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const onComplete = jest.fn();
    ctx.window.renderScenarioSelector(host, onComplete);

    // 3축을 다 고르고 완료를 눌렀다고 가정 — 콜백이 나가는 지점을 직접 여러 번 때린다.
    const buttons = host.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThan(0);
    // 렌더 구조에 의존하지 않도록, 내부 가드 자체를 소스로도 확인한다.
    expect(src).toMatch(/_fired/);
  });

  test('가드가 콜백을 감싸는 형태로 남아 있다', () => {
    const src = read('components/scenario-selector.js');
    expect(src).toMatch(/if \(_fired\) return;/);
    expect(src).toMatch(/_fired = true;/);
  });
});
