/* 작업실 V2 — 다중 카드(전·후 합치기 + 그대로) QA. 현재 플로우 기준으로 다시 씀(2026-10-01).
 *
 *   업로드 → 레이아웃(구성 'ba' = wsl-ba-lr 1장 + 그대로 N장) → composeCards → templateOutputs → 캡션 결과 캐러셀
 *   → 저장 → 홈 '이어서' 재진입(startScreen:'layout') → 구성 보존 → 카드 단위 사진 편집 → 폰에 저장(N장).
 *
 * [2026-09-10 scope-lock 이후 폐기된 전제] startScreen:'edit' · command type:'template' · data-fl="tplrelease" ·
 *   "다중 pair 3개"(현재 작업실은 글 하나에 전·후 쌍 1개만) — 전부 제거. 2026-10-01 감사(flow-workspace-photo 01~06)의
 *   회귀를 실제 브라우저에서 잡는다.
 *
 * 정적 서버 + Playwright(chromium)로 앱 전체(index.html)를 띄운다. 백엔드 없음(인증 게이트 우회, IndexedDB 저장만).
 *   실행: node scripts/wsv2-multipair-qa.js   종료코드: 0=PASS, 1=FAIL
 */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8198;
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.map': 'application/json',
};
function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/index.html';
      const fp = path.join(ROOT, p);
      if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); res.end('404'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
      fs.createReadStream(fp).pipe(res);
    });
    srv.listen(PORT, () => resolve(srv));
  });
}

const results = [];
const ck = (name, cond, detail) => { results.push({ name, pass: !!cond, detail: detail || '' }); console.log((cond ? '  PASS ' : '  FAIL ') + name + (cond ? '' : ' :: ' + (detail || ''))); };
const isHardError = (t) =>
  /pageerror:|TypeError|ReferenceError|SyntaxError|is not a function|Cannot read|Cannot set|is not defined|is not an object/.test(t)
  && !/fetch|network|net::|load failed|401|403|404|429|5\d\d|apiUrl|apiFetch|run\.app|supabase|persona|assistant\/ask/i.test(t);

// 페이지 안 헬퍼 — 단색 사진, 결과물 픽셀 읽기
const PAGE_HELPERS = `
  window.__mk = function (c, w, h) { var cv = document.createElement('canvas'); cv.width = w || 600; cv.height = h || 750; var x = cv.getContext('2d'); x.fillStyle = c; x.fillRect(0, 0, cv.width, cv.height); return cv.toDataURL('image/jpeg', 0.8); };
  window.__px = function (url, pts) { return new Promise(function (res) { var im = new Image(); im.onload = function () { var cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight; var cx = cv.getContext('2d'); cx.drawImage(im, 0, 0); var out = { w: cv.width, h: cv.height }; pts.forEach(function (p) { var d = cx.getImageData(Math.floor(p[0] * (cv.width - 1)), Math.floor(p[1] * (cv.height - 1)), 1, 1).data; out[p[2]] = [d[0], d[1], d[2]]; }); res(out); }; im.onerror = function () { res(null); }; im.src = url; }); };
  window.__near = function (a, b, tol) { if (!a || !b) return false; tol = tol || 24; return Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol && Math.abs(a[2] - b[2]) <= tol; };
`;

