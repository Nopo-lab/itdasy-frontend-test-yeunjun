#!/usr/bin/env node
/* bp-ba-skin-acne-pink + bp-ba-hair-extension-polaroid 전용 QA (v429) — 런타임 미수정, 실브라우저 검증.
   실행: python3 -m http.server 8099 후
        PHOTO_QA_URL=http://127.0.0.1:8099/?nav_v7=0 node scripts/bp-ba-skin-hair-qa.js
   라이브: PHOTO_QA_URL=https://nopo-lab.github.io/itdasy-frontend-test-yeunjun/ */
const { chromium } = require('playwright');
const zlib = require('zlib');
const BASE = process.env.PHOTO_QA_URL || 'http://127.0.0.1:8099/?nav_v7=0&v=skinhairqa';
const TARGETS = [
  { id: 'bp-ba-skin-acne-pink', industry: 'skin' },
  { id: 'bp-ba-hair-extension-polaroid', industry: 'hair' },
];

// 작은 단색 PNG 생성(전/후 사진 슬롯용)
function crc32(b){let c=~0;for(let i=0;i<b.length;i++){c^=b[i];for(let k=0;k<8;k++)c=(c>>>1)^(0xEDB88320&-(c&1));}return ~c>>>0;}
function ck(t,d){const T=Buffer.from(t,'ascii');const L=Buffer.alloc(4);L.writeUInt32BE(d.length);const C=Buffer.alloc(4);C.writeUInt32BE(crc32(Buffer.concat([T,d])));return Buffer.concat([L,T,d,C]);}
function png(s,r,g,b){const sig=Buffer.from([137,80,78,71,13,10,26,10]);const h=Buffer.alloc(13);h.writeUInt32BE(s,0);h.writeUInt32BE(s,4);h[8]=8;h[9]=2;const row=Buffer.concat([Buffer.from([0]),Buffer.concat(Array.from({length:s},()=>Buffer.from([r,g,b])))]);const raw=Buffer.concat(Array.from({length:s},()=>row));return Buffer.concat([sig,ck('IHDR',h),ck('IDAT',zlib.deflateSync(raw)),ck('IEND',Buffer.alloc(0))]);}
const baseURL = 'data:image/png;base64,' + png(8,230,120,150).toString('base64');
const beforeURL = 'data:image/png;base64,' + png(6,60,180,90).toString('base64');
const afterURL = 'data:image/png;base64,' + png(6,180,60,90).toString('base64');

