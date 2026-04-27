const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const exists = (name) => fs.existsSync(path.join(root, name));

const errors = [];
const fail = (msg) => errors.push(msg);

const index = read('index.html');
const sw = read('sw.js');
const core = read('app-core.js');

const scriptSrcs = [...index.matchAll(/<script\s+[^>]*src=["']([^"']+)["']/g)]
  .map((m) => m[1])
  .filter((src) => !/^https?:\/\//.test(src));

for (const src of scriptSrcs) {
  if (!exists(src)) fail(`index.html references missing script: ${src}`);
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

if (!swVersion) fail('sw.js CACHE_VERSION not found');
if (!appBuild) fail('app-core.js APP_BUILD not found');
if (!latestBuild) fail('index.html __LATEST_BUILD__ not found');
if (swVersion && appBuild && swVersion !== appBuild) {
  fail(`CACHE_VERSION (${swVersion}) and APP_BUILD (${appBuild}) differ`);
}
if (appBuild && latestBuild && appBuild !== latestBuild) {
  fail(`APP_BUILD (${appBuild}) and __LATEST_BUILD__ (${latestBuild}) differ`);
}

if (errors.length) {
  console.error('Smoke check failed:');
  for (const err of errors) console.error(`- ${err}`);
  process.exit(1);
}

console.log(`Smoke check passed (${scriptSrcs.length} scripts, build ${appBuild || '?'})`);
