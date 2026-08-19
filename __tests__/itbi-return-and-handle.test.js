/**
 * [연준님 2026-08-17 · B·C] 잇비 실사용 결함 2건.
 *
 *   B  "📷 인스타그램 연동돼 있어요 — @@disabled_offitial."   ← @ 두 번
 *   C  잇비 → "고객 화면 열기" → 뒤로가기 → **홈**            ← 대화를 잃는다
 *
 * B 는 표시 헬퍼(window.igHandle)로, C 는 시트 라우터 한 곳으로 통일했다.
 * 이 테스트는 **동작**(igHandle)과 **배선**(소스에 레거시 경로가 안 남았는지)을 같이 본다.
 */
const fs = require('fs');
const path = require('path');
const R = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

// ── B. 핸들 정규화 — 실제로 실행해서 확인 ─────────────────────────────
describe('B · igHandle — @ 는 정확히 하나', () => {
  let igHandle;
  beforeAll(() => {
    // app-core 전체를 로드하면 DOM/네트워크가 딸려온다 — 함수 정의부만 떼어 평가한다.
    const src = R('app-core.js');
    const m = src.match(/window\.igHandle = function \(v\) \{[\s\S]*?\n\};/);
    expect(m).toBeTruthy();
    const w = {};
    // eslint-disable-next-line no-new-func
    new Function('window', m[0])(w);
    igHandle = w.igHandle;
  });

  test.each([
    'disabled_offitial', '@disabled_offitial', '@@disabled_offitial',
    '  @disabled_offitial ', '@@@disabled_offitial',
    'instagram.com/disabled_offitial',
    'https://www.instagram.com/disabled_offitial/?hl=ko',
  ])('%s → @disabled_offitial', (raw) => {
    expect(igHandle(raw)).toBe('@disabled_offitial');
  });

  test.each(['', null, undefined, '   ', '@', '@@'])('빈 값 %p → 빈 문자열 ("@" 만 남기지 않는다)', (raw) => {
    expect(igHandle(raw)).toBe('');
  });

  test('몇 번을 통과시켜도 같다 (저장·표시 양쪽에서 돌아도 안전)', () => {
    const once = igHandle('@@shop.name_1');
    expect(once).toBe('@shop.name_1');
    expect(igHandle(once)).toBe(once);
    expect(igHandle(igHandle(once))).toBe(once);
  });

  test('인스타에 없는 문자는 떨군다', () => {
    expect(igHandle('@내샵 handle!')).toBe('@handle');
  });
});

