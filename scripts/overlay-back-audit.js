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

/* [P1 2026-09-10] 🔴 이 스크립트에 사각지대가 있었다.
 *
 *   위 정규식은 **인라인 스타일**만 본다. 그런데 오버레이를 CSS 클래스로 만드는 파일이 있다:
 *       app-retention-ai.js →  el.className = 'p9-sheet'   (풀스크린은 CSS 에 정의)
 *   그래서 감사는 "미등록 0" 이라고 통과시켰는데, 실제로는 **뒤로가기 등록이 0건**이었다.
 *   실측(배포본 9421f5a, 실 Chrome): retentionSheet 가 화면에 떠 있는데 `location.hash` 가 비어
 *   있었다 → 뒤로가기를 누르면 시트가 닫히는 게 아니라 **앱이 통째로 종료**된다.
 *
 *   "가드가 있다" 와 "가드가 그 경로를 본다" 는 다르다. 그래서 CSS 쪽도 같이 읽는다:
 *   css 에서 풀스크린 오버레이 클래스를 모아, 그 클래스를 붙이는 js 도 대상에 넣는다.
 */
function fullscreenOverlayClasses() {
  const out = new Set();
  const cssFiles = walkExt(ROOT, '.css');
  for (const f of cssFiles) {
    const src = fs.readFileSync(f, 'utf8');
    const re = /\.([A-Za-z0-9_-]+)\s*\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(src))) {
      const body = m[2];
      if (!/position:\s*fixed/.test(body)) continue;
      const full = /inset:\s*0/.test(body)
        || (/top:\s*0/.test(body) && /left:\s*0/.test(body))
        || (/width:\s*100(vw|%)/.test(body) && /height:\s*100(vh|%)/.test(body));
      if (full) out.add(m[1]);
    }
  }
  return out;
}

function usesOverlayClass(src, classes) {
  for (const c of classes) {
    if (new RegExp("className\\s*=\\s*['\"`][^'\"`]*\\b" + c + "\\b").test(src)) return c;
    if (new RegExp("class=\\\\?['\"][^'\"]*\\b" + c + "\\b").test(src)) return c;
  }
  return null;
}

// 등록이 필요 없는 파일 — 반드시 이유를 적을 것
const ALLOWLIST = new Map([
  ['app-fun.js', '컨페티 연출용 호스트. pointer-events 없고 사용자가 닫는 UI 가 아니다'],
  ['js/workspace/workspace-crop.js', '작업실 편집기 내부 단계. WorkspaceFlow 가 back 을 이미 소유한다'],
  ['app-brand-kit.js', '브랜드킷 모달 — 후속 티켓에서 등록 예정(2026-09-10 기록)'],
  ['app-feed-planner.js', '피드 플래너 — 후속 티켓에서 등록 예정(2026-09-10 기록)'],
  ['app-template-import.js', '템플릿 가져오기 — 후속 티켓에서 등록 예정(2026-09-10 기록)'],
]);

function walkExt(dir, ext, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.some((s) => e.name === s)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkExt(p, ext, out);
    else if (e.name.endsWith(ext)) out.push(p);
  }
  return out;
}

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

const OVERLAY_CLASSES = fullscreenOverlayClasses();

for (const p of walk(ROOT)) {
  const src = fs.readFileSync(p, 'utf8');
  scanned++;
  // 인라인 스타일 오버레이 **또는** 풀스크린 CSS 클래스를 붙이는 오버레이
  const viaClass = usesOverlayClass(src, OVERLAY_CLASSES);
  if (!OVERLAY_RE.test(src) && !viaClass) continue;
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
