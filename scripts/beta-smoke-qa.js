#!/usr/bin/env node
/* 앱 전체 베타 출시 점검 — E2E smoke (1회성, 런타임 코드 미수정)
   GitHub Pages(staging 백엔드) + 데모계정으로 핵심 플로우 진입/렌더/pageerror/XSS escape 점검.
   읽기 위주(고객/예약/매출 생성은 하지 않음 — staging 데이터 오염 방지). P0/P1 탐색용.

   실행: node scripts/beta-smoke-qa.js
   결과: output/playwright/betaqa_*.png + 콘솔 JSON 리포트 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'output', 'playwright');
const PAGES = process.env.BETA_URL || 'https://nopo-lab.github.io/itdasy-frontend-test-yeunjun/';
const EMAIL = process.env.DEMO_EMAIL || 'review@itdasy.com';
const PW = process.env.DEMO_PW || '';

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 430, height: 920 }, deviceScaleFactor: 2 });
  const errors = [];
  const failedReqs = [];
  page.on('pageerror', e => errors.push('pageerror: ' + String(e.message || e)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text().slice(0, 160)); });
  page.on('requestfailed', r => { const f = r.failure(); failedReqs.push(`${r.method()} ${r.url().slice(0, 90)} — ${f ? f.errorText : '?'}`); });
  page.on('response', r => { if (r.status() >= 500) failedReqs.push(`HTTP ${r.status()} ${r.url().slice(0, 90)}`); });

  await page.addInitScript(() => {
    // XSS 실행 트랩 (innerHTML script 는 비실행이나, onerror/inline handler 류 방어 확인)
    window.__xssFired = false;
    const _al = window.alert; window.alert = function () { window.__xssFired = true; return _al && _al.apply(this, arguments); };
  });

  const report = { url: PAGES, steps: {}, findings: [] };
  const snap = async (name) => { try { await page.screenshot({ path: path.join(OUT, `betaqa_${name}.png`) }); } catch (_e) { void _e; } };
  const errCountAt = () => errors.length;

  // ── 1. 로드 + 로그인 화면 ──
  await page.goto(PAGES, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);
  const hasLogin = await page.evaluate(() => !!document.getElementById('loginEmail'));
  report.steps.load = { ok: true, hasLoginForm: hasLogin };
  await snap('login');

  // ── 2. 데모계정 로그인 ── (이메일 폼은 접혀 있음 → emailFoldBtn 으로 펼침)
  if (hasLogin) {
    try { await page.click('#emailFoldBtn', { timeout: 5000 }); } catch (_e) { void _e; }
    await page.waitForTimeout(600);
    await page.waitForSelector('#loginEmail', { state: 'visible', timeout: 10000 });
    await page.fill('#loginEmail', EMAIL);
    await page.fill('#loginPassword', PW);
    const e0 = errCountAt();
    await page.click('#loginBtn');
    // 로그인 완료: lockOverlay hidden + appLoadingOverlay 사라짐
    let loggedIn = false;
    try {
      await page.waitForFunction(() => {
        const lock = document.getElementById('lockOverlay');
        const load = document.getElementById('appLoadingOverlay');
        const lockHidden = !lock || lock.classList.contains('hidden') || lock.style.display === 'none';
        const loadHidden = !load || load.style.display === 'none' || getComputedStyle(load).display === 'none';
        return lockHidden && loadHidden;
      }, null, { timeout: 40000 });
      loggedIn = true;
    } catch (_e) { loggedIn = false; }
    await page.waitForTimeout(2500);
    const loginErr = await page.evaluate(() => { const e = document.getElementById('loginError'); return e && e.style.display !== 'none' ? e.textContent : null; });
    report.steps.login = { loggedIn, loginErrorShown: loginErr, newErrors: errors.slice(e0).slice(0, 5) };
    await snap('after_login');
  }

  // ── 3. 온보딩 오버레이 처리 (신규 브라우저면 뜰 수 있음) ──
  const onbVisible = await page.evaluate(() => { const o = document.getElementById('onboardingOverlay'); return !!(o && !o.classList.contains('hidden') && getComputedStyle(o).display !== 'none'); });
  report.steps.onboarding = { shown: onbVisible };
  if (onbVisible) {
    await snap('onboarding');
    // 완료/다음/건너뛰기 버튼을 순차 클릭해 통과 시도
    for (let i = 0; i < 5; i++) {
      const clicked = await page.evaluate(() => {
        const o = document.getElementById('onboardingOverlay');
        if (!o || o.classList.contains('hidden')) return false;
        const btn = o.querySelector('button:not([disabled])');
        if (btn) { btn.click(); return true; }
        return false;
      });
      if (!clicked) break;
      await page.waitForTimeout(900);
    }
    report.steps.onboarding.passedAttempt = true;
  }

  // ── 4. 핵심 화면 순회 — dashboard("내 샵 관리") 카드 경유 ──
  const measure = () => page.evaluate(() => {
    const xssText = document.body.innerText.includes('alert(1)');                 // escape→텍스트(안전)
    const xssScript = Array.from(document.querySelectorAll('script')).some(s => /alert\(1\)/.test(s.textContent || ''));
    return { bodyLen: document.body.innerText.trim().length, xssAsText: xssText, xssAsScript: xssScript, xssFired: window.__xssFired };
  });
  report.steps.screens = {};
  // 홈
  let e0 = errCountAt(); await page.click('.tab-bar__btn[data-tab="home"]').catch(() => {}); await page.waitForTimeout(1500);
  report.steps.screens.home = { ...(await measure()), newErrors: errors.slice(e0).slice(0, 4) }; await snap('home');
  // dashboard 진입
  e0 = errCountAt(); await page.click('.tab-bar__btn[data-tab="dashboard"]').catch(() => {}); await page.waitForTimeout(2000);
  report.steps.screens.dashboard = { ...(await measure()), newErrors: errors.slice(e0).slice(0, 4) }; await snap('dashboard');
  // dashboard 카드 → 예약/고객/매출
  for (const card of [{ name: 'booking', t: '예약관리' }, { name: 'customer', t: '고객관리' }, { name: 'revenue', t: '매출관리' }]) {
    e0 = errCountAt();
    await page.click('.tab-bar__btn[data-tab="dashboard"]').catch(() => {}); await page.waitForTimeout(1200);
    const clicked = await page.evaluate(t => {
      const el = Array.from(document.querySelectorAll('button,a,[role="button"],.ms-hub-item,div')).find(n => n.children.length < 6 && (n.textContent || '').replace(/\s/g, '').includes(t));
      if (el) { el.click(); return true; } return false;
    }, card.t);
    await page.waitForTimeout(2600);
    report.steps.screens[card.name] = { clicked, ...(await measure()), newErrors: errors.slice(e0).slice(0, 4) };
    await snap(card.name);
  }

  // ── 5. 사진편집기 진입/저장 smoke ──
  const peInfo = await page.evaluate(async () => {
    if (window.AppLoader) await window.AppLoader.ensure('photo');
    if (!(window.ItdEditor && window.ItdEditor.compose)) return { available: false };
    try {
      const c = document.createElement('canvas'); c.width = 400; c.height = 400; const g = c.getContext('2d'); g.fillStyle = '#cab'; g.fillRect(0, 0, 400, 400);
      const src = c.toDataURL('image/png');
      const result = await window.ItdEditor.compose({ photo: src, ratio: '1:1', layers: [
        { type: 'text', role: 'title', text: 'QA', x: 0.5, y: 0.5, size: 0.08, color: '#ffffff' }
      ] });
      return { available: true, composed: !!(result && result.length > 100), canvasExportable: /^data:image\//.test(result || '') };
    } catch (e) { return { available: true, error: String(e && e.message) }; }
  });
  report.steps.photoEditor = peInfo;
  await snap('photoeditor');

  // ── 6. 잇비 브리핑 (읽기) ──
  const briefInfo = await page.evaluate(async () => {
    try {
      const auth = (window.authHeader ? window.authHeader() : {});
      const res = await window.apiFetch('/assistant/brief', { headers: auth });
      const ok = res.ok; let hasText = false;
      if (ok) { const d = await res.json(); hasText = JSON.stringify(d).length > 20; }
      return { reachable: true, status: res.status, hasContent: hasText };
    } catch (e) { return { reachable: false, error: String(e && e.message) }; }
  });
  report.steps.assistantBrief = briefInfo;

  // ── 7. 백엔드 연결 실패 안내 (오프라인 mock) ──
  await page.route('**/assistant/ask', route => route.abort('failed'));
  const failInfo = await page.evaluate(async () => {
    try {
      window.showToast && (window.__toastSeen = []);
      const req = window.apiFetch('/assistant/ask', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, window.authHeader ? window.authHeader() : {}), body: '{}' })
        .catch(e => ({ ok: false, _err: String(e && e.message) }));
      const timeout = new Promise(resolve => setTimeout(() => resolve({ ok: false, _timeout: true }), 5000));
      const res = await Promise.race([req, timeout]);
      return { handled: true, ok: !!res.ok };
    } catch (e) { return { handled: true, threw: String(e && e.message) }; }
  });
  report.steps.backendFail = failInfo;

  report.severeErrors = errors.filter(e => !/favicon|ResizeObserver|TensorFlow|XNNPACK|Failed to load resource.*sw\.js|Failed to load resource: net::ERR_FAILED/i.test(e));
  report.totalErrors = errors.length;
  report.failedRequests = Array.from(new Set(failedReqs)).slice(0, 20);
  await browser.close();
  console.log(JSON.stringify(report, null, 2));
}

main().catch(e => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
