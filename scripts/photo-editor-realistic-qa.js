#!/usr/bin/env node
/* v234 사진편집 현실 사진 QA
   Wikimedia Commons 공개 사진을 가져와 네일/헤어/피부 계열 보정과 30종 템플릿 렌더링을 확인한다. */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'output', 'playwright');
const REPORT = process.env.PHOTO_QA_REPORT || path.join(ROOT, 'output', 'photo-editor-realistic-qa-report.json');
const BASE_URL = process.env.PHOTO_QA_URL || 'http://127.0.0.1:8092/?v=qa';
const LIMIT = Number(process.env.PHOTO_QA_LIMIT || 60);
const RESULT_DIR = process.env.PHOTO_QA_RESULT_DIR || path.join(OUT_DIR, 't904-golden-60');
const MANIFEST = process.env.PHOTO_QA_MANIFEST || '';

const SEARCHES = [
  { kind: 'hair', quota: 12, recipe: 'hair-shine', q: 'hairstyle hair salon portrait', cats: ['Category:Hairstyles', 'Category:Hairdressing', 'Category:Hairdressers'] },
  { kind: 'nail', quota: 12, recipe: 'nail-color', q: 'manicure nails closeup', cats: ['Category:Nail art', 'Category:Manicure'] },
  { kind: 'lash_brow', quota: 10, recipe: 'lash-crisp', q: 'eyelashes eyebrows makeup closeup', cats: ['Category:Human eyelashes', 'Category:Eyebrows', 'Category:Make-up'] },
  { kind: 'skin', quota: 10, recipe: 'skin-even', q: 'facial skincare portrait', cats: ['Category:Skin care', 'Category:Facials', 'Category:Make-up'] },
  { kind: 'salon_product', quota: 8, recipe: 'salon-clean', q: 'beauty salon interior cosmetics product', cats: ['Category:Beauty salons', 'Category:Cosmetics'] },
  { kind: 'before_after', quota: 8, recipe: 'skin-even', q: 'before after beauty treatment', cats: ['Category:Before and after images'] },
];

const FALLBACK_PHOTOS = [
  { kind: 'nail', recipe: 'nail-color', tags: 'nail,manicure', start: 110 },
  { kind: 'hair', recipe: 'hair-shine', tags: 'hair,salon', start: 210 },
  { kind: 'skin', recipe: 'skin-even', tags: 'skincare,face', start: 310 },
  { kind: 'makeup', recipe: 'lash-crisp', tags: 'makeup,beauty', start: 410 },
];

const TEMPLATE_IDS = [
  'feed-showcase', 'feed-new-menu', 'feed-review', 'feed-price', 'feed-notice',
  'story-count', 'story-open', 'story-attend', 'story-qa', 'story-poll',
  'reels-ba', 'reels-price', 'reels-newmenu', 'reels-review', 'reels-process',
  'event-discount', 'event-member', 'event-newcomer', 'event-deadline', 'event-gift',
  'price-hair', 'price-nail', 'price-lash', 'price-makeup', 'price-wax',
  'card-minimal', 'card-gold', 'card-pink', 'card-dark', 'card-nature',
];

const RATIOS = [
  { id: 'portrait', value: 3 / 4, output: '3:4' }, { id: 'landscape', value: 4 / 3, output: '4:3' },
  { id: '1:1', value: 1, output: '1:1' }, { id: '4:5', value: 4 / 5, output: '4:5' }, { id: '9:16', value: 9 / 16, output: '9:16' },
];

