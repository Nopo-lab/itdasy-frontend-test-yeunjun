/* Phase 1 관측 계층 계약 테스트.
 *
 * 이 테스트들이 잠그는 것은 "기능이 동작한다"가 아니라 **"동작을 바꾸지 않는다"** 이다.
 * Phase 1 의 계약은 관측뿐이므로, 여기서 깨지면 Phase 1 이 Phase 1 이 아니게 된다.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const pctxSrc = fs.readFileSync(path.join(ROOT, 'js/photo/photo-context.js'), 'utf8');
const metricsSrc = fs.readFileSync(path.join(ROOT, 'js/workspace/wm-metrics.js'), 'utf8');
const shadowSrc = fs.readFileSync(path.join(ROOT, 'js/workspace/edit-plan-shadow.js'), 'utf8');

function loadIntoWindow(srcList) {
  const win = {};
  const sandboxDoc = {
    createElement: () => {
      let W = 0, H = 0;
      return {
        set width(v) { W = v; }, get width() { return W; },
        set height(v) { H = v; }, get height() { return H; },
        getContext: () => ({
          drawImage() {},
          getImageData: (a, b, w, h) => {
            const d = new Uint8ClampedArray(w * h * 4);
            for (let y = 0; y < h; y++) {
              for (let x = 0; x < w; x++) {
                const i = (y * w + x) * 4;
                const skin = x > w * 0.66 && y > h * 0.66;
                d[i] = skin ? 200 : 40; d[i + 1] = skin ? 150 : 60;
                d[i + 2] = skin ? 130 : 180; d[i + 3] = 255;
              }
            }
            return { data: d };
          }
        })
      };
    }
  };
  global.window = win;
  global.document = sandboxDoc;
  global.performance = { now: () => 0 };
  global.Image = function () { setTimeout(() => this.onload && this.onload(), 0); };
  Object.defineProperty(global.Image.prototype, 'src', { set() {}, configurable: true });
  Object.defineProperty(global.Image.prototype, 'naturalWidth', { get() { return 480; }, configurable: true });
  Object.defineProperty(global.Image.prototype, 'naturalHeight', { get() { return 600; }, configurable: true });
  srcList.forEach((s) => { new Function('window', 'document', 'Image', 'performance', s)(win, sandboxDoc, global.Image, global.performance); });
  return win;
}

describe('[Phase 1] PhotoContext — 관측 전용 계약', () => {
  test('공개 API 는 of/peek/stats 뿐 — 배치를 바꾸는 함수가 없다', () => {
    const win = loadIntoWindow([pctxSrc]);
    expect(Object.keys(win.PhotoContext).sort()).toEqual(['SCHEMA', 'of', 'peek', 'stats']);
    // apply/place/layout 같은 '적용' 동사가 공개면 Phase 1 계약 위반
    expect(Object.keys(win.PhotoContext).join(',')).not.toMatch(/apply|place|layout|anchor/i);
  });

  test('subjectZone 을 실제로 계산한다 (피부 우하단 → lower-right)', async () => {
    const win = loadIntoWindow([pctxSrc]);
    const ctx = await win.PhotoContext.of('x.png');
    expect(ctx.subjectZone).toBe('lower-right');
    expect(ctx.subjectRegion).toBeTruthy();
  });

  test('실패는 던지지 않고 null — 이 모듈이 죽어도 앱은 그대로 동작해야 한다', async () => {
    const win = loadIntoWindow([pctxSrc]);
    await expect(win.PhotoContext.of('')).resolves.toBeNull();
    await expect(win.PhotoContext.of(null)).resolves.toBeNull();
  });

  test('결과에 원본 바이트·dataURL·EXIF·임베딩이 없다', async () => {
    const win = loadIntoWindow([pctxSrc]);
    const ctx = await win.PhotoContext.of('x.png');
    const json = JSON.stringify(ctx);
    expect(json).not.toMatch(/data:/);
    ['src', 'dataUrl', 'bytes', 'exif', 'embedding', 'landmarks'].forEach((k) => {
      expect(Object.prototype.hasOwnProperty.call(ctx, k)).toBe(false);
    });
  });

  test('같은 사진은 재계산하지 않는다 (L0 동일 객체 반환)', async () => {
    const win = loadIntoWindow([pctxSrc]);
    const a = await win.PhotoContext.of('x.png');
    const b = await win.PhotoContext.of('x.png');
    expect(b).toBe(a);
    expect(win.PhotoContext.stats().l0hit).toBeGreaterThan(0);
  });

  test('피부 임계가 safe-zone.js 와 동일하다 (같은 사진에 다른 답이 나오면 안 된다)', () => {
    const szSrc = fs.readFileSync(path.join(ROOT, 'js/itd-editor/safe-zone.js'), 'utf8');
    // YCbCr 범위 상수
    ['77', '130', '134', '176'].forEach((n) => {
      expect(pctxSrc).toContain(n);
      expect(szSrc).toContain(n);
    });
    expect(pctxSrc).toMatch(/0\.03/);
    expect(pctxSrc).toMatch(/0\.72/);
    expect(szSrc).toMatch(/0\.03/);
    expect(szSrc).toMatch(/0\.72/);
  });
});

describe('[Phase 1] WMMetrics — 격리와 무침습', () => {
  test('tenant 키는 T8 과 같은 last_user_id 를 쓴다 (격리 경계는 한 곳에서만 정의)', () => {
    expect(metricsSrc).toMatch(/getItem\('last_user_id'\)/);
    // 주석에는 사고 경위로 옛 키 이름이 남아 있을 수 있다 — 검사 대상은 **실제 getItem 호출**뿐.
    expect(metricsSrc).not.toMatch(/getItem\(['"]itdasy:tenant['"]\)/);
    const sigSrc = fs.readFileSync(path.join(ROOT, 'js/workspace/work-memory-signals.js'), 'utf8');
    expect(sigSrc).toMatch(/getItem\('last_user_id'\)/);
  });

  test('WMSignals.begin 이 null 이면 세션을 세지 않는다 (유령 세션 방지)', () => {
    // QA 에서 실제로 발생했던 회귀 — 로그아웃 상태에서 세션·outcome 이 유령으로 쌓였다
    expect(metricsSrc).toMatch(/if \(!r\) \{ _cur = null; return r; \}/);
  });

  test('원본이 false 를 반환한 신호는 세지 않는다 (system 스코프 오염 차단)', () => {
    expect(metricsSrc).toMatch(/if \(r === true\)/);
  });

  test('preview_only·abandoned 는 계측 전용 — 학습(WMLearn)으로 넘기지 않는다', () => {
    expect(metricsSrc).toMatch(/preview_only/);
    expect(metricsSrc).toMatch(/abandoned/);
    /* 계측 모듈이 학습 API 를 **호출**하면 가중치 0 보장이 깨진다.
       주석에서 WMLearn 을 언급하는 건 문제가 아니다 — 잡아야 할 건 호출이다. */
    expect(metricsSrc).not.toMatch(/window\.WMLearn|WMLearn\s*\./);
    expect(metricsSrc).not.toMatch(/window\.WMPrefs|WMPrefs\s*\./);
  });

  test('T8 파일을 수정하지 않는다 — 래핑으로만 관측', () => {
    expect(metricsSrc).toMatch(/oNote\.apply/);
    expect(metricsSrc).toMatch(/oBegin\.apply/);
  });
});

