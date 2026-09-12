/* [ITBI 2차 최종 게이트 · CASE-021] "여러 명" 을 가리키는 말을 고객 이름으로 집던 것.
 *
 * 라이브 실측(user 4 · build 20260911-2341-5669216):
 *   "오래 안 온 손님한테 문자 보내줘"        → "🔍 **오래**님을 못 찾았어요."
 *   "이탈 위험 고객한테 안부 문자 초안 써줘"  → "🔍 **위험**님을 못 찾았어요."
 *
 * 원인: `_extractMsgTarget` 이 호칭(님)이 없으면 **금지어 목록을 뺀 뒤 첫 한글 덩어리**를
 * 이름으로 집는다. 목록에 없는 단어는 전부 사람 이름이 된다 — 블랙리스트의 숙명이다.
 * (이 레포에 2026-08-17 부터 "한국어 파싱에 블랙리스트 금지" 가 적혀 있다.)
 *
 * 게다가 이 파일 안에 모순이 있었다: `_draftTone` 은 같은 단어들
 * `(오래|뜸|이탈|안 오|발길)` 을 보고 'we_miss_you'(집단 대상 톤)라고 판단하면서
 * 바로 다음 줄에서 그 단어에서 한 사람 이름을 뽑으려 한다.
 *
 * 고친 방식: 이름 매칭을 약화하지 않는다(그러면 "박지우 문자 보내줘" 가 깨진다).
 * **집단을 가리키는 말 + 호칭 근거 없음** 일 때만 지름길이 손을 뗀다 →
 * 백엔드의 `generate_bulk_message`(segment) 경로가 받는다.
 */
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(
  path.join(__dirname, '..', 'assistant-intent-router.js'), 'utf8');

function pick(name) {
  const m = SRC.match(new RegExp('^\\s*const ' + name + ' = (/.*/);\\s*$', 'm'));
  if (!m) throw new Error(name + ' 선언을 못 찾음 — 가드가 사라졌거나 이름이 바뀌었다');
  // eslint-disable-next-line no-new-func
  return new Function('return ' + m[1] + ';')();
}

const SEGMENT = pick('_SEGMENT_TARGET');
const NAME_EV = pick('_NAME_EVIDENCE');

/** tryDraftMessage 앞단 가드와 **같은 판정** — 여기서 true 면 백엔드로 넘긴다. */
function defersToBackend(t) {
  return SEGMENT.test(t) && !NAME_EV.test(t);
}

describe('집단 대상 문구 요청은 FE 지름길이 삼키지 않는다', () => {
  const GROUP = [
    '오래 안 온 손님한테 문자 보내줘',
    '한동안 안 온 고객한테 안부 문자 써줘',
    '이탈 위험 고객한테 안부 문자 초안 써줘',
    '뜸한 손님들한테 문자 보내줘',
    '발길 끊긴 손님한테 메시지 만들어줘',
    '단골 손님한테 감사 문자 써줘',
    '신규 고객한테 환영 문자 보내줘',
    '새로 온 손님한테 인사 문구 써줘',
    '전체 고객한테 공지 문자 보내줘',
    '모든 손님한테 휴무 안내 보내줘',
    '회원권 잔액 적은 고객한테 충전 안내 써줘',
    '회원권 만료 임박한 고객한테 문자 보내줘',
    '생일인 고객한테 축하 메시지 만들어줘',
    '안 오시는 분들한테 문자 보내줘',
  ];
  test.each(GROUP)('%s → 백엔드로 넘긴다', (q) => {
    expect(defersToBackend(q)).toBe(true);
  });
});

describe('한 사람을 지목한 요청은 그대로 FE 가 처리한다 (오탐 방지)', () => {
  // 여기서 true 가 나오면 내 가드가 정상 기능을 죽인 것이다.
  const SINGLE = [
    '박지우님한테 문자 보내줘',
    '김호영님 안부 문자 써줘',
    '박지우 문자 보내줘',
    '이 고객한테 리터치 안내 보내줘',
    '오늘 온 손님한테 감사 문자 써줘',
    '방금 그 분한테 문자 보내줘',
  ];
  test.each(SINGLE)('%s → FE 지름길 유지', (q) => {
    expect(defersToBackend(q)).toBe(false);
  });
});

describe('집단 표현이라도 이름 근거가 있으면 한 사람으로 본다', () => {
  // "오래 안 온 박지우님한테" — 집단어가 있어도 호칭이 붙은 이름이 있으면 지목이다.
  test('오래 안 온 박지우님한테 문자 보내줘', () => {
    expect(defersToBackend('오래 안 온 박지우님한테 문자 보내줘')).toBe(false);
  });
  test('단골인 김호영씨한테 감사 문자 써줘', () => {
    expect(defersToBackend('단골인 김호영씨한테 감사 문자 써줘')).toBe(false);
  });
});

describe('가드가 실제 함수 안에 배선돼 있다', () => {
  /* 상수만 만들어 놓고 tryDraftMessage 가 안 쓰면 아무것도 안 막는다 —
   * 이 레포에서 "읽는 코드만 있고 대입부가 없던" 사고가 실제로 있었다. */
  test('tryDraftMessage 본문이 _SEGMENT_TARGET 을 참조한다', () => {
    const i = SRC.indexOf('async function tryDraftMessage(');
    expect(i).toBeGreaterThan(0);
    const body = SRC.slice(i, i + 1400);
    expect(body).toMatch(/_SEGMENT_TARGET\.test\(t\)/);
    expect(body).toMatch(/!_NAME_EVIDENCE\.test\(t\)/);
    // 이름 추출보다 **앞에** 있어야 한다
    expect(body.indexOf('_SEGMENT_TARGET')).toBeLessThan(body.indexOf('_extractMsgTarget'));
  });
});
