'use strict';

/* 편집기 신뢰성 — 저장(완료)이 영구 잠기지 않는다. 구현보다 먼저 작성 (2026-08-21).
   ⚠️ T8 개인화와 **무관한** Editor Reliability 계약이다. 개인화를 꺼도 지켜져야 한다.

   ── 실제로 재현된 사고
   `loadImg()` 에 타임아웃이 없어서, 이미지가 load 도 error 도 안 주면 promise 가 영영 pending →
   `exportComposite()` 콜백 미호출 → `S._saving` 이 **true 로 영구 고착** →
   버튼이 '저장 중…' + disabled 로 굳고 **재클릭 경로가 전부 막힌다.**
   원장은 편집한 작업물을 저장도 발행도 못 하고 앱을 껐다 켜야 한다.
   느린 네트워크·CDN 지연·큰 스티커 자산(T6 assetRef)에서 충분히 발생한다.

   브라우저 실측(2026-08-21):
     API 차단  → 완료 정상(닫힘)
     API 401   → 완료 정상(1.0초)
     API 429   → 완료 정상(1.0초)
     이미지 1개 무응답 → 🔴 영구 잠김 (버튼 '저장 중…' disabled, 재클릭 무효)
   즉 원인은 API 가 아니라 편집기 내부다.

   ── 계약
   1. loadImg 는 절대 무한 pending 하지 않는다. load / error / timeout 셋 중 하나로 **반드시** 정착한다.
   2. 이미 정착한 뒤 늦게 온 load/error/timeout 은 **중복 처리하지 않는다**(double resolve 금지).
   3. _saving 은 성공·실패·예외·타임아웃 **모든 경로에서** 해제된다.
   4. 저장 실패 = 편집기 데드락이 아니다. 버튼이 복구되고 편집기는 열린 채 재시도 가능하다.
   5. 타임아웃 값은 함수 안에 박지 않고 상수로 분리한다. */

const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'itd-editor.js'), 'utf8');

/* itd-editor.js 는 DOM 통짜라 통째 로드가 불가하다. 계약을 담은 함수만 떼어내 검증한다
   — 소스에서 직접 추출하므로 "테스트만 통과하는 사본"이 될 수 없다(추출 실패 시 테스트가 깨진다). */
function extract(name) {
  const re = new RegExp('function ' + name + '\\s*\\([\\s\\S]*?\\n  \\}', 'm');
  const m = SRC.match(re);
  if (!m) throw new Error('소스에서 ' + name + ' 을 못 찾음 — 이름이 바뀌었으면 테스트도 갱신할 것');
  return m[0];
}
function makeLoadImg(ImageImpl, timeoutMs) {
  const consts = SRC.match(/var IMG_LOAD_TIMEOUT_MS\s*=\s*\d+;/);
  if (!consts) throw new Error('IMG_LOAD_TIMEOUT_MS 상수가 없다 — 매직넘버 금지 계약 위반');
  // eslint-disable-next-line no-new-func
  return new Function('Image', 'OVERRIDE', `
    ${consts[0]}
    if (OVERRIDE) IMG_LOAD_TIMEOUT_MS = OVERRIDE;
    ${extract('loadImg')}
    return loadImg;
  `)(ImageImpl, timeoutMs);
}

// 테스트용 Image — 동작을 주입한다(즉시 load / 즉시 error / 무응답 / 지연)
function FakeImage(behavior, delay) {
  return function () {
    const im = { onload: null, onerror: null, crossOrigin: null, _src: null };
    Object.defineProperty(im, 'src', {
      get() { return im._src; },
      set(v) {
        im._src = v;
        if (behavior === 'load') setTimeout(() => im.onload && im.onload(), delay || 0);
        else if (behavior === 'error') setTimeout(() => im.onerror && im.onerror(), delay || 0);
        // 'hang' → 아무것도 안 부른다
      }
    });
    return im;
  };
}

describe('[Editor 신뢰성 1·5] loadImg 는 무한 pending 하지 않는다', () => {
  test('타임아웃이 상수로 분리돼 있다 (매직넘버 금지)', () => {
    expect(SRC).toMatch(/var IMG_LOAD_TIMEOUT_MS\s*=\s*\d+;/);
    const v = +SRC.match(/var IMG_LOAD_TIMEOUT_MS\s*=\s*(\d+);/)[1];
    expect(v).toBeGreaterThanOrEqual(3000);    // 너무 짧으면 느린 회선에서 멀쩡한 저장이 깨진다
    expect(v).toBeLessThanOrEqual(20000);      // 너무 길면 원장이 그동안 갇힌다
  });
  test('정상 이미지 → 이미지 객체로 resolve', async () => {
    const loadImg = makeLoadImg(FakeImage('load'));
    await expect(loadImg('x.png')).resolves.toBeTruthy();
  });
  test('load error → null 로 resolve (기존 계약 유지)', async () => {
    const loadImg = makeLoadImg(FakeImage('error'));
    await expect(loadImg('x.png')).resolves.toBeNull();
  });
  test('🔴 무응답 이미지 → 타임아웃으로 null 회수 (예전엔 영영 pending)', async () => {
    jest.useFakeTimers();
    const loadImg = makeLoadImg(FakeImage('hang'), 8000);
    let settled = false;
    const p = loadImg('hang.png').then((v) => { settled = true; return v; });
    await Promise.resolve();
    expect(settled).toBe(false);              // 아직은 대기
    jest.advanceTimersByTime(8001);
    await expect(p).resolves.toBeNull();
    jest.useRealTimers();
  });
  test('경계 — 타임아웃 직전에 온 load 는 정상 성공한다', async () => {
    jest.useFakeTimers();
    const loadImg = makeLoadImg(FakeImage('load', 7900), 8000);
    const p = loadImg('slow.png');
    jest.advanceTimersByTime(7950);
    await expect(p).resolves.toBeTruthy();
    jest.useRealTimers();
  });
});

