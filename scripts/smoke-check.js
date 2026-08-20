const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const localPath = (name) => name.split(/[?#]/, 1)[0];

/* [2026-08-21] `--git` 모드 — "저장소에 있는가" 를 파일시스템 대신 git 에게 묻는다.
   왜 두 모드가 필요한가: 이번에 실제로 난 사고가 **파일시스템 검사로는 안 잡히는 종류**였다.
   내 로컬엔 파일이 있는데 커밋엔 안 들어가서(untracked), 배포본에서만 404 가 났다.
   CI 는 tracked 파일만 체크아웃하므로 기본(파일시스템) 모드로 잡히지만,
   그건 이미 푸시된 뒤다. 커밋 직전에 잡으려면 git 에게 물어야 한다. */
const GIT_MODE = process.argv.includes('--git');
let _tracked = null;
function _trackedSet() {
  if (_tracked) return _tracked;
  _tracked = new Set();
  try {
    // HEAD 에 있는 것 + 이번에 staged 된 것 = "이 커밋 이후 저장소에 존재할 파일"
    const ls = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' });
    const staged = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'],
      { cwd: root, encoding: 'utf8' });
    for (const l of (ls + '\n' + staged).split('\n')) if (l.trim()) _tracked.add(l.trim());
  } catch (_e) {
    // git 이 없거나 저장소가 아니면 판정을 포기하고 파일시스템으로 폴백(검사를 죽이지 않는다)
    _tracked = null;
  }
  return _tracked;
}
const exists = (name) => {
  if (GIT_MODE) {
    const t = _trackedSet();
    if (t) return t.has(name);
  }
  return fs.existsSync(path.join(root, name));
};

const errors = [];
const fail = (msg) => errors.push(msg);

const index = read('index.html');
const sw = read('sw.js');
const core = read('app-core.js');

const scriptSrcs = [...index.matchAll(/<script\s+[^>]*src=["']([^"']+)["']/g)]
  .map((m) => m[1])
  .filter((src) => !/^https?:\/\//.test(src));

for (const src of scriptSrcs) {
  if (!exists(localPath(src))) fail(`index.html references missing script: ${src}`);
}

/* 🔴 [2026-08-21 사고 재발방지] 지연로드 매니페스트(`js/load-groups.js`)도 검사한다.
   예전엔 index.html 의 <script> 와 sw.js STATIC_ASSETS 만 봤다. 그래서 **매니페스트가
   없는 파일을 부르는 상태로 배포가 성공했다** — 라이브에서 404 3건.
   증상이 "안 열림"이 아니라 조용한 낭비라 더 늦게 발견된다: loader.ensure() 가 하나라도
   실패하면 `_done` 을 안 세워, 편집기를 열 때마다 photo 그룹 89개를 통째로 재요청한다.
   여기서 막으면 그런 커밋은 **배포 자체가 실패**한다. */
const groupsSrc = read('js/load-groups.js');
const groupEntries = [...groupsSrc.matchAll(/['"]([^'"]+\.(?:js|css))(?:\?[^'"]*)?['"]/g)]
  .map((m) => m[1])
  .filter((src) => !/^https?:\/\//.test(src));
if (!groupEntries.length) fail('js/load-groups.js 에서 로드 항목을 하나도 못 찾음 (형식 변경?)');
for (const src of groupEntries) {
  if (!exists(localPath(src))) {
    fail(`load-groups.js 가 없는 파일을 부름: ${src}` +
      (GIT_MODE ? ' — 저장소에 없음(커밋 누락?)' : ''));
  }
}

const staticAssetsBlock = sw.match(/const STATIC_ASSETS = \[([\s\S]*?)\];/);
if (!staticAssetsBlock) {
  fail('sw.js STATIC_ASSETS block not found');
} else {
  const assets = [...staticAssetsBlock[1].matchAll(/['"]([^'"]+)['"]/g)]
    .map((m) => m[1])
    .filter((asset) => asset.startsWith('./'))
    .map((asset) => asset.slice(2));
  for (const asset of assets) {
    if (!exists(asset)) fail(`sw.js caches missing asset: ${asset}`);
  }
}

const swVersion = sw.match(/const CACHE_VERSION = ['"]([^'"]+)['"];/)?.[1];
const appBuild = core.match(/window\.APP_BUILD = ['"]([^'"]+)['"];/)?.[1];
const latestBuild = index.match(/window\.__LATEST_BUILD__ = ['"]([^'"]+)['"];/)?.[1];

/* 🔴 버전 3종 일치는 **배포(CI) 관심사**지 커밋 관심사가 아니다.
   deploy.yml 이 빌드 때 SHA 를 주입하므로 **로컬 작업본은 항상 어긋나 있는 게 정상**이다.
   (실측: CACHE_VERSION 20260816-… vs APP_BUILD 20260705-… — 평상시 상태)
   그래서 --git(커밋 직전) 모드에서는 이 검사를 건너뛴다.
   안 그러면 pre-commit 이 **모든 커밋을 막는다** — 훅을 넣자마자 그럴 뻔했다. */
if (!GIT_MODE) {
  if (!swVersion) fail('sw.js CACHE_VERSION not found');
  if (!appBuild) fail('app-core.js APP_BUILD not found');
  if (!latestBuild) fail('index.html __LATEST_BUILD__ not found');
  if (swVersion && appBuild && swVersion !== appBuild) {
    fail(`CACHE_VERSION (${swVersion}) and APP_BUILD (${appBuild}) differ`);
  }
  if (appBuild && latestBuild && appBuild !== latestBuild) {
    fail(`APP_BUILD (${appBuild}) and __LATEST_BUILD__ (${latestBuild}) differ`);
  }
}

if (errors.length) {
  console.error('Smoke check failed:');
  for (const err of errors) console.error(`- ${err}`);
  process.exit(1);
}

console.log(`Smoke check passed (${scriptSrcs.length} scripts, ${groupEntries.length} lazy-group entries, build ${appBuild || '?'}${GIT_MODE ? ', git mode' : ''})`);
