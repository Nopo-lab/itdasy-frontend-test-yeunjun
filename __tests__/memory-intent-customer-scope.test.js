/**
 * [P1 2026-09-09] 고객 메모 요청이 원장 기억 조회에 가로채이던 것
 *
 * 실측(실 Chrome, 배포본 87c668e):
 *   "김호영님 고객 메모 보여줘"
 *     → POST /assistant/ask        0회   (LLM 을 아예 안 부름)
 *     → GET  /customers/675/memos  0회   (그 손님 메모를 한 번도 안 봄)
 *     → GET  /assistant/facts      2회   (원장 기억만 조회)
 *     → 화면: "지금 이런 걸 기억하고 있어요 🧠 • 고양이 알러지 주의"
 *
 *   그 손님의 실제 고객 메모는 `is_warning: true, is_medical: true` 인 "고양이 알러지 있음".
 *   원장이 "이 손님 메모 뭐 있어?" 라고 물었을 때 **알러지 경고를 못 본다.**
 *
 * 원인: memory-intent.js 의 `RECALL_RE` 에 `메모\s*(보여|뭐|목록|확인|알려|있|좀)` 가 있어
 * 앞의 고객 지시어를 무시하고 잡아챈다. save/forget 모드도 같은 구멍이었다
 * ("○○님 메모 지워줘" → 원장 기억에서 삭제 시도, "○○님 알러지 메모해" → 원장 기억에 저장).
 *
 * 같은 계열 `saved-cards-intent.js` 는 사진·예약·매출 도메인에 양보하는 가드를 여러 개
 * 갖고 있다 — 여기만 빠져 있었다.
 */
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'assistant', 'core', 'memory-intent.js'), 'utf8');

function extractGuard() {
  const i = SRC.indexOf('var CUSTOMER_SCOPE_RE = new RegExp(');
  expect(i).toBeGreaterThan(-1);
  const j = SRC.indexOf('\n  );', i);
  let expr = SRC.slice(i + 'var CUSTOMER_SCOPE_RE = new RegExp('.length, j);
  expr = expr.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
  // eslint-disable-next-line no-eval
  const re = new RegExp(eval(expr));
  return (t) => (/(^|\s)(내|제)\s*메모/.test(t) ? false : re.test(t));
}

describe('memory-intent 는 고객 메모 요청을 가로채지 않는다', () => {
  const isCustomerScoped = extractGuard();

  test.each([
    ['그 사람 메모 보여줘'],
    ['김호영님 메모 보여줘'],
    ['김호영님 고객 메모 보여줘'],
    ['강연준님 메모 확인해줘'],
    ['이 고객 메모 알려줘'],
    ['손님 메모 뭐 있어'],
    ['아까 그분 메모 보여줘'],
    ['김호영님 알러지 있다고 메모해'],          // save 모드도 양보해야 한다
    ['김호영님 메모 지워줘'],                    // forget 모드도 양보해야 한다
    ['김호영님은 고양이 알러지 있어. 고객 메모에 남겨'],
  ])('고객 스코프로 판정: %s', (q) => {
    expect(isCustomerScoped(q)).toBe(true);
  });

  test.each([
    ['내 메모 보여줘'],
    ['메모 보여줘'],
    ['뭐 기억하고 있어?'],
    ['화요일 오전 예약 안 받으니 기억해'],
    ['원장님은 앞으로 화요일 오전 예약 안 받으니 기억해'],
  ])('원장 기억으로 남긴다: %s', (q) => {
    expect(isCustomerScoped(q)).toBe(false);
  });

  test('classify 가 고객 스코프면 null 을 돌려 서버 경로에 양보한다', () => {
    const i = SRC.indexOf('function classify(q)');
    expect(i).toBeGreaterThan(-1);
    const body = SRC.slice(i, i + 700);
    expect(body).toMatch(/_isCustomerScoped\(t\)\)\s*return null;/);
    // 양보 판정이 FORGET/RECALL/SAVE 판정보다 **먼저** 와야 한다
    const guardAt = body.indexOf('_isCustomerScoped');
    const forgetAt = body.indexOf('FORGET_RE.test');
    const recallAt = body.indexOf('RECALL_RE.test');
    expect(guardAt).toBeLessThan(forgetAt);
    expect(guardAt).toBeLessThan(recallAt);
  });

  test('"내 메모" 예외가 살아 있다(원장 기억을 못 보게 되면 안 된다)', () => {
    expect(SRC).toMatch(/내\|제\)\\s\*메모/);
  });
});
