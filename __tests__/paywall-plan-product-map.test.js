/**
 * @jest-environment jsdom
 */
/* 결제창의 플랜 카드 ↔ 실제로 결제되는 상품/금액이 어긋나지 않게 잠근다.
 *
 * 왜 만들었나 (2026-09-07 결제 릴리즈 게이트)
 * ─────────────────────────────────────────
 * 2026-09-02 에 결제창이 월 9,900 / 연 99,000 두 장으로 바뀌었는데
 * **app-iap.js 는 안 따라왔다.** 상품 ID 가 `itdasy_membership_monthly_6900`
 * 하나뿐이었고 purchaseMembership() 은 고른 플랜을 아예 안 받았다. 그래서
 *
 *     "연 99,000원으로 시작하기" 를 눌러도 → ₩6,900 월간 상품이 결제됨
 *
 * 금액·결제주기·상품이 셋 다 다른 결제였다. 화면만 고치는 커밋으로는
 * 절대 안 잡히는 종류라(문구는 완벽했다) 여기서 구조로 막는다.
 *
 * 잠그는 것:
 *   ① index.html 의 모든 `data-plan` 카드가 app-iap.js PRODUCTS 에 상품 ID 를 갖는다
 *   ② 같은 카드가 app-billing.js PLAN_DISPLAY(웹 PG 금액)에도 있다
 *   ③ 화면에 적힌 금액과 PLAN_DISPLAY 금액이 같다
 *   ④ 상품 ID 두 개가 서로 다르다 (복붙으로 월간이 두 번 들어가는 사고 방지)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** app-iap.js 는 IIFE 라 통째로 실행한 뒤 window.ItdasyIAP 에서 꺼낸다. */
function loadIap() {
  delete window.ItdasyIAP;
  // eslint-disable-next-line no-new-func
  new Function(read('app-iap.js')).call(window);
  return window.ItdasyIAP;
}

function loadBilling() {
  delete window.ItdasyBilling;
  // eslint-disable-next-line no-new-func
  new Function(read('app-billing.js')).call(window);
  return window.ItdasyBilling;
}

