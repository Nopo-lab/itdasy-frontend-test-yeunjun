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
  'style-polish.css',
  'sw.js',
  'manifest.webmanifest',
].filter((file) => fs.existsSync(path.join(root, file)));

const rootGlobs = [
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

console.log(`Capacitor www bundle ready: ${path.relative(root, out)}`);
