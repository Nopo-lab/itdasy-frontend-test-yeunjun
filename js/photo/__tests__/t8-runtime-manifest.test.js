/* T8 학습 체인이 **런타임에 실제로 실린다**는 걸 잠근다. [2026-08-23]
 *
 * 🔴 실제로 있었던 일: 운영 프론트에 `work-memory-signals.js`·`work-memory-preferences.js`
 *    파일은 **있었는데 로더에 등록이 없었다.** 그래서 `window.WMSignals` 가 undefined 였고,
 *    편집기는 `if (window.WMSignals)` 로 감싸고 있어서 **조용히 관측 0** 이 됐다.
 *    원장이 아무리 편집해도 배우는 게 없었고, 개인화는 영원히 안 붙었다.
 *    파일 grep 으로는 절대 안 잡힌다 — 파일은 멀쩡히 있었으니까.
 *
 * 그래서 여기서는 **세 가지를 다 본다**:
 *   ① 파일이 있다  ② 로더가 부른다  ③ 순서가 의존성과 맞다  ④ 전역을 실제로 만든다
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../..');
const groups = fs.readFileSync(path.join(ROOT, 'js/load-groups.js'), 'utf8');

/* 순서 = 의존성. signals(관측) → decay·store(저장) → preferences(집계)
   → persona·personalize(적용) → learn(폐루프). engine 은 이 모두의 앞. */
const T8_CHAIN = [
  ['js/workspace/work-memory-engine.js', 'WorkMemoryEngine'],
  ['js/workspace/work-memory-signals.js', 'WMSignals'],
  ['js/workspace/work-memory-decay.js', null],
  ['js/workspace/work-memory-store.js', null],
  ['js/workspace/work-memory-preferences.js', 'WMPrefs'],
  ['js/workspace/work-memory-persona.js', null],
  ['js/workspace/work-memory-personalize.js', 'WMPersonalize'],
  ['js/workspace/work-memory-learn.js', 'WMLearn']
];
const ALSO = ['js/workspace/edit-plan-shadow.js', 'js/photo/obb-geometry.js'];

const posOf = (f) => groups.indexOf(`'${f}?`) >= 0 ? groups.indexOf(`'${f}?`) : groups.indexOf(`'${f}'`);

describe('T8 런타임 매니페스트 — 파일 존재만으로 통과시키지 않는다', () => {
  test.each(T8_CHAIN.concat(ALSO.map((f) => [f, null])))('%s 파일이 있다', (f) => {
    expect(fs.existsSync(path.join(ROOT, f))).toBe(true);
  });

  test.each(T8_CHAIN.concat(ALSO.map((f) => [f, null])))('%s 를 로더가 실제로 부른다', (f) => {
    expect(posOf(f)).toBeGreaterThan(-1);
  });

  test('🔑 순서가 의존성과 맞다 — 늦게 실리면 앞 모듈이 전역을 못 본다', () => {
    const pos = T8_CHAIN.map(([f]) => posOf(f));
    for (let i = 1; i < pos.length; i++) {
      expect(pos[i]).toBeGreaterThan(pos[i - 1]);
    }
  });

  test('🔑 캐시버스터가 붙어 있다 — 안 붙으면 영영 갱신 안 된다', () => {
    T8_CHAIN.concat(ALSO.map((f) => [f, null])).forEach(([f]) => {
      expect(groups).toMatch(new RegExp(`'${f.replace(/[/.]/g, '\\$&')}\\?v=`));
    });
  });

  test('🔑 모듈이 실제로 그 전역을 만든다 — 이름이 어긋나면 로드돼도 소용없다', () => {
    T8_CHAIN.forEach(([f, g]) => {
      if (!g) return;
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      expect(src).toMatch(new RegExp(`window\\.${g}\\s*=`));
    });
  });

  test('🔑 편집기가 그 전역을 조건부로만 쓴다 — 없으면 조용히 지나간다(그래서 가드가 필요하다)', () => {
    const ed = fs.readFileSync(path.join(ROOT, 'js/itd-editor/itd-editor.js'), 'utf8');
    expect(ed).toMatch(/if \(window\.WMSignals\)/);   // 이 패턴 때문에 누락이 무증상이었다
  });
});
