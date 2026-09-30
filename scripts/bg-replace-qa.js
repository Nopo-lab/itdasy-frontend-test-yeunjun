#!/usr/bin/env node
/* T-116 배경 교체 실작동 검증 (1회성, 프로덕션 코드 미수정)
   - 누끼 서버 API(/image/remove-bg)는 route 로 mock → 실제 과금/업로드 0.
   - bg 탭 진입/조작부 가시성(T-117 회귀)/배경 적용(preset·procedural·color)/
     캔버스 픽셀 변화/저장(onSave) 반영/복원/작업실 bridge fallback 을 검증.
   - 3종 합성 사진(인물·네일·헤어)으로 누끼+합성 파이프라인 동작 확인.

   실행: python3 -m http.server 8099  (레포 루트) 후
        node scripts/bg-replace-qa.js
   결과: output/playwright/bg_*.png + 콘솔 JSON 리포트 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { chromium } = require('playwright');

// ── 의존성 0 PNG 인코더 (RGBA) — 누끼 mock 응답용 ──
const _CRC_TABLE = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; } return t; })();
function _crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = _CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function _chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0); const t = Buffer.from(type, 'ascii'); const crc = Buffer.alloc(4); crc.writeUInt32BE(_crc32(Buffer.concat([t, data])), 0); return Buffer.concat([len, t, data, crc]); }
function encodePng(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; // 8bit RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([sig, _chunk('IHDR', ihdr), _chunk('IDAT', idat), _chunk('IEND', Buffer.alloc(0))]);
}
function makeCutoutPngBuffer() {
  // 200x250: 가운데 불투명 흰 타원(인물), 나머지 투명 → alphaBBox 가 의미있게 잡힘
  const w = 200, h = 250, rgba = Buffer.alloc(w * h * 4);
  const cx = w / 2, cy = h * 0.46, rx = w * 0.34, ry = h * 0.4;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4; const dx = (x - cx) / rx, dy = (y - cy) / ry;
    const inside = dx * dx + dy * dy <= 1;
    rgba[i] = 235; rgba[i + 1] = 200; rgba[i + 2] = 175; rgba[i + 3] = inside ? 255 : 0;
  }
  return encodePng(w, h, rgba);
}

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'output', 'playwright');
const BASE_URL = process.env.PHOTO_QA_URL || 'http://127.0.0.1:8099/?nav_v7=1&v=t116';

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 430, height: 920 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + String(e.message || e)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });

  // ── 누끼 API mock: 가운데 불투명 타원 + 투명 배경 PNG 반환(과금 0) ──
  let removeBgCalls = 0;
  const CUTOUT_PNG = makeCutoutPngBuffer();
  await page.route('**/image/remove-bg', async route => {
    removeBgCalls++;
    await new Promise(r => setTimeout(r, 200)); // 로딩 피드백 검증용 지연
    await route.fulfill({ status: 200, contentType: 'image/png', body: CUTOUT_PNG });
  });

  await page.addInitScript(() => {
    window.APP_BUILD = window.APP_BUILD || 'qa-t116';
    window.__toastLog = [];
    window.__bgStatusLog = [];
    window.addEventListener('itdasy:photo-bg-status', e => { window.__bgStatusLog.push(e.detail && e.detail.message); });
    const _hook = () => {
      if (window.showToast && !window.showToast.__wrapped) {
        const orig = window.showToast;
        window.showToast = function (msg, opts) { try { window.__toastLog.push(String(msg)); } catch (_e) { void _e; } return orig.apply(this, arguments); };
        window.showToast.__wrapped = true;
      }
    };
    const iv = setInterval(_hook, 50); setTimeout(() => clearInterval(iv), 8000);

    window.__makePhoto = function (kind) {
      const c = document.createElement('canvas'); c.width = 800; c.height = 1000;
      const g = c.getContext('2d');
      if (kind === 'face') { const gr = g.createLinearGradient(0, 0, 0, 1000); gr.addColorStop(0, '#dfe7f0'); gr.addColorStop(1, '#b9c6d8'); g.fillStyle = gr; g.fillRect(0, 0, 800, 1000); g.fillStyle = '#e8b89a'; g.beginPath(); g.arc(400, 430, 175, 0, 7); g.fill(); }
      else if (kind === 'nail') { g.fillStyle = '#efe7e0'; g.fillRect(0, 0, 800, 1000); g.fillStyle = '#d8a08a'; g.fillRect(280, 300, 240, 420); g.fillStyle = '#a23b52'; for (let i = 0; i < 4; i++) { g.fillRect(300 + i * 55, 320, 38, 70); } }
      else { /* hair / busy bg */ g.fillStyle = '#3a5a3a'; g.fillRect(0, 0, 800, 1000); for (let i = 0; i < 200; i++) { g.fillStyle = `hsl(${(i * 37) % 360},40%,${30 + (i % 40)}%)`; g.fillRect((i * 53) % 800, (i * 91) % 1000, 30, 30); } g.fillStyle = '#5b3a26'; g.beginPath(); g.arc(400, 450, 190, 0, 7); g.fill(); }
      return c.toDataURL('image/png');
    };

    window.__openPE = async function (kind, opts) {
      document.body.classList.remove('itdasy-locked');
      const lock = document.getElementById('lockOverlay'); if (lock) lock.classList.add('hidden');
      const PE = window.PhotoEditor;
      PE.open(Object.assign({ src: window.__makePhoto(kind || 'face'), shopName: 'QA 살롱', initial_tab: 'auto' }, opts || {}));
      await new Promise((res, rej) => { const t0 = Date.now(); const t = () => { const s = PE._internal.getState && PE._internal.getState(); if (s && s.originalImg && s.originalImg.naturalWidth) return res(); if (Date.now() - t0 > 20000) return rej(new Error('load timeout')); setTimeout(t, 80); }; t(); });
      const NV = window.PhotoEditorNavV7; if (NV) { try { NV.setEnabled(true); NV.mount(); } catch (_e) { void _e; } }
      await new Promise(r => setTimeout(r, 200));
    };
    window.__gotoBg = async function () { const NV = window.PhotoEditorNavV7; if (NV && NV.setSubChip) NV.setSubChip('tpl-bg'); await new Promise(r => setTimeout(r, 350)); };
    window.__cornerColors = function () {
      const cv = document.getElementById('peCanvas'); if (!cv) return null;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      const w = cv.width, h = cv.height;
      const tl = ctx.getImageData(4, 4, 1, 1).data;
      const tr = ctx.getImageData(w - 5, 4, 1, 1).data;
      const ctr = ctx.getImageData((w / 2) | 0, (h / 2) | 0, 1, 1).data;
      return { w, h, tl: [tl[0], tl[1], tl[2]], tr: [tr[0], tr[1], tr[2]], center: [ctr[0], ctr[1], ctr[2]] };
    };
    window.__panelMeasure = function () {
      const panel = document.getElementById('pePanel'); const nav = document.getElementById('peNavV7');
      if (!panel) return { error: 'no panel' };
      const cards = Array.from(panel.querySelectorAll('[data-pe-bg-id]'));
      const shadowBtns = Array.from(panel.querySelectorAll('[data-pe-shadow]'));
      const pr = panel.getBoundingClientRect();
      const navTop = nav ? nav.getBoundingClientRect().top : window.innerHeight;
      const first = cards[0] ? cards[0].getBoundingClientRect() : null;
      return {
        bgCardCount: cards.length, shadowBtnCount: shadowBtns.length,
        panelTop: Math.round(pr.top), panelBottom: Math.round(pr.bottom), navTopY: Math.round(navTop),
        firstCard: first ? { top: Math.round(first.top), bottom: Math.round(first.bottom) } : null,
        firstCardVisible: first ? (first.top >= pr.top - 2 && first.bottom <= Math.min(pr.bottom, navTop) + 2) : false,
        hasRestore: !!panel.querySelector('[data-pe-bg-restore]'),
        scrollable: Math.round(panel.scrollHeight) > Math.round(panel.clientHeight) + 2,
      };
    };
    window.__applyBg = async function (bgId) {
      const panel = document.getElementById('pePanel');
      const btn = panel && panel.querySelector(`[data-pe-bg-id="${bgId}"]`);
      if (!btn) return { ok: false, reason: 'no card ' + bgId };
      btn.click();
      // compose 완료 대기 — originalSrc 가 data:image/jpeg 합성본으로 바뀔 때까지
      const PE = window.PhotoEditor;
      await new Promise((res) => { const t0 = Date.now(); const t = () => { const s = PE._internal.getState(); if (s && s.bg && s.bg.id === bgId) return res(); if (Date.now() - t0 > 15000) return res(); setTimeout(t, 100); }; t(); });
      await new Promise(r => setTimeout(r, 250));
      const s = PE._internal.getState();
      return { ok: !!(s.bg && s.bg.id === bgId), bgId: s.bg && s.bg.id, hasRemovedCache: !!s.removedBgDataUrl };
    };
    window.__restore = async function () {
      const panel = document.getElementById('pePanel');
      const btn = panel && panel.querySelector('[data-pe-bg-restore]');
      if (!btn) return { ok: false };
      btn.click(); await new Promise(r => setTimeout(r, 400));
      const s = window.PhotoEditor._internal.getState();
      return { ok: !(s.bg && s.bg.id), bgId: s.bg && s.bg.id };
    };
  });

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => window.PhotoEditor && window.PhotoEditorNavV7 && window.PhotoEditorBgCompose && typeof window.GALLERY_BG_LIST === 'function', null, { timeout: 45000 });
  await page.waitForTimeout(1200);

  const report = { url: BASE_URL, cases: {}, removeBgCalls: 0, toastSample: [], bgStatusSample: [] };

  // ── [1] bg 탭 진입 + 조작부 가시성(T-117) ──
  await page.evaluate(() => window.__openPE('face'));
  await page.evaluate(() => window.__gotoBg());
  report.cases.entry = await page.evaluate(() => window.__panelMeasure());
  await page.screenshot({ path: path.join(OUT, 'bg_entry.png') });

  // ── [2] 배경 교체 — preset(pink) before/after ──
  const beforeReplace = await page.evaluate(() => window.__cornerColors());
  await page.screenshot({ path: path.join(OUT, 'bg_remove_before_after.png') }); // before(원본)
  const applyPink = await page.evaluate(() => window.__applyBg('pink'));
  const afterPink = await page.evaluate(() => window.__cornerColors());
  await page.screenshot({ path: path.join(OUT, 'bg_replace_before_after.png') }); // after(분홍)
  report.cases.replace_pink = { apply: applyPink, before: beforeReplace, after: afterPink };

  // ── [2b] procedural(black_lux) ──
  const applyBlack = await page.evaluate(() => window.__applyBg('bg_black_lux'));
  const afterBlack = await page.evaluate(() => window.__cornerColors());
  report.cases.replace_black = { apply: applyBlack, after: afterBlack };

  // ── [3] 복원 ──
  const restore = await page.evaluate(() => window.__restore());
  const afterRestore = await page.evaluate(() => window.__cornerColors());
  report.cases.restore = { restore, after: afterRestore };

  // ── [4] 3종 사진 각각 배경 적용 성공 여부 ──
  report.cases.photos = {};
  for (const kind of ['face', 'nail', 'hair']) {
    await page.evaluate(k => window.__openPE(k), kind);
    await page.evaluate(() => window.__gotoBg());
    const before = await page.evaluate(() => window.__cornerColors());
    const apply = await page.evaluate(() => window.__applyBg('pink'));
    const after = await page.evaluate(() => window.__cornerColors());
    report.cases.photos[kind] = { apply, before, after };
  }

  // ── [5] 저장 onSave 반영(작업실 slot 시뮬) — 배경 적용 후 _save → onSave dataUrl ──
  const slotSave = await page.evaluate(async () => {
    let saved = null;
    await window.__openPE('face', { onSave: (d) => { saved = d; }, initial_tab: 'bg' });
    await window.__gotoBg();
    await window.__applyBg('pink');
    // 저장 트리거 — 공개 API 엔 save 가 없으므로 저장 버튼 클릭(_save → onSave)
    const saveBtn = document.querySelector('#photoEditorSheet [data-pe-act="save"]');
    if (saveBtn) saveBtn.click();
    // onSave 가 _saveViaCallback 경로로 비동기 호출됨
    await new Promise(res => setTimeout(res, 800));
    let cornerOfSaved = null;
    if (saved) {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = saved; });
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const cx = c.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0);
      const tl = cx.getImageData(4, 4, 1, 1).data; cornerOfSaved = [tl[0], tl[1], tl[2], img.width, img.height];
    }
    return { saved: !!saved, cornerOfSaved };
  });
  report.cases.slotSave = slotSave;
  await page.screenshot({ path: path.join(OUT, 'bg_slot_save_check.png') });

  // ── [6] export(standalone PNG) 반영 ──
  const exportCheck = await page.evaluate(async () => {
    await window.__openPE('face', { initial_tab: 'bg' });
    await window.__gotoBg();
    await window.__applyBg('bg_black_lux');
    const cv = document.getElementById('peCanvas');
    const dataUrl = cv.toDataURL('image/png');
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl; });
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const cx = c.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0);
    const tl = cx.getImageData(4, 4, 1, 1).data;
    return { exported: true, corner: [tl[0], tl[1], tl[2]], dim: [img.width, img.height] };
  });
  report.cases.exportCheck = exportCheck;
  await page.screenshot({ path: path.join(OUT, 'bg_export_check.png') });

  // ── [7] 작업실 fallback 분기 (정적 + 함수 존재) ──
  report.cases.workshop = await page.evaluate(() => ({
    openSlotPhotoInEditor: typeof window.openSlotPhotoInEditor === 'function',
    fallbackOpenBgPanel: typeof window.openBgPanel === 'function',
    peOpen: typeof (window.PhotoEditor && window.PhotoEditor.open) === 'function',
  }));

  // ── [8] 실패 안내 — 서버 500 → '합성 실패' 토스트 (조용히 죽지 않는지). 휴대폰 폴백은 2026-09-30 삭제 ──
  await page.unroute('**/image/remove-bg');
  await page.route('**/image/remove-bg', route => route.fulfill({ status: 500, contentType: 'text/plain', body: 'fail' }));
  const failCase = await page.evaluate(async () => {
    // 서버 실패 → compose._removeBg 가 throw → bg-tab catch → toast
    window.__toastLog = [];
    await window.__openPE('face', { initial_tab: 'bg' });
    await window.__gotoBg();
    const panel = document.getElementById('pePanel');
    const btn = panel.querySelector('[data-pe-bg-id="pink"]');
    btn.click();
    await new Promise(r => setTimeout(r, 2500));
    const s = window.PhotoEditor._internal.getState();
    return { toasts: (window.__toastLog || []).slice(), bgApplied: !!(s.bg && s.bg.id), btnReEnabled: !btn.disabled };
  });
  report.cases.failCase = failCase;

  report.removeBgCalls = removeBgCalls;
  report.toastSample = await page.evaluate(() => (window.__toastLog || []).slice(0, 40));
  report.bgStatusSample = await page.evaluate(() => (window.__bgStatusLog || []));
  report.severeErrors = errors.filter(e => !/favicon|ResizeObserver|TensorFlow|XNNPACK/i.test(e));

  await browser.close();
  console.log(JSON.stringify(report, null, 2));
}

main().catch(e => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
