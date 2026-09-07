/**
 * [전수감사 2026-09-08] 완료된 예약이 상세에서 "예약 확정" 으로 보이던 것.
 *
 * 실측(스테이징 · 실 Chrome · 예약 843):
 *   DB      status = "completed", amount = 150,000, deposit = 50,000
 *   캘린더  칩에 ✓ · 사이드바 "완료 1"
 *   상세    파란 **"예약 확정"** 배지 + **"시술 완료"** 버튼이 다시 뜸
 *
 * 원인 — `_bookingStatusLabel` 이 `'done'` 을 보고 있었는데
 * **백엔드에 그런 status 가 없다**(models.py: confirmed/completed/cancelled/no_show).
 * `'done'` 분기는 한 번도 안 탄 죽은 코드였고 completed 는 기본값으로 떨어졌다.
 * 바로 아래 `_resolved` 는 'completed' 를 제대로 나열한다 — 한쪽만 고친 흔적이다.
 *
 * 두 번째 결함 — '시술 완료' 버튼이 status 와 무관하게 항상 그려졌다.
 * 이 모달은 애초에 '이미 끝난 예약' 에만 열리므로 그 버튼은 정의상 틀렸다.
 * 서버는 `became_completed` 전이에서만 매출을 만들어 돈은 안전하지만,
 * 원장님은 다시 입력한 금액이 반영된 줄 안다(조용히 버려진다).
 */
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'app-calendar-view.js'), 'utf8');

/** 백엔드 models.py 의 Booking.status 주석이 정본 */
const BACKEND_STATUSES = ['confirmed', 'completed', 'cancelled', 'no_show'];

describe('예약 status 라벨 — 백엔드 enum 과 맞는가', () => {
  test('라벨 표가 백엔드 status 를 전부 안다', () => {
    const m = SRC.match(/_BOOKING_STATUS_LABEL\s*=\s*\{([\s\S]*?)\}/);
    expect(m).toBeTruthy();
    const body = m[1];
    const missing = BACKEND_STATUSES.filter(s => !new RegExp(`\\b${s}\\s*:`).test(body));
    expect(missing).toEqual([]);
  });

  test('색상 표도 마찬가지', () => {
    const m = SRC.match(/_BOOKING_STATUS_COLOR\s*=\s*\{([\s\S]*?)\}/);
    expect(m).toBeTruthy();
    const missing = BACKEND_STATUSES.filter(s => !new RegExp(`\\b${s}\\s*:`).test(m[1]));
    expect(missing).toEqual([]);
  });

  test('completed 를 삼항 사슬로 다시 판정하지 않는다 (원래 버그 모양)', () => {
    // `raw.status === 'done' ? ... : '예약 확정'` 같은 인라인 판정이 부활하면 잡는다
    expect(SRC).not.toMatch(/raw\.status\s*===\s*'done'\s*\?/);
  });
});

describe("'시술 완료' 버튼 — 이미 끝난 예약엔 없어야", () => {
  test('_canComplete 로 게이팅한다', () => {
    expect(SRC).toMatch(/_canComplete/);
    const m = SRC.match(/const\s+_canComplete\s*=\s*([^;]+);/);
    expect(m).toBeTruthy();
    // 완료·취소·노쇼가 전부 제외 대상이어야 한다
    ['completed', 'cancelled', 'no_show'].forEach(s => {
      expect(m[1]).toContain(s);
    });
  });

  test('버튼이 조건부로 렌더된다 (무조건 출력이 아니다)', () => {
    const btn = SRC.match(/\$\{_canComplete\s*\?[^}]*시술 완료/);
    expect(btn).toBeTruthy();
  });
});

describe('라벨 동작 (함수를 실제로 실행)', () => {
  // 파일 전체를 로드하지 않고 두 표 + 함수만 떼어 실행한다(의존성 없음)
  function loadLabelFns() {
    const label = SRC.match(/var _BOOKING_STATUS_LABEL\s*=\s*\{[\s\S]*?\};/)[0];
    const color = SRC.match(/var _BOOKING_STATUS_COLOR\s*=\s*\{[\s\S]*?\};/)[0];
    const fnL = SRC.match(/function _bookingStatusLabel\(s\)\s*\{[\s\S]*?\}/)[0];
    const fnC = SRC.match(/function _bookingStatusColor\(s\)\s*\{[\s\S]*?\}/)[0];
    // eslint-disable-next-line no-new-func
    return new Function(`${label}${color}${fnL}${fnC}
      return { L: _bookingStatusLabel, C: _bookingStatusColor };`)();
  }

  test.each([
    ['completed', '완료'],
    ['cancelled', '취소됨'],
    ['no_show', '노쇼'],
    ['confirmed', '예약 확정'],
    [undefined, '예약 확정'],
  ])('status=%s → %s', (status, expected) => {
    expect(loadLabelFns().L(status)).toBe(expected);
  });

  test('completed 는 확정과 다른 색이어야 한다 (한눈에 구분)', () => {
    const { C } = loadLabelFns();
    expect(C('completed')).not.toBe(C('confirmed'));
  });
});

/**
 * [전수감사 2026-09-08] PC 주간 뷰에서 고객명만 짜부라지던 것 (연준님 PHOTO 1).
 *
 * 실브라우저 실측 — 주간 칩의 이름 요소를 칼럼 폭별로 측정:
 *   칼럼 165px → 이름 90px (필요 33) 정상
 *   칼럼 110px → 이름 35px 정상
 *   칼럼  95px → 이름 20px → **잘림**   ← 창 폭 약 950px 이하
 *   칼럼  80px → 이름  5px → "…"
 *   같은 구간에서 시간 라벨은 폭을 그대로 유지했다.
 *
 * 이름이 `flex:1`(하한 없음)이고 시간이 `flex-shrink:0` 이라 압력을 이름이 전부 받았다.
 * 여긴 시간 격자다 — 블록의 세로 위치가 이미 시각을 말한다.
 * 반면 이름은 그 칸이 누구 예약인지 알려주는 유일한 정보다.
 *
 * ⚠️ 수정 후 브라우저 재측정은 셀렉터가 리로드 후 달라져 **깨끗하게 반복하지 못했다.**
 *    그래서 여기서는 스타일 계약만 못박는다(하한이 사라지면 잡힌다).
 */
describe('PC 주간 칩 — 고객명이 0 으로 짜부라지지 않는다', () => {
  const PC_CHIP = SRC.match(/if \(isPC\) \{[\s\S]*?return '<div style="display:flex[\s\S]*?<\/div>';/);

  test('PC 분기를 찾을 수 있다', () => {
    expect(PC_CHIP).toBeTruthy();
  });

  test('이름 span 에 min-width 하한이 있다', () => {
    const nameSpan = PC_CHIP[0].match(/<span style="flex:1;[^"]*"/);
    expect(nameSpan).toBeTruthy();
    expect(nameSpan[0]).toMatch(/min-width:\s*[\d.]+em/);
  });

  test('하한이 한글 3자를 담을 만큼은 된다 (3em 이상)', () => {
    const m = PC_CHIP[0].match(/min-width:\s*([\d.]+)em/);
    expect(m).toBeTruthy();
    expect(parseFloat(m[1])).toBeGreaterThanOrEqual(3);
  });

  test('이름은 여전히 ellipsis 로 넘침 처리된다 (하한을 넘어서면)', () => {
    const nameSpan = PC_CHIP[0].match(/<span style="flex:1;[^"]*"/)[0];
    expect(nameSpan).toContain('text-overflow:ellipsis');
    expect(nameSpan).toContain('white-space:nowrap');
  });
});
