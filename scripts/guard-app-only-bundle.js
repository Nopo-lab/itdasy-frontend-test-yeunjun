#!/usr/bin/env node
/*
 * Guard the native store bundle from going back to a remote GitHub Pages shell.
 *
 * Plain grep is too noisy because old audit comments and docs mention the
 * previous Pages URL. This check strips comments first, then blocks executable
 * code/config that would make the native app depend on GitHub Pages at runtime.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const blocked = [
  'nopo-lab.github.io/itdasy-frontend-test-yeunjun',
  'nopo-lab.github.io/itdasy-frontend/',
];

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
}

function stripComments(text) {
  return text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

const cap = readJson('capacitor.config.json');
if (cap.server && Object.prototype.hasOwnProperty.call(cap.server, 'url')) {
  throw new Error('앱전용 빌드인데 capacitor.config.json 에 server.url 이 남아 있습니다.');
}

const webDir = cap.webDir || 'www';
const files = walk(path.join(root, webDir)).filter((file) => /\.(html|js|css|json|webmanifest)$/i.test(file));
const hits = [];
for (const file of files) {
  const text = stripComments(fs.readFileSync(file, 'utf8'));
  for (const needle of blocked) {
    if (text.includes(needle)) {
      hits.push(`${path.relative(root, file)} contains ${needle}`);
    }
  }
}

if (hits.length) {
  throw new Error(`앱전용 번들 실행 코드에 GitHub Pages 주소가 남아 있습니다:\n${hits.join('\n')}`);
}

console.log('앱전용 번들 확인 완료: server.url 없음, 실행 코드 GitHub Pages 의존 없음');
