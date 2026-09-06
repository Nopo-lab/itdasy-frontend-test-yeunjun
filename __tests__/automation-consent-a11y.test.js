/**
 * @jest-environment jsdom
 */
/* 자동화 동의 시트 — 키보드 사용자 (2026-09-06 릴리즈 게이트)
 *
 * `aria-modal="true"` 라고 선언해 놨으면 그에 맞게 동작해야 한다:
 *   · 열면 포커스가 시트 **안으로** 들어온다 (안 그러면 스크린리더가 뒤 화면을 읽는다)
 *   · Esc 로 닫힌다 (모달의 기본 약속)
 *   · 닫으면 포커스가 **원래 누른 토글로** 돌아온다 (안 그러면 처음부터 Tab 해야 한다)
 *   · 동의 체크 없이는 CTA 가 disabled — 색만이 아니라 **속성**으로
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'automation-consent.js'), 'utf8');
const flush = () => new Promise((r) => setTimeout(r, 0));

function load() {
  document.body.innerHTML = '<button id="opener">토글</button>';
  delete window.AutomationConsent;
  window.apiUrl = (p) => 'https://api.test' + p;
  window.authHeader = () => ({ Authorization: 'Bearer t' });
  window.apiFetch = jest.fn(() => Promise.resolve({ ok: true, status: 200 }));
  window.toastIt = jest.fn();
  window.requestAnimationFrame = (fn) => fn();
  window._registerSheet = jest.fn();
  window._markSheetOpen = jest.fn();
  window._markSheetClosed = jest.fn();
  new Function(SRC).call(window);
  return window.AutomationConsent;
}

const sheet = () => document.getElementById('automationConsentSheet');

test('열면 포커스가 시트 안으로 들어온다', async () => {
  const AC = load();
  document.getElementById('opener').focus();
  AC.ask('automation_dm_autoreply');
  await flush();
  expect(sheet().contains(document.activeElement)).toBe(true);
});

test('Esc 로 닫히고 승인은 되지 않는다', async () => {
  const AC = load();
  const p = AC.ask('automation_dm_autosend');
  await flush();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await expect(p).resolves.toBe(false);
  expect(window.apiFetch).not.toHaveBeenCalled();     // 승인 기록도 안 남는다
});

test('닫으면 포커스가 원래 누른 토글로 돌아온다', async () => {
  const AC = load();
  const opener = document.getElementById('opener');
  opener.focus();
  const p = AC.ask('automation_comment_autoreply');
  await flush();
  sheet().querySelector('[data-ac="no"]').click();
  await p;
  await flush();
  expect(document.activeElement).toBe(opener);
});

test('체크 전에는 CTA 가 속성으로 disabled — 색만으로 알리지 않는다', async () => {
  const AC = load();
  AC.ask('automation_dm_quick_reply');
  await flush();
  const yes = sheet().querySelector('[data-ac="yes"]');
  expect(yes.disabled).toBe(true);
  const chk = sheet().querySelector('[data-ac="agree"]');
  chk.checked = true;
  chk.dispatchEvent(new Event('change', { bubbles: true }));
  expect(yes.disabled).toBe(false);
});