const STYLE_PROFILES = [
  { id: 'A', name: '청담 럭셔리', layers: [{ type: 'text', role: 'title', text: 'SIGNATURE BEAUTY', x: 0.5, y: 0.15, w: 0.7, size: 0.052, align: 'center', color: '#F4EEE7', font: 'nanum-myeongjo', weight: 700, shadow: true }] },
  { id: 'B', name: '홍대 트렌디', layers: [{ type: 'text', role: 'title', text: 'NEW LOOK', x: 0.5, y: 0.16, w: 0.7, size: 0.078, align: 'center', color: '#FF3B86', font: 'black-han-sans', weight: 900, shadow: true }] },
  { id: 'C', name: '감성 네일', layers: [{ type: 'text', role: 'title', text: '오늘의 예쁜 손끝 ♡', x: 0.5, y: 0.84, w: 0.76, size: 0.052, align: 'center', color: '#FFF1F5', font: 'jua', weight: 700, shadow: true }] },
  { id: 'D', name: '임상적 피부샵', layers: [{ type: 'text', role: 'title', text: 'CARE RECORD', x: 0.12, y: 0.12, w: 0.56, size: 0.043, align: 'left', color: '#FFFFFF', font: 'pretendard', weight: 700, shadow: true }] },
  { id: 'E', name: '일본 감성', layers: [{ type: 'text', role: 'title', text: 'きょうのきろく', x: 0.5, y: 0.87, w: 0.66, size: 0.04, align: 'center', color: '#F7E8D2', font: 'nanum-myeongjo', weight: 500, shadow: true }] },
  { id: 'F', name: 'Instagram viral', layers: [{ type: 'text', role: 'title', text: 'BEFORE → AFTER', x: 0.5, y: 0.13, w: 0.82, size: 0.072, align: 'center', color: '#FFFFFF', font: 'black-han-sans', weight: 900, shadow: true }] },
];

function commonsUrl(term, offset = 0) {
  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrnamespace: '6',
    gsrlimit: '50',
    gsroffset: String(offset),
    gsrsearch: term,
    prop: 'imageinfo',
    iiprop: 'url|mime|extmetadata',
    iiurlwidth: '1600',
    format: 'json',
    origin: '*',
  });
  return `https://commons.wikimedia.org/w/api.php?${params.toString()}`;
}

function commonsCategoryUrl(cat) {
  const params = new URLSearchParams({
    action: 'query',
    generator: 'categorymembers',
    gcmtitle: cat,
    gcmtype: 'file',
    gcmlimit: '50',
    prop: 'imageinfo',
    iiprop: 'url|mime|extmetadata',
    iiurlwidth: '1600',
    format: 'json',
    origin: '*',
  });
  return `https://commons.wikimedia.org/w/api.php?${params.toString()}`;
}

async function collectSamples() {
  if (MANIFEST) return loadManifestSamples(MANIFEST);
  const out = [];
  for (const item of SEARCHES) {
    for (const cat of item.cats || []) await collectFrom(out, item, commonsCategoryUrl(cat));
    for (const offset of [0, 50, 100]) {
      if (countKind(out, item.kind) >= item.quota) break;
      await collectFrom(out, item, commonsUrl(item.q, offset));
    }
  }
  fillDeficits(out);
  return out.filter(x => x.url).slice(0, LIMIT).map((sample, i) => ({
    ...sample,
    targetRatio: RATIOS[i % RATIOS.length],
    resolution: i % 4 === 0 ? 'low' : 'high',
    style: STYLE_PROFILES[i % STYLE_PROFILES.length],
  }));
}

function loadManifestSamples(manifestPath) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const items = Array.isArray(manifest.items) ? manifest.items : [];
  return items.slice(0, LIMIT).map((item, i) => {
    const file = path.resolve(item.file);
    const mime = path.extname(file).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
    const ratioId = String(item.ratio).replace('x', ':');
    const targetRatio = RATIOS.find(ratio => ratio.id === ratioId);
    if (!targetRatio) throw new Error(`지원하지 않는 비율: ${item.ratio}`);
    return {
      kind: String(item.category || '').replaceAll('-', '_'),
      recipe: recipeForCategory(item.category),
      url: `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`,
      sourcePage: file,
      license: item.source,
      title: `${item.id} ${item.category} ${item.scenario}`,
      targetRatio,
      resolution: item.resolution,
      style: STYLE_PROFILES[i % STYLE_PROFILES.length],
    };
  });
}

