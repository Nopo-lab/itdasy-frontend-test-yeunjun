'use strict';

/* [BUG-02 / BUG-06 · 2026-09-09] 편집 중 리로드 복구 + 접근성/키보드 회귀 고정.
 *
 * BUG-02 가 왜 P1 이었나(실제로 당함):
 *   텍스트를 넣은 상태에서 새 배포가 떨어지자 app-core 의 'SW 버전 불일치 → 캐시 삭제 후 reload'
 *   가 돌아 편집기·초안이 통째로 사라졌다. 편집기는 진행 중 작업을 어디에도 저장하지 않았고,
 *   beforeunload 가드는 standalone PWA + 시트 열림일 때만 동작해 일반 웹에선 아무것도 못 막았다.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js/itd-editor/itd-editor.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'css/itd-editor.css'), 'utf8');

describe('BUG-02 · 편집 중 리로드로 작업을 잃지 않는다', () => {
  test('주기 스냅샷 + pagehide/visibilitychange 동기 저장이 모두 걸려 있다', () => {
    expect(SRC).toMatch(/setInterval\(function \(\) \{ _draftSnap\(false\); \}, DRAFT_TICK_MS\)/);
    expect(SRC).toMatch(/addEventListener\('pagehide', function \(\) \{ _draftSnap\(true\); \}\)/);
    expect(SRC).toMatch(/visibilityState === 'hidden'\) _draftSnap\(true\)/);
  });

  test('사진(dataURL)은 sessionStorage 에 넣지 않는다 — quota 로 저장 자체가 실패한다', () => {
    const split = SRC.slice(SRC.indexOf('function _splitDraft'));
    expect(split).toMatch(/delete light\.photos/);
    expect(split).toMatch(/delete light\.photoDraw/);
    expect(split).toMatch(/delete light\.collageBgImg/);
    /* 큰 것은 기존 IDB assets store 재사용(새 store 를 만들면 스키마 가드도 같이 고쳐야 한다).
       ⚠️ 이 단언은 원래 `saveAssetToDB(DRAFT_ASSET` 이었는데, 그건 **버그 형태를 고정한 것**이었다 —
          그 함수는 인자를 1개만 받는다. 아래 'IDB 규약대로 저장한다' describe 가 올바른 형태를 지킨다. */
    expect(SRC).toMatch(/window\.saveAssetToDB\(\{ id: DRAFT_ASSET/);
  });

  test('입력 중인 글자도 초안에 들어간다 — L.text 는 blur 에서만 갱신되기 때문', () => {
    // 이걸 빠뜨리면 "원장이 방금 치던 문구" 정확히 그것만 플레이스홀더로 복구된다(실측으로 잡음)
    expect(SRC).toMatch(/function _flushEditingText/);
    const snap = SRC.slice(SRC.indexOf('function _draftSnap'), SRC.indexOf('function _draftStart'));
    expect(snap).toMatch(/_flushEditingText\(\);[\s\S]*_exportState\(\)/);
  });

  test('자동으로 덮어쓰지 않고 물어본다 (Restore / Discard)', () => {
    expect(SRC).toMatch(/_showDraftBar\(/);
    expect(SRC).toContain('이어서 편집');
    expect(SRC).toContain('새로 시작');
    // 사진이 다른 게시물이면 제안하지 않는다
    expect(SRC).toMatch(/_dr\.sig === _photosSig\(S\.photos\)/);
  });

  test('정상 종료(저장·취소·back)에서는 초안을 지운다 — 유령 복구 배너 방지', () => {
    const clears = (SRC.match(/_draftClear\(\)/g) || []).length;
    expect(clears).toBeGreaterThanOrEqual(4);           // 저장 / 취소 / back / 새로시작
    expect(SRC).toMatch(/_restoreSaveUi\(\);\s*\n\s*_draftClear\(\);/);   // 저장 성공 경로
  });

  /* [라이브 실측 2026-09-10] 복구 초안을 **새 세션이 2초 만에 덮어썼다.**
     편집기를 열면 주기 스냅샷이 곧바로 DRAFT_KEY 를 현재(복구 전) 상태로 갈아엎어서,
     '이어서 편집' 을 누르기도 전에 되살릴 대상이 사라졌다(배너도 그래서 안 떴다).
     순서가 계약이다: 격리(_draftStash) → 타이머 시작(_draftStart). 뒤집히면 같은 버그가 돌아온다. */
  test('열 때 기존 초안을 pending 으로 격리한 뒤에야 타이머를 시작한다', () => {
    const open = SRC.slice(SRC.indexOf('function open(opts)'));
    const iStash = open.indexOf('_draftStash()');
    const iStart = open.indexOf('_draftStart()');
    expect(iStash).toBeGreaterThan(-1);
    expect(iStart).toBeGreaterThan(-1);
    expect(iStash).toBeLessThan(iStart);          // 격리가 먼저
    // 진행 중 세션은 DRAFT_KEY 에만 쓰고, pending 은 건드리지 않는다
    const snap = SRC.slice(SRC.indexOf('function _draftSnap'), SRC.indexOf('function _draftStart'));
    expect(snap).toMatch(/setItem\(DRAFT_KEY/);
    expect(snap).not.toMatch(/DRAFT_PENDING_KEY/);
  });

  test('복구 초안은 pending 을 먼저 읽는다 — 진행 중 초안에 가려지지 않게', () => {
    const read = SRC.slice(SRC.indexOf('function _draftRead'), SRC.indexOf('function _draftLoadMedia'));
    expect(read).toMatch(/getItem\(DRAFT_PENDING_KEY\) \|\| sessionStorage\.getItem\(DRAFT_KEY\)/);
  });

  test('TTL 만료는 pending 만 버린다 — 진행 중 세션 초안까지 날리지 않는다', () => {
    const read = SRC.slice(SRC.indexOf('function _draftRead'), SRC.indexOf('function _draftLoadMedia'));
    expect(read).toMatch(/DRAFT_TTL_MS\) \{ _draftDropPending\(\)/);
    expect(read).not.toMatch(/DRAFT_TTL_MS\) \{ _draftClear\(\)/);
  });

  test('TTL 이 있어 오래된 초안이 영원히 되살아나지 않는다', () => {
    expect(SRC).toMatch(/DRAFT_TTL_MS/);
    expect(SRC).toMatch(/Date\.now\(\) - o\.ts\) > DRAFT_TTL_MS/);
  });
});

