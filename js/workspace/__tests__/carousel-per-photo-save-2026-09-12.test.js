/* 🔴 [2026-09-12 · ZERO-HELP §22 3장 격리 라이브 실측] **캐러셀에서 사진이 바뀌고 글자가 사라졌다.**
 *
 * 실측(LIVE e4e00d7 · 실계정 user 4 · 네일·헤어·속눈썹 3장 캐러셀):
 *   편집기에서 장마다 다른 편집 — 1번 네일: 밝기 123 + 'A1nail' / 2번 헤어: 대비 82 + 'B2hair'
 *   / 3번 속눈썹: 온도 28 + 'C3lash'. 전환 A→B→C→A→C→B 6회 모두 **완벽 격리**(각 장이 자기 것만).
 *   그런데 [완료] → 저장 → 새로고침 뒤 발행본 3장이
 *       [헤어 + B2hair] [헤어(글자 없음)] [속눈썹(글자 없음)]
 *   **네일 사진이 통째로 사라지고 헤어가 두 장**, A1nail·C3lash 소실.
 *   저장본도 photos[0].editState.layers = ['B2hair'](네일 자리에 헤어 글자), [1]·[2]는 null.
 *
 * 원인 두 겹:
 *   ① onDone 이 **편집기를 열 때 잡은 장(p0)** 에 합성본을 넣는다. 원장이 편집기 썸네일로
 *      장을 바꾸면 dataUrl 은 바뀐 장의 것이라 **다른 사진 자리에 덮어쓴다.**
 *   ② 장별 합성(ItdEditor.compose)은 **비동기**인데 `_persistEditQuiet()` 는 그 앞에서
 *      동기로 이미 끝난다 → 나머지 장의 글자가 저장본에 하나도 안 들어간다.
 */
const fs = require('fs');
const path = require('path');
const FLOW = fs.readFileSync(path.join(__dirname, '../workspace-v2-flow.js'), 'utf8');
const EDITOR = fs.readFileSync(path.join(__dirname, '../../itd-editor/itd-editor.js'), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

describe('① 합성본은 **지금 보던 장**에 저장한다', () => {
  test('편집기가 현재 장 번호를 meta.photoIdx 로 알려준다', () => {
    const src = strip(EDITOR);
    const i = src.indexOf('meta.photoIdx');
    expect(i).toBeGreaterThan(0);
    const line = src.slice(i, i + 140);
    expect(line).toMatch(/S\.adjSel/);
    expect(line).toMatch(/isSingleL\(S\.layout\)/);   // 콜라주는 한 장 합성이라 해당 없음
  });

  test('meta.photoIdx 는 perPhoto 와 같은 저장 경로에 실린다(한쪽만 있으면 못 맞춘다)', () => {
    const src = strip(EDITOR);
    const pp = src.indexOf('meta.perPhoto = _collectPerPhoto()');
    const pi = src.indexOf('meta.photoIdx');
    expect(pp).toBeGreaterThan(0);
    expect(Math.abs(pi - pp)).toBeLessThan(600);
  });

  test('flow 가 meta.photoIdx 로 대상 사진을 바꾼다 — 쓰기 전에', () => {
    const src = strip(FLOW);
    const i = src.indexOf('var p = p0 || _activeEditPhoto()');
    expect(i).toBeGreaterThan(0);
    const seg = src.slice(i, i + 700);
    expect(seg).toMatch(/meta\.photoIdx != null/);
    expect(seg).toMatch(/editablePhotos\(\)\s*\|\|\s*\[\]\)\[meta\.photoIdx\]/);
    const pick = seg.indexOf('meta.photoIdx != null');
    const write = seg.indexOf('p.editedDataUrl = dataUrl');
    expect(pick).toBeGreaterThan(-1);
    expect(write).toBeGreaterThan(pick);   // 대상 확정이 **쓰기보다 먼저**
  });

  test('알려주지 않으면(콜라주 등) 기존 p0 동작 그대로 — 되돌아갈 길을 남긴다', () => {
    const src = strip(FLOW);
    const i = src.indexOf('var p = p0 || _activeEditPhoto()');
    const seg = src.slice(i, i + 700);
    expect(seg).toMatch(/if \(_tpNow\) p = _tpNow;/);   // 못 찾으면 p 유지
  });
});