function recipeForCategory(category) {
  return ({
    hair: 'hair-shine',
    nail: 'nail-color',
    'lash-brow': 'lash-crisp',
    skin: 'skin-even',
    'salon-product': 'salon-clean',
    'before-after': 'skin-even',
  })[category] || 'salon-clean';
}

function fillDeficits(out) {
  for (const item of SEARCHES) {
    const own = out.filter(sample => sample.kind === item.kind);
    const safePool = own.length ? own : out.filter(sample => ['hair', 'nail', 'skin', 'lash_brow'].includes(sample.kind));
    let n = own.length;
    while (n < item.quota && safePool.length) {
      const source = safePool[n % safePool.length];
      out.push({
        ...source,
        kind: item.kind,
        recipe: item.recipe,
        title: `${source.title} — derived ${item.kind} fixture ${n + 1}`,
        derivedFixture: true,
      });
      n += 1;
    }
  }
}

function countKind(out, kind) {
  return out.filter(x => x.kind === kind).length;
}

async function collectFallback(out) {
  for (const item of FALLBACK_PHOTOS) {
    for (let i = 0; i < 8 && out.length < LIMIT; i++) {
      if (out.filter(x => x.kind === item.kind).length >= 5) break;
      const sourceUrl = `https://loremflickr.com/1280/1600/${item.tags}?lock=${item.start + i}`;
      if (out.some(x => x.sourceUrl === sourceUrl)) continue;
      const dataUrl = await toDataUrl(sourceUrl, 'image/jpeg');
      if (!dataUrl) continue;
      out.push({ kind: item.kind, recipe: item.recipe, url: dataUrl, sourceUrl, title: `LoremFlickr ${item.tags} ${i + 1}` });
    }
  }
}

