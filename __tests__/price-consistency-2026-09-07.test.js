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
  /* `ItdasyIAP.purchaseMembership()` 은 플랜 인자를 안 받고 단일 월간 상품만 산다.
     그런데 연간을 고르면 버튼이 "연 99,000원으로 시작하기" 가 된다.
     스토어에 연간 상품이 없는 동안 연간 선택으로 IAP 를 태우면 **월간이 청구**된다. */
  test('IAP 는 여전히 단일 상품이다 (전제 확인)', () => {
    const iap = read('app-iap.js');
    expect(iap).toMatch(/var PRODUCT_ID = 'itdasy_membership_monthly_\d+'/);
    expect(iap).toMatch(/function purchaseMembership\(\)/);   // 인자 없음
  });

  test('네이티브 분기에서 pro_yearly 는 IAP 로 안 넘어간다', () => {
    const src = read('app-plan.js');
    const i = src.indexOf('if (_isNative()) {', src.indexOf('async function doPlanAction'));
    expect(i).toBeGreaterThan(-1);
    const nativeBlock = src.slice(i, i + 1800);
    const guard = nativeBlock.indexOf("_selectedPlan === 'pro_yearly'");
    // 실제 호출만 본다 — 설명 주석에도 purchaseMembership 이라는 낱말이 나온다
    const buy = nativeBlock.indexOf('window.ItdasyIAP.purchaseMembership(');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(buy);     // 가드가 구매보다 먼저
  });
});
