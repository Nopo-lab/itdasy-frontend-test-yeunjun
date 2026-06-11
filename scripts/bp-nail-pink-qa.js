#!/usr/bin/env node
/* bp-ba-nail-pink-polaroid 전용 QA (v428) — 런타임 미수정, 실브라우저 검증.
   실행: python3 -m http.server 8099 후
        PHOTO_QA_URL=http://127.0.0.1:8099/?nav_v7=0 node scripts/bp-nail-pink-qa.js
   라이브: PHOTO_QA_URL=https://nopo-lab.github.io/itdasy-frontend-test-yeunjun/ */
const { chromium } = require('playwright');
const zlib = require('zlib');
const BASE = process.env.PHOTO_QA_URL || 'http://127.0.0.1:8099/?nav_v7=0&v=pinkqa';
const ID = 'bp-ba-nail-pink-polaroid';

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
  await page.waitForTimeout(4000);   // 라이브: 버전 불일치 1회 캐시버스트 리로드 정착 대기
  try { await page.evaluate(async () => { try { const rs = await navigator.serviceWorker.getRegistrations(); rs.forEach(r => r.unregister()); if (window.caches) { const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); } } catch (_) { /* noop */ } }); } catch (_) { /* context may have navigated */ }
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.waitForFunction(() => window.PhotoEditor && window.PhotoEditorTemplatesV2 && window.PhotoEditorTemplateMarketData
    && window.PhotoEditorBeautyPack && window.buildAssistantTemplateMeta && window.restoreAssistantTemplate
    && window.loadGalleryItems && window.loadSlotsFromDB, null, { timeout: 30000 });

  const R = await page.evaluate(async ({ ID, baseURL, beforeURL, afterURL }) => {
    const out = {};
    const MD = window.PhotoEditorTemplateMarketData;
    const PE = window.PhotoEditor, TV = window.PhotoEditorTemplatesV2;
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const loadImg = (src) => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });

    // 1) 갤러리 노출 + 칩
    const vis = (MD.visibleTemplates() || []).map(t => t.id);
    out.galleryVisible = vis.includes(ID);
    out.bpCount = vis.filter(x => /^bp-/.test(x)).length;     // 7 기대(blackgold/nail-polaroid/nail-pink/lash/skin-acne/hair-ext/event-spring, BP-6)
    out.v3Count = vis.filter(x => /^v3-/.test(x)).length;     // 무회귀
    out.premiumChip = /^bp-/.test(ID);                        // premium 칩 필터 매칭
    const data = MD.lookupById(ID);
    out.lookup = !!data;
    out.beforeAfterChip = !!data && data.cat === 'ba';        // before_after 칩(cat:ba)
    out.purpose = data && data.purpose; out.industry = data && data.industry; out.kind = data && data.kind;
    out.existingNailPolaroid = !!MD.lookupById('bp-ba-nail-polaroid'); // 기존 무회귀

    // 2) 워터마크 차등 검사: 내 id(DONE) vs 가짜 id(워터마크) — c.sub(#A2868E≈162,134,142) 텍스트 픽셀 카운트
    function renderTo(id) {
      const cv = document.createElement('canvas'); cv.width = 1080; cv.height = 1350;
      const cx = cv.getContext('2d');
      const pal = (MD.lookupById(id) && MD.lookupById(id).palette) || (data && data.palette);
      window.PhotoEditorBeautyPack.draw(cx, cv.width, cv.height, {}, { id, slotValues: {}, imageSlots: {} }, { palette: pal });
      const band = cx.getImageData(Math.round(1080 * 0.28), 1350 - 50, Math.round(1080 * 0.44), 42).data;
      let n = 0;
      for (let i = 0; i < band.length; i += 4) {
        if (Math.abs(band[i] - 162) < 26 && Math.abs(band[i + 1] - 134) < 26 && Math.abs(band[i + 2] - 142) < 26) n++;
      }
      return n;
    }
    out.subPxMine = renderTo(ID);
    out.subPxFake = renderTo('bp-__fake__unregistered__');   // 미등록 → fallback bg + SKELETON 워터마크
    out.noWatermark = out.subPxMine < 40 && out.subPxFake > out.subPxMine + 40;

    // 3) apply: 에디터 열고 적용
    PE.open({ src: baseURL, initial_tab: 'template' });
    await sleep(300);
    TV.apply(ID);
    await sleep(300);
    let st = PE._internal.getState();
    out.applied = !!(st && st.tplV2 && st.tplV2.id === ID);

    // 4·5) 렌더러 직접 검증(에디터 합성 캔버스는 WebGL일 수 있어 2d 판독 불가 → draw() 직접):
    //   slots/slotValues 가 출력에 반영되는지 + before/after 교체 + S4 focal/zoom 무크래시 확인.
    st.tplV2.imageSlots = st.tplV2.imageSlots || {};
    st.secondImg = await loadImg(beforeURL);                  // before = state.secondImg(편집기 상태 주입)
    const beforeImg = st.secondImg, afterImg = await loadImg(afterURL);
    const pal = data.palette;
    function drawDirect(slotValues, withImgs) {
      const cv = document.createElement('canvas'); cv.width = 1080; cv.height = 1350;
      const cx = cv.getContext('2d');
      const state = withImgs ? { secondImg: beforeImg, editedImg: afterImg } : {};
      const imageSlots = withImgs
        ? { before_photo: { src: beforeURL, focal: { x: 0.4, y: 0.6 }, zoom: 1.3 },
            after_photo: { src: afterURL, focal: { x: 0.6, y: 0.4 }, zoom: 1.2 } }
        : {};
      window.PhotoEditorBeautyPack.draw(cx, 1080, 1350, state, { id: ID, slotValues, imageSlots }, { palette: pal });
      return cx.getImageData(0, 0, 1080, 1350).data;
    }
    function variance(d) { let mn = 255, mx = 0; for (let i = 0; i < d.length; i += 4 * 97) { const v = d[i]; if (v < mn) mn = v; if (v > mx) mx = v; } return mx - mn; }
    function diff(a, b) { let n = 0; for (let i = 0; i < a.length; i += 4 * 53) { if (Math.abs(a[i] - b[i]) > 16 || Math.abs(a[i + 1] - b[i + 1]) > 16 || Math.abs(a[i + 2] - b[i + 2]) > 16) n++; } return n; }

    const baseRender = drawDirect({}, false);
    out.canvasVariance = variance(baseRender);   // >20 = 비-blank

    // before/after 이미지 슬롯을 _slotImg 캐시에 올리려 2회 draw(첫 호출=비동기 로드 트리거)
    drawDirect({}, true); await sleep(250);
    const imgRender = drawDirect({}, true);
    out.swapNoCrash = true;                       // 여기까지 throw 0(pageerror 별도 집계)
    out.swapDiff = diff(baseRender, imgRender);   // 사진 들어오면 출력 변화 >0

    const editRender = drawDirect({
      headline: '젤네일 변화', headline_accent: '오늘', subtitle: '바뀐 손끝 ♡',
      tags: ['딥 클렌징', '글로시 탑', '컬러 매칭'], footer_right: '내일도 예쁘게♡', cta: 'DM 주세요',
    }, false);
    out.slotEditVariance = variance(editRender);
    out.slotEditDiff = diff(baseRender, editRender);   // 문구 바뀌면 출력 변화 >0

    // 6) P2-2a 메타 캡처 → 저장(gallery+slot). 먼저 편집기 state(tplV2)에 편집값 주입(복원 검증용).
    st.tplV2.slotValues = Object.assign({}, st.tplV2.slotValues, { headline: '젤네일 변화', footer_right: '내일도 예쁘게♡' });
    st.tplV2.imageSlots = { before_photo: { src: beforeURL, focal: { x: 0.4, y: 0.6 }, zoom: 1.3 }, after_photo: { src: afterURL, focal: { x: 0.6, y: 0.4 }, zoom: 1.2 } };
    const g0 = (await window.loadGalleryItems()).filter(i => i.source === 'assistant_template').length;
    const s0 = (await window.loadSlotsFromDB()).filter(x => /^asst_/.test(x.id || '')).length;
    const meta = window.buildAssistantTemplateMeta(st, 'before_after');
    out.metaTemplateId = meta && meta.templateId;
    out.metaHasSlots = !!(meta && meta.slotValues && meta.imageSlots);
    const dataUrl = baseURL;   // baked 결과 대용(저장 경로 검증용)
    const rid = 'pinkqa' + Date.now().toString(36);
    window.saveAssistantTemplateResult(dataUrl, { purpose: 'before_after', label: '네일 핑크 QA', rid, templateMeta: meta });
    await sleep(800);
    const g1 = (await window.loadGalleryItems()).filter(i => i.source === 'assistant_template').length;
    const slots = await window.loadSlotsFromDB();
    const s1 = slots.filter(x => /^asst_/.test(x.id || '')).length;
    out.savedGallery = g1 > g0; out.savedSlot = s1 > s0;
    const mySlot = slots.find(x => x.id === 'asst_' + rid);
    out.slotHasTemplateMeta = !!(mySlot && mySlot.templateMeta && mySlot.templateMeta.templateId === ID);

    // 7) 재오픈 복원(restore) → 재적용 + slotValues 복원
    const ok = window.restoreAssistantTemplate(mySlot, { dataUrl: baseURL }, function () {});
    await sleep(500);
    st = PE._internal.getState();
    out.restoreReturn = ok;
    out.restoredId = !!(st && st.tplV2 && st.tplV2.id === ID);
    out.restoredHeadline = st && st.tplV2 && st.tplV2.slotValues && st.tplV2.slotValues.headline;

    return out;
  }, { ID, baseURL, beforeURL, afterURL });

  // 모바일 overflow
  const overflowX = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));

  await browser.close();

  // 판정
  const checks = {
    'gallery 노출': R.galleryVisible,
    'premium 칩 매칭(/^bp-/)': R.premiumChip,
    'before_after 칩(cat:ba)': R.beforeAfterChip,
    'lookupById purpose=before_after': R.purpose === 'before_after',
    'lookupById industry=nail': R.industry === 'nail',
    'kind=before_after': R.kind === 'before_after',
    'BP 7종 노출': R.bpCount === 7,
    'v3 5종 무회귀': R.v3Count === 5,
    '기존 nail-polaroid 무회귀': R.existingNailPolaroid,
    'SKELETON 워터마크 없음': R.noWatermark,
    'apply 성공(tplV2.id)': R.applied,
    '렌더 비-blank(variance)': R.canvasVariance > 20,
    'before/after 교체+focal/zoom 무크래시(diff)': R.swapNoCrash && R.swapDiff > 0,
    'slotValues 편집 반영(diff)': R.slotEditDiff > 0,
    'meta templateId 일치': R.metaTemplateId === ID,
    'meta slotValues+imageSlots': R.metaHasSlots,
    '저장→마무리 갤러리': R.savedGallery,
    '저장→작업실 슬롯': R.savedSlot,
    'slot.templateMeta(P2-2a)': R.slotHasTemplateMeta,
    'restore 재적용': R.restoreReturn && R.restoredId,
    'restore slotValues 복원': R.restoredHeadline === '젤네일 변화',
    'mobile overflow 0': overflowX === 0,
    'pageerror 0': errs.length === 0,
    'console.error 0(benign 제외)': cerrs.length === 0,
  };
  let pass = 0, fail = 0;
  console.log('\n=== bp-ba-nail-pink-polaroid QA (v428) ===');
  for (const [k, v] of Object.entries(checks)) { console.log((v ? '  ✅ ' : '  ❌ ') + k); v ? pass++ : fail++; }
  console.log(`\n  세부: bpCount=${R.bpCount} v3Count=${R.v3Count} subPxMine=${R.subPxMine} subPxFake=${R.subPxFake} canvasVar=${R.canvasVariance} swapDiff=${R.swapDiff} slotEditDiff=${R.slotEditDiff} overflowX=${overflowX}`);
  if (errs.length) { console.log('\n  pageerrors:'); errs.slice(0, 8).forEach(e => console.log('   - ' + e)); }
  if (cerrs.length) { console.log('\n  console.errors(non-benign):'); cerrs.slice(0, 8).forEach(e => console.log('   - ' + e)); }
  console.log(`\n  결과: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('QA 실행 오류:', e); process.exit(2); });
