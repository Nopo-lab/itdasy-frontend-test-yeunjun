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
    // [2026-09-13] 옮기는 일은 _placeLayerAt 한 곳으로 모았다(되돌리기도 같은 함수를 쓰게).
    //   reorderLayer 는 반드시 그 함수를 거쳐야 하고, 그 함수가 배열·DOM 을 함께 옮긴다.
    const i = ed.indexOf('function reorderLayer');
    const seg = ed.slice(i, ed.indexOf('function _placeLayerAt', i));
    expect(seg).toMatch(/_placeLayerAt\(L, to\);/);
    expect(seg).not.toMatch(/S\.layers\.splice/);   // 우회해서 배열만 옮기는 경로가 생기면 안 된다
    const j = ed.indexOf('function _placeLayerAt');
    const place = ed.slice(j, ed.indexOf('function _syncLayerBtns', j));
    expect(place).toMatch(/S\.layers\.splice\(i, 1\); S\.layers\.splice\(/);
    expect(place).toMatch(/refs\.layers\.appendChild\(x\.el\)/);
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
  /* [2026-09-13 계약 변경] 예전 계약은 "순서 변경은 되돌리기 스택을 채우지 않는다
     (원장이 되돌리고 싶은 편집이 밀려난다)" 였다. 걱정 자체는 맞지만 **대가가 더 컸다.**
     기록이 없으면 순서 변경 뒤의 ↩ 가 그 변경을 건너뛰고 **앞선 '추가'를 취소**해서
     원장이 만든 다른 글자·스티커가 사라진다.
     실측(2026-09-13, Chrome 402×684 실엔진): 글자 2개 → 맨 뒤로 → ↩ → 레이어 2→1.
     스택은 40개 상한이고 순서 변경은 드문 조작이라 '밀려남' 쪽 위험이 훨씬 작다.
     → 순서 변경도 한 번 남기고, 되돌리면 원래 자리로 돌아가야 한다. */
  test('순서 변경은 되돌리기에 남는다 — 안 남기면 ↩ 가 엉뚱한 레이어를 지운다', () => {
    const i = ed.indexOf('function reorderLayer');
    const seg = ed.slice(i, ed.indexOf('function _placeLayerAt', i));
    expect(seg).toMatch(/_pushOp\(\{ op: 'order', L: L, from: i, to: to \}\)/);
    // 실제로 안 움직였으면(맨 앞에서 '앞으로') 쌓지 않는다 — 여기서 먼저 빠져나가야 한다
    const guard = seg.indexOf('if (to === i) return false;');
    expect(guard).toBeGreaterThan(0);   // 없으면 indexOf 가 -1 이라 아래 비교가 거짓으로 통과한다
    expect(guard).toBeLessThan(seg.indexOf("_pushOp({ op: 'order'"));
  });
});
