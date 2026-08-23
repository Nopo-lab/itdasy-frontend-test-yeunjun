/* 편집기 확장 — 화살표·레이어 순서. **화면과 발행본이 같은지**가 핵심이다.
 *
 * 어제 외곽선이 화면에만 있고 발행본엔 없던 버그를 겪었다. 새 도형을 넣을 때
 * 같은 실수를 안 만들려면 CSS·canvas·직렬화 **세 곳**이 다 있어야 한다.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../..');
const ed = fs.readFileSync(path.join(ROOT, 'js/itd-editor/itd-editor.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'css/itd-editor.css'), 'utf8');

describe('[화살표] 화면·발행본·직렬화 세 곳에 다 있다', () => {
  test('도형 목록에 있다', () => {
    expect(ed).toMatch(/\{ key: 'arrow', label: '화살표' \}/);
  });
  test('화면(CSS)에서 그린다', () => {
    expect(ed).toMatch(/L\.shape === 'arrow'/);
    expect(ed).toMatch(/itl-arrowhead/);
  });
  test('🔑 발행본(canvas)에서도 그린다 — 빠뜨리면 화면에만 보인다', () => {
    const i = ed.indexOf('function drawShape');
    const seg = ed.slice(i, ed.indexOf('function exportComposite', i));
    expect(seg).toMatch(/L\.shape === 'arrow'/);
    expect(seg).toMatch(/c\.moveTo\(bodyEnd, -hd\)/);
  });
  /* 🔴 브라우저에서 잡았다. 처음엔 `base.type = 'shape'` 로 저장했는데
     복원 라우팅(`addShopLayer`)은 image/line/rect/sticker 만 안다 —
     모르는 type 은 **조용히 텍스트 레이어**로 떨어진다. 그래서 발행본에서 화살표가 사라졌다
     (with/without 바이트가 동일했다). 새 type 이름을 만들지 말고 기존 계열에 실어야 한다. */
  test('🔑 복원 라우팅이 아는 type 으로 직렬화한다 (새 이름 금지)', () => {
    expect(ed).toMatch(/base\.type = 'line'; base\.shape = 'arrow';/);
    // 라우팅이 실제로 그 type 을 안다
    expect(ed).toMatch(/if \(spec\.type === 'line'\) return addShopLine\(spec, R\);/);
    // 복원 시 shape 를 존중한다 — 안 그러면 민선이 된다
    expect(ed).toMatch(/L\.shape = \(spec\.shape === 'arrow'\) \? 'arrow' : 'line';/);
  });
  test('머리 크기가 화면·발행본에서 같은 공식이다', () => {
    // CSS: Math.max(sw * 2.2, 10) · canvas: Math.max(sw * 2.2, 10 * scale)
    const cssSide = ed.slice(ed.indexOf("} else if (L.shape === 'arrow')"), ed.indexOf('} else {', ed.indexOf("} else if (L.shape === 'arrow')")));
    expect(cssSide).toMatch(/sw \* 2\.2/);
    const i = ed.indexOf('function drawShape');
    const canvasSide = ed.slice(i, ed.indexOf('function exportComposite', i));
    expect(canvasSide).toMatch(/sw \* 2\.2/);
    expect(canvasSide).toMatch(/hd \* 1\.4/);
  });
  test('새 좌표축을 만들지 않았다 — 기존 회전(rot)으로 방향을 잡는다', () => {
    expect(ed).not.toMatch(/arrowStart|arrowEnd|x1.*y1.*x2.*y2/);
  });
});

describe('[레이어 순서] 배열과 DOM 이 같이 움직인다', () => {
  test('네 방향 전부 있다', () => {
    ['front', 'back', 'up', 'down'].forEach((k) => {
      expect(ed).toMatch(new RegExp("data-lyr=\"" + k + "\""));
    });
  });
  test('🔑 배열 순서와 DOM 순서를 함께 옮긴다 (갈리면 화면≠발행본)', () => {
    const i = ed.indexOf('function reorderLayer');
    const seg = ed.slice(i, ed.indexOf('function _syncLayerBtns', i));
    expect(seg).toMatch(/S\.layers\.splice\(i, 1\); S\.layers\.splice\(to, 0, L\);/);
    expect(seg).toMatch(/refs\.layers\.appendChild\(x\.el\)/);
  });
  test('선택이 없으면 버튼이 꺼진다 (사라지지 않는다 — 자리가 들썩이면 오탭)', () => {
    expect(ed).toMatch(/b\.disabled = !\(L && i >= 0 && i < n - 1\)/);
    expect(css).toMatch(/\.itlyr:disabled/);
  });
  test('선택이 바뀌면 버튼 상태가 갱신된다', () => {
    const i = ed.indexOf('function selectLayer');
    const seg = ed.slice(i, i + 1200);
    expect(seg).toMatch(/_syncLayerBtns\(\)/);
  });
  test('되돌리기 스택을 채우지 않는다 — 원장이 되돌리고 싶은 편집이 밀려난다', () => {
    const i = ed.indexOf('function reorderLayer');
    const seg = ed.slice(i, ed.indexOf('function _syncLayerBtns', i));
    expect(seg).not.toMatch(/_pushOp/);
  });
});