describe('[Editor 신뢰성 2] double resolve 금지 — 늦게 온 이벤트가 중복 처리되지 않는다', () => {
  test('타임아웃 직후 load 가 와도 결과가 안 바뀐다', async () => {
    jest.useFakeTimers();
    const loadImg = makeLoadImg(FakeImage('load', 9000), 8000);
    const p = loadImg('late.png');
    jest.advanceTimersByTime(8001);
    const first = await p;
    expect(first).toBeNull();                 // 타임아웃이 이겼다
    jest.advanceTimersByTime(2000);           // 그 뒤 load 도착
    await expect(p).resolves.toBeNull();      // 결과는 그대로 — 뒤집히지 않는다
    jest.useRealTimers();
  });
  test('load 후 타임아웃이 돌아도 타이머가 결과를 덮지 않는다', async () => {
    jest.useFakeTimers();
    const loadImg = makeLoadImg(FakeImage('load', 10), 8000);
    const p = loadImg('fast.png');
    jest.advanceTimersByTime(20);
    const v = await p;
    expect(v).toBeTruthy();
    jest.advanceTimersByTime(9000);
    await expect(p).resolves.toBe(v);
    jest.useRealTimers();
  });
  test('타임아웃 타이머는 정착 시 정리된다(누수 없음)', async () => {
    jest.useFakeTimers();
    const loadImg = makeLoadImg(FakeImage('load', 5), 8000);
    const p = loadImg('x.png');
    jest.advanceTimersByTime(10);
    await p;
    expect(jest.getTimerCount()).toBe(0);
    jest.useRealTimers();
  });
});

describe('[Editor 신뢰성 3·4·5] 저장 실패가 데드락이 아니다 — 소스 계약', () => {
  const doneBlock = (() => {
    const i = SRC.indexOf('refs.done.addEventListener');
    if (i < 0) throw new Error('완료 버튼 핸들러를 못 찾음');
    return SRC.slice(i, i + 2600);
  })();
  test('🔴 _saving 해제가 모든 경로에서 보장된다', () => {
    /* 해제 지점을 여러 곳에 흩뿌리는 게 아니라 **한 곳(_restoreSaveUi)** 으로 모으고
       모든 종료 경로가 그걸 부르게 한다 — 흩어져 있으면 새 경로가 생길 때 또 빠뜨린다. */
    expect(doneBlock).toMatch(/_restoreSaveUi\s*=\s*function/);
    expect(doneBlock).toMatch(/_restoreSaveUi[\s\S]{0,200}_saving\s*=\s*false/);
    const calls = (doneBlock.match(/_restoreSaveUi\(\)/g) || []).length;
    expect(calls).toBeGreaterThanOrEqual(4);   // 워치독 · 세션바뀜 · 합성실패 · 성공
    // 재진입 방지(두 번 복구해도 안전)
    expect(doneBlock).toMatch(/_restored/);
  });
  test('저장 실패 시 버튼 라벨·disabled 가 복구된다', () => {
    expect(doneBlock).toMatch(/disabled\s*=\s*false/);
    expect(doneBlock).toMatch(/textContent\s*=\s*'완료'/);
  });
  test('🔴 export 가 끝내 응답 안 해도 풀어주는 안전망이 있다', () => {
    expect(SRC).toMatch(/var SAVE_WATCHDOG_MS\s*=\s*\d+;/);
    expect(doneBlock).toMatch(/SAVE_WATCHDOG_MS/);
  });
  test('실패해도 close() 를 부르지 않는다 — 편집기는 열린 채 재시도 가능', () => {
    // 성공 경로에서만 close 가 불린다
    const successOnly = doneBlock.slice(doneBlock.indexOf('exportComposite'));
    expect(successOnly).toMatch(/if\s*\(\s*!url\s*\)|url\s*==\s*null|!url\)/);
  });
  test('중복 완료 클릭 가드는 그대로 있다(정상 저장 중 재클릭 차단)', () => {
    expect(doneBlock).toMatch(/if \(S\._saving\) return;/);
  });
});