describe('② 장별 합성이 끝난 뒤에도 저장한다(비동기 경주)', () => {
  function composeBlock() {
    const src = strip(FLOW);
    // ⚠️ `window.ItdEditor.compose({` 는 자동합성(_autoComposeTemplate)에도 있다 —
    //    첫 일치를 집으면 엉뚱한 함수를 본다. perPhoto 구간 **뒤에서** 찾는다.
    const pp = src.indexOf('var _pp = meta && meta.perPhoto');
    expect(pp).toBeGreaterThan(0);
    const i = src.indexOf('window.ItdEditor.compose({', pp);
    expect(i).toBeGreaterThan(pp);
    const j = src.indexOf('} catch (_ppe)', i);
    expect(j).toBeGreaterThan(i);
    const b = src.slice(i, j);
    expect(b.length).toBeLessThan(1400);
    return b;
  }

  test('compose 콜백 안에서 _persistEditQuiet 를 부른다', () => {
    expect(composeBlock()).toMatch(/_persistEditQuiet\(\)/);
  });

  test('그 저장은 결과 반영(_syncOutputForEdit·editState) **뒤에** 온다', () => {
    const b = composeBlock();
    const sync = b.indexOf('_syncOutputForEdit(tp, u, false)');
    const es = b.indexOf('tp.editState =');
    const per = b.indexOf('_persistEditQuiet()');
    expect(sync).toBeGreaterThan(-1);
    expect(es).toBeGreaterThan(sync);
    expect(per).toBeGreaterThan(es);
  });

  test('동기 경로의 주 저장도 그대로 남아 있다(둘 다 필요하다)', () => {
    const src = strip(FLOW);
    const learn = src.indexOf('_learnShopStyle(meta && meta.layers)');
    expect(learn).toBeGreaterThan(0);
    expect(src.indexOf('_persistEditQuiet();', learn)).toBeGreaterThan(learn);
  });
});

describe('③ 합성본은 **그 사진의 출력 자리**에 들어간다', () => {
  /* 실측(2026-09-12, 3장 캐러셀): photos[2].editedDataUrl 은 P3lash 로 제대로 구워졌는데
     templateOutputs[2] 는 합성 안 된 원본이었다 — 발행하면 3번째 장만 글자가 없다.
     원인: `_syncOutputForEdit` 이 isWs 를 먼저 보고 `outs[0]` 으로 폴백해
     3번 합성본을 1번 출력 자리에 넣었다(그 자리는 뒤이은 장별 합성이 덮어 자가치유). */
  function syncFn() {
    const src = strip(FLOW);
    const i = src.indexOf('function _syncOutputForEdit(');
    expect(i).toBeGreaterThan(0);
    const j = src.indexOf('\n  }', i);
    const b = src.slice(i, j);
    expect(b.length).toBeLessThan(900);
    return b;
  }

  test('사진(p)으로 찾는 분기가 isWs 폴백보다 **먼저** 온다', () => {
    const b = syncFn();
    const byPhoto = b.indexOf("(o.photoIds || []).indexOf(p.id) >= 0");
    const wsFallback = b.indexOf('outs[0]');
    expect(byPhoto).toBeGreaterThan(-1);
    expect(wsFallback).toBeGreaterThan(byPhoto);
  });

  test('isWs 폴백은 사진으로 못 찾았을 때만 돈다', () => {
    expect(syncFn()).toMatch(/if \(!tgt && isWs\)/);
  });

  test('옛 형태(isWs 를 먼저 보고 else if (p))가 남아 있지 않다', () => {
    const b = syncFn();
    expect(b).not.toMatch(/if \(isWs\) tgt =[\s\S]*else if \(p\)/);
  });

  test('첫 출력일 때 스칼라 미러를 맞추는 계약은 그대로', () => {
    expect(syncFn()).toMatch(/tgt === outs\[0\][\s\S]{0,120}d\.templateOutput = dataUrl/);
  });
});