(async () => {
  const errs = [];
  const browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const cerrs = [];
  const BENIGN = /XNNPACK|TensorFlow Lite|Created TensorFlow|GL driver|WebGL|GroupMarker|Failed to load resource|favicon|net::ERR|sw\.js|ServiceWorker/i;
  page.on('pageerror', e => errs.push('pageerror: ' + String(e.message || e)));
  page.on('console', m => { if (m.type() === 'error') { const t = m.text(); if (!BENIGN.test(t)) cerrs.push('console.error: ' + t.slice(0, 160)); } });

  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);
  try { await page.evaluate(async () => { try { const rs = await navigator.serviceWorker.getRegistrations(); rs.forEach(r => r.unregister()); if (window.caches) { const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); } } catch (_) { /* noop */ } }); } catch (_) { /* context may have navigated */ }
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.waitForFunction(() => window.PhotoEditor && window.PhotoEditorTemplatesV2 && window.PhotoEditorTemplateMarketData
    && window.PhotoEditorBeautyPack && window.buildAssistantTemplateMeta && window.restoreAssistantTemplate
    && window.loadGalleryItems && window.loadSlotsFromDB, null, { timeout: 30000 });

  const R = await page.evaluate(async ({ TARGETS, baseURL, beforeURL, afterURL }) => {
    const all = {};
    const MD = window.PhotoEditorTemplateMarketData;
    const PE = window.PhotoEditor, TV = window.PhotoEditorTemplatesV2;
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const loadImg = (src) => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
    const vis = (MD.visibleTemplates() || []).map(t => t.id);
    all._bpCount = vis.filter(x => /^bp-/.test(x)).length;     // 7 기대(BP-6 event-spring 추가)
    all._v3Count = vis.filter(x => /^v3-/.test(x)).length;     // 5 무회귀
    all._existingNailPink = !!MD.lookupById('bp-ba-nail-pink-polaroid');
    all._existingNailPolaroid = !!MD.lookupById('bp-ba-nail-polaroid');

    for (const T of TARGETS) {
      const ID = T.id; const out = {};
      out.galleryVisible = vis.includes(ID);
      out.premiumChip = /^bp-/.test(ID);
      const data = MD.lookupById(ID);
      out.lookup = !!data;
      out.beforeAfterChip = !!data && data.cat === 'ba';
      out.purpose = data && data.purpose; out.industry = data && data.industry; out.kind = data && data.kind;

      // 워터마크 차등: 내 id(DONE, 워터마크 없음) vs 미등록 id(SKELETON 워터마크)
      function renderTo(id, palOverride) {
        const cv = document.createElement('canvas'); cv.width = 1080; cv.height = 1350;
        const cx = cv.getContext('2d');
        const pal = palOverride || (MD.lookupById(id) && MD.lookupById(id).palette);
        window.PhotoEditorBeautyPack.draw(cx, cv.width, cv.height, {}, { id, slotValues: {}, imageSlots: {} }, { palette: pal });
        const band = cx.getImageData(Math.round(1080 * 0.28), 1350 - 50, Math.round(1080 * 0.44), 42).data;
        const sub = pal && pal.sub ? pal.sub.replace('#', '') : 'A2868E';
        const sr = parseInt(sub.slice(0, 2), 16), sg = parseInt(sub.slice(2, 4), 16), sb = parseInt(sub.slice(4, 6), 16);
        let n = 0;
        for (let i = 0; i < band.length; i += 4) { if (Math.abs(band[i] - sr) < 26 && Math.abs(band[i + 1] - sg) < 26 && Math.abs(band[i + 2] - sb) < 26) n++; }
        return n;
      }
      out.subPxMine = renderTo(ID);
      out.subPxFake = renderTo('bp-__fake__unregistered__', data.palette);
      // DONE 등록 시 'SKELETON · id' 워터마크 미표시. 하단 밴드의 sub색 픽셀이 미등록(워터마크)의 절반 미만이면 통과.
      //   (일부 템플릿은 푸터를 sub색으로 그려 밴드에 소량 걸리므로 절대 임계 대신 상대 임계 사용)
      out.noWatermark = out.subPxMine < Math.max(80, out.subPxFake * 0.45);

      // apply
      PE.open({ src: baseURL, initial_tab: 'template' });
      await sleep(300); TV.apply(ID); await sleep(300);
      let st = PE._internal.getState();
      out.applied = !!(st && st.tplV2 && st.tplV2.id === ID);

      // 렌더러 직접 검증
      const pal = data.palette;
      const beforeImg = await loadImg(beforeURL), afterImg = await loadImg(afterURL);
      function drawDirect(slotValues, withImgs) {
        const cv = document.createElement('canvas'); cv.width = 1080; cv.height = 1350;
        const cx = cv.getContext('2d');
        const state = withImgs ? { secondImg: beforeImg, editedImg: afterImg } : {};
        const imageSlots = withImgs
          ? { before_photo: { src: beforeURL, focal: { x: 0.4, y: 0.6 }, zoom: 1.3 }, after_photo: { src: afterURL, focal: { x: 0.6, y: 0.4 }, zoom: 1.2 } }
          : {};
        window.PhotoEditorBeautyPack.draw(cx, 1080, 1350, state, { id: ID, slotValues, imageSlots }, { palette: pal });
        return cx.getImageData(0, 0, 1080, 1350).data;
      }
      function variance(d) { let mn = 255, mx = 0; for (let i = 0; i < d.length; i += 4 * 97) { const v = d[i]; if (v < mn) mn = v; if (v > mx) mx = v; } return mx - mn; }
      function diff(a, b) { let n = 0; for (let i = 0; i < a.length; i += 4 * 53) { if (Math.abs(a[i] - b[i]) > 16 || Math.abs(a[i + 1] - b[i + 1]) > 16 || Math.abs(a[i + 2] - b[i + 2]) > 16) n++; } return n; }

      const baseRender = drawDirect({}, false);
      out.canvasVariance = variance(baseRender);
      drawDirect({}, true); await sleep(250);
      const imgRender = drawDirect({}, true);
      out.swapNoCrash = true; out.swapDiff = diff(baseRender, imgRender);

      const editRender = drawDirect({
        headline: '변화', headline_accent: '오늘', subtitle: '바뀐 모습 ♡',
        before_label: 'B', after_label: 'A', before_caption: '전 상태', after_caption: '후 상태', cta: 'DM 주세요',
      }, false);
      out.slotEditDiff = diff(baseRender, editRender);

      // P2-2a 저장/복원
      st.tplV2.slotValues = Object.assign({}, st.tplV2.slotValues, { headline: 'QA변화', subtitle: 'QA서브' });
      st.tplV2.imageSlots = { before_photo: { src: beforeURL, focal: { x: 0.4, y: 0.6 }, zoom: 1.3 }, after_photo: { src: afterURL, focal: { x: 0.6, y: 0.4 }, zoom: 1.2 } };
      const g0 = (await window.loadGalleryItems()).filter(i => i.source === 'assistant_template').length;
      const s0 = (await window.loadSlotsFromDB()).filter(x => /^asst_/.test(x.id || '')).length;
      const meta = window.buildAssistantTemplateMeta(st, 'before_after');
      out.metaTemplateId = meta && meta.templateId;
      out.metaHasSlots = !!(meta && meta.slotValues && meta.imageSlots);
      const rid = 'shqa' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
      window.saveAssistantTemplateResult(baseURL, { purpose: 'before_after', label: 'BA QA', rid, templateMeta: meta });
      await sleep(800);
      const g1 = (await window.loadGalleryItems()).filter(i => i.source === 'assistant_template').length;
      const slots = await window.loadSlotsFromDB();
      const s1 = slots.filter(x => /^asst_/.test(x.id || '')).length;
      out.savedGallery = g1 > g0; out.savedSlot = s1 > s0;
      const mySlot = slots.find(x => x.id === 'asst_' + rid);
      out.slotHasTemplateMeta = !!(mySlot && mySlot.templateMeta && mySlot.templateMeta.templateId === ID);

      const ok = window.restoreAssistantTemplate(mySlot, { dataUrl: baseURL }, function () {});
      await sleep(500);
      st = PE._internal.getState();
      out.restoreReturn = ok;
      out.restoredId = !!(st && st.tplV2 && st.tplV2.id === ID);
      out.restoredHeadline = st && st.tplV2 && st.tplV2.slotValues && st.tplV2.slotValues.headline;

      all[ID] = out;
    }
    return all;
  }, { TARGETS, baseURL, beforeURL, afterURL });

  const overflowX = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
  await browser.close();

  let pass = 0, fail = 0;
  function check(label, v) { console.log((v ? '  ✅ ' : '  ❌ ') + label); v ? pass++ : fail++; }
  console.log('\n=== bp-ba-skin-acne-pink + hair-extension QA (v429) ===');
  check('BP 7종 노출', R._bpCount === 7);
  check('v3 5종 무회귀', R._v3Count === 5);
  check('기존 nail-pink 무회귀', R._existingNailPink);
  check('기존 nail-polaroid 무회귀', R._existingNailPolaroid);
  for (const T of TARGETS) {
    const r = R[T.id]; console.log('\n  [' + T.id + ']');
    check('gallery 노출', r.galleryVisible);
    check('premium 칩(/^bp-/)', r.premiumChip);
    check('before_after 칩(cat:ba)', r.beforeAfterChip);
    check('purpose=before_after', r.purpose === 'before_after');
    check('industry=' + T.industry, r.industry === T.industry);
    check('kind=before_after', r.kind === 'before_after');
    check('SKELETON 워터마크 없음', r.noWatermark);
    check('apply 성공', r.applied);
    check('렌더 비-blank', r.canvasVariance > 20);
    check('before/after 교체+focal/zoom 무크래시', r.swapNoCrash && r.swapDiff > 0);
    check('slotValues 편집 반영', r.slotEditDiff > 0);
    check('meta templateId 일치', r.metaTemplateId === T.id);
    check('meta slotValues+imageSlots', r.metaHasSlots);
    check('저장→마무리 갤러리', r.savedGallery);
    check('저장→작업실 슬롯', r.savedSlot);
    check('slot.templateMeta(P2-2a)', r.slotHasTemplateMeta);
    check('restore 재적용', r.restoreReturn && r.restoredId);
    check('restore slotValues 복원', r.restoredHeadline === 'QA변화');
    console.log('    세부: subPxMine=' + r.subPxMine + ' subPxFake=' + r.subPxFake + ' canvasVar=' + r.canvasVariance + ' swapDiff=' + r.swapDiff + ' slotEditDiff=' + r.slotEditDiff);
  }
  check('mobile overflow 0', overflowX === 0);
  check('pageerror 0', errs.length === 0);
  check('console.error 0(benign 제외)', cerrs.length === 0);
  if (errs.length) { console.log('\n  pageerrors:'); errs.slice(0, 8).forEach(e => console.log('   - ' + e)); }
  if (cerrs.length) { console.log('\n  console.errors:'); cerrs.slice(0, 8).forEach(e => console.log('   - ' + e)); }
  console.log('\n  결과: ' + pass + ' PASS / ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('QA 실행 오류:', e); process.exit(2); });
