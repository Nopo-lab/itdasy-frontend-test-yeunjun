/**
 * @jest-environment jsdom
 */
/* [BUG-N3] 충전했는데 다시 열면 "현재 잔액 0원" 으로 보이던 것.
 *
 * 실측(라이브 ec4cf71, 실 Chrome): 30,000원 충전 →
 *   POST /memberships/topup  200
 *   토스트 "QA0911_김테스트님 +30,000원 (잔액 30,000원)"
 *   내역  "09-11 06:55 · 회원권 충전 +30,000원"
 *   서버  current_balance: 30000 / membership_balance: 30000
 *   그런데 시트 머리글만 **"현재 잔액 0원"**.
 * 0원으로 보고 또 충전하면 이중 충전이 된다.
 *
 * 이 테스트는 문자열을 찾지 않는다. 실제 `_loadHistory` 를 파일에서 꺼내
 * **가짜 서버 응답을 물려 실행**하고, DOM 의 머리글이 실제로 바뀌는지 본다.
 */
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'app-membership.js'), 'utf8');

/** IIFE 내부의 _loadHistory 를 꺼내 실행 가능한 형태로 만든다. */
function loadFn(fetchImpl) {
  const at = SRC.indexOf('async function _loadHistory(');
  if (at < 0) throw new Error('_loadHistory 를 못 찾음 — 구조가 바뀌었으면 이 테스트부터 고쳐라');
  let depth = 0, i = SRC.indexOf('{', at), end = -1;
  for (; i < SRC.length; i++) {
    if (SRC[i] === '{') depth++;
    else if (SRC[i] === '}' && --depth === 0) { end = i; break; }
  }
  const body = SRC.slice(at, end + 1);
  const formatMoney = (n) => Number(n).toLocaleString('ko-KR') + '원';
  return new Function('_fetch', 'formatMoney', body + '; return _loadHistory;')(fetchImpl, formatMoney);
}

function mountSheet(subText) {
  document.body.innerHTML =
    '<div id="membershipSheet"><div id="msSub">' + subText + '</div><div id="wrap"></div></div>';
  return document.querySelector('#wrap');
}

describe('회원권 머리글 잔액은 서버가 진실원이다', () => {
  test('🔴 서버 잔액이 화면의 낡은 값을 덮는다', async () => {
    const wrap = mountSheet('QA0911_김테스트님 회원권 충전 · 현재 잔액 0원');
    const load = loadFn(async () => ({
      current_balance: 30000,
      history: [{ id: 1, kind: 'topup', amount: 30000, display_amount: 30000, service_name: '회원권 충전', recorded_at: '2026-09-11T06:55:14Z' }],
    }));
    await load(711, wrap);
    expect(document.querySelector('#msSub').textContent).toContain('30,000원');
    expect(document.querySelector('#msSub').textContent).not.toContain('잔액 0원');
  });

  test('고객 이름은 그대로 둔다 — 잔액 부분만 바꾼다', async () => {
    const wrap = mountSheet('QA0911_김테스트님 회원권 충전 · 현재 잔액 0원');
    const load = loadFn(async () => ({ current_balance: 52000, history: [{ id: 1, kind: 'topup', amount: 52000, recorded_at: '2026-09-11T06:55:14Z' }] }));
    await load(711, wrap);
    const t = document.querySelector('#msSub').textContent;
    expect(t).toContain('QA0911_김테스트님');
    expect(t).toContain('52,000원');
  });

  test('서버가 잔액을 안 주면 화면 값을 건드리지 않는다', async () => {
    const wrap = mountSheet('홍길동님 회원권 충전 · 현재 잔액 7,000원');
    const load = loadFn(async () => ({ history: [{ id: 1, kind: 'topup', amount: 1000, recorded_at: '2026-09-11T06:55:14Z' }] }));
    await load(711, wrap);
    expect(document.querySelector('#msSub').textContent).toContain('7,000원');
  });

  test('잔액 문구가 없는 머리글은 건드리지 않는다', async () => {
    const wrap = mountSheet('홍길동님 회원권 충전');
    const load = loadFn(async () => ({ current_balance: 30000, history: [{ id: 1, kind: 'topup', amount: 30000, recorded_at: '2026-09-11T06:55:14Z' }] }));
    await load(711, wrap);
    expect(document.querySelector('#msSub').textContent).toBe('홍길동님 회원권 충전');
  });

  test('내역 렌더는 그대로 동작한다 (기존 계약 유지)', async () => {
    const wrap = mountSheet('홍길동님 회원권 충전 · 현재 잔액 0원');
    const load = loadFn(async () => ({
      current_balance: 20000,
      history: [{ id: 1, kind: 'use', amount: 0, display_amount: 10000, service_name: '컷', recorded_at: '2026-09-11T07:00:00Z' }],
    }));
    await load(711, wrap);
    expect(wrap.innerHTML).toContain('최근 내역');
    expect(wrap.innerHTML).toContain('10,000원');   // display_amount 우선 (amount=0 이 아니라)
    expect(wrap.innerHTML).toContain('−');          // 사용은 음수 표기
  });
});
