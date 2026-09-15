#!/usr/bin/env node
'use strict';

const { chromium } = require('playwright');

const url = process.env.PHOTO_QA_URL || 'http://127.0.0.1:8081/?v=t904-loader-probe';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.addInitScript(() => {
    try { localStorage.clear(); } catch (_e) { /* QA 격리 */ }
    try { navigator.serviceWorker.register = () => Promise.reject(new Error('qa sw off')); } catch (_e) { /* QA 격리 */ }
  });
  const failed = [];
  const consoleErrors = [];
  page.on('requestfailed', request => failed.push({ url: request.url(), error: request.failure()?.errorText }));
  page.on('response', response => {
    if (response.status() >= 400) failed.push({ url: response.url(), status: response.status() });
  });
  page.on('console', message => {
    if (message.type() === 'error' || /로드 실패/.test(message.text())) consoleErrors.push(message.text());
  });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  const state = await page.evaluate(async () => ({
    ensured: await window.AppLoader.ensure('photo'),
    loaded: window.AppLoader.loaded('photo'),
    photoEditor: !!window.PhotoEditor,
    itdEditor: !!window.ItdEditor,
    beautyEngine: !!window.PhotoEditorBeautyEngine,
    navV7: !!window.PhotoEditorNavV7,
    groups: Object.keys(window.APP_LOAD_GROUPS || {}),
  }));
  process.stdout.write(`${JSON.stringify({ state, failed, consoleErrors }, null, 2)}\n`);
  await browser.close();
  process.exit(state.ensured && state.itdEditor ? 0 : 1);
})().catch(error => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exit(1);
});
