/* [P1 2026-09-09] DB 이름에 접두사가 붙어 있으면 **정확히 부른 이름도 '유사'로 떨어져서**
 * 예약이 되묻기에 갇히고, 심지어 다른 고객이 후보 1번으로 올라왔다.
 *
 * 실측(배포본 cb74b6f · 실 Chrome · 운영 DB):
 *   Q "E2E_A_박지우님 모레 오후 3시에 커트 예약 잡아줘"
 *   A "🔍 정확히 일치하는 고객이 없어요. 비슷한 이름 후보예요. 정확한 이름으로 다시 알려주세요:
 *      · E2E_B_박지우현 (010-7001-0002)      ← 물어보지 않은 고객이 1번
 *      · E2E_A_박지우  (010-7001-0001)"
 *   → 예약 4건 → 4건. 정확한 이름을 댔는데 다시 대라고 하고, 다시 대도 같은 답이 나온다.
 *
 * 원인: 이름 추출이 `[가-힣]{2,5}` 라 "박지우" 만 뽑는다.
 *   `_nameMatches('박지우', 'E2E_A_박지우')` = candidate.includes(target) = **90**.
 *   자동 확정은 100 단독일 때만이라 90 은 되묻기로 간다.
 *   게다가 'E2E_B_박지우현' 도 같은 90 이라 동점이 되어 다른 고객이 먼저 뜬다.
 *
 * 운영 데이터에도 접두사 이름이 실제로 있다("(샘플) 이수민" — 시드·별칭 표기).
 * 그래서 **이름 경계에서 끝나는 접두사형은 같은 사람**으로 본다.
 * 백엔드 `_customer_ids_by_name` 이 이미 쓰는 규칙과 같은 계약이다(형제 경로 정렬).
 */
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'assistant-intent-router.js'), 'utf8');

function cut(name) {
  const i = SRC.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('함수를 못 찾음: ' + name);
  let depth = 0;
  for (let k = SRC.indexOf('{', i); k < SRC.length; k++) {
    if (SRC[k] === '{') depth++;
    else if (SRC[k] === '}') { depth--; if (depth === 0) return SRC.slice(i, k + 1); }
  }
  throw new Error('중괄호가 안 닫힘: ' + name);
}

// eslint-disable-next-line no-new-func
const nameMatches = new Function(cut('_nameMatches') + '\nreturn _nameMatches;')();
const decide = new Function(cut('_decideCustomer') + '\nreturn _decideCustomer;')();

const score = (target, names) => names
  .map((n) => ({ c: { name: n, phone: '010-0000-0000' }, score: nameMatches(target, n) }))
  .filter((x) => x.score > 0)
  .sort((a, b) => b.score - a.score);

/* [계약 갱신 · 잇비 전수QA 2026-09-11]
 * 원래 계약은 "접두사형도 완전 일치와 **같은 100**" 이었다. 그런데 둘이 **동시에** 있으면
 * 동점이 되어 되묻기로 빠진다 — 실측:
 *   고객 목록에 "김호영" 과 "E2E_C_김호영" 이 둘 다 있을 때
 *   "김호영님 예약 있어?" → "🔍 같은 이름 2명 있어요"      ← 같은 이름이 아니다
 * 그래서 등급을 하나 더 둔다: **완전 일치 110 > 접두사형 100 > 부분 90**.
 * "접두사형도 자동 확정된다" 는 원래 의도는 그대로다(단독이면 100 으로 확정).
 */
describe('접두사가 붙은 이름도 자동 확정 등급(100+)이다', () => {
  test.each([
    ['E2E_A_박지우', '박지우', 100],
    ['(샘플) 이수민', '이수민', 100],
    ['샵-김서연', '김서연', 100],
  ])('%s ← "%s" = %i (접두사형)', (dbName, spoken, want) => {
    expect(nameMatches(spoken, dbName)).toBe(want);
  });
  test('완전 일치는 접두사형보다 높다 — 둘이 같이 있어도 되묻지 않는다', () => {
    expect(nameMatches('이수민', '이수민')).toBe(110);
    expect(nameMatches('이수민', '이수민')).toBeGreaterThan(nameMatches('이수민', '(샘플) 이수민'));
  });
});

describe('비슷한 다른 사람은 여전히 정확 일치가 아니다', () => {
  test.each([
    ['E2E_B_박지우현', '박지우'],   // 접미가 아니다 — 다른 사람
    ['박지우현', '박지우'],
    ['박김서연', '김서연'],          // 앞이 한글이면 경계가 아니다 — 다른 사람
    ['E2E_A_박지우', '지우'],        // 이름 일부만 말한 것 — 자동 확정 금지
  ])('%s ← "%s" 는 100 이 아니다', (dbName, spoken) => {
    expect(nameMatches(spoken, dbName)).not.toBe(100);
  });
});

describe('실측 사고 그 상황 — 예약이 자동 확정된다', () => {
  test('"박지우" 로 부르면 E2E_A_박지우 로 확정되고 박지우현은 안 뜬다', () => {
    const picked = decide(score('박지우', ['E2E_B_박지우현', 'E2E_A_박지우']));
    expect(picked.customer).toBeTruthy();
    expect(picked.customer.name).toBe('E2E_A_박지우');
    expect(picked.askText).toBeUndefined();
  });

  test('"(샘플) 이수민" 도 되묻지 않는다', () => {
    const picked = decide(score('이수민', ['(샘플) 이수민', '이수진']));
    expect(picked.customer && picked.customer.name).toBe('(샘플) 이수민');
  });
});

describe('안전장치는 그대로 (자동 확정을 넓히다 오선택 만들지 않았는지)', () => {
  test('진짜 동명이인은 여전히 되묻는다', () => {
    const picked = decide(score('김민수', ['E2E_G_김민수', 'E2E_G_김민수']));
    expect(picked.customer).toBeUndefined();
    expect(picked.askText).toMatch(/같은 이름/);
  });

  test('접두사만 다르고 같은 이름이 둘이면 되묻는다', () => {
    const picked = decide(score('이수민', ['(샘플) 이수민', 'A_이수민']));
    expect(picked.customer).toBeUndefined();
    expect(picked.askText).toBeTruthy();
  });

  test('유사 후보뿐이면 여전히 자동 확정하지 않는다', () => {
    const picked = decide(score('박지우', ['E2E_B_박지우현']));
    expect(picked.customer).toBeUndefined();
    expect(picked.askText).toMatch(/정확히 일치하는 고객/);
  });
});
