#!/usr/bin/env node
/**
 * [2026-09-09] 전체화면 오버레이 뒤로가기 등록 감사
 *
 * 왜 필요한가 — 실측(실 Chrome, 배포본):
 *   예약 폼(#cvBookingForm) → 고객 선택창 → 브라우저 뒤로가기
 *   → hash #cvBookingForm → #booking  (작성 중이던 예약 폼이 닫힘)
 *   → 선택창은 화면에 그대로 남음
 *   안드로이드 하드웨어 백도 같은 경로다. 시트 스택이 비면 앱이 그대로 꺼진다.
 *
 * 전수 조사에서 `position:fixed; inset:0` 오버레이를 쓰는 파일 50개 중
 * **32개가 뒤로가기 레지스트리에 미등록**이었다. 사람이 새 오버레이를 만들 때마다
 * 등록을 기억해야 한다면 또 빠진다 — 그래서 CI 에서 기계가 본다.
 *
 * 계약: 전체화면 fixed 오버레이를 만드는 파일은
 *   window._markSheetOpen(...)  (직접 등록)  또는
 *   window._bindSheetBack(...)  (헬퍼)
 * 중 하나를 반드시 써야 한다.
 *
 * 예외를 추가하려면 ALLOWLIST 에 이유와 함께 적는다.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SKIP = ['node_modules', '.git', 'ios', 'android', '.claude', '__tests__', 'landing', 'scripts'];
const OVERLAY_RE = /position:\s*fixed;\s*inset:\s*0/;

// 등록이 필요 없는 파일 — 반드시 이유를 적을 것
const ALLOWLIST = new Map([
  // 예: ['app-foo.js', '토스트 전용. 사용자가 닫는 UI 가 아니라 back 대상이 아니다'],
]);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.some((s) => e.name === s)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

const offenders = [];
let scanned = 0;
let overlayFiles = 0;

for (const p of walk(ROOT)) {
  const src = fs.readFileSync(p, 'utf8');
  scanned++;
  if (!OVERLAY_RE.test(src)) continue;
  overlayFiles++;
  const rel = path.relative(ROOT, p);
  if (ALLOWLIST.has(rel)) continue;
  const bound = src.includes('_markSheetOpen') || src.includes('_bindSheetBack');
  if (!bound) offenders.push(rel);
}

if (offenders.length) {
  console.error('오버레이 뒤로가기 감사 실패 — 등록이 없는 전체화면 오버레이:');
  for (const f of offenders) console.error('  - ' + f);
  console.error('');
  console.error('고치는 법: 오버레이를 화면에 올린 직후 한 줄을 추가한다.');
  console.error("  window._bindSheetBack('<이름>', <오버레이 엘리먼트>, () => { <닫는 코드> });");
  console.error('닫기 지점이 여러 개여도 헬퍼가 DOM 에서 사라짐을 관찰하므로 한 곳만 부르면 된다.');
  console.error('back 대상이 아닌 오버레이라면 이 파일의 ALLOWLIST 에 이유와 함께 넣는다.');
  process.exit(1);
}

console.log(`오버레이 뒤로가기 감사 통과 (js ${scanned}개 중 오버레이 ${overlayFiles}개, 미등록 0)`);