describe('B · 표시 지점이 직접 @ 를 붙이지 않는다', () => {
  const FILES = [
    'app-core.js', 'app-brand-kit.js', 'app-chat-auto-edit.js',
    'app-settings-hub.js', 'app-instant-caption.js',
    'js/workspace/workspace-adapter.js',
  ];
  test.each(FILES)('%s — 핸들에 @ 직접 결합 없음', (f) => {
    const src = R(f);
    // 핸들 변수에 '@' 를 직접 붙이는 패턴만 잡는다 (워터마크 리터럴 '@itdasy' 등은 무관).
    // 주석은 뺀다 — "왜 고쳤나" 를 적으려면 그 패턴을 인용해야 한다.
    const bad = src.split('\n')
      .filter((ln) => !/^\s*(\/\/|\*|\/\*)/.test(ln))
      .filter((ln) =>
        /['"`]@['"`]\s*\+\s*\w*(handle|ig|instagram)/i.test(ln)
        || /`@\$\{\s*(handle|ig)\b/i.test(ln));
    expect(bad).toEqual([]);
  });
});

// ── C. 잇비 복귀 배선 ──────────────────────────────────────────────────
describe('C · 잇비에서 연 화면을 닫으면 채팅으로 돌아온다', () => {
  test('_nav 가 복귀 표시를 건다 (화면마다 붙이지 않는다)', () => {
    const src = R('js/assistant/core/action-hub.js');
    const nav = src.match(/function _nav\(fn\) \{[\s\S]*?\n  \}/)[0];
    expect(nav).toMatch(/__itbiArmReturn/);
    expect(nav).toMatch(/closeAssistant/);   // 화면이 채팅 뒤로 열리던 것도 유지
  });

  test('시트 라우터가 표시를 잡고 닫힐 때 복귀한다', () => {
    const src = R('app-core.js');
    expect(src).toMatch(/window\.__itbiArmReturn = function/);
    const open = src.match(/window\._markSheetOpen = function[\s\S]*?\n  \};/)[0];
    expect(open).toMatch(/__ITBI_RETURN_ARM__/);
    expect(open).toMatch(/_itbiReturnFor = name/);
    const close = src.match(/window\._markSheetClosed = function[\s\S]*?\n  \};/)[0];
    expect(close).toMatch(/_itbiReturnFor/);
    expect(close).toMatch(/openAssistant/);
  });

  test('arm 은 시트 하나만 먹는다 — 중첩(목록 위 상세)에서 잘못 튀지 않게', () => {
    const open = R('app-core.js').match(/window\._markSheetOpen = function[\s\S]*?\n  \};/)[0];
    // arm 을 소비하는 즉시 false 로 내려야 두 번째 시트가 표시를 받지 않는다
    const armIdx = open.indexOf('__ITBI_RETURN_ARM__ = false');
    const setIdx = open.indexOf('_itbiReturnFor = name');
    expect(armIdx).toBeGreaterThan(-1);
    expect(armIdx).toBeLessThan(setIdx);
  });

  test('이미 잇비가 열려 있으면 다시 열지 않는다', () => {
    const close = R('app-core.js').match(/window\._markSheetClosed = function[\s\S]*?\n  \};/)[0];
    expect(close).toMatch(/_alreadyOpen/);
  });

  test('닫기의 history.go 가 착지한 뒤에 다음 화면을 연다 (경합 방지)', () => {
    // 실측(375px, 3회 중 2회): 바로 열면 늦게 온 popstate 가 새 화면의 hash 를 지워
    // 뒤로가기가 통째로 죽었다. 목록은 떠 있는데 back 을 눌러도 아무 일이 없다.
    const nav = R('js/assistant/core/action-hub.js');
    const body = nav.slice(nav.indexOf('function _nav(fn)'),
                           nav.indexOf('\n  }', nav.indexOf('function _nav(fn)')) + 4);
    expect(body).toMatch(/__afterHistorySettles/);
    // 닫기 → 대기 → 열기 순서여야 한다
    expect(body.indexOf('closeAssistant')).toBeLessThan(body.indexOf('__afterHistorySettles'));

    const core = R('app-core.js');
    const fn = core.match(/window\.__afterHistorySettles = function[\s\S]*?\n  \};/)[0];
    expect(fn).toMatch(/_progBack/);        // 미착지 back 개수를 본다
    expect(fn).toMatch(/300/);              // 영영 안 와도 화면은 열린다(폴백)
  });

  test('같은 시트를 다시 열어도 스택에 중복 쌓이지 않는다 (유령 항목 방지)', () => {
    // 실측 누수: 뒤로가기로 잇비 복귀 → openAssistant() 가 _markSheetOpen 재호출 →
    // hash 는 이미 #assistant 라 pushState 는 건너뛰는데 stack.push 만 일어났다.
    // 유령이 남으면 다음 뒤로가기가 그걸 pop 하려다 아무 일도 안 한다.
    const open = R('app-core.js').match(/window\._markSheetOpen = function[\s\S]*?\n  \};/)[0];
    expect(open).toMatch(/stack\[stack\.length - 1\] === name/);
    // 중복 가드는 pushState 보다 **먼저** 와야 한다
    expect(open.indexOf('stack[stack.length - 1] === name'))
      .toBeLessThan(open.indexOf('history.pushState'));
  });

  test('history 를 직접 조작하지 않는다 (앱 라우터 경로 그대로)', () => {
    const close = R('app-core.js').match(/window\._markSheetClosed = function[\s\S]*?\n  \};/)[0];
    const after = close.slice(close.indexOf('_itbiReturnFor && names.indexOf'));
    expect(after).not.toMatch(/history\.(pushState|back|go)\(/);
  });

  test('레거시 __ITDASY_CUSTOMER_RETURN__ 경로는 같은 변경에서 제거됐다', () => {
    // 새 경로를 만들고 옛 경로를 남기면 둘 다 도는 이중 복귀가 된다.
    for (const f of ['js/assistant/core/action-hub.js', 'app-customer.js', 'app-customer-dashboard.js']) {
      const code = R(f).split('\n').filter((ln) => !ln.trim().startsWith('//')).join('\n');
      expect(code).not.toMatch(/__ITDASY_CUSTOMER_RETURN__/);
    }
  });
});

// ── C. 홈 능동제안 — 누를 수 있는 것과 정보 배너를 구분한다 ──────────────
describe('C · 빈 chat_input 은 버튼이 아니라 정보 배너', () => {
  const src = R('js/assistant/suggestion-controls.js');
  const render = src.match(/function renderProactiveCarousel[\s\S]*?\n  \}/)[0];

  test('chat_input 이 없으면 text 로 폴백하지 않는다', () => {
    // 실측: `s.chat_input || s.text` 라서 누르면 "⏰ 30분 뒤 시작 — 준비 OK?" 가
    // 입력창에 채워졌다. 무심코 엔터 치면 그 문구가 잇비에게 전송된다.
    // 주석은 뺀다 — 왜 고쳤는지 적으려면 옛 패턴을 인용해야 한다.
    const code = render.split('\n').filter((ln) => !/^\s*\/\//.test(ln)).join('\n');
    expect(code).not.toMatch(/chat_input\s*\|\|\s*s\.text/);
  });

  test('빈 chat_input 은 button 이 아니라 비대화형 요소로 렌더', () => {
    expect(render).toMatch(/if\s*\(!chat\)/);
    const blank = render.slice(render.indexOf('if (!chat)'), render.indexOf('return `<button'));
    expect(blank).toMatch(/<div/);
    expect(blank).toMatch(/cursor:default/);
    expect(blank).not.toMatch(/data-proactive-chat/);   // 클릭 핸들러가 안 잡게
  });

  test('물어볼 게 있는 제안만 버튼', () => {
    expect(render).toMatch(/data-proactive-chat="\$\{_esc\(chat\)\}"/);
  });
});