describe('BUG-06 · 접근성 / 키보드', () => {
  test('아이콘 전용 도구 버튼 5개 전부 접근성 이름이 있다', () => {
    for (const tool of ['text', 'adjust', 'sticker', 'shape', 'draw']) {
      const m = new RegExp('data-tool="' + tool + '"[^>]*aria-label="');
      expect(SRC).toMatch(m);
    }
  });

  test('정렬 버튼 3개에 접근성 이름이 있다', () => {
    for (const a of ['left', 'center', 'right']) {
      expect(SRC).toMatch(new RegExp('data-aln="' + a + '"[^>]*aria-label="'));
    }
  });

  test('레이어 핸들에 접근성 이름이 있다', () => {
    for (const c of ['itl__del', 'itl__dup', 'itl__rot', 'itl__rs']) {
      expect(SRC).toMatch(new RegExp('class="' + c + '"[^>]*aria-label="'));
    }
  });

  test('레이어 핸들 손가락 타깃이 44px 이상이다 (아이콘 24 + inset 10*2)', () => {
    const m = CSS.match(/\.itl__del::after[^{]*\{content:"";position:absolute;inset:(-?\d+)px\}/);
    expect(m).toBeTruthy();
    expect(24 + Math.abs(Number(m[1])) * 2).toBeGreaterThanOrEqual(44);
  });

  test('Escape 로 단계적으로 빠져나간다 — 입력 → 패널 → 편집기', () => {
    const h = SRC.slice(SRC.indexOf("e.key !== 'Escape'"));
    expect(h).toMatch(/editing\.tx\.blur\(\)/);        // ① 글자 입력만 종료
    expect(h).toMatch(/_closeToolPanel\(\)/);          // ② 패널만 닫기
    expect(h).toMatch(/S\._cancelled = true/);         // ③ 편집기 취소
  });
});


/* [2026-09-10 콘솔 실측] 복구 초안의 **사진이 IDB 에 한 번도 안 들어가고 있었다.**
   `saveAssetToDB(DRAFT_ASSET, media)` 로 2개 인자를 넘겼는데 이 함수는 **인자 1개**를 받는다
   (assets store 는 keyPath:'id'). 그래서 `DataError: key path did not yield a value` 로 조용히 실패했고,
   레이어는 sessionStorage 라 복구가 되는 것처럼 보였지만 **붓그림·배경사진은 되살릴 수 없었다.**
   토스트도 에러도 사용자에겐 안 보였다 — 콘솔을 읽어서 잡았다. */
describe('BUG-02 · 초안 사진을 IDB 규약대로 저장한다', () => {
  const DB = require('fs').readFileSync(require('path').join(ROOT, 'app-gallery-db.js'), 'utf8');

  test('app-gallery-db 의 saveAssetToDB 는 인자 1개(keyPath 객체)를 받는다', () => {
    expect(DB).toMatch(/async function saveAssetToDB\(asset\)/);
    expect(DB).toMatch(/objectStore\(_ASSET_STORE\)\.put\(asset\)/);
  });

  test('편집기는 id 를 가진 객체로 저장한다 — 2인자 호출이 없다', () => {
    /* [2026-09-11] `sig:` 가 id 와 media 사이에 들어가면서 문구 고정 정규식이 깨졌다.
       계약은 '객체 1개로 저장한다(2인자 아님)' 이지 필드 순서가 아니다 — 순서에 안 묶이게 쓴다. */
    expect(SRC).toMatch(/saveAssetToDB\(\{\s*id:\s*DRAFT_ASSET,[\s\S]{0,80}?media:/);
    expect(SRC).not.toMatch(/saveAssetToDB\(DRAFT_ASSET,/);   // 옛 2인자 호출이 돌아오면 실패
  });

  test('읽을 때 레코드에서 media 만 꺼낸다', () => {
    const fn = SRC.slice(SRC.indexOf('function _draftLoadMedia'), SRC.indexOf('function _draftLoadMedia') + 700);
    /* 레코드 통째가 아니라 media 만 — 조기 반환(!rec || !rec.media)도 같은 계약이다. */
    expect(fn).toMatch(/rec\.media/);
    expect(fn).not.toMatch(/return\s+rec\s*;/);
  });
});