describe('[Phase 1] 위치 학습 confound 방어 (Phase 0 center 75% 교훈)', () => {
  const prefSrc = fs.readFileSync(path.join(ROOT, 'js/workspace/work-memory-preferences.js'), 'utf8');

  test('BASE_FEATURES(무수정 유지 → positive)에 x/y 가 없다', () => {
    const m = prefSrc.match(/var BASE_FEATURES = \[([^\]]*(?:\][^;]*)*?)\];/);
    expect(m).toBeTruthy();
    expect(m[1]).not.toMatch(/'x'/);
    expect(m[1]).not.toMatch(/'y'/);
    expect(m[1]).toMatch(/font/);
  });

  test('위치는 position_changed 이벤트를 통해서만 학습된다', () => {
    expect(prefSrc).toMatch(/position_changed:\s*\[\['x',\s*'x'\],\s*\['y',\s*'y'\]\]/);
  });

  test('교체당한 좌표를 negative 로 세지 않는다 (옮긴 것 ≠ 싫어한 것)', () => {
    expect(prefSrc).toMatch(/교체당한 좌표/);
  });
});

describe('[Phase 2 준비] EditPlanShadow — 자기채점 금지', () => {
  test('wouldImprove 를 노출하지 않는다', () => {
    const win = loadIntoWindow([shadowSrc]);
    expect(Object.keys(win.EditPlanShadow)).not.toContain('wouldImprove');
    const A = win.EditPlanShadow.compareSafety([], [], null);
    expect(Object.prototype.hasOwnProperty.call(A, 'wouldImprove')).toBe(false);
  });

  test('Shadow A 와 B 는 별도 함수 — 한 점수로 합치지 않는다', () => {
    const win = loadIntoWindow([shadowSrc]);
    expect(typeof win.EditPlanShadow.compareSafety).toBe('function');
    expect(typeof win.EditPlanShadow.comparePersonalization).toBe('function');
    const A = win.EditPlanShadow.compareSafety([], [], null);
    const B = win.EditPlanShadow.comparePersonalization(null, null);
    expect(A.kind).toBe('A');
    expect(B.kind).toBe('B');
  });

  test('피사체를 모르면 wouldOverlap 은 null (모르는 걸 0 으로 쓰지 않는다)', () => {
    const win = loadIntoWindow([shadowSrc]);
    const r = win.EditPlanShadow.compareSafety(
      [{ type: 'text', x: 0.7, y: 0.7, w: 0.3, size: 0.06 }],
      [{ type: 'text', x: 0.2, y: 0.2, w: 0.3, size: 0.06 }], null);
    expect(r.wouldOverlap).toBeNull();
    expect(r.subjectKnown).toBe(false);
  });

  test('겹침을 실제로 계산한다', () => {
    const win = loadIntoWindow([shadowSrc]);
    const pctx = { subjectRegion: { x: 0.6, y: 0.6, w: 0.35, h: 0.35 } };
    const r = win.EditPlanShadow.compareSafety(
      [{ type: 'text', x: 0.75, y: 0.78, w: 0.3, size: 0.06 }],
      [{ type: 'text', x: 0.20, y: 0.15, w: 0.3, size: 0.06 }], pctx);
    expect(r.existing.overlapCount).toBe(1);
    expect(r.proposed.overlapCount).toBe(0);
    expect(r.wouldMove).toBe(1);
  });

  test('어디에서도 호출되지 않는다 (Phase 2 게이트 전 적용 0%)', () => {
    const jsDir = path.join(ROOT, 'js');
    const hits = [];
    (function walk(d) {
      fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
        const p = path.join(d, e.name);
        if (e.isDirectory()) { if (e.name !== '__tests__') walk(p); return; }
        if (!e.name.endsWith('.js') || e.name === 'edit-plan-shadow.js') return;
        if (/EditPlanShadow\./.test(fs.readFileSync(p, 'utf8'))) hits.push(p);
      });
    })(jsDir);
    expect(hits).toEqual([]);
  });
});