/** app-billing.js 의 PLAN_DISPLAY 는 모듈 내부 변수라 소스에서 읽는다. */
function planDisplay() {
  const src = read('app-billing.js');
  const m = src.match(/var PLAN_DISPLAY = \{([\s\S]*?)\};/);
  expect(m).toBeTruthy();
  const out = {};
  for (const line of m[1].split('\n')) {
    const e = line.match(/(\w+)\s*:\s*\{\s*amount:\s*(\d+)/);
    if (e) out[e[1]] = Number(e[2]);
  }
  return out;
}

/** 결제창(#planPopup) 안의 플랜 카드들 — data-plan 과 표시 금액. */
function paywallCards() {
  document.documentElement.innerHTML = read('index.html');
  const pop = document.getElementById('planPopup');
  expect(pop).toBeTruthy();
  return [...pop.querySelectorAll('.plan-card[data-plan]')].map((el) => {
    const priceEl = el.querySelector('.pw-price');
    // "<del>118,800원</del>연 99,000원" 처럼 취소선이 앞에 붙는다 — 마지막 금액이 실제 청구액.
    const nums = ((priceEl && priceEl.textContent) || '').match(/[\d,]+(?=\s*원)/g) || [];
    const shown = nums.length ? Number(nums[nums.length - 1].replace(/,/g, '')) : null;
    return { plan: el.dataset.plan, shown };
  });
}

// 'free' 카드는 결제 대상이 아니다(체험 유지).
const PAID = (c) => c.plan && c.plan !== 'free';

test('결제창에 유료 카드가 실제로 있다 (셀렉터가 죽으면 아래 테스트가 전부 무의미해진다)', () => {
  const paid = paywallCards().filter(PAID);
  expect(paid.length).toBeGreaterThan(0);
  paid.forEach((c) => expect(c.shown).toBeGreaterThan(0));
});

test('모든 유료 카드가 스토어 상품 ID 를 갖는다 — 없으면 엉뚱한 상품이 결제된다', () => {
  const iap = loadIap();
  const products = iap.PRODUCTS;
  const missing = paywallCards().filter(PAID)
    .filter((c) => !Object.prototype.hasOwnProperty.call(products, c.plan))
    .map((c) => c.plan);
  expect(missing).toEqual([]);
});

test('폐기된 상품을 다시 팔지 않는다 — 되돌림 사고 방지', () => {
  // 뮤테이션 검증에서 걸린 구멍: "카드마다 상품 ID 가 있다" 만 보면
  // 월간 ID 를 폐기된 ₩6,900 으로 되돌려도 통과했다. 파는 목록과 폐기 목록이
  // 겹치면 안 된다는 것까지 잠근다.
  const src = read('app-iap.js');
  const legacy = (src.match(/LEGACY_PRODUCT_IDS = \[([^\]]*)\]/) || [])[1] || '';
  const legacyIds = [...legacy.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  expect(legacyIds.length).toBeGreaterThan(0);        // 목록 자체가 사라지면 이 가드가 무의미
  const sold = Object.values(loadIap().PRODUCTS);
  expect(sold.filter((id) => legacyIds.includes(id))).toEqual([]);
});

test('플랜마다 상품 ID 가 다르다 — 복붙으로 두 카드가 같은 상품을 팔면 안 된다', () => {
  const ids = Object.values(loadIap().PRODUCTS);
  expect(new Set(ids).size).toBe(ids.length);
});

test('productIdFor(모르는 플랜) 은 월간으로 떨어진다 (조용한 undefined 금지)', () => {
  const iap = loadIap();
  expect(iap.productIdFor('존재하지않는플랜')).toBe(iap.PRODUCTS.pro);
});

test('웹 PG 표시 금액이 결제창에 적힌 금액과 같다', () => {
  const disp = planDisplay();
  paywallCards().filter(PAID).forEach((c) => {
    expect(disp[c.plan]).toBe(c.shown);
  });
});

test('웹 PG 결제 모듈이 로드되고 플랜 목록을 결제창과 공유한다', () => {
  expect(loadBilling()).toBeTruthy();
  const disp = planDisplay();
  paywallCards().filter(PAID).forEach((c) => {
    expect(Object.prototype.hasOwnProperty.call(disp, c.plan)).toBe(true);
  });
});


// ─────────────────────────────────────────────────────────────
// 배선 테스트 — 매핑표가 맞아도 **클릭이 그걸 안 쓰면** 소용없다.
//   뮤테이션 검증에서 실제로 걸렸다: purchaseMembership(_selectedPlan) 을
//   purchaseMembership() 으로 되돌려도 위 테스트 6개가 전부 통과했다.
//   그래서 결제창을 실제로 띄우고 눌러서 **주문된 상품 ID** 를 본다.
// ─────────────────────────────────────────────────────────────
function bootPaywall() {
  document.documentElement.innerHTML = read('index.html');
  delete window.ItdasyIAP;
  delete window.openPlanPopup;
  // 네이티브 앱인 척 — 웹 PG 분기로 새지 않게
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios' };
  window.showToast = () => {};
  window.hapticLight = window.hapticMedium = window.hapticSuccess = () => {};
  window.apiUrl = (p) => 'https://api.test' + p;
  // eslint-disable-next-line no-new-func
  new Function(read('app-iap.js')).call(window);
  // eslint-disable-next-line no-new-func
  new Function(read('app-plan.js')).call(window);

  const ordered = [];
  const real = window.ItdasyIAP;
  window.ItdasyIAP = Object.assign({}, real, {
    isAvailable: () => true,
    purchaseMembership: (plan) => {
      ordered.push({ plan, productId: real.productIdFor(plan) });
      return new Promise(() => {});   // 진행 중 상태로 둔다
    },
  });
  return { ordered, real };
}

async function orderFor(cardPlan) {
  const { ordered } = bootPaywall();
  await window.openPlanPopup();
  document.querySelector(`#planPopup .plan-card[data-plan="${cardPlan}"]`).click();
  // 버튼 리스너는 DOMContentLoaded 에 붙는데 jsdom 에선 그 이벤트가 이미 지나갔다.
  //   여기서 보려는 건 "버튼이 바인딩됐나"(그건 브라우저 QA 가 봤다)가 아니라
  //   **doPlanAction 이 고른 플랜을 결제에 넘기는가** 이므로 핸들러를 직접 부른다.
  await window.doPlanAction();
  await new Promise((r) => setTimeout(r, 0));
  return ordered[0] || null;
}

test('월간 카드를 누르면 월간 상품이 주문된다', async () => {
  const iap = loadIap();
  await expect(orderFor('pro')).resolves.toEqual({ plan: 'pro', productId: iap.PRODUCTS.pro });
});

test('연간 카드를 누르면 연간 상품이 주문된다 — 여기가 2026-09-07 에 깨져 있던 지점', async () => {
  const iap = loadIap();
  await expect(orderFor('pro_yearly'))
    .resolves.toEqual({ plan: 'pro_yearly', productId: iap.PRODUCTS.pro_yearly });
});
