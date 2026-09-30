/* [2026-09-30 원영 결정] 휴대폰(브라우저) 누끼 폴백(@imgly/background-removal) 삭제.
 *
 * 왜 지웠나
 *  - 두 겹으로 죽어 있었다: 불러오던 `dist/index.umd.js` 가 1.7.0 패키지에 없고,
 *    모델 경로(jsDelivr npm)의 resources.json 은 비어 있다(모델은 img.ly 전용 서버에 있다).
 *  - 살리면 첫 사용 때 폰이 약 100MB 를 받는다(medium 모델 88MB + ONNX 실행엔진).
 *  - 늘 실패하면서 서버 오류 문구를 덮었다 — 한도 초과(429)인데 "누끼 모듈을 못 불러왔어요" 가 떴다.
 *
 * 다시 넣으려면 이 테스트를 지우기 전에 위 세 가지를 먼저 해결할 것.
 */
const fs = require('fs');
const path = require('path');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

describe('휴대폰 누끼 폴백은 없다', () => {
  test.each(['index.html', 'app-photo-editor-bg-compose.js', 'js/workspace/workspace-adapter.js'])(
    '%s 에 imgly 로더·폴백이 없다', (f) => {
      const s = read(f);
      expect(s).not.toMatch(/_lazyImgly|@imgly\/background-removal|imgly_bgr|imglyRemoveBackground/);
    });

  test('서버 한도 초과(429) 문구가 그대로 올라간다 — 폴백이 덮지 않는다', () => {
    const s = read('app-photo-editor-bg-compose.js');
    const body = s.slice(s.indexOf('async function _removeBg'), s.indexOf('async function _removeBg') + 2000);
    expect(body).toMatch(/res\.status === 429\) throw new Error\('오늘 배경제거 한도/);
    expect(body).not.toMatch(/catch\s*\(serverErr\)/);
  });
});
