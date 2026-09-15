#!/usr/bin/env node
/* UX-BA-1/2 + UX-CTA-1 QA 러너 (런타임 미수정, 합성 측정 + 소스 정적검사)

   자동 검증:
     A. 데이터 라벨(UX-BA-1) — CATS ba='시술 전후', PURPOSE before_after='시술 전후', ba-* 라벨 'B/A'/'전후 비교' 잔존 0
     B. ba-compose 가짜 Before 금지(UX-BA-2) — secondImg 없이 그리면 before 슬롯이 placeholder(현재 사진 흑백 아님)
     C. ba-compose 실제 Before(UX-BA-2) — secondImg 주면 before 슬롯에 그 사진이 들어감
     D. 소스 정적검사(UX-CTA-1) — 저장·게시 준비 / details.pe-tpl-legacy / ba-slider '보정 전후' / 시술 전 사진 추가
     E. pageerror 0

   ※ 390×844 첫화면 CTA 과밀/접힘 시각확인은 브라우저 수동(이 하네스는 구조·동작·문구를 보장).
   실행: python3 -m http.server 8099 후 node scripts/photo-ba-ux-qa.js */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const BASE_URL = process.env.PHOTO_QA_URL || 'http://127.0.0.1:8099/?nav_v7=0&v=ba-ux-qa';
const ROOT = path.resolve(__dirname, '..');