describe('[Editor 신뢰성 4] exportComposite 는 콜백을 정확히 한 번 부른다', () => {
  // 함수가 길어 중괄호로 자르면 잘못 잘린다 — 다음 함수 선언 직전까지를 본문으로 본다.
  const expBlk = (() => {
    const i = SRC.indexOf('function exportComposite');
    const j = SRC.indexOf('/* ── 배선 ── */', i);
    if (i < 0 || j < 0) throw new Error('exportComposite 범위를 못 잡음');
    return SRC.slice(i, j);
  })();
  test('cb 를 직접 부르지 않고 1회 가드(_fire)를 통과시킨다', () => {
    expect(expBlk).toMatch(/_cbDone\s*=\s*false/);
    expect(expBlk).toMatch(/_fire\s*=\s*function/);
    expect(expBlk).toMatch(/if \(_cbDone\) return; _cbDone = true;/);
  });
  test('실패 경로에서도 반드시 콜백이 온다 — _fire(null)', () => {
    expect(expBlk).toMatch(/_fire\(null\)/);
  });
  test('promise 체인에 catch 가 달려 있다 — 예외로 콜백이 증발하지 않는다', () => {
    expect(expBlk).toMatch(/\.catch\(function/);
  });
  test('cb 호출 지점은 _fire 안 딱 한 곳뿐이다', () => {
    /* cb 를 여러 곳에서 부르면 언젠가 한 경로가 빠지거나 두 번 불린다.
       유일한 호출을 1회 가드 안에 가둔다 — 그 밖에서 cb( 가 보이면 회귀다. */
    const raw = (expBlk.match(/\bcb\(/g) || []);
    expect(raw.length).toBe(1);
    expect(expBlk).toMatch(/_cbDone = true; try \{ cb\(url\);/);
  });
});

describe('[Editor 신뢰성 6] 개인화와 무관한 계약', () => {
  test('저장 복구 로직이 T8 모듈에 의존하지 않는다', () => {
    const i = SRC.indexOf('refs.done.addEventListener');
    const blk = SRC.slice(i, i + 2600);
    expect(blk).not.toMatch(/WMPersona|WMPersonalize|WMPrefs/);
  });
  test('loadImg 도 T8 에 의존하지 않는다', () => {
    expect(extract('loadImg')).not.toMatch(/WM[A-Z]/);
  });
});

describe('[Editor 신뢰성] 기존 계약 회귀', () => {
  test('T4 undo(wmApply/wmRemove) 계약 유지', () => {
    expect(SRC).toMatch(/op: 'wmRemove'/);
    expect(SRC).toMatch(/function undoWmApply/);
  });
  test('_serLayer 화이트리스트 유지', () => {
    expect(SRC).toMatch(/base\.type = \(L\.type === 'badge'\) \? 'badge' : 'text';/);
    expect(SRC).toMatch(/base\.font = L\.font && L\.font\.key;/);
  });
  test('_pushOp 종류가 늘지 않았다', () => {
    const ops = [...SRC.matchAll(/_pushOp\(\{\s*op:\s*'([a-zA-Z]+)'/g)].map((m) => m[1]);
    const allowed = ['add', 'del', 'move', 'resize', 'wrap', 'photo', 'cellcrop', 'wmApply', 'wmRemove'];
    ops.forEach((o) => expect(allowed).toContain(o));
  });
  test('T8-A system scope 래핑 유지', () => {
    expect(SRC).toMatch(/WMSignals\.system\(function \(\) \{ return _restoreLayersInner/);
  });
});

describe('[Editor 신뢰성 7] 사진이 통째로 안 실리면 저장 성공으로 치지 않는다', () => {
  /* 데드락을 고치고 나니 다음 문제가 드러났다(브라우저 실측):
     이미지가 전부 타임아웃돼도 글씨만 있는 합성본을 만들어 **저장 성공**으로 닫혔다.
     원장이 사진 빠진 게시물을 그대로 발행할 수 있다. 데드락보다 조용해서 더 나쁘다.
     ⚠️ 일부만 실패한 콜라주는 기존대로 나머지를 살린다 — 막는 건 '사진 0장'뿐이다. */
  const expBlk = (() => {
    const i = SRC.indexOf('function exportComposite');
    const j = SRC.indexOf('/* ── 배선 ── */', i);
    return SRC.slice(i, j);
  })();
  test('그려진 사진 수를 센다', () => {
    expect(expBlk).toMatch(/_photoDrawn\s*=\s*0/);
    const incs = (expBlk.match(/_photoDrawn\+\+/g) || []).length;
    expect(incs).toBe(2);                       // 단일 경로 + 콜라주 경로
  });
  test('🔴 사진 0장이면 _fire(null) 로 실패 처리', () => {
    expect(expBlk).toMatch(/if \(!_photoDrawn\) \{ _fire\(null\); return; \}/);
  });
  test('사진이 한 장이라도 그려지면 정상 저장(콜라주 부분 실패 허용)', () => {
    // 0 일 때만 막는다 — 부분 실패까지 막으면 멀쩡한 저장이 깨진다
    expect(expBlk).not.toMatch(/_photoDrawn\s*<\s*imgs\.length/);
    expect(expBlk).not.toMatch(/_photoDrawn\s*!==\s*/);
  });
});
