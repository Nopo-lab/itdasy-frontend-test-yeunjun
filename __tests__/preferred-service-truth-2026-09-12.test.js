/**
 * @jest-environment jsdom
 *
 * BUG-C1 회귀 — 고객 '선호 시술' 에 **시술이 아닌 행**이 올라오던 것.
 *
 * 실측(라이브, QA 고객): 매출행이 [회원권 충전 ×2, 컷, 컷 환불, 시술, 매출 환불] 인데
 * 선호 시술이 "회원권 충전" 으로 떴다. 프론트가 service_name 을 그냥 세고 있었다.
 * 원장 눈엔 "이 손님이 제일 좋아하는 시술 = 회원권 충전" 이다 — 그건 시술이 아니다.
 *
 * 서버엔 이미 SSOT(services/customer_visits.treatment_filters)로 계산한 값이 있었는데
 * 프론트가 그걸 **무시하고** 다시 세고 있었다.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DASH = fs.readFileSync(path.join(ROOT, 'app-customer-dashboard.js'), 'utf8');
const BRIEF = fs.readFileSync(path.join(ROOT, 'app-customer-ai-brief.js'), 'utf8');

function extractFn(src, header) {
  const i = src.indexOf(header);
  if (i < 0) return '';
  let d = 0, started = false;
  for (let k = i; k < src.length; k++) {
    const c = src[k];
    if (c === '{') { d++; started = true; }
    else if (c === '}') { d--; if (started && d === 0) return src.slice(i, k + 1); }
  }
  return '';
}

function loadTopService() {
  const nonTreat = DASH.slice(DASH.indexOf('const _NON_TREATMENT'), DASH.indexOf('function _isTreatmentRow'));
  const isTreat = extractFn(DASH, 'function _isTreatmentRow(r) {');
  const top = extractFn(DASH, 'function _topService(rows, serverTop) {');
  expect(nonTreat).not.toBe('');
  expect(isTreat).not.toBe('');
  expect(top).not.toBe('');
  // eslint-disable-next-line no-new-func
  return new Function(nonTreat + '\n' + isTreat + '\n' + top + '\n; return _topService;')();
}

// 라이브에서 본 그대로의 행 모양
const LIVE_ROWS = [
  { id: 1, amount: 30000, service_name: '회원권 충전', membership_delta: 30000 },
  { id: 2, amount: 30000, service_name: '회원권 충전', membership_delta: 30000 },
  { id: 3, amount: 50000, service_name: '컷', membership_delta: null },
  { id: 4, amount: -50000, service_name: '컷 환불', membership_delta: null, refund_of_id: 3 },
  { id: 5, amount: 10000, service_name: '시술', membership_delta: null },
  { id: 6, amount: -10000, service_name: '매출 환불', membership_delta: null, refund_of_id: 5 },
];

describe('BUG-C1 · 선호 시술은 시술인 행만 센다', () => {
  test('🔴 회원권 충전이 최다여도 선호 시술이 되지 않는다 (이번 버그)', () => {
    const top = loadTopService()(LIVE_ROWS, null);
    expect(top).not.toBe('회원권 충전');
  });

  test('환불행도 후보가 아니다', () => {
    const top = loadTopService()(LIVE_ROWS, null);
    expect(top).not.toMatch(/환불/);
  });

  test('실제 시술 중 하나가 선택된다', () => {
    expect(['컷', '시술']).toContain(loadTopService()(LIVE_ROWS, null));
  });

  test('회원권 *사용*(delta<0)은 시술이므로 후보다', () => {
    const rows = [
      { id: 1, amount: 0, service_name: '젤네일', membership_delta: -30000 },
      { id: 2, amount: 0, service_name: '젤네일', membership_delta: -30000 },
      { id: 3, amount: 50000, service_name: '컷', membership_delta: null },
    ];
    expect(loadTopService()(rows, null)).toBe('젤네일');
  });

  test('서버가 준 top_services 가 있으면 그게 이긴다 (SSOT)', () => {
    expect(loadTopService()(LIVE_ROWS, ['속눈썹'])).toBe('속눈썹');
  });

  test('취소 복구행도 제외된다 (옛 행 이름 폴백)', () => {
    const rows = [
      { id: 1, amount: 10000, service_name: '컷 취소 복구', membership_delta: null },
      { id: 2, amount: 10000, service_name: '컷 취소 복구', membership_delta: null },
      { id: 3, amount: 50000, service_name: '펌', membership_delta: null },
    ];
    expect(loadTopService()(rows, null)).toBe('펌');
  });

  test('시술이 하나도 없으면 null (엉뚱한 걸 고르지 않는다)', () => {
    const rows = [{ id: 1, amount: 30000, service_name: '회원권 충전', membership_delta: 30000 }];
    expect(loadTopService()(rows, null)).toBeNull();
  });
});

describe('BUG-C1 · 가게 기억 카드도 같은 규칙을 쓴다', () => {
  test('서버 top_services 를 먼저 본다', () => {
    const body = extractFn(BRIEF, 'function _memoryFacts(d) {');
    expect(body).not.toBe('');
    expect(body).toMatch(/d\.top_services/);
  });

  test('폴백에서도 회원권 원장 행을 거른다', () => {
    const body = extractFn(BRIEF, 'function _memoryFacts(d) {');
    expect(body).toMatch(/membership_delta/);
    expect(body).toMatch(/회원권 충전/);
  });

  test('🔴 필터 없이 service_name 을 그냥 세지 않는다', () => {
    const body = extractFn(BRIEF, 'function _memoryFacts(d) {');
    expect(body).not.toMatch(/rows\.forEach\(r => \{ const n = \(r && r\.service_name \|\| ''\)\.trim\(\); if \(n\) top\[n\]/);
  });
});

describe('BUG-C1 · 대시보드가 서버 값을 실제로 넘긴다 (조용한 무효화 방지)', () => {
  test('_topService 호출에 d.top_services 가 전달된다', () => {
    expect(DASH).toMatch(/_topService\(m\.revenues, d && d\.top_services\)/);
  });
});
