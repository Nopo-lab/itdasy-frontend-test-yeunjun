/* [ITBI Closeout 2026-09-13 · P3] 프론트 지름길 답엔 후속 추천칩이 0개였다(추천칩 그래프 나쁜 막다른 길 16/20). */
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'app-assistant.js'), 'utf8');
const ROUTER = fs.readFileSync(path.join(__dirname, '..', 'assistant-intent-router.js'), 'utf8');

function cut(src, startMarker) {
  const i = src.indexOf(startMarker);
  if (i < 0) throw new Error('못 찾음: ' + startMarker);
  let depth = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') depth++; else if (src[k] === '}') { depth--; if (depth === 0) return src.slice(i, k + 1); }
  }
  throw new Error('안 닫힘');
}

const TABLE = SRC.slice(SRC.indexOf('  const _FE_FOLLOWUPS = {'), SRC.indexOf('  function _feFollowups('));  // _FE_CHIP_FAMILY 포함
const FN = cut(SRC, '  function _feFollowups(');
function make(history) {
  // eslint-disable-next-line no-new-func
  return new Function('_history', TABLE + FN + '\nreturn _feFollowups;')(history);
}

describe('_feFollowups', () => {
  test('매출 답엔 3개', () => {
    expect(make([{ role: 'user', text: '이번 달 매출 얼마야?' }])('revenue')).toHaveLength(3);
  });
  test('방금 물은 질문은 다시 권하지 않는다', () => {
    const f = make([{ role: 'user', text: '오늘 빈 시간 알려줘' }, { role: 'user', text: '오늘 예약 몇 개야?' }]);
    expect(f('bookings')).not.toContain('오늘 빈 시간 알려줘');
  });
  test('같은 뜻을 방금 물었으면 거른다 — 재료비 → 매출 → 지출 칩 금지(라이브 재추천 1건)', () => {
    const f = make([{ role: 'user', text: '재료비 얼마 썼어?' }, { role: 'user', text: '이번 달 매출 얼마야?' }]);
    expect(f('revenue')).not.toContain('이번 달 지출 얼마야?');
    expect(f('revenue').length).toBeGreaterThan(0);
  });
  test('관련 없는 질문 뒤엔 지출 칩이 그대로 나온다', () => {
    expect(make([{ role: 'user', text: '이번 달 매출 얼마야?' }])('revenue')).toContain('이번 달 지출 얼마야?');
  });
  test('이름 템플릿은 이름이 있을 때만', () => {
    expect(make([])('bookings_lookup', '김호영')).toContain('김호영님 마지막 방문 언제야?');
    expect(make([])('bookings_lookup', '').some(t => /님 /.test(t) && t.startsWith('님'))).toBe(false);
  });
});

describe('배관 — 지름길 답이 칩을 싣는다', () => {
  const run = cut(SRC, '  async function _runAsyncIntentRule(');
  test('예약·매출 분기 3곳 모두 related', () => {
    const pushes = run.match(/_history\.push\(\{ role: 'assistant'[^;]*\);/g) || [];
    expect(pushes.length).toBeGreaterThanOrEqual(3);
    pushes.slice(0, 3).forEach(p => expect(p).toMatch(/related:/));
  });
  test('예약 조회 지름길이 고객 이름을 돌려주고 칩을 붙인다', () => {
    expect(ROUTER).toMatch(/type: 'bookings_lookup'/);
    expect(ROUTER).toMatch(/customer: customer, customer_name: customer\.name/);
    expect(cut(SRC, '  async function _tryLookupBookingShortcut(')).toMatch(/_feFollowups\('bookings_lookup', result\.customer_name/);
  });
});
