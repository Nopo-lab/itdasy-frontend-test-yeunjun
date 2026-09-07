/**
 * 가격 정합성 가드 (2026-09-07 · "9900 통일").
 *
 * 왜 필요한가 — 실제로 어긋나 있었다:
 *   · 화면/약관/랜딩/백엔드는 **월 9,900 / 연 99,000** (2026-09-02 가격 개편)
 *   · 그런데 출시 문서 5개는 **₩6,900 · 7일 체험 · $4.99** 로 남아 있었다
 *   · `CLAUDE.md` 도 "월 6,900원 단일 멤버십 확정" 이라고 적혀 있었다
 * 결제 화면에서 **표시 금액과 청구 금액이 다르면** 스토어 심사·환불 분쟁 사유다.
 *
 * 정본(authoritative): 백엔드 `/subscription/plans`
 *   price: 9900 · price_yearly: 99000 · price_usd: 6.99
 *
 * ⚠️ 상품ID `itdasy_membership_monthly_6900` 은 **이름만 옛 가격이 남은 레거시 식별자**다.
 *    스토어 등록과 묶여 있어 이름을 바꾸면 결제가 끊긴다 → 이름은 그대로 두고,
 *    "콘솔 실제 가격이 ₩9,900 인지" 는 사람이 확인해야 한다(코드로 검증 불가).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const MONTHLY = 9900;
const YEARLY = 99000;

describe('가격 정본 — 월 9,900 / 연 99,000', () => {
  test('app-billing.js 청구 금액이 정본과 같다', () => {
    const src = read('app-billing.js');
    expect(src).toMatch(new RegExp(`pro:\\s*\\{\\s*amount:\\s*${MONTHLY}\\b`));
    expect(src).toMatch(new RegExp(`pro_yearly:\\s*\\{\\s*amount:\\s*${YEARLY}\\b`));
  });

  test('페이월(index.html) 표시 금액이 정본과 같다', () => {
    const html = read('index.html');
    expect(html).toContain('월 9,900원');
    expect(html).toContain('연 99,000원');
    // 옛 가격이 화면에 남아 있으면 안 된다
    expect(html).not.toContain('월 6,900원');
  });

  test('약관·랜딩이 정본과 같다', () => {
    expect(read('terms.html')).toContain('9,900');
    expect(read('landing/index.html')).toContain('9,900');
  });

  test('사용자에게 보이는 파일에 옛 가격(6,900)이 없다', () => {
    const USER_FACING = ['index.html', 'terms.html', 'terms-en.html', 'support.html',
      'landing/index.html', 'app-plan.js', 'app-billing.js'];
    // 주석은 제외한다 — app-plan.js 에는 "6,900원 결제자가 무료 취급됐다" 같은
    // **과거 사고 기록**이 주석으로 남아 있고, 그건 화면에 안 나온다.
    const stripComments = (s) => s
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
      .replace(/<!--[\s\S]*?-->/g, '');
    const bad = USER_FACING.filter((f) => /6,900|6900원/.test(stripComments(read(f))));
    expect({ 옛가격이_남은_파일: bad }).toEqual({ 옛가격이_남은_파일: [] });
  });

  test('출시 문서가 정본 가격을 말한다', () => {
    const DOCS = ['RELEASE_CHECKLIST.md', 'LAUNCH_REMAINING.md', 'IAP_SETUP.md',
      'docs/submission/iOS-Preflight-Checklist.md', 'docs/submission/Play-Store-Metadata.md'];
    for (const d of DOCS) {
      const s = read(d);
      expect(s).toMatch(/9,900/);
      // ₩6,900 을 "청구 가격" 으로 적어두면 안 된다 (상품ID 안의 _6900 은 예외)
      expect(s.replace(/itdasy_membership_monthly_6900/g, '')).not.toMatch(/₩6,900/);
    }
  });
});

describe('네이티브 연간 결제 — 표시와 청구가 어긋나지 않는다', () => {
  /* [2026-09-08 계약 재정의]
   *
   * 원래 이 describe 는 두 가지를 **전제로 고정**하고 있었다:
   *     ① IAP 는 단일 상품이다 (`PRODUCT_ID` 하나, `purchaseMembership()` 인자 없음)
   *     ② 그러니 네이티브에서 연간은 IAP 로 넘기지 말고 막아라
   *
   * ②는 옳았지만 ①은 **고쳐야 할 결함이지 지켜야 할 계약이 아니었다.** 원인은
   * "연간 상품이 없다" 가 아니라 "구매 함수가 고른 플랜을 안 받는다" 였고,
   * 그걸 그대로 둔 채 연간만 막으면 연간 카드가 영영 죽은 채로 남는다.
   *
   * 그래서 원인을 고쳤다(app-iap.js `PRODUCTS` 매핑 + `purchaseMembership(plan)`).
   * 이제 잠글 계약은 바뀐다 — **고른 카드의 상품이 그대로 주문되는가.**
   * 그 검증은 `paywall-plan-product-map.test.js` 가 결제창을 실제로 눌러서 한다
   * (뮤테이션 4종으로 가드가 진짜 깨지는지도 확인했다).
   *
   * 여기서는 "원래 막으려던 사고" 만 다시 못 나게 잠근다:
   *   잘못된 금액이 청구되는 일 = 카드와 상품이 어긋나는 일.
   */
  test('구매 함수가 고른 플랜을 받는다 — 단일 상품 하드코딩으로 되돌아가지 않는다', () => {
    const iap = read('app-iap.js');
    expect(iap).toMatch(/function purchaseMembership\(plan\)/);
    expect(iap).not.toMatch(/var PRODUCT_ID = '/);   // 단일 상품 상수 부활 금지
  });

  test('연간 카드에는 연간 상품이 매핑돼 있다', () => {
    const iap = read('app-iap.js');
    const block = iap.slice(iap.indexOf('var PRODUCTS'), iap.indexOf('var DEFAULT_PLAN'));
    expect(block).toMatch(/pro_yearly:\s*'itdasy_pro_yearly_\d+'/);
    expect(block).toMatch(/pro:\s*'itdasy_pro_monthly_\d+'/);
  });

  test('네이티브 분기가 고른 플랜을 그대로 넘긴다 (월간 하드코딩 금지)', () => {
    const src = read('app-plan.js');
    const i = src.indexOf('if (_isNative()) {', src.indexOf('async function doPlanAction'));
    expect(i).toBeGreaterThan(-1);
    const nativeBlock = src.slice(i, i + 2600);
    expect(nativeBlock).toContain('window.ItdasyIAP.purchaseMembership(_selectedPlan)');
  });

  test('스토어에 상품이 없을 때는 "결제 실패" 가 아니라 준비중이라고 말한다', () => {
    // 카드 문제로 오해하게 만들면 원장님이 카드를 바꾸러 간다 — 원인이 아닌데.
    const src = read('app-plan.js');
    expect(src).toContain("r.reason === 'no_product'");
  });
});
