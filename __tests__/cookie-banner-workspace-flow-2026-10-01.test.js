/* 🔴 [2026-10-01 flow-workspace-photo-11] 첫 방문 쿠키 배너(z-index 9950)가 작업실 플로우(#wsv2Flow .wsv2flow, z-index 9800)의
 *   하단 CTA '레이아웃 고르기 →' 를 덮어 누를 수 없었다(실측 e2e-main-phase1: Playwright click 실패
 *   '<div id="itdasyCookieBanner"> subtree intercepts pointer events', banner bottom 844 / cta top 776).
 *
 * 수정: app-cookie-consent.js 의 숨김 규칙(body:has(.subscreen-overlay.is-open))에 작업실 플로우 루트(.wsv2flow.is-open)를 추가 —
 *       플로우가 열려 있는 동안 배너를 숨기고 닫으면 다시 보인다(동의 상태는 그대로).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = process.env.ITDASY_SRC_ROOT || path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'app-cookie-consent.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'css/workspace-v2-flow.css'), 'utf8');

test('🔴 배너 숨김 규칙에 작업실 플로우 루트(.wsv2flow.is-open)가 들어 있다', () => {
  const m = SRC.match(/st\.textContent = '([^']+)';/);
  expect(m).not.toBeNull();
  const rule = m[1];
  expect(rule).toMatch(/body:has\(\.subscreen-overlay\.is-open\) #itdasyCookieBanner/);   // 기존 설정 하위화면 규칙 유지
  expect(rule).toMatch(/body:has\(\.wsv2flow\.is-open\) #itdasyCookieBanner/);
  expect(rule).toMatch(/display: none !important/);
});

test('플로우 루트 클래스·열림 클래스는 CSS 와 같은 이름(.wsv2flow / .is-open) — 셀렉터 오타 가드', () => {
  expect(CSS).toMatch(/\.wsv2flow\.is-open \{ display: flex; \}/);
  // 배너가 플로우보다 위(z 9950 > 9800)인 건 그대로 — 숨김으로 푼다(z 를 낮추면 다른 화면에서 배너가 가려진다)
  expect(SRC).toMatch(/z-index:9950/);
  expect(CSS).toMatch(/\.wsv2flow \{[^}]*z-index: 9800/);
});
