#!/usr/bin/env node
/* T-602: Real customer dashboard + actual API on the isolated local test server.
 * Start backend/scripts/customer_care_local_server.py before running this.
 */
const ENGINE = process.env.T602_ENGINE || 'chromium';
const engine = require('playwright')[ENGINE];
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ROOT = path.resolve(__dirname, '..');
const API = 'http://127.0.0.1:8767';
async function boot(page) {
  await page.route('http://t602.local/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/api/')) {
      const response = await route.fetch({ url: API + url.pathname.slice(4) + url.search });
      return route.fulfill({ response });
    }
    return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><body><div id="customerSheet"><input id="customerSearch" aria-label="고객 검색"></div><main id="detail"></main></body></html>' });
  });
  await page.goto('http://t602.local/');
  const sprite = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').match(/<svg id="icon-sprite"[\s\S]*?<\/svg>/)[0];
  await page.evaluate(html => document.body.insertAdjacentHTML('afterbegin', html), sprite);
  await page.addStyleTag({ content: 'body{margin:0;background:#f7f6f6;font-family:Arial,sans-serif;color:#242424}#detail{max-width:680px;margin:auto;padding:16px;box-sizing:border-box}#customerSheet{max-width:648px;margin:auto;padding:16px 16px 0}#customerSearch{display:none}.ic{fill:none;stroke:currentColor;stroke-width:1.7}*{box-sizing:border-box}' });
  for (const file of ['css/screens/customer-v4.css', 'css/screens/customer-care.css']) await page.addStyleTag({ path: path.join(ROOT, file) });
  await page.evaluate(() => {
    window.API = '/api'; window.getToken = () => 't602-user1';
    window.authHeader = () => ({ Authorization: 'Bearer ' + window.getToken() });
    window.apiFetch = (url, options) => fetch('/api' + url, options);
    window.showToast = text => { window.lastToast = text; };
    window.formatMoney = n => Number(n || 0).toLocaleString() + '원';
    window._esc = text => String(text ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  });
  for (const f of ['data', 'view', 'forms', 'controller', 'due']) await page.addScriptTag({ path: path.join(ROOT, 'js/customer-care/' + f + '.js') });
  await page.addScriptTag({ path: path.join(ROOT, 'app-customer-dashboard.js') });
  await page.evaluate(() => { window.CustomerCare.mountDueShortcut(document.getElementById('customerSheet')); return window._renderCustomerDetail(document.getElementById('detail'), 10); });
  await page.locator('[data-cc-action="edit-plan"]').waitFor();
}
async function resetFixture(page) {
  await page.evaluate(async () => {
    await window.CustomerCare.request(window.CustomerCare.paths.plan(10), 'PUT', { due_date: null, note: '' });
    await window.CustomerCare.request(window.CustomerCare.paths.referrer(10), 'PUT', { referrer_id: null });
    const records = await window.CustomerCare.request(window.CustomerCare.paths.records(10));
    for (const record of records.items.filter(r => r.service_name === '가상 QA 젤 네일')) await window.CustomerCare.request(window.CustomerCare.paths.record(record.id), 'DELETE');
    await window._renderCustomerDetail(document.getElementById('detail'), 10);
  });
  await page.getByRole('button', { name: '날짜 추가', exact: true }).waitFor();
}
async function main() {
  const browser = await engine.launch(); const page = await browser.newPage({ viewport: { width: Number(process.env.T602_WIDTH || 390), height: 844 } });
  const errors = []; page.on('pageerror', error => { errors.push(error.message); console.error('BROWSER ERROR', error.message); });
  await boot(page);
  await resetFixture(page);
  await page.getByRole('button', { name: '기록 추가', exact: true }).click();
  await page.getByLabel('시술명', { exact: true }).fill('가상 QA 젤 네일');
  await page.getByLabel('시술 방법 · 고객 반응').fill('누드 핑크 · 손톱 끝은 둥글게. 다음에는 길이 유지.');
  await page.screenshot({ path: path.join(ROOT, 'output/playwright/t602-' + ENGINE + '-mobile-form.png'), fullPage: true });
  await page.getByRole('button', { name: '기록 저장', exact: true }).click();
  await page.getByText('가상 QA 젤 네일', { exact: true }).waitFor();
  await page.getByRole('button', { name: '날짜 추가', exact: true }).click();
  await page.getByRole('button', { name: '3주 뒤', exact: true }).click();
  await page.getByLabel('그날 챙길 내용').fill('유지 상태 확인');
  await page.screenshot({ path: path.join(ROOT, 'output/playwright/t602-' + ENGINE + '-plan-form.png'), fullPage: true });
  const dueDate = await page.getByLabel('방문 날짜').inputValue();
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await page.getByText('유지 상태 확인', { exact: true }).waitFor();
  await page.getByRole('button', { name: '소개자 지정', exact: true }).click();
  await page.getByLabel('우리 샵 고객 검색').fill('민지');
  await page.locator('[data-cc-action="pick-referrer"]').click();
  await page.getByRole('button', { name: '소개자 저장', exact: true }).click();
  await page.getByRole('button', { name: /민지 님/ }).waitFor();
  await page.locator('.cc-due summary').click();
  await page.locator('.cc-due-person').waitFor();
  await page.screenshot({ path: path.join(ROOT, 'output/playwright/t602-' + ENGINE + '-mobile.png'), fullPage: true });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'mobile overflow');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: path.join(ROOT, 'output/playwright/t602-' + ENGINE + '-desktop.png'), fullPage: true });
  const care = await page.evaluate(() => window.CustomerCare.request(window.CustomerCare.paths.care(10)));
  assert.equal(care.plan.due_date, dueDate); assert.equal(care.referrer.id, 11);
  const other = await page.evaluate(async () => (await window.apiFetch('/customers/20/care', { headers: window.authHeader() })).status);
  assert.equal(other, 404);
  await page.evaluate(() => window._renderCustomerDetail(document.getElementById('detail'), 10));
  await page.getByText('유지 상태 확인', { exact: true }).first().waitFor();
  await page.locator('[data-cc-action="edit-plan"]').click();
  await page.getByRole('button', { name: '날짜 지우기', exact: true }).click();
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await page.getByText('정해둔 날짜가 없어요', { exact: true }).waitFor({ timeout: 5000 }).catch(async error => {
    console.error(await page.locator('body').innerText());
    console.error(await page.locator('[name="due_date"]').evaluate(el => ({ value: el.value, valid: el.validity.valid, bad: el.validity.badInput, under: el.validity.rangeUnderflow, over: el.validity.rangeOverflow, message: el.validationMessage })));
    await page.screenshot({ path: path.join(ROOT, 'output/playwright/t602-' + ENGINE + '-failure.png'), fullPage: true });
    throw error;
  });
  assert.equal((await page.evaluate(() => window.CustomerCare.request(window.CustomerCare.paths.care(10)))).plan.due_date, null);
  assert.deepEqual(errors, []); await browser.close();
  fs.writeFileSync(path.join(ROOT, 'output/playwright/t602-' + ENGINE + '-result.json'), JSON.stringify({ pass: true, engine: ENGINE, checks: ['actual dashboard', 'create treatment', 'care save and clear', 'referral search and save', 'due list', 'reload persists', 'other owner denied', 'mobile no overflow', 'desktop render', 'no browser exceptions'] }, null, 2));
  console.log('PASS: 10 browser integration checks; screenshots in output/playwright');
}
main().catch(error => { console.error(error); process.exit(1); });
