/**
 * [2026-09-09] 고객 목록을 "여는 순간" 서버와 맞춘다 — stale 목록 가드
 *
 * 실측(실 Chrome, 운영 DB):
 *   다른 경로로 손님 생성(`POST /customers` → 201) → 홈 → 고객관리 재진입
 *   → 목록에 **안 나온다**. 세션 9 에서는 10초를 기다려도 수렴하지 않았고
 *     (DB 5명 · 화면 4행), 그 사이 `GET /customers` 는 실제로 나갔는데도 화면이 안 바뀌었다.
 *
 * 원인: `openCustomers()` 가 `list()` 를 불렀는데 `list()` 는 `swr.fresh`(2분 이내)면
 * 네트워크를 **아예 안 친다**. 이름은 stale-while-revalidate 인데 동작은 그냥 2분 TTL 캐시였다.
 *
 * 원장이 겪는 모습: 폰에서 손님을 추가하고 PC 를 보면 없다.
 * 명함 스캔·DM 자동 등록·잇비가 만든 손님도 같다 — "저장됐다는데 목록에 없다".
 */
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'app-customer.js'), 'utf8');

function openCustomersBody() {
  const i = SRC.indexOf('window.openCustomers = async function');
  expect(i).toBeGreaterThan(-1);
  const j = SRC.indexOf('window.closeCustomers = function', i);
  return SRC.slice(i, j > i ? j : i + 6000);
}

describe('고객 목록 진입 시 서버 재확인', () => {
  const body = openCustomersBody();

  test('캐시가 신선해도 _fetchFresh 를 부른다', () => {
    expect(body).toMatch(/_fetchFresh\(\)\.then/);
  });

  test('fresh 여부에 갇힌 list() 경유로 되돌아가지 않았다', () => {
    // 예전 코드: list().then(() => _rerender())  — swr.fresh 면 네트워크 0회
    expect(body).not.toMatch(/list\(\)\.then\(\(\) => _rerender\(\)\)/);
  });

  test('내용이 같으면 다시 그리지 않는다(스크롤·검색 상태 보존)', () => {
    expect(body).toMatch(/sig\(fresh\) !== sig\(_cache\)/);
  });

  test('id 목록으로 비교한다(길이만 보면 교체를 놓친다)', () => {
    expect(body).toMatch(/map\(\(c\) => c && c\.id\)\.join\(','\)/);
  });

  test('실패해도 화면이 죽지 않는다', () => {
    expect(body).toMatch(/_fetchFresh\(\)\.then\([\s\S]{0,400}\}\)\.catch\(\(\) => \{\}\)/);
  });
});
