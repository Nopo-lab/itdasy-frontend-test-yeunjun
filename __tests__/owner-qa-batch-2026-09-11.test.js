/* [원장 QA 배치 2026-09-11] 실 Chrome 에서 재현한 5건의 재발 방지.
 *
 * 전부 "그 줄을 지우면 FAIL" 하도록 짰다 — 존재 확인이 아니라 **가드 자체**를 본다.
 */
const fs = require('fs');
const path = require('path');
const R = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

describe('매출 · /services 무한 재귀 (초당 57회 429)', () => {
  const src = R('app-revenue.js');

  test('시술 칩 재렌더는 재시도 플래그로 1회만 돈다', () => {
    // 실측: 매출 입력 모달을 연 채 10초 → GET /services 570건(전부 429).
    //   loadServiceTemplates() 가 실패해도 []를 반환(throw X)해 .then() 이 돌고,
    //   캐시가 비어 있으니 같은 분기가 자기 자신을 무한히 다시 불렀다.
    const m = src.match(/if \(!list\.length[^)]*\)\s*\{[\s\S]{0,240}?loadServiceTemplates\(\)/);
    expect(m).not.toBeNull();
    expect(m[0]).toMatch(/_rfSvcRetried/);           // 가드 없으면 FAIL
  });

  test('재시도 플래그를 먼저 세우고 호출한다 (세우기 전 호출이면 경합)', () => {
    const i = src.indexOf('modal._rfSvcRetried = true;');
    const j = src.indexOf('window.loadServiceTemplates().then', i);
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
  });
});

describe('고객 · 목록을 못 불러온 것을 "0명"으로 표시하지 않는다', () => {
  const src = R('app-customer.js');

  test('pick() 이 로드 실패를 별도로 기록한다', () => {
    expect(src).toMatch(/_pickLoadFailed\s*=\s*false/);
    expect(src).toMatch(/_pickLoadFailed\s*=\s*true/);
  });

  test('빈 결과 분기에서 로드 실패를 **가장 먼저** 판정한다', () => {
    // 검색어가 있을 때도 '새 고객으로 추가' 를 권하면 중복 고객이 생긴다.
    const at = src.indexOf('if (!hits.length) {');
    expect(at).toBeGreaterThan(-1);
    const blk = src.slice(at, at + 3000);
    const failIdx = blk.indexOf('_pickLoadFailed');
    const trimIdx = blk.indexOf('else if (trimmed)');
    expect(failIdx).toBeGreaterThan(-1);
    expect(trimIdx).toBeGreaterThan(failIdx);   // 순서가 뒤집히면 FAIL
  });

  test('로드 실패 화면은 신규 추가 UI 를 숨긴다', () => {
    const i = src.indexOf('고객 목록을 불러오지 못했어요');
    expect(i).toBeGreaterThan(-1);
    const seg = src.slice(i, i + 700);
    expect(seg).toMatch(/createRow\.style\.display\s*=\s*'none'/);
  });
});

describe('예약 · 폼 스크롤이 예약 시각을 바꾸지 않는다', () => {
  const src = R('app-calendar-view.js');

  test('시간 휠에 wheel 핸들러가 있고 기본 동작을 막는다', () => {
    const i = src.indexOf(".bf-tp-wheel'");
    expect(i).toBeGreaterThan(-1);
    const seg = src.slice(i, i + 6000);
    expect(seg).toMatch(/addEventListener\('wheel'/);
    expect(seg).toMatch(/preventDefault\(\)/);
    expect(seg).toMatch(/passive:\s*false/);       // passive:true 면 preventDefault 가 무시된다
  });

  test('휠 입력을 스크롤 조상으로 넘긴다', () => {
    expect(src).toMatch(/sc\.scrollTop\s*\+=\s*e\.deltaY/);
  });
});

describe('잇비 · 못 열었으면 질문을 지우지 않는다', () => {
  const src = R('app-home-v41.js');

  test('openSheet 가 성공/실패를 반환한다', () => {
    const i = src.indexOf('const openSheet = (opts) =>');
    expect(i).toBeGreaterThan(-1);
    const seg = src.slice(i, i + 600);
    expect(seg).toMatch(/return false/);
    expect(seg).toMatch(/return true/);
  });

  test('Enter · 전송 두 경로 모두 실패 시 input 을 보존한다', () => {
    const hits = src.match(/openSheet\([^)]*\) === false\) return;/g) || [];
    expect(hits.length).toBeGreaterThanOrEqual(2);   // Enter + swap 버튼
  });
});

describe('회원권 · 고객 상세에서 도달할 수 있다', () => {
  const src = R('app-customer-dashboard.js');

  test('상세 액션 줄에 회원권 버튼이 있다', () => {
    expect(src).toMatch(/data-cv4-act="membership"/);
  });

  test('회원권 액션이 충전 시트를 연다', () => {
    const i = src.indexOf("act === 'membership'");
    expect(i).toBeGreaterThan(-1);
    expect(src.slice(i, i + 400)).toMatch(/openMembershipCharge/);
  });

  test('잔액을 버튼 라벨에 노출한다', () => {
    expect(src).toMatch(/_mbBtn/);
    expect(src).toMatch(/membership_balance/);
  });
});
