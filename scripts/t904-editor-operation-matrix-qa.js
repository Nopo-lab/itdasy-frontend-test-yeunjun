/* T-904 사진 편집기 실제 조작 검사.
 * 합성 이미지 1장을 실제 편집기에 열어 20회 보정, 전체 되돌리기/다시 실행,
 * 초기화, 저장, 재열기를 브라우저 DOM과 저장된 editState로 확인한다. */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const BASE_URL = process.env.PHOTO_QA_URL || 'http://127.0.0.1:8092/?v=t904-matrix';
const MANIFEST = process.env.PHOTO_QA_MANIFEST;
const REPORT = process.env.PHOTO_MATRIX_REPORT || path.join(ROOT, 'output', 't904-editor-operation-matrix.json');
const SCREENSHOT = path.join(ROOT, 'output', 'playwright', 't904-editor-operation-matrix.png');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function loadFixture() {
  assert(MANIFEST, 'PHOTO_QA_MANIFEST가 필요합니다.');
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const item = manifest.items && manifest.items[0];
  assert(item && item.file, 'manifest 첫 사진을 찾지 못했습니다.');
  const file = path.resolve(item.file);
  const mime = path.extname(file).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
  return { item, dataUrl: `data:${mime};base64,${fs.readFileSync(file).toString('base64')}` };
}

async function setSlider(page, key, value) {
  await page.$eval(`[data-panel="adjust"] [data-adj="${key}"]`, (input, next) => {
    input.value = String(next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

async function sliderValues(page) {
  return page.$$eval('[data-panel="adjust"] [data-adj]', inputs => Object.fromEntries(
    inputs.map(input => [input.getAttribute('data-adj'), Number(input.value)]),
  ));
}

async function clickMany(page, selector, count) {
  for (let i = 0; i < count; i++) await page.click(selector);
}

(async () => {
  const fixture = loadFixture();
  const errors = [];
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  page.on('pageerror', error => errors.push(`page: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });

  try {
    await page.addInitScript(() => {
      try { localStorage.clear(); } catch (_error) { void _error; }
      try { navigator.serviceWorker.register = () => Promise.reject(new Error('qa sw off')); } catch (_error) { void _error; }
    });
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1200);
    await page.addScriptTag({ path: path.join(ROOT, 'dev', 'qa-photo-harness.js') });
    const boot = await page.evaluate(() => window.QA.boot());
    assert(boot.editor, '사진 편집기가 로드되지 않았습니다.');
    await page.evaluate(async photo => {
      window.__t904EditorOut = await window.QA.openEditor({ photo, ratio: '4:5', wait: 800 });
    }, fixture.dataUrl);
    await page.click('[data-tool="adjust"]');

    const initial = await sliderValues(page);
    assert(JSON.stringify(initial) === JSON.stringify({ b: 100, c: 100, s: 100, w: 0, sh: 0 }), `초기값 오류: ${JSON.stringify(initial)}`);

    const operations = [
      ['b', 106], ['c', 104], ['s', 108], ['w', 4], ['sh', 3],
      ['sh', 8], ['w', 8], ['s', 112], ['c', 108], ['b', 110],
      ['b', 104], ['c', 99], ['s', 98], ['w', 1], ['sh', 0],
      ['sh', 4], ['w', 3], ['s', 101], ['c', 103], ['b', 108],
    ];
    for (const [key, value] of operations) await setSlider(page, key, value);

    const after20 = await sliderValues(page);
    assert(JSON.stringify(after20) === JSON.stringify({ b: 108, c: 103, s: 101, w: 3, sh: 4 }), `20회 결과 오류: ${JSON.stringify(after20)}`);
    assert(await page.$eval('[data-r="undo"]', button => !button.disabled), '되돌리기 버튼이 활성화되지 않았습니다.');

    await clickMany(page, '[data-r="undo"]', operations.length);
    const afterUndoAll = await sliderValues(page);
    assert(JSON.stringify(afterUndoAll) === JSON.stringify(initial), `전체 되돌리기 오류: ${JSON.stringify(afterUndoAll)}`);
    assert(await page.$eval('[data-r="redo"]', button => !button.disabled), '다시 실행 버튼이 활성화되지 않았습니다.');

    await clickMany(page, '[data-r="redo"]', operations.length);
    const afterRedoAll = await sliderValues(page);
    assert(JSON.stringify(afterRedoAll) === JSON.stringify(after20), `전체 다시 실행 오류: ${JSON.stringify(afterRedoAll)}`);

    await page.click('[data-r="adjReset"]');
    const afterReset = await sliderValues(page);
    assert(JSON.stringify(afterReset) === JSON.stringify(initial), `초기화 오류: ${JSON.stringify(afterReset)}`);
    await page.click('[data-r="undo"]');
    assert(JSON.stringify(await sliderValues(page)) === JSON.stringify(after20), '초기화 되돌리기 오류');

    await page.click('[data-r="done"]');
    await page.waitForFunction(() => window.QA.cap.dones.length === 1, null, { timeout: 30000 });
    const saved = await page.evaluate(() => window.QA.cap.dones[0]);
    assert(saved.dataUrl && saved.dataUrl.startsWith('data:image/'), '저장 결과 이미지가 없습니다.');
    assert(saved.editState && saved.editState.adj && saved.editState.adj[0], '저장된 편집 상태가 없습니다.');

    await page.evaluate(async ({ photo, editState }) => {
      await window.QA.openEditor({ photo, ratio: '4:5', editState, wait: 800 });
    }, { photo: fixture.dataUrl, editState: saved.editState });
    await page.click('[data-tool="adjust"]');
    const reopened = await sliderValues(page);
    assert(JSON.stringify(reopened) === JSON.stringify(after20), `재열기 복원 오류: ${JSON.stringify(reopened)}`);
    assert(await page.$eval('[data-r="undo"]', button => button.disabled), '재열기 직후 되돌리기가 비어 있지 않습니다.');

    fs.mkdirSync(path.dirname(SCREENSHOT), { recursive: true });
    await page.screenshot({ path: SCREENSHOT, fullPage: true });
    const report = {
      result: 'PASS',
      checkedAt: new Date().toISOString(),
      build: boot.build,
      fixture: fixture.item,
      executed: {
        sequentialAdjustments: operations.length,
        reverseOrderCovered: true,
        undoEverything: true,
        redoEverything: true,
        reset: true,
        resetUndo: true,
        save: true,
        reopen: true,
      },
      initial,
      after20,
      afterUndoAll,
      afterRedoAll,
      afterReset,
      reopened,
      outputBytes: Buffer.byteLength(saved.dataUrl, 'utf8'),
      screenshot: SCREENSHOT,
      errors,
    };
    fs.mkdirSync(path.dirname(REPORT), { recursive: true });
    fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 2;
});
