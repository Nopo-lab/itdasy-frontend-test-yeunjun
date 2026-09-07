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
