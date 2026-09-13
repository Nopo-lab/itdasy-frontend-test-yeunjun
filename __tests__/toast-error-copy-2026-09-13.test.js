/**
 * @jest-environment jsdom
 */
/* 원장님 토스트에 **영문 예외·원시 JSON** 이 그대로 뜨던 것 (P2, 2026-09-13 클로즈아웃).
 *
 * 실측 문구 4종:
 *   "저장 실패: Failed to fetch"                                  (DM 설정 저장)
 *   "저장 실패: The user aborted a request."                      (DM 설정 저장, 타임아웃)
 *   "해제 실패: Failed to fetch"                                  (인스타 연결 해제)
 *   '해제 실패: 해제 실패 (HTTP 500) {"detail":"server error"}'   (라벨 중복 + 원시 JSON)
 *
 * `_humanError()` 는 이미 이걸 한국어로 바꾸지만, 거치지 않고
 * `showToast('저장 실패: ' + e.message)` 하는 곳이 22군데였다.
 * 그래서 showToast 길목(`_userSafeToastText`)에서 흡수한다.
 */
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'app-core.js'), 'utf8');

function load() {
  const startRe = SRC.indexOf('window._LEAKY_ERROR_RE');
  expect(startRe).toBeGreaterThan(-1);
  const endMark = 'function showToast(';
  const end = SRC.indexOf(endMark, startRe);
  expect(end).toBeGreaterThan(startRe);
  const body = SRC.slice(startRe, end);
  const win = { console };
  // eslint-disable-next-line no-new-func
  new Function('window', 'navigator', 'console', body)(win, global.navigator, console);
  return win._userSafeToastText;
}

describe('토스트 문구 정규화', () => {
  const f = load();
  const 실측 = [
    '저장 실패: Failed to fetch',
    '저장 실패: The user aborted a request.',
    '해제 실패: Failed to fetch',
    '해제 실패: 해제 실패 (HTTP 500) {"detail":"server error"}',
  ];

  test('1) 영문 원문이 하나도 안 남는다', () => {
    실측.forEach((s) => {
      const out = f(s);
      expect(out).not.toMatch(/Failed to fetch|aborted a request|HTTP\s*\d{3}|Internal Server Error/i);
    });
  });

  test('2) 원시 JSON 이 안 남는다', () => {
    const out = f('해제 실패: 해제 실패 (HTTP 500) {"detail":"server error"}');
    expect(out).not.toMatch(/[{}]/);
    expect(out).not.toMatch(/detail/i);
  });

  test('3) 라벨이 중복되지 않는다', () => {
    const out = f('해제 실패: 해제 실패 (HTTP 500) {"detail":"server error"}');
    expect(out.match(/해제 실패/g)).toHaveLength(1);
  });

  test('4) 무슨 작업이 실패했는지는 남는다', () => {
    expect(f('저장 실패: Failed to fetch')).toMatch(/^저장 실패/);
    expect(f('해제 실패: Failed to fetch')).toMatch(/^해제 실패/);
  });

  test('5) 타임아웃은 "모른다" 고 말한다 — 실패라고 단정하지 않는다', () => {
    const out = f('저장 실패: The user aborted a request.');
    expect(out).toMatch(/확인하지 못했어요|확인해 주세요/);
  });

  test('6) Failed to fetch 를 "인터넷 문제" 라고 단정하지 않는다 (온라인일 때)', () => {
    // 2026-09-01 실사고 재발 방지: 서버 503 인데 공유기를 탓하던 문구
    expect(f('저장 실패: Failed to fetch')).not.toMatch(/인터넷/);
    expect(f('저장 실패: Failed to fetch')).toMatch(/서버에 연결하지 못했어요/);
  });

  test('7) 서버가 한국어로 이유를 주면 그대로 쓴다', () => {
    const out = f('저장 실패: (HTTP 400) {"detail":"이미 등록된 전화번호예요"}');
    expect(out).toContain('이미 등록된 전화번호예요');
  });

  test('8) 정상 한국어 토스트는 건드리지 않는다', () => {
    ['저장됐어요 ✓', '김민지님 +50,000원 (잔액 350,000원)', '오늘 예약 7건'].forEach((s) => {
      expect(f(s)).toBe(s);
    });
  });

  test('9) showToast 가 이 길목을 실제로 통과시킨다', () => {
    expect(SRC).toMatch(/safe = window\._userSafeToastText\(safe\)/);
  });
  test('10) 영문을 열거하지 않아도 잡는다 — 사유에 한글이 없으면 누출', () => {
    // 실측(2차): DM 설정 저장이 서버 detail 을 그대로 붙여 첫 판을 통과했다
    expect(f('저장 실패: server error')).not.toMatch(/server error/i);
    expect(f('저장 실패: server error')).toMatch(/서버 오류/);
    expect(f('저장 실패: rate limited')).not.toMatch(/rate limited/i);
    expect(f('저장 실패: rate limited')).toMatch(/요청이 너무 많아요/);
    expect(f('저장 실패: Not Found')).not.toMatch(/Not Found/);
    expect(f('저장 실패: Not Found')).toMatch(/^저장 실패 — /);
  });

  test('11) 한국어 사유는 그대로 둔다 (과잉 치환 금지)', () => {
    expect(f('저장 실패: 이름은 필수예요')).toBe('저장 실패: 이름은 필수예요');
    expect(f('충전 실패 — 요청이 잠깐 몰렸어요. 몇 초 뒤 다시 눌러 주세요.')).toBe('충전 실패 — 요청이 잠깐 몰렸어요. 몇 초 뒤 다시 눌러 주세요.');
  });
});

describe('_humanError — 5xx 는 서버 탓이지 네트워크 탓이 아니다', () => {
  const win = { console: { warn() {} } };
  beforeAll(() => {
    const start = SRC.indexOf('window._humanError = function');
    const end = SRC.indexOf('\n};', start) + 3;
    // eslint-disable-next-line no-new-func
    new Function('window', 'console', SRC.slice(start, end))(win, win.console);
  });
  test.each([['HTTP 500'], ['HTTP 502'], ['HTTP 503'], ['Internal Server Error']])('%s → 서버 오류', (m) => {
    const out = win._humanError(new Error(m));
    expect(out).toMatch(/서버 오류/);
    expect(out).not.toMatch(/네트워크/);
  });
  test('Failed to fetch 의 기존 분류는 그대로 (기존 테스트와 같은 결정)', () => {
    expect(win._humanError(new Error('Failed to fetch'))).toMatch(/네트워크/);
  });
});
