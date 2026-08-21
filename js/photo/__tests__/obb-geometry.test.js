/* OBB geometry 정확성 계약 — [Phase 5.4 사전검증]
 * 이 모듈은 **어디에도 연결돼 있지 않다.** 연결 시점(회전 표본이 많다고 판명될 때)에
 * 계산이 맞다는 걸 이미 증명해두는 게 목적이다.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'js/photo/obb-geometry.js'), 'utf8');
function load() { const w = {}; new Function('window', src)(w); return w.OBBGeometry; }
const R = (cx, cy, w, h, rot) => ({ cx, cy, w, h, rot: rot || 0 });

describe('[Phase 5.4] OBB — 알려진 정답과 일치한다', () => {
  const G = load();

  test('회전해도 면적은 변하지 않는다', () => {
    const a = G.polygonArea(G.toPolygon(R(.5, .5, .4, .2, 0), 1));
    [15, 30, 45, 60, 90].forEach((d) => {
      expect(G.polygonArea(G.toPolygon(R(.5, .5, .4, .2, d), 1))).toBeCloseTo(a, 9);
    });
  });

  test('45° 동심 정사각형 교집합 = 정팔각형 2(√2−1)a²', () => {
    const a = 0.4;
    const got = G.intersectionArea(G.toPolygon(R(.5, .5, a, a, 0), 1), G.toPolygon(R(.5, .5, a, a, 45), 1));
    expect(got).toBeCloseTo(2 * (Math.SQRT2 - 1) * a * a, 9);
  });

  test('자기 자신과의 교집합 = 자기 면적', () => {
    const p = G.toPolygon(R(.5, .5, .4, .2, 30), 1);
    expect(G.intersectionArea(p, p)).toBeCloseTo(G.polygonArea(p), 9);
  });

  test('떨어진 사각형은 0', () => {
    expect(G.intersectionArea(G.toPolygon(R(.15, .15, .1, .1, 0), 1),
      G.toPolygon(R(.85, .85, .1, .1, 0), 1))).toBe(0);
  });

  test('정규화 좌표의 축척 차이(aspect)를 보정한다', () => {
    /* 4:5 사진에서 aspect 를 무시하고 회전시키면 사각형이 찌그러져 면적이 달라진다.
       보정하면 회전 전후 면적이 같아야 한다. */
    const withA = G.polygonArea(G.toPolygon(R(.5, .5, .3, .1, 45), 0.8));
    const noRot = G.polygonArea(G.toPolygon(R(.5, .5, .3, .1, 0), 0.8));
    expect(withA).toBeCloseTo(noRot, 9);
  });

  test('겹침 비율을 하나로 합치지 않는다 (SafetyShadow 와 같은 의미)', () => {
    const r = G.overlapRatios(G.toPolygon(R(.5, .5, .4, .2, 20), 1), G.toPolygon(R(.5, .5, .4, .4, 0), 1));
    ['layerCoveredRatio', 'subjectCoveredRatio', 'iou', 'intersection'].forEach((k) => expect(r).toHaveProperty(k));
  });
});

describe('[Phase 5.4] 아직 아무 데도 연결되지 않았다', () => {
  test('OBBGeometry 를 참조하는 코드가 없다', () => {
    const hits = [];
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) { if (!['node_modules', '.git', '__tests__', '.claude'].includes(e.name)) walk(p); continue; }
        if (!e.name.endsWith('.js') || e.name === 'obb-geometry.js') continue;
        if (/OBBGeometry\s*\./.test(fs.readFileSync(p, 'utf8'))) hits.push(path.relative(ROOT, p));
      }
    };
    walk(path.join(ROOT, 'js'));
    expect(hits).toEqual([]);
  });

  test('SafetyShadow 의 회전 제외 규칙은 그대로다', () => {
    const sh = fs.readFileSync(path.join(ROOT, 'js/photo/safety-shadow.js'), 'utf8');
    expect(sh).toMatch(/rotToleranceDeg: 5/);
    // 주석에 "OBB 필요" 라고 적어둔 건 문제가 아니다 — 잡아야 할 건 **호출**이다
    expect(sh).not.toMatch(/OBBGeometry\s*\.|orientedRectToPolygon\s*\(/);
  });
});
