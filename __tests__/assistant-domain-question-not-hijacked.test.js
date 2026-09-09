/* [§11 2026-09-09 · 3차] "제외 목록이 하나 더 있었다" 를 문법 모양과 무관하게 막는다.
 *
 * 1차: `customer-add-guard._looksAddCustomer` 에 '메모' 가 없어서
 *      "김호영님 메모 추가해줘" 가 **고객 추가**로 새어 나갔다.
 * 2차: 같은 목록을 쓰는 `customer-phone-intent` 에도 똑같이 빠져 있었다(전역 검색으로 발견).
 * 3차: **같은 파일 안에 목록이 하나 더 있었다** — `_looksFindCustomer`.
 *      실측(배포본 402267d): `_looksFindCustomer('김호영 고객 메모 있어?')` → true
 *      → 잇비가 메모를 답하는 대신 "김호영님 고객 기록을 열게요" 하고 화면만 연다.
 *
 * 왜 2차 가드가 3차를 못 막았나: 그 테스트는 `return !/(...)/.test(t);` 라는
 * **문법 모양**을 정규식으로 찾았다. `_looksFindCustomer` 는 `if (/(...)/) return false;`
 * 라 모양이 달라서 검색에 안 걸렸다. 가드가 스스로 반쪽이었던 것이다.
 *
 * 그래서 이 파일은 문법을 보지 않는다. 분류기 함수를 **실제로 실행해서**
 * 도메인 질문이 하나라도 가로채이면 실패시킨다. 새 분류기가 어떤 모양으로 추가돼도
 * (아래 커버리지 테스트가) 같이 걸린다.
 */
const fs = require('fs');
const path = require('path');

const CORE = path.join(__dirname, '..', 'js', 'assistant', 'core');
const GUARD_SRC = fs.readFileSync(path.join(CORE, 'customer-add-guard.js'), 'utf8');
const PHONE_SRC = fs.readFileSync(path.join(CORE, 'customer-phone-intent.js'), 'utf8');

/** 소스에서 `function 이름(...) { ... }` 를 중괄호 균형으로 통째로 잘라낸다. */
function cut(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('함수를 못 찾음: ' + name);
  let depth = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) return src.slice(i, k + 1); }
  }
  throw new Error('중괄호가 안 닫힘: ' + name);
}

/** 모듈 최상단의 상수 선언(정규식 등)을 그대로 가져온다 — 분류기가 참조한다. */
function consts(src) {
  return [...src.matchAll(/^  (?:const|var|let)\s+[A-Z_][A-Z0-9_]*\s*=[^\n]*$/gm)].map((m) => m[0]).join('\n');
}

function build(src, names, helpers) {
  const code = [consts(src), ...(helpers || []).map((h) => cut(src, h)),
                ...names.map((n) => cut(src, n))].join('\n');
  const ret = '{' + names.map((n) => `${JSON.stringify(n)}: ${n}`).join(', ') + '}';
  return new Function(code + '\nreturn ' + ret + ';')();
}

/* 원장이 실제로 던지는 도메인 질문 — 이 중 하나라도 가로채이면 잇비가 엉뚱한 화면을 연다. */
const DOMAIN_QUESTIONS = [
  '고객 메모 있나?', '손님 메모 있어?', '고객 노트 있나?',
  '김호영 고객 메모 있어?', '고객 알러지 있나?', '손님 알레르기 있어?',
  '고객 주의사항 있어?', '고객 특이사항 있나?',
  '고객 회원권 잔액 있나?', '손님 회원권 있어?', '고객 충전 내역 있나?',
];

/* 반대로 이건 반드시 잡혀야 한다 — 제외어를 늘리다 본래 기능을 죽이지 않았는지. */
const REAL_HITS = [
  ['_looksAddCustomer', '박서준 고객 추가해줘'],
  ['_looksAddCustomer', '새 손님 등록해줘'],
  ['_looksFindCustomer', '고객 찾아줘'],
  ['_looksFindCustomer', '김호영 찾아줘'],
  ['_looksOpenRecord', '김호영 고객 기록 열어줘'],
];

describe('customer-add-guard: 도메인 질문을 가로채지 않는다', () => {
  const GUARD_PREDICATES = ['_looksAddCustomer', '_looksOpenRecord', '_looksFindCustomer'];
  const F = build(GUARD_SRC, GUARD_PREDICATES, ['_trim']);

  test.each(DOMAIN_QUESTIONS)('%s — 어떤 분류기도 가로채지 않는다', (q) => {
    const hit = GUARD_PREDICATES.filter((n) => F[n](q));
    expect(hit).toEqual([]);
  });

  test.each(REAL_HITS)('%s 는 %s 를 여전히 잡는다', (fn, q) => {
    expect(F[fn](q)).toBe(true);
  });

  /* 🔑 구조 가드 — 이게 3차 사고를 막는 핵심.
     분류기를 하나 더 만들면 이 테스트가 먼저 빨개져서 위 배터리에 등록하게 만든다. */
  test('분류기가 새로 생기면 위 배터리에 등록하라고 알린다', () => {
    const found = [...GUARD_SRC.matchAll(/function\s+(_looks[A-Za-z]+)\s*\(/g)].map((m) => m[1]);
    expect(found.sort()).toEqual([...GUARD_PREDICATES].sort());
  });
});

describe('customer-phone-intent: 도메인 질문을 가로채지 않는다', () => {
  const PHONE_PREDICATES = [...new Set(
    [...PHONE_SRC.matchAll(/function\s+(_looks[A-Za-z]+)\s*\(/g)].map((m) => m[1]))];
  const F = build(PHONE_SRC, PHONE_PREDICATES, ['_trim']);

  test('분류기가 하나라도 있어야 테스트가 의미를 갖는다', () => {
    expect(PHONE_PREDICATES.length).toBeGreaterThan(0);
  });

  test.each(DOMAIN_QUESTIONS)('%s — 어떤 분류기도 가로채지 않는다', (q) => {
    const hit = PHONE_PREDICATES.filter((n) => F[n](q + ' 010-1234-5678'));
    expect(hit).toEqual([]);
  });
});
