/* [STAGE F] 교정 폐루프 — **학습이 한쪽으로만 쌓이지 않는지** 잠근다.
 *
 * 조사 결과 교정(negative) 경로는 이미 T8 배관으로 돌고 있었다.
 * 브라우저에서 확인했다: 우리 값 'center' → negative 2, 원장 선택 'left' → positive 2.
 *
 * 진짜 빈틈은 **비대칭**이었다. 우리 값이 틀렸을 때만 negative 가 남고
 * 맞았을 때는 아무 기록도 안 남는다 → 90% 맞아도 negative 만 누적돼 '싫어하는 값'이 된다.
 * 그래서 얹은 값을 baseline 에 등록한다. 단 **약한 증거**(publishedKeptAuto=1)로만.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../..');
const edSrc = fs.readFileSync(path.join(ROOT, 'js/itd-editor/itd-editor.js'), 'utf8');
const sigSrc = fs.readFileSync(path.join(ROOT, 'js/workspace/work-memory-signals.js'), 'utf8');
const prefSrc = fs.readFileSync(path.join(ROOT, 'js/workspace/work-memory-preferences.js'), 'utf8');

describe('기존 체계를 재사용한다 — 새 이벤트·저장소 없음', () => {
  test('새 이벤트 이름을 만들지 않았다', () => {
    // AUTO_APPLIED / MANUAL_CHANGED 같은 병렬 체계를 만들면 T8 과 두 벌이 된다.
    expect(edSrc).not.toMatch(/AUTO_APPLIED|MANUAL_CHANGED|PUBLISHED_WITHOUT_CHANGE/);
  });

  test('교정은 기존 신호(font/color/alignment_changed)를 그대로 쓴다', () => {
    ['font_changed', 'color_changed', 'alignment_changed'].forEach((e) => {
      expect(edSrc).toMatch(new RegExp("_sig\\('" + e + "'"));
    });
  });

  test('WMPrefs 를 다시 집계하지 않는다 — 편집기는 신호만 낸다', () => {
    expect(edSrc).not.toMatch(/WMPrefs\.learn|WMPrefs\.list/);
  });
});

describe('🔴 우리 값을 원장 취향으로 둔갑시키지 않는다', () => {
  test('얹은 값은 _src:plan 으로 보낸다', () => {
    expect(edSrc).toMatch(/var row = \{ type: 'text', _src: 'plan' \}/);
  });

  test('T8 이 plan 을 자동적용으로 인정한다 (약한 증거)', () => {
    expect(prefSrc).toMatch(/if \(l\._src === 'wm' \|\| l\._src === 'plan'\) keptAuto\[feat\] = 1;/);
  });

  test('publishedKeptAuto 는 여전히 1 — 자기강화 방지선을 안 건드렸다', () => {
    expect(prefSrc).toMatch(/publishedKeptAuto: 1/);
    expect(prefSrc).toMatch(/publishedKept: 3/);
    expect(prefSrc).toMatch(/replaced: 2/);
  });

  test('되돌릴 UI 가 없는 축(외곽선·그림자)은 baseline 에 안 넣는다', () => {
    // 유지가 동의를 뜻하지 않는 축이다 — STAGE D 의 NO_SIGNAL 정책과 같은 이유.
    const i = edSrc.indexOf('function _planBaseline');
    const seg = edSrc.slice(i, edSrc.indexOf('\n  }', edSrc.indexOf('rows.length', i)));
    expect(seg).not.toMatch(/_planAxes\.stroke|_planAxes\.shadow/);
    expect(seg).toMatch(/_planAxes\.font/);
    expect(seg).toMatch(/_planAxes\.align/);
  });
});

describe('세션 안전 — 교정 등록이 경계를 안 넘는다', () => {
  test('baseline 등록도 alive() 뒤에서만', () => {
    expect(edSrc).toMatch(/if \(alive\(\)\) _planBaseline\(\);/);
  });

  test('세션이 없으면 조용히 무시한다', () => {
    expect(sigSrc).toMatch(/if \(!_cur \|\| !Array\.isArray\(layers\) \|\| !layers\.length\) return false;/);
  });

  test('baseline 은 신호가 아니라 기준선 — note() 계약을 안 건드렸다', () => {
    // note() 는 여전히 system 스코프를 막는다(원장 조작만 신호).
    expect(sigSrc).toMatch(/function note\(event, payload\) \{[\s\S]{0,120}if \(isSystem\(\)\) return false;/);
  });
});

describe('안전장치 우선순위 — 교정이 못 이긴다', () => {
  /* ⚠️ 고정 길이로 자르면 다음 함수까지 넘어간다(첫 버전에서 그랬다).
     함수 경계까지만 본다 — 남의 코드를 내 검사 대상에 넣으면 오탐이 난다. */
  function planBaselineBody() {
    const i = edSrc.indexOf('function _planBaseline');
    const end = edSrc.indexOf('\n  }', edSrc.indexOf('window.WMSignals.baseline(rows)', i));
    return edSrc.slice(i, end);
  }

  test('교정 학습이 가독성·Safety 코드를 건드리지 않는다', () => {
    expect(planBaselineBody()).not.toMatch(/TextReadability|SafetyShadow|webkitTextStroke/);
  });

  test('교정은 값을 기록만 한다 — 편집 결과를 바꾸지 않는다', () => {
    expect(planBaselineBody()).not.toMatch(/L\.(font|color|align|x|y|fontSize)\s*=[^=]/);
  });
});
