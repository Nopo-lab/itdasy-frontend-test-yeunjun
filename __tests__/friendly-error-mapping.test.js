/**
 * @jest-environment jsdom
 */
/* 실패했을 때 원장님이 **원인과 다음 행동**을 알 수 있어야 한다.
 *
 * 실측 사고 (2026-09-01): GCP 결제가 닫혀 백엔드가 전 경로 503 이던 날,
 *   로그인 화면에 "인터넷 연결을 확인해 주세요." 가 떴다.
 *   원장님 인터넷은 멀쩡했다 — 공유기만 계속 껐다 켜게 만드는 문구였다.
 *   원인: 브라우저는 서버다운·DNS실패·CORS거부를 **전부 `Failed to fetch` 하나로** 보고한다.
 *   → navigator.onLine 으로 가른다. false 일 때만 "인터넷" 이라고 말한다.
 *
 * 두 번째 문제: 마지막 폴백이 e.message 를 그대로 내보내 기술 문구가 샜다.
 *   ("HTTP 500", "TypeError: ... undefined")
 *   → 사람이 쓴 한국어만 통과. 단, 로그인 실패처럼 일부러 한국어를 throw 하는
 *     경로가 있으므로 통째로 막으면 안 된다.
 */
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'app-core.js'), 'utf8');

/** app-core.js 에서 _friendlyErr 만 떼어내 실행 가능한 함수로 만든다 */
function loadFriendlyErr() {
  const start = SRC.indexOf('function _friendlyErr(');
  expect(start).toBeGreaterThan(-1);
  // 함수 끝 = 다음 최상위 '\n}'
  const end = SRC.indexOf('\n}', start);
  const body = SRC.slice(start, end + 2);
  // eslint-disable-next-line no-new-func
  return new Function(body + '\nreturn _friendlyErr;')();
}

const err = (msg, status) => { const e = new Error(msg); if (status) e.status = status; return e; };
const setOnline = (v) => Object.defineProperty(navigator, 'onLine', { value: v, configurable: true });

let friendly;
beforeEach(() => { friendly = loadFriendlyErr(); setOnline(true); });

describe('네트워크 실패 — 내 인터넷 vs 서버', () => {
  test('오프라인이면 인터넷 안내', () => {
    setOnline(false);
    expect(friendly(err('Failed to fetch'))).toMatch(/인터넷/);
  });

  test('온라인인데 못 닿으면 **서버** 안내 (공유기 탓하지 않는다)', () => {
    setOnline(true);
    const msg = friendly(err('Failed to fetch'));
    expect(msg).toMatch(/서버/);
    expect(msg).not.toMatch(/인터넷 연결을 확인/);
  });

  test('WebKit 문구(Load failed)도 같은 분기를 탄다 — iOS 에서 영문 노출됐던 이력', () => {
    setOnline(true);
    expect(friendly(err('Load failed'))).toMatch(/서버/);
    setOnline(false);
    expect(friendly(err('Load failed'))).toMatch(/인터넷/);
  });
});

describe('상태코드별 안내', () => {
  const cases = [
    [401, /로그인/],
    [403, /권한/],
    [404, /찾을 수 없|지워/],
    [409, /이미/],
    [429, /잠시|많/],
    [500, /서버/],
    [503, /서버/],
  ];
  test.each(cases)('%i → 사용자 언어', (status, re) => {
    expect(friendly(err('HTTP ' + status, status))).toMatch(re);
  });

  test('타임아웃은 "다시 시도" 로 끝난다', () => {
    expect(friendly(err('timeout of 20000ms exceeded'))).toMatch(/지연|다시 시도/);
  });
});

describe('기술 문구가 새지 않는다', () => {
  test('TypeError 원문을 그대로 보여주지 않는다', () => {
    const msg = friendly(err("Cannot read properties of undefined (reading 'x')"));
    expect(msg).not.toMatch(/undefined|Cannot read/);
    expect(msg).toMatch(/[가-힣]/);
  });

  test('"HTTP 500" 같은 문구도 그대로 나가지 않는다', () => {
    expect(friendly(err('HTTP 500'))).not.toBe('HTTP 500');
  });

  test('JSON 조각도 막는다', () => {
    expect(friendly(err('{"detail":"boom"}'))).not.toMatch(/[{}]/);
  });

  test('사람이 쓴 한국어는 통과 — 로그인 실패 경로가 이걸 쓴다', () => {
    const human = '아이디 또는 비밀번호가 달라요. 다시 확인해 주세요.';
    expect(friendly(err(human))).toBe(human);
  });

  test('폴백도 사용자 언어다', () => {
    expect(friendly(err(''), '로그인 실패')).toMatch(/[가-힣]/);
  });
});

describe('숫자 오판 방지', () => {
  test('금액에 401 이 스쳐도 "로그인이 풀렸어요" 가 되면 안 된다', () => {
    // 예전엔 message.includes('401') 이라 "1401원" 이 401 로 잡혔다
    const msg = friendly(err('결제 금액 1401원이 맞지 않아요'));
    expect(msg).not.toMatch(/로그인이 풀렸/);
    expect(msg).toMatch(/1401원/);
  });

  test('status 필드가 있으면 그걸 우선한다', () => {
    expect(friendly(err('무언가 잘못됐어요', 403))).toMatch(/권한/);
  });
});