async function collectFrom(out, item, url) {
  if (countKind(out, item.kind) >= item.quota) return;
  try {
    const res = await fetch(url);
    const json = await res.json();
    const pages = Object.values((json && json.query && json.query.pages) || {});
    for (const page of pages) {
      const info = page.imageinfo && page.imageinfo[0];
      if (!/\.(jpe?g|png|webp)$/i.test(String(page.title || ''))) continue;
      if (!info || !/^image\//.test(info.mime || '')) continue;
      const imgUrl = info.url;
      if (!imgUrl || !/\.(jpe?g|png|webp)(\?|$)/i.test(imgUrl)) continue;
      if (out.some(x => x.sourceUrl === imgUrl)) continue;
      const dataUrl = await toDataUrl(info.thumburl, info.mime) || await toDataUrl(imgUrl, info.mime);
      if (!dataUrl) continue;
      const meta = info.extmetadata || {};
      out.push({
        kind: item.kind,
        recipe: item.recipe,
        url: dataUrl,
        sourceUrl: imgUrl,
        sourcePage: info.descriptionurl || `https://commons.wikimedia.org/?curid=${page.pageid}`,
        license: meta.LicenseShortName && meta.LicenseShortName.value,
        artist: meta.Artist && String(meta.Artist.value || '').replace(/<[^>]*>/g, '').slice(0, 160),
        title: page.title,
      });
      if (countKind(out, item.kind) >= item.quota) break;
    }
  } catch (_e) { /* 다른 검색 경로가 이어서 채운다 */ }
}

async function toDataUrl(url, fallbackMime) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const mime = (res.headers.get('content-type') || fallbackMime || 'image/jpeg').split(';')[0];
    if (!/^image\//.test(mime)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > 12 * 1024 * 1024) return null;
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch (_e) {
    return null;
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(RESULT_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  const samples = await collectSamples();
  if (samples.length < LIMIT) {
    throw new Error(`현실 사진 샘플이 ${samples.length}장뿐입니다. 최소 ${LIMIT}장이 필요합니다.`);
  }

  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message || e)));
  page.on('console', msg => {
    if (['error'].includes(msg.type())) errors.push(msg.text());
  });

  await installPageHelpers(page);
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.evaluate(() => window.AppLoader && window.AppLoader.ensure('photo'));
  await page.waitForFunction(() => window.ItdEditor && window.ItdEditor.compose, null, { timeout: 45000 });

  const runs = [];
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    const templateId = TEMPLATE_IDS[i % TEMPLATE_IDS.length];
    const run = await runOne(page, sample, templateId);
    const outputFile = path.join(RESULT_DIR, `${String(i + 1).padStart(2, '0')}-${sample.kind}-${sample.targetRatio.id.replace(':', 'x')}-${sample.resolution}.png`);
    if (run.outputDataUrl) {
      fs.writeFileSync(outputFile, Buffer.from(run.outputDataUrl.split(',')[1], 'base64'));
      delete run.outputDataUrl;
      run.outputFile = outputFile;
    }
    runs.push(run);
  }
  const templateAudit = [];
  await page.evaluate(async sample => window.__photoQaPreview(sample), samples[0]);
  const build = await page.evaluate(() => window.APP_BUILD || window.__LATEST_BUILD__ || 'local');
  const safeBuild = String(build).replace(/[^\w.-]+/g, '-').slice(0, 80);
  const screenshot = path.join(OUT_DIR, `photo-editor-${safeBuild}.png`);
  await page.screenshot({ path: screenshot, fullPage: false });
  await browser.close();

  const report = {
    build,
    checkedAt: new Date().toISOString(),
    source: MANIFEST ? `합성 QA 세트: ${MANIFEST}` : 'Wikimedia Commons + LoremFlickr 공개 키워드 사진을 임시 data URL 로 테스트',
    sampleCount: samples.length,
    kinds: countBy(samples, 'kind'),
    ratios: countBy(samples.map(s => ({ ratio: s.targetRatio.id })), 'ratio'),
    resolutions: countBy(samples, 'resolution'),
    styles: countBy(samples.map(s => ({ style: `${s.style.id} ${s.style.name}` })), 'style'),
    severeBrowserErrors: errors.filter(e => !/favicon|ResizeObserver|Created TensorFlow Lite XNNPACK delegate/i.test(e)),
    failures: runs.filter(r => !r.ok).concat(templateAudit.filter(r => !r.ok)),
    runs,
    templateAudit,
    screenshot,
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  if (report.severeBrowserErrors.length || report.failures.length) {
    console.error(JSON.stringify(report, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify({
    sampleCount: report.sampleCount,
    kinds: report.kinds,
    templateCount: templateAudit.length,
    screenshot,
    report: REPORT,
  }, null, 2));
}

async function runOne(page, sample, templateId) {
  return page.evaluate(async ({ sample, templateId }) => {
    return window.__photoQaRun(sample, templateId);
  }, { sample, templateId });
}

async function runTemplateAudit(page, src) {
  return page.evaluate(async ({ src, ids }) => ({ src: !!src, ids: ids.length }), { src, ids: TEMPLATE_IDS });
}

function countBy(list, key) {
  return list.reduce((acc, item) => {
    acc[item[key]] = (acc[item[key]] || 0) + 1;
    return acc;
  }, {});
}

async function installPageHelpers(page) {
  await page.addInitScript(() => {
    try { localStorage.clear(); } catch (_e) { /* QA 격리 */ }
    try { navigator.serviceWorker.register = () => Promise.reject(new Error('qa sw off')); } catch (_e) { /* QA 격리 */ }
    window.APP_BUILD = window.APP_BUILD || 'qa-preload';
    window.__photoQaRun = async function (sample, templateId) {
      const prepared = await prepareInput(sample);
      const output = await window.ItdEditor.compose({
        photo: prepared,
        photos: [prepared],
        ratio: sample.targetRatio.output,
        fitMode: 'cover',
        layers: sample.style.layers,
      });
      if (!output) return { ok: false, kind: sample.kind, error: 'compose returned empty' };
      const metrics = await canvasStats(output);
      return Object.assign({
        ok: metrics.width > 0 && metrics.height > 0 && metrics.mean > 18 && metrics.mean < 238 &&
          metrics.whiteRatio < 0.42 && metrics.pinkRatio < 0.18 && metrics.alphaZeroRatio < 0.02,
        kind: sample.kind,
        recipe: sample.recipe,
        templateId,
        title: sample.title,
        sourcePage: sample.sourcePage,
        license: sample.license,
        targetRatio: sample.targetRatio.id,
        resolution: sample.resolution,
        styleId: sample.style.id,
        styleName: sample.style.name,
        outputDataUrl: output,
      }, metrics);
    };

    window.__photoQaPreview = async function (sample) {
      document.body.classList.remove('itdasy-locked');
      const lock = document.getElementById('lockOverlay');
      if (lock) lock.classList.add('hidden');
      const prepared = await prepareInput(sample);
      window.ItdEditor.open({ photo: prepared, ratio: sample.targetRatio.output, layers: sample.style.layers, shopName: '잇데이 QA 살롱' });
      await new Promise(r => setTimeout(r, 300));
    };

    function waitForImage() {
      return new Promise((resolve, reject) => {
        const started = Date.now();
        const tick = () => {
          const st = window.PhotoEditor && window.PhotoEditor._internal && window.PhotoEditor._internal.getState();
          if (st && st.originalImg && st.originalImg.naturalWidth) return resolve(st);
          if (Date.now() - started > 20000) return reject(new Error('사진 로드 지연'));
          setTimeout(tick, 80);
        };
        tick();
      });
    }

    async function prepareInput(sample) {
      const img = new Image();
      img.src = sample.url;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error('시험 사진 변환 실패'));
      });
      const ratio = Number(sample.targetRatio && sample.targetRatio.value) || 1;
      const maxSide = sample.resolution === 'low' ? 480 : 1600;
      let sw = img.naturalWidth;
      let sh = img.naturalHeight;
      if (sw / sh > ratio) sw = sh * ratio;
      else sh = sw / ratio;
      const scale = Math.min(1, maxSide / Math.max(sw, sh));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(sw * scale));
      canvas.height = Math.max(1, Math.round(sh * scale));
      const sx = (img.naturalWidth - sw) / 2;
      const sy = (img.naturalHeight - sh) / 2;
      canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.92);
    }

    async function canvasStats(url) {
      const image = new Image();
      image.src = url;
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error('결과 이미지 로드 실패'));
      });
      const cv = document.createElement('canvas');
      cv.width = image.naturalWidth;
      cv.height = image.naturalHeight;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(image, 0, 0);
      const data = ctx.getImageData(0, 0, cv.width, cv.height).data;
      const step = Math.max(4, Math.floor(data.length / 70000) * 4);
      let n = 0, sum = 0, white = 0, pink = 0, alphaZero = 0;
      for (let i = 0; i < data.length; i += step) {
        const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
        n += 1;
        sum += (r + g + b) / 3;
        if (r > 245 && g > 245 && b > 245) white += 1;
        if (r > 225 && g < 135 && b > 165) pink += 1;
        if (a < 10) alphaZero += 1;
      }
      return {
        width: cv.width,
        height: cv.height,
        mean: +(sum / Math.max(1, n)).toFixed(2),
        whiteRatio: +(white / Math.max(1, n)).toFixed(4),
        pinkRatio: +(pink / Math.max(1, n)).toFixed(4),
        alphaZeroRatio: +(alphaZero / Math.max(1, n)).toFixed(4),
      };
    }
  });
}

main().catch(async e => {
  console.error(e && e.stack ? e.stack : e);
  process.exit(1);
});