(async () => {
  const srv = await serve();
  const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;
  const browser = await chromium.launch(isRoot ? { args: ['--no-sandbox'] } : {});
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errs = [], downloads = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('download', (d) => downloads.push(d.suggestedFilename()));
  // 레포 그대로 서빙 시 build.txt 대조 리로드 억제(ws-flow-smoke 와 동일 — 앱의 세션당 1회 가드 키)
  await page.addInitScript(() => { try { sessionStorage.setItem('srv_build_checked', '1'); } catch (e) { void e; } });

  try {
    await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.WorkspaceFlow && window.WorkspaceLayout && window.ItdEditor && window.saveSlotToDB, { timeout: 30000 });
    await page.waitForTimeout(2000);
    await page.evaluate((h) => {
      try { if (typeof _setAuthGateLocked === 'function') _setAuthGateLocked(false); } catch (e) { void e; }
      const lock = document.getElementById('lockOverlay'); if (lock) lock.style.display = 'none';
      const b = document.getElementById('itdasyCookieBanner'); if (b) b.remove();
      // eslint-disable-next-line no-eval
      eval(h);
      window.__saved = [];
      const orig = window.saveSlotToDB;
      window.saveSlotToDB = function (slot) { try { window.__saved.push(JSON.parse(JSON.stringify(slot))); } catch (e) { void e; } return orig.apply(this, arguments); };
      window.__toasts = []; const ot = window.showToast; window.showToast = function (m) { window.__toasts.push(String(m)); try { return ot && ot.apply(this, arguments); } catch (e) { void e; } };
    }, PAGE_HELPERS);
    const last = () => page.evaluate(() => window.__saved[window.__saved.length - 1]);
    const outsBrief = (s) => (s.templateOutputs || []).map((o) => ({ pairId: o.pairId, templateId: o.templateId, len: (o.outputUrl || '').length, edited: !!o.storyEdited }));
    const compOn = () => page.$$eval('#wsv2Flow [data-fl-comp]', (els) => els.filter((e) => e.classList.contains('on')).map((e) => e.getAttribute('data-fl-comp')));
    const screen = () => page.evaluate(() => { const s = window.WorkspaceFlow.getActiveSlot(); return s && s.screen; });
    const waitScreen = (n) => page.waitForFunction((n2) => { const s = window.WorkspaceFlow.getActiveSlot(); return s && s.screen === n2; }, n, { timeout: 30000 });

    // ── Q1 업로드 3장 → 레이아웃 → '전·후 합치기' = 카드 2장 ──
    await page.evaluate(() => window.WorkspaceFlow.open({ startScreen: 'upload', photoUrls: [window.__mk('#c87878'), window.__mk('#78a0c8'), window.__mk('#dba060')] }));
    await waitScreen('layout');
    await page.click('#wsv2Flow [data-fl-comp="ba"]'); await page.waitForTimeout(300);
    ck('Q1 전·후 합치기 → 구성 ba · 카드 2장', (await compOn()).join() === 'ba' && (await page.$$eval('#wsv2Flow .wsc-frame', (e) => e.length)) === 2, JSON.stringify(await compOn()));

    // ── Q2 CTA → composeCards → templateOutputs [ba-lr, flat] · 합성본 좌=전 색, 우=후 색 ──
    await page.click('#wsv2Flow [data-fl="cta"]'); await waitScreen('caption'); await page.waitForTimeout(400);
    await page.evaluate(() => window.WorkspaceFlow.command({ type: 'save' })); await page.waitForTimeout(800);
    const s1 = await last();
    const o1 = outsBrief(s1);
    ck('Q2 templateOutputs = [wsl-ba-lr, 그대로]', o1.length === 2 && o1[0].templateId === 'wsl-ba-lr' && o1[1].templateId === null, JSON.stringify(o1));
    const px1 = await page.evaluate((u) => window.__px(u, [[0.25, 0.5, 'L'], [0.75, 0.5, 'R']]), s1.templateOutputs[0].outputUrl);
    ck('Q2b 합성본 1080×1080 · 좌=전(붉은) · 우=후(푸른)', px1 && px1.w === 1080 && px1.h === 1080 && px1.L[0] > px1.L[2] && px1.R[2] > px1.R[0], JSON.stringify(px1));
    ck('Q2c 원본 사진 3장 무오염(editedDataUrl 없음)', s1.photos.length === 3 && s1.photos.every((p) => !p.editedDataUrl), JSON.stringify(s1.photos.map((p) => !!p.editedDataUrl)));
    ck('Q2d 저장 모델에 구성(layoutComp=ba · layoutCards 2)이 들어간다', s1.workspaceContext && s1.workspaceContext.layoutComp === 'ba' && Array.isArray(s1.workspaceContext.layoutCards) && s1.workspaceContext.layoutCards.length === 2, JSON.stringify(s1.workspaceContext && { comp: s1.workspaceContext.layoutComp, cards: (s1.workspaceContext.layoutCards || []).length }));

    // ── Q3 [01] 홈 '이어서' 와 같은 재진입(startScreen:'layout') → 구성 ba 유지 → CTA → 합성본 보존 ──
    await page.evaluate(async (id) => { const l = await window.loadSlotsFromDB(); const s = l.find((x) => x.id === id); window.WorkspaceFlow.open({ slot: s, startScreen: 'layout' }); }, s1.id);
    await waitScreen('layout'); await page.waitForTimeout(400);
    ck('Q3 재진입(layout) — 구성 ba · 카드 2장(flat 초기화 없음)', (await compOn()).join() === 'ba' && (await page.$$eval('#wsv2Flow .wsc-frame', (e) => e.length)) === 2, JSON.stringify(await compOn()));
    await page.click('#wsv2Flow [data-fl="cta"]'); await waitScreen('caption'); await page.waitForTimeout(400);
    await page.evaluate(() => window.WorkspaceFlow.command({ type: 'save' })); await page.waitForTimeout(800);
    const s2 = await last();
    ck('Q3b 재진입 후 CTA·저장해도 templateOutputs 동일(pairId·templateId·합성본 그대로)', JSON.stringify(outsBrief(s2)) === JSON.stringify(o1) && s2.templateOutputs[0].outputUrl === s1.templateOutputs[0].outputUrl && s2.id === s1.id, JSON.stringify(outsBrief(s2)));
    // 옛 저장본(구성 없음)도 결과물로 역산된다
    await page.evaluate(async (id) => { const l = await window.loadSlotsFromDB(); const s = l.find((x) => x.id === id); delete s.workspaceContext.layoutComp; delete s.workspaceContext.layoutCards; window.WorkspaceFlow.open({ slot: s, startScreen: 'layout' }); }, s1.id);
    await waitScreen('layout'); await page.waitForTimeout(400);
    ck('Q3c 옛 저장본(구성 키 없음)도 templateOutputs 로 ba 역산', (await compOn()).join() === 'ba', JSON.stringify(await compOn()));
    await page.evaluate(() => window.WorkspaceFlow.close()); await page.waitForTimeout(300);

    // ── Q4 [03] 캡션 전에도 '나중에 이어서하기' 가 보이고, 뒤로가기로 나가도 작업이 남는다 ──
    const beforeIds = await page.evaluate(async () => (await window.loadSlotsFromDB()).map((s) => s.id));
    const before = beforeIds.length;
    await page.evaluate(() => window.WorkspaceFlow.open({ startScreen: 'upload', photoUrls: [window.__mk('#8c6'), window.__mk('#68c')] }));
    await waitScreen('layout'); await page.click('#wsv2Flow [data-fl-comp="ba"]'); await page.waitForTimeout(200);
    await page.click('#wsv2Flow [data-fl="cta"]'); await waitScreen('caption'); await page.waitForTimeout(400);
    const bar = await page.evaluate(() => { const b = document.querySelector('#wsv2Flow .wsv2flow__actionbar'), c = document.querySelector('#wsv2Flow [data-fl="cta"]'); return { hidden: b.classList.contains('hidden'), display: getComputedStyle(b).display, label: c && c.textContent.trim() }; });
    ck('Q4 캡션 전(글 없음) 하단 CTA "나중에 이어서하기" 노출', !bar.hidden && bar.display !== 'none' && bar.label === '나중에 이어서하기', JSON.stringify(bar));
    for (let i = 0; i < 4; i++) { if (!(await page.evaluate(() => window.WorkspaceFlow.isOpen()))) break; await page.click('#wsv2Flow [data-fl="back"]'); await page.waitForTimeout(500); }
    await page.waitForTimeout(800);
    const after = await page.evaluate(async (ids) => { const l = await window.loadSlotsFromDB(); const s = l.find((x) => ids.indexOf(x.id) < 0); return { n: l.length, photos: s && s.photos.length, outs: s && (s.templateOutputs || []).length, toasts: window.__toasts.splice(0) }; }, beforeIds);
    ck('Q4b 뒤로가기 ×3 으로 나가도 사진 2·합성본 1 이 임시 저장돼 있다', !(await page.evaluate(() => window.WorkspaceFlow.isOpen())) && after.n === before + 1 && after.photos === 2 && after.outs === 1 && after.toasts.some((t) => /임시 저장/.test(t)), JSON.stringify(after));

    // ── Q5 [05→04] 캡션 결과 캐러셀 — 결과물 슬라이드는 **첫 장 비율로 통일**(발행 규칙: BE 가 첫 장 비율로 pad) ──
    await page.evaluate(async (id) => { const l = await window.loadSlotsFromDB(); const s = l.find((x) => x.id === id); s.caption = 'QA 캡션'; window.WorkspaceFlow.open({ slot: s, startScreen: 'caption' }); }, s1.id);
    await waitScreen('caption'); await page.waitForTimeout(1200);
    const slides = await page.$$eval('#wsv2Flow [data-fl-carslide]', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return { id: e.getAttribute('data-fl-carslide'), igout: e.hasAttribute('data-fl-igout'), ar: e.style.aspectRatio, boxAr: +(r.width / r.height).toFixed(3) }; }));
    ck('Q5 캐러셀 2장 · 전후 합성본(1:1) 칸이 1:1, 두 번째 결과물 칸도 첫 장 비율(1:1)로 통일(04 발행 규칙)', slides.length === 2 && slides[0].igout && slides[0].ar === '1080 / 1080' && Math.abs(slides[0].boxAr - 1) < 0.02 && slides[1].ar === '1080 / 1080' && Math.abs(slides[1].boxAr - 1) < 0.02, JSON.stringify(slides));

    // ── Q6 [06] 폰에 저장 = 카드 전부 ──
    await page.click('#wsv2Flow [data-fl="saveimg"]'); await page.waitForTimeout(1500);
    const sheetTxt = await page.$eval('#wsv2Flow [data-fl-pubask] .pub-ask__d', (e) => e.textContent).catch(() => '');
    ck('Q6 폰에 저장 → 2장 다운로드 + "2장" 안내', downloads.length === 2 && /2장/.test(sheetTxt) && (await page.evaluate(() => window.__toasts.splice(0))).some((t) => /2장을 저장/.test(t)), JSON.stringify({ downloads, sheetTxt }));
    await page.evaluate(() => { const b = document.querySelector('#wsv2Flow [data-fl="pubnot"]'); if (b) b.click(); });

    // ── Q7 [02] 2번째 카드(그대로)를 보며 사진 편집 → 편집기는 그 사진 · 완료본은 그 카드에만 ──
    const dots = await page.$$eval('#wsv2Flow [data-fl-cardot]', (els) => els.map((e) => e.getAttribute('data-fl-cardot')));
    await page.click('#wsv2Flow [data-fl-cardot="' + dots[1] + '"]'); await page.waitForTimeout(400);
    const savesBefore = await page.evaluate(() => window.__saved.length);
    await page.click('#wsv2Flow [data-fl="storyedit"]');
    await page.waitForFunction(() => window.ItdEditor.isOpen(), null, { timeout: 15000 }); await page.waitForTimeout(1200);
    const edPhoto = await page.evaluate(async () => { const ph = document.querySelector('.itded .itded__photo'); const bg = (ph && ph.style.backgroundImage || '').replace(/^url\("?|"?\)$/g, ''); return bg ? window.__px(bg, [[0.5, 0.5, 'C']]) : null; });
    ck('Q7 편집기가 연 사진 = 2번째 카드의 사진(주황, 600×750) — 전후 합성본이 아님', edPhoto && edPhoto.w === 600 && edPhoto.h === 750 && edPhoto.C[0] > 190 && edPhoto.C[1] > 130 && edPhoto.C[2] < 130, JSON.stringify(edPhoto));
    await page.click('.itded [data-r="done"]');
    await page.waitForFunction(() => !window.ItdEditor.isOpen(), null, { timeout: 20000 });
    await page.waitForFunction((n) => window.__saved.length > n, savesBefore, { timeout: 10000 });
    await page.waitForTimeout(800);
    const s3 = await last();
    ck('Q7b 완료 후 1번 카드 합성본 그대로 · 2번 카드만 바뀜 · photos[0] 무오염', s3.templateOutputs[0].outputUrl === s1.templateOutputs[0].outputUrl && s3.templateOutputs[1].outputUrl !== s1.templateOutputs[1].outputUrl && !s3.photos[0].editedDataUrl && !!s3.photos[2].editedDataUrl, JSON.stringify(outsBrief(s3)));
    // 1번 카드(합성본)를 보며 편집 → 그 카드에만, 사진 모델 무오염, 재진입 CTA 에도 유지
    await page.click('#wsv2Flow [data-fl-cardot="' + dots[0] + '"]'); await page.waitForTimeout(400);
    const n2 = await page.evaluate(() => window.__saved.length);
    await page.click('#wsv2Flow [data-fl="storyedit"]');
    await page.waitForFunction(() => window.ItdEditor.isOpen(), null, { timeout: 15000 }); await page.waitForTimeout(800);
    const edPhoto2 = await page.evaluate(async () => { const ph = document.querySelector('.itded .itded__photo'); const bg = (ph && ph.style.backgroundImage || '').replace(/^url\("?|"?\)$/g, ''); return bg ? window.__px(bg, [[0.25, 0.5, 'L'], [0.75, 0.5, 'R']]) : null; });
    await page.click('.itded [data-r="done"]');
    await page.waitForFunction(() => !window.ItdEditor.isOpen(), null, { timeout: 20000 });
    await page.waitForFunction((n) => window.__saved.length > n, n2, { timeout: 10000 }); await page.waitForTimeout(800);
    const s4 = await last();
    ck('Q7c 1번 카드 편집: 편집기가 1:1 합성본(좌 붉음·우 푸름)을 열고, 완료본은 1번 카드에만 · storyEdited 카드 표식 · 사진 무오염', edPhoto2 && edPhoto2.w === 1080 && edPhoto2.h === 1080 && edPhoto2.L[0] > edPhoto2.L[2] && edPhoto2.R[2] > edPhoto2.R[0] && s4.templateOutputs[0].outputUrl !== s3.templateOutputs[0].outputUrl && s4.templateOutputs[0].storyEdited === true && s4.templateOutputs[1].outputUrl === s3.templateOutputs[1].outputUrl && !s4.photos[0].editedDataUrl && !s4.photos[1].editedDataUrl, JSON.stringify({ edPhoto2, outs: outsBrief(s4) }));
    await page.evaluate(() => window.WorkspaceFlow.close()); await page.waitForTimeout(300);
    await page.evaluate(async (id) => { const l = await window.loadSlotsFromDB(); const s = l.find((x) => x.id === id); window.WorkspaceFlow.open({ slot: s, startScreen: 'layout' }); }, s1.id);
    await waitScreen('layout'); await page.waitForTimeout(300);
    await page.click('#wsv2Flow [data-fl="cta"]'); await waitScreen('caption'); await page.waitForTimeout(400);
    await page.evaluate(() => window.WorkspaceFlow.command({ type: 'save' })); await page.waitForTimeout(800);
    const s5 = await last();
    ck('Q7d 편집한 합성본은 재진입 → CTA 를 거쳐도 다시 굽히지 않는다', s5.templateOutputs[0].outputUrl === s4.templateOutputs[0].outputUrl && s5.templateOutputs[0].storyEdited === true, JSON.stringify(outsBrief(s5)));
  } catch (e) {
    ck('EXCEPTION', false, String(e && e.stack || e).split('\n').slice(0, 2).join(' '));
  }

  const hard = errs.filter(isHardError);
  ck('Q8 flow runtime error 0', hard.length === 0, JSON.stringify(hard.slice(0, 3)));

  await browser.close();
  srv.close();
  const pass = results.filter((x) => x.pass).length;
  console.log(`\n작업실 다중카드 QA: ${pass}/${results.length} PASS`);
  process.exit(pass === results.length ? 0 : 1);
})();