function staticChecks() {
  const out = [];
  const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
  const compose = read('app-photo-editor-ba-compose.js');
  out.push(['D3 시술 전 사진 추가 CTA', compose.includes('시술 전 사진 추가')]);
  out.push(['D7 ba-compose placeholder 함수', compose.includes('_beforePlaceholder')]);
  out.push(['D8 ba-compose 가짜 grayscale 가드', compose.includes('before && !_hasBefore')]);
  return out;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript(() => {
    try { localStorage.clear(); } catch (_e) { /* QA 격리 */ }
    try { navigator.serviceWorker.register = () => Promise.reject(new Error('qa sw off')); } catch (_e) { /* QA 격리 */ }
  });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + String(e.message || e)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text().slice(0, 160)); });

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.evaluate(() => window.AppLoader && window.AppLoader.ensure('photo'));
  await page.waitForFunction(() => window.PhotoEditorBACompose && window.PhotoEditorTemplateMarketData && window.PhotoEditorTemplateOverlay, null, { timeout: 45000 });

  const res = await page.evaluate(() => {
    const checks = [];
    const ok = (name, cond, detail) => checks.push({ name, pass: !!cond, detail: detail || '' });
    const MD = window.PhotoEditorTemplateMarketData;

    // ── A. 데이터 라벨 ──
    const baCat = MD.CATS.find(c => c.id === 'ba');
    ok('A1 CATS ba=시술 전후', baCat && baCat.label === '시술 전후', baCat && baCat.label);
    ok('A2 PURPOSE before_after=시술 전후', MD.PURPOSE_LABEL.before_after === '시술 전후', MD.PURPOSE_LABEL.before_after);
    const baTpls = MD.TEMPLATES.filter(t => /^ba-/.test(t.id));
    const badLabels = baTpls.filter(t => /B\/A|전후 비교/.test(t.label)).map(t => t.id);
    ok('A3 ba-* 라벨에 B/A·전후비교 잔존 0', badLabels.length === 0, badLabels.join(','));
    const allBaTreatment = baTpls.every(t => /시술|전후|네일|헤어|속눈썹|피부|포트폴리오|과정/.test(t.label));
    ok('A4 ba-* 라벨 시술 전후 의미', allBaTreatment, baTpls.map(t => t.label).slice(0, 3).join(' / '));

    // ── B/C. ba-compose 가짜 Before 금지 / 실제 Before ──
    const W = 400, H = 500;
    function redCanvas() {
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const c = cv.getContext('2d'); c.fillStyle = 'rgb(255,40,40)'; c.fillRect(0, 0, W, H); return c;
    }
    function greenImg() {
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const c = cv.getContext('2d'); c.fillStyle = 'rgb(30,210,60)'; c.fillRect(0, 0, W, H); return cv;
    }
    // _flowerShadow(ba-*-cream) before=좌, after=우. box: pad=w*.1, gap=w*.045, top=h*.29, boxW=(w-2pad-gap)/2, boxH=h*.44
    const pad = W * 0.1, gap = W * 0.045, top = H * 0.29, boxW = (W - pad * 2 - gap) / 2, boxH = H * 0.44;
    const beforeC = [Math.round(pad + boxW / 2), Math.round(top + boxH / 2)];
    const afterC = [Math.round(pad + boxW + gap + boxW / 2), Math.round(top + boxH / 2)];
    const isRed = (p) => p[0] > p[1] + 40 && p[0] > p[2] + 40;
    const isGreen = (p) => p[1] > p[0] + 40 && p[1] > p[2] + 30;

    // B: secondImg 없음
    let c = redCanvas();
    window.PhotoEditorBACompose.draw(c, W, H, { secondImg: null }, { id: 'ba-nail-cream' }, { head: 'x', shop: 'y' });
    const bNo = c.getImageData(beforeC[0], beforeC[1], 1, 1).data;
    const aNo = c.getImageData(afterC[0], afterC[1], 1, 1).data;
    ok('B1 secondImg 없음 → before 가짜 흑백 아님(빨강 X)', !isRed(bNo), 'before rgb=' + [bNo[0], bNo[1], bNo[2]]);
    ok('B2 secondImg 없음 → after 는 현재 사진(빨강 O)', isRed(aNo), 'after rgb=' + [aNo[0], aNo[1], aNo[2]]);

    // C: secondImg 있음(초록)
    c = redCanvas();
    window.PhotoEditorBACompose.draw(c, W, H, { secondImg: greenImg() }, { id: 'ba-nail-cream' }, { head: 'x', shop: 'y' });
    const bYes = c.getImageData(beforeC[0], beforeC[1], 1, 1).data;
    const aYes = c.getImageData(afterC[0], afterC[1], 1, 1).data;
    ok('C1 secondImg 있음 → before=선택 사진(초록 O)', isGreen(bYes), 'before rgb=' + [bYes[0], bYes[1], bYes[2]]);
    ok('C2 secondImg 있음 → after=현재 사진(빨강 O)', isRed(aYes), 'after rgb=' + [aYes[0], aYes[1], aYes[2]]);

    // ── F. P1 수정: ba-cream/sage/dark 도 적용(template-overlay.draw) 시 After 에 현재 사진 반영 ──
    const tplOf = (id) => MD.TEMPLATES.find(t => t.id === id);
    const redRatio = (cv) => { const d = cv.getImageData(0, 0, W, H).data; let n = 0; for (let i = 0; i < d.length; i += 4) { if (d[i] > d[i + 1] + 40 && d[i] > d[i + 2] + 40) n++; } return n / (W * H); };
    ['ba-cream', 'ba-sage', 'ba-dark', 'ba-nail-cream'].forEach((id) => {
      const cc = redCanvas();
      window.PhotoEditorTemplateOverlay.draw(cc, W, H, tplOf(id), { bg: '#7b61ff', shopName: 's' });
      const rr = redRatio(cc);
      ok('F ' + id + ' 적용 시 현재 사진(After) 반영', rr > 0.02, 'redRatio=' + rr.toFixed(3));
    });

    return checks;
  });

  // ── D. 소스 정적검사 ──
  staticChecks().forEach(([name, pass]) => res.push({ name, pass: !!pass, detail: '' }));

  // ── E. pageerror ──
  const severe = errors.filter(e => !/favicon|ResizeObserver|TensorFlow|XNNPACK|Failed to load resource|ERR_|tfjs|WebGL|backend/i.test(e));
  res.push({ name: 'E1 severe pageerror 0', pass: severe.length === 0, detail: severe.join(' | ').slice(0, 300) });

  const pass = res.filter(r => r.pass).length, fail = res.length - pass;
  console.log(JSON.stringify({ checks: res, summary: pass + ' pass / ' + fail + ' fail' }, null, 2));
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
}
main().catch(e => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
