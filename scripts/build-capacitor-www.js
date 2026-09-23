#!/usr/bin/env node
/*
 * Build the bundled Capacitor web payload.
 *
 * The store app must not depend on GitHub Pages at runtime. This script copies
 * only the browser runtime allowlist into www/ so Capacitor loads app files from
 * the native bundle instead of redirecting to a remote page.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'www');

const rootFiles = [
  'index.html',
  'oauth-return.html',
  'reset-password.html',
  'privacy.html',
  'privacy-en.html',
  'terms.html',
  'terms-en.html',
  'sw.js',
  'manifest.webmanifest',
  'manifest.json',
  'icon.svg',
  'format-money.js',
].filter((file) => fs.existsSync(path.join(root, file)));

const rootGlobs = [
  // [2026-09-24] style.css 와 @import 자식(style-base/home/components/...)이 빠져 있어서
  //   앱에서 기본 스타일이 통째로 없었다(로그인 화면에 온보딩·탭바가 맨몸으로 드러남).
  /^style(-.*)?\.css$/,
  /^app-.*\.js$/,
  /^app-.*\.css$/,
  /^ITDASY-.*\.css$/,
  /^workspace-.*\.html$/,
];

const directories = [
  'assets',
  'components',
  'css',
  'icons',
  'js',
  'shared',
  'workers',
].filter((dir) => fs.existsSync(path.join(root, dir)));

const skipDirs = new Set([
  '.git',
  '.github',
  '.husky',
  '__tests__',
  'node_modules',
  'Pods',
  'build',
  'dist',
  'output',
  'tmp',
]);

function resetDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function copyFile(rel) {
  const src = path.join(root, rel);
  const dst = path.join(out, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

function copyDir(rel) {
  const srcDir = path.join(root, rel);
  const dstDir = path.join(out, rel);
  fs.mkdirSync(dstDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (skipDirs.has(entry.name)) continue;
    const child = path.join(rel, entry.name);
    if (entry.isDirectory()) copyDir(child);
    else if (entry.isFile()) copyFile(child);
  }
}

resetDir(out);
for (const file of rootFiles) copyFile(file);
for (const name of fs.readdirSync(root)) {
  if (rootGlobs.some((re) => re.test(name))) copyFile(name);
}
for (const dir of directories) copyDir(dir);

const redirected = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
if (/http-equiv=["']refresh["']/i.test(redirected) || /github\.io\/itdasy-frontend-test-yeunjun/i.test(redirected)) {
  throw new Error('www/index.html still redirects to GitHub Pages');
}

// 복사 목록을 손으로 적는 방식이라 빠뜨리기 쉽다 — 앱이 실제로 부르는 로컬 파일이
// 번들에 전부 있는지 index.html · CSS @import · 로더(load-groups.js)를 따라가며 확인한다.
// 하나라도 없으면 빌드를 실패시킨다(앱에서는 404 가 조용히 스타일·기능 누락으로 보인다).
function localRefs(file) {
  const s = fs.readFileSync(file, 'utf8');
  const re = /(?:src|href)=["']([^"'#]+)["']|@import\s+(?:url\()?["']([^"']+)["']|["']((?:js|css|components|shared|workers|assets|icons)\/[^"'?]+\.(?:js|css|html|json|png|svg|webp))(?:\?[^"']*)?["']|["']((?:app|style|ITDASY|workspace)-[^"'?/]+\.(?:js|css|html))(?:\?[^"']*)?["']/g;
  const refs = [];
  let m;
  while ((m = re.exec(s))) {
    const r = m[1] || m[2] || m[3] || m[4];
    if (!r || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(r)) continue;
    refs.push(r.split('?')[0]);
  }
  return refs;
}
const seen = new Set();
const missing = new Set();
function follow(rel, fromDir) {
  const p = path.normalize(path.join(fromDir, rel));
  if (seen.has(p)) return;
  seen.add(p);
  if (!fs.existsSync(p)) { missing.add(path.relative(out, p)); return; }
  // 로더 안의 경로는 문서 기준(www/)이고, CSS @import 는 그 CSS 파일 기준이다
  if (/\.(?:html|css)$/.test(p)) for (const r of localRefs(p)) follow(r, path.dirname(p));
  else if (/load-groups\.js$/.test(p)) for (const r of localRefs(p)) follow(r, out);
}
follow('index.html', out);
if (missing.size) {
  throw new Error(`앱 번들에 없는 파일을 앱이 부릅니다(${missing.size}개):\n${[...missing].sort().join('\n')}`);
}

console.log(`Capacitor www bundle ready: ${path.relative(root, out)} (참조 ${seen.size}개 확인)`);
