'use strict';

/* [BUG-07 2026-09-10] 같은 편집이 창 크기에 따라 **줄바꿈이 달라지던 것** — 회귀 고정.
 *
 * 무엇이 문제였나(브라우저 실측):
 *   복원은 저장된 상대폭으로 max-width 를, 상대크기로 폰트를 되살린다. 그런데
 *   **폰트 메트릭이 크기에 선형이 아니다** — 같은 문구의 자연 폭 비율이
 *   스테이지 505→533 에서 0.70446 → 0.71262 (1.16% 차) 로 움직인다.
 *   여유가 적은 문구는 이 몇 px 때문에 한 줄이 두 줄로 접힌다.
 *   (2026-09-03 에 0.47px 부족으로 같은 사고가 있었고 `+1px` 로 땜질했지만 메트릭 변동은 못 덮는다.)
 *
 *   A/B 실측(stage 533×666, w=0.70537):
 *     lines 없음(옛 데이터) → 2줄, max-width 377px
 *     lines:1 (가드)        → 1줄, max-width 377→394px 로 확장
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js/itd-editor/itd-editor.js'), 'utf8');

describe('BUG-07 · 줄바꿈은 모델 속성이다', () => {
  test('저장할 때 그때의 줄 수를 함께 싣는다', () => {
    expect(SRC).toMatch(/base\.lines = _lineCount\(L\.tx, L\.fontSize\)/);
  });

  test('복원이 줄 수를 지킨다 — 한 줄이면 자연 폭을 직접 재고, 여러 줄이면 넓혀간다', () => {
    const add = SRC.slice(SRC.indexOf('function addShopLayer'));
    // 한 줄 케이스: 줄바꿈을 잠깐 끄고 자연 폭을 재서 한 번에 맞춘다(루프보다 정확)
    expect(add).toMatch(/_want === 1/);
    expect(add).toMatch(/whiteSpace = 'pre'; t\.style\.maxWidth = 'none'/);
    expect(add).toMatch(/_nat > _cur/);
    // 여러 줄 케이스: 상한 + 무한루프 가드
    expect(add).toMatch(/while \(_lineCount\(t, L\.fontSize\) > _want/);
    expect(add).toMatch(/_cap = Math\.floor\(R\.width \* 0\.98\)/);
    expect(add).toMatch(/_guard\+\+ < 40/);
  });

  test('원장이 직접 정한 고정폭(wrapW)은 건드리지 않는다', () => {
    const add = SRC.slice(SRC.indexOf('function addShopLayer'));
    expect(add).toMatch(/spec\.lines > 0 && spec\.wrapW == null/);
  });

  test('줄 수 계산은 lineHeight 기준이고 최소 1줄이다', () => {
    const fn = SRC.slice(SRC.indexOf('function _lineCount'), SRC.indexOf('function _serLayer'));
    expect(fn).toMatch(/getComputedStyle\(el\)\.lineHeight/);
    expect(fn).toMatch(/Math\.max\(1,/);
    expect(fn).toMatch(/catch/);          // 측정 실패해도 복원을 막지 않는다
  });

  test('옛 저장본(lines 없음)에서도 복원이 깨지지 않는다 — 가드는 선택적이다', () => {
    const add = SRC.slice(SRC.indexOf('function addShopLayer'));
    // spec.lines 가 없으면 루프 자체가 안 돈다(조건이 > 0)
    expect(add).toMatch(/if \(spec\.lines > 0 &&/);
  });
});

describe('BUG-07 · 줄 수 보존 로직 시뮬레이션', () => {
  /** addShopLayer 의 확장 루프를 그대로 옮겨 경계 동작을 고정한다. */
  function widen(specW, stageW, naturalPx, want) {
    let cur = Math.ceil(specW * stageW) + 1;
    const cap = Math.floor(stageW * 0.98);
    let guard = 0;
    const linesAt = (w) => (naturalPx <= w ? 1 : 2);   // 단순 2줄 모델
    while (linesAt(cur) > want && cur < cap && guard++ < 40) {
      cur = Math.min(cap, Math.ceil(cur * 1.08) + 1);
    }
    return { cur, lines: linesAt(cur), guard };
  }

  test('실측 knife-edge 재현: 377px 로는 접히고, 확장하면 한 줄로 돌아온다', () => {
    // stage 533, w=0.70537 → 377px, 실제 필요 379.8px
    const noGuard = Math.ceil(0.70537 * 533) + 1;
    expect(noGuard).toBe(377);
    expect(379.8 <= noGuard).toBe(false);          // 옛 동작 = 두 줄

    const r = widen(0.70537, 533, 379.8, 1);
    expect(r.lines).toBe(1);
    expect(r.cur).toBeGreaterThan(377);
    expect(r.cur).toBeLessThanOrEqual(Math.floor(533 * 0.98));
  });

  test('의도한 2줄은 넓히지 않는다', () => {
    const r = widen(0.5, 600, 900, 2);             // 이미 원하는 줄 수
    expect(r.cur).toBe(Math.ceil(0.5 * 600) + 1);  // 루프 미진입
    expect(r.guard).toBe(0);
  });

  test('아무리 넓혀도 안 되는 경우 유한 횟수에서 멈춘다(무한루프 없음)', () => {
    const r = widen(0.1, 500, 99999, 3);           // 절대 도달 불가
    expect(r.guard).toBeLessThanOrEqual(40);
    expect(r.cur).toBeLessThanOrEqual(Math.floor(500 * 0.98));
  });
});
