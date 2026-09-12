/* [BUG-004] 매출 달력에서 환불일이 사라지던 것.
 *
 * 실측(라이브 d4dbfed, 2026-09): 헤더 325,000원인데 달력 칩을 더하면 340,000원.
 * 차이 15,000 의 정체 = 9/9 의 **−18,000원 환불일이 칩 없이 빈 칸**이었던 것(+ 만원 반올림 3,000).
 * 원장은 "어느 날이 빠졌는지" 를 화면에서 찾을 수 없었다.
 *
 * 문자열 매칭이 아니라 **배포되는 dayChip 함수를 파일에서 꺼내 실제로 실행**한다.
 * 그래야 "코드에 그 글자가 있다" 가 아니라 "그렇게 동작한다" 를 증명한다.
 */
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'app-revenue-calendar.js'), 'utf8');

/** 실제 소스에서 dayChip 구현을 꺼내 호출 가능한 함수로 만든다. */
function makeDayChip(totals) {
  // 중괄호를 세어서 잘라낸다 — 한 줄짜리 구버전이든 여러 줄 신버전이든 똑같이 꺼내진다.
  //   (줄바꿈에 의존하는 정규식을 쓰면 구버전에서 **추출이 실패해 스위트가 통째로 에러**나고,
  //    "이 수정을 되돌리면 어느 테스트가 깨지는가" 를 보여주지 못한다.)
  const at = SRC.indexOf('dayChip:');
  if (at < 0) throw new Error('dayChip 을 찾지 못했다');
  const open = SRC.indexOf('{', SRC.indexOf('=>', at));
  let depth = 0, end = -1;
  for (let i = open; i < SRC.length; i++) {
    if (SRC[i] === '{') depth++;
    else if (SRC[i] === '}' && --depth === 0) { end = i; break; }
  }
  const m = [null, SRC.slice(SRC.indexOf('(ds)', at), end + 1)];
  // _man = 실제 구현과 같은 규칙(만원 단위 반올림, 최소 1만)
  const _man = (t) => (t > 0 ? Math.max(1, Math.round(t / 10000)) : 0) + '만';
  return new Function('totals', '_man', 'return ' + m[1])(totals, _man);
}

describe('매출 달력 · 일별 칩', () => {
  const chip = makeDayChip({
    '2026-09-05': 60000,    // 보통 매출일
    '2026-09-06': 33000,    // 반올림 대상
    '2026-09-09': -18000,   // 🔴 환불로 음수 — 예전엔 빈 칸이었다
    '2026-09-11': 0,        // 🔴 +5만/−5만 상계 — 돈은 오갔는데 합계 0
  });

  test('매출일은 만원 단위 칩을 보여준다', () => {
    expect(chip('2026-09-05')).toContain('6만');
    expect(chip('2026-09-06')).toContain('3만');
  });

  test('🔴 환불로 음수인 날도 칩이 보인다 (예전엔 빈 칸)', () => {
    const html = chip('2026-09-09');
    expect(html).not.toBe('');
    expect(html).toContain('2만');        // |−18,000| → 2만
    expect(html).toMatch(/−|-/);          // 음수 표시가 있어야 한다
  });

  test('🔴 상계돼 0원인 날도 "아무 일 없던 날"로 만들지 않는다', () => {
    const html = chip('2026-09-11');
    expect(html).not.toBe('');
    expect(html).toContain('0원');
  });

  test('음수·0 칩은 매출 칩과 다른 스타일이어야 한다 (로즈면 "벌었다"로 읽힌다)', () => {
    expect(chip('2026-09-09')).toContain('is-minus');
    expect(chip('2026-09-11')).toContain('is-minus');
    expect(chip('2026-09-05')).not.toContain('is-minus');
  });

  test('기록이 아예 없는 날은 여전히 빈 칸', () => {
    expect(chip('2026-09-20')).toBe('');
  });

  test('"0만" 같은 표기는 나오지 않는다', () => {
    ['2026-09-05','2026-09-06','2026-09-09','2026-09-11','2026-09-20']
      .forEach(d => expect(chip(d)).not.toContain('0만'));
  });

  test('is-minus 스타일이 실제로 정의돼 있다', () => {
    expect(SRC).toMatch(/\.bk-month-m__evt\.is-minus\s*\{/);
  });
});
