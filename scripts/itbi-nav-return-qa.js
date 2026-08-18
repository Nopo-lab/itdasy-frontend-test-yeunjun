#!/usr/bin/env node
/* 잇비 내비게이션 복귀 QA — [연준님 2026-08-18 지시로 고정]
 *
 * 2026-08-18 에 375px 에서 실제로 터진 두 버그의 회귀 하네스다. 둘 다 소스 검사로는
 * 못 잡는다(코드는 멀쩡해 보였다) — 상태 전이를 실제로 돌려봐야 드러난다.
 *
 *   ① history.go(-n) 경합
 *      잇비 close → go(-1) 은 **비동기** → 목록 pushState → 늦게 온 popstate 가
 *      목록의 hash 를 지움 → 뒤로가기가 통째로 죽는다. 3회 중 2회 재현됐다.
 *      462px 데스크톱에선 우연히 타이밍이 맞아 통과했다 — 느린 기기일수록 잘 터진다.
 *
 *   ② 시트 스택 유령
 *      뒤로가기로 잇비 복귀 → openAssistant() 가 _markSheetOpen 재호출 →
 *      hash 는 이미 복원돼 pushState 는 건너뛰고 stack.push 만 → 유령이 남는다.
 *      유령이 남으면 다음 뒤로가기가 그걸 pop 하려다 아무 일도 안 한다.
 *
 * 검증 시퀀스 3 + 유령 0:
 *   A  잇비 → 고객 화면 → back → 잇비          (×3 반복)
 *   B  잇비 → 고객 → 상세 → back(목록) → back(잇비)
 *   C  잇비 열기 → 닫기 → 다시 열기            (스택 크기 정상)
 *
 * 실행: python3 -m http.server 8099 후
 *       node scripts/itbi-nav-return-qa.js   (ITBI_NAV_QA_URL 로 대상 지정 가능)
 */
const { chromium } = require('playwright');
const BASE_URL = process.env.ITBI_NAV_QA_URL || 'http://127.0.0.1:8099/?nav_v7=0&v=navqa';

const W = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const browser = await chromium.launch({ headless: true });
  // 375px — 이 버그가 드러난 폭. 데스크톱 폭에선 타이밍이 맞아 통과해 버린다.
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e.message || e)));

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(2500);

  // 인증·네트워크 없이 상태 전이만 본다 — 화면 열기 함수는 스텁으로 대체.
  await page.evaluate(() => {
    const mk = (id) => {
      let e = document.getElementById(id);
      if (!e) { e = document.createElement('div'); e.id = id; document.body.appendChild(e); }
      return e;
    };
    const list = mk('customerSheet'); const dash = mk('customerDashSheet');
    list.style.display = 'none'; dash.style.display = 'none';
    window.openCustomers = function () {
      list.style.display = 'flex';
      if (window._registerSheet) window._registerSheet('customers', window.closeCustomers);
      if (window._markSheetOpen) window._markSheetOpen('customers');
    };
    window.closeCustomers = function () {
      list.style.display = 'none';
      if (window._markSheetClosed) window._markSheetClosed('customers');
    };
    window.openCustomerDashboard = function () {
      dash.style.display = 'flex';
      if (window._registerSheet) window._registerSheet('customerDash', window.closeCustomerDashboard);
      if (window._markSheetOpen) window._markSheetOpen('customerDash');
    };
    window.closeCustomerDashboard = function () {
      dash.style.display = 'none';
      if (window._markSheetClosed) window._markSheetClosed('customerDash');
    };
  });

  const snap = () => page.evaluate(() => {
    const g = (id) => (document.getElementById(id) || {}).style?.display || 'missing';
    return { hash: location.hash, stack: (window._sheetBackStack || []).slice(),
             asst: g('assistantSheet'), list: g('customerSheet'), dash: g('customerDashSheet') };
  });
  const openViaHub = () => page.evaluate(() =>
    window.ItdasyActionHub.handleActionClick({ kind: 'open_customer', payload: {} }));

  const fails = [];
  const check = (name, cond, got) => {
    if (!cond) fails.push(`${name} — ${JSON.stringify(got)}`);
    console.log(`  ${cond ? '✅' : '❌'} ${name}`);
  };

  // ── A. 잇비 → 고객 화면 → back → 잇비 (3회) ──
  console.log('\nA. 잇비 → 고객 화면 → 뒤로 → 잇비');
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.openAssistant()); await W(700);
    await openViaHub(); await W(1200);
    const opened = await snap();
    // 경합이 있으면 여기서 hash 가 비어 버린다 (목록은 떠 있는데 주소만 사라짐)
    check(`A${i + 1} 목록 hash 유지`, opened.hash === '#customers', opened);
    await page.goBack(); await W(1100);
    const back = await snap();
    check(`A${i + 1} 잇비 복귀`, back.asst === 'block' && back.list === 'none', back);
    await page.evaluate(() => window.closeAssistant()); await W(700);
    const idle = await snap();
    check(`A${i + 1} 유령 0`, idle.stack.length === 0, idle);
  }

  // ── B. 중첩: 상세를 닫으면 목록, 목록을 닫으면 잇비 ──
  console.log('\nB. 목록 → 상세 → 뒤로(목록) → 뒤로(잇비)');
  await page.evaluate(() => window.openAssistant()); await W(700);
  await openViaHub(); await W(1200);
  await page.evaluate(() => window.openCustomerDashboard(1)); await W(1000);
  const stacked = await snap();
  check('B 상세가 목록 위에 쌓임',
    stacked.stack.join('>') === 'customers>customerDash', stacked);
  await page.goBack(); await W(1100);
  const b1 = await snap();
  // 여기서 잇비가 열리면 실패 — 목록 위 상세만 닫은 것이므로 목록으로 돌아가야 한다
  check('B 뒤로1 → 목록 (잇비로 튀지 않음)',
    b1.list === 'flex' && b1.dash === 'none' && b1.asst === 'none', b1);
  await page.goBack(); await W(1100);
  const b2 = await snap();
  check('B 뒤로2 → 잇비', b2.asst === 'block' && b2.list === 'none', b2);
  await page.evaluate(() => window.closeAssistant()); await W(700);
  check('B 유령 0', (await snap()).stack.length === 0, await snap());

  // ── C. 열기 → 닫기 → 다시 열기 (스택 크기 정상) ──
  console.log('\nC. 잇비 열기 → 닫기 → 다시 열기');
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.openAssistant()); await W(800);
    const o = await snap();
    check(`C${i + 1} 열림 스택 1개`, o.stack.length === 1 && o.stack[0] === 'assistant', o);
    await page.evaluate(() => window.closeAssistant()); await W(800);
    const c = await snap();
    check(`C${i + 1} 닫힘 스택 0개`, c.stack.length === 0, c);
  }

  if (errors.length) { console.log('\n⚠️ 페이지 에러:'); errors.slice(0, 5).forEach((e) => console.log('   ' + e)); }
  await browser.close();

  console.log(`\n${'='.repeat(60)}`);
  if (fails.length) { console.log(`❌ FAIL ${fails.length}건`); fails.forEach((f) => console.log('   ' + f)); process.exit(1); }
  console.log('✅ PASS — 복귀 3시퀀스 정상, 스택 유령 0');
}

main().catch((e) => { console.error(e); process.exit(1); });
