/*
 * autosend-toggle.test.js — AI 자동발송 토글 UI 계약  [P0-2 2026-08-20]
 *
 * ── 왜 소스 계약 테스트인가
 *   `app-dm-menu.js` 는 `_render()` 가 `body.innerHTML` 을 쓰는 DOM 화면이다.
 *   **깨지면 실제 사고가 되는 계약**만 소스에서 잠근다. 화면 픽셀은 브라우저 실측으로 본다.
 *
 *   [2026-08-26] 동의 시트는 `js/automation-consent.js` 로 빠졌다(토글 4개 공용).
 *   시트 자체의 동작(체크박스 없이는 안 켜짐 등)은 jsdom 으로 실제로 눌러 보는
 *   `__tests__/automation-consent.test.js` 가 본다. 여기는 **이 토글이 그 시트를 거치는가**만 본다.
 *   (선례: js/workspace/__tests__/work-memory-apply-undo.test.js 의 '편집기 소스 계약')
 *
 * ── 여기서 잠그는 사고 4개
 *   1. 🔴 부분 본문 저장 → 원장님 톤·운영시간·예약금이 통째로 초기화된다.
 *      서버 `POST /instagram/dm-reply/settings` 는 **full-replace** 다(백엔드 테스트가 고정).
 *      그래서 반드시 GET → 수정 → POST 여야 한다.
 *   2. 🔴 동의 없이 켜짐 → AI 가 지은 글이 원장님 확인 없이 손님에게 나간다.
 *   3. 🔴 끌 때도 동의를 물음 → 끄는 건 언제나 안전한데 손만 더 가고, 급할 때 못 끈다.
 *   4. 🔴 시트 뒤로가기 미등록 → 안드로이드에서 뒤로가기가 **앱을 종료**시킨다.
 */
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'app-dm-menu.js'), 'utf8');

/** 함수 하나의 본문만 잘라낸다 — 다른 함수의 코드가 섞여 오탐/미탐이 나지 않게. */
function fnBody(src, name) {
  const start = src.indexOf(name);
  expect(start).toBeGreaterThan(-1);
  const after = src.slice(start);
  // 다음 최상위 함수 선언까지
  const next = after.slice(1).search(/\n {2}(?:async )?function /);
  return next === -1 ? after : after.slice(0, next + 1);
}

describe('로드 계약', () => {
  test('전역 오염 없이 로드되고 진입점을 등록한다', () => {
    const win = {};
    const ctx = { window: win, document: undefined, localStorage: undefined };
    // IIFE 는 로드 시점에 DOM 을 만지지 않는다 — 그래서 window 스텁만으로 실행된다.
    // 이게 깨지면(로드 중 document 접근) 초기 부팅 순서에 민감해졌다는 신호다.
    new Function('window', 'document', 'localStorage', SRC)(win, ctx.document, ctx.localStorage);
    expect(typeof win.openDMMenuSettings).toBe('function');
    // 진입점 흡수 관계 유지 (2026-08-16 통합)
    expect(win.openDMAutoreplySettings).toBe(win.openDMMenuSettings);
  });
});

describe('[1] 저장은 read-modify-write — 다른 DM 설정을 초기화하지 않는다', () => {
  const body = fnBody(SRC, 'async function _syncAutosendEnabled');

  test('POST 전에 GET 으로 현재 설정을 먼저 읽는다', () => {
    const getAt = body.indexOf("apiUrl('/instagram/dm-reply/settings')");
    const postAt = body.indexOf("method: 'POST'");
    expect(getAt).toBeGreaterThan(-1);
    expect(postAt).toBeGreaterThan(-1);
    expect(getAt).toBeLessThan(postAt);           // GET 이 먼저여야 read-modify-write
  });

  test('본문은 서버가 준 전체 설정(cur)을 그대로 보낸다', () => {
    expect(body).toMatch(/cur\.dm_autosend_enabled\s*=\s*!!on/);
    expect(body).toMatch(/body:\s*JSON\.stringify\(cur\)/);
  });

  test('🔴 토글만 담은 부분 본문을 만들지 않는다', () => {
    // `{ dm_autosend_enabled: ... }` 리터럴을 본문으로 쓰면 서버가 나머지를 기본값으로 덮는다
    expect(body).not.toMatch(/JSON\.stringify\(\s*\{/);
  });

  test('실패하면 화면 상태를 되돌린다 — 켜진 것처럼 보이는데 안 나가는 게 최악', () => {
    expect(body).toMatch(/_ai\.dm_autosend_enabled\s*=\s*!on/);
    expect(body).toMatch(/_render\(\)/);
  });

  test('경합 가드(seq)를 쓴다 — 빠르게 두 번 눌렀을 때 마지막 의도만 남는다', () => {
    expect(body).toMatch(/const seq = \+\+_aiSyncSeq/);
    expect(body.match(/if \(seq !== _aiSyncSeq\) return;/g).length).toBeGreaterThanOrEqual(2);
  });
});

describe('[2][3] 동의는 켤 때만', () => {
  const handler = SRC.slice(SRC.indexOf("if (kind === 'autosend')"),
                            SRC.indexOf("if (kind === 'ice')"));

  test('켜는 방향은 동의 시트를 거친다', () => {
    expect(handler).toMatch(/_consentThenApply\(_AC\(\)\.DM_AUTOSEND, _apply\)/);
  });

  test('끄는 방향은 즉시 적용한다 (안 묻는다)', () => {
    // `if (!_next) { _apply(); return; }` — OFF 는 동의 없이 바로
    expect(handler).toMatch(/if \(!_next\)\s*\{\s*_apply\(\);\s*return;\s*\}/);
    const offAt = handler.indexOf('if (!_next)');
    const consentAt = handler.indexOf('_consentThenApply');
    expect(offAt).toBeLessThan(consentAt);        // OFF 조기 반환이 동의보다 먼저
  });

  test('동의 후에만 서버로 나간다 — _apply 안에서만 sync 를 부른다', () => {
    expect(handler).toMatch(/const _apply = \(\) => \{[^}]*_syncAutosendEnabled\(_next\);\s*\}/);
    // _apply 밖에서 직접 부르는 경로가 없어야 한다
    expect(handler.match(/_syncAutosendEnabled\(/g)).toHaveLength(1);
  });

  test('초안(B묶음)이 꺼져 있으면 켜지지 않고 이유를 알려준다', () => {
    expect(handler).toMatch(/if \(!_ai\.enabled\)/);
    expect(handler).toMatch(/_toast\(/);
  });
});

describe('[4] 동의 시트 — 공용 모듈 쪽 계약', () => {
  // [2026-08-26] 시트가 `js/automation-consent.js` 로 옮겨갔다. 옛 `_askAutosendConsent`
  //   본문에서 보던 것들을 그대로 새 위치에서 본다 — 검사를 잃어버리면 사고가 되돌아온다.
  const CONSENT = fs.readFileSync(
    path.join(__dirname, '..', '..', 'automation-consent.js'), 'utf8');

  test('_registerSheet + _markSheetOpen 을 부른다', () => {
    // 빠뜨리면 안드로이드 뒤로가기가 앱을 종료시킨다 (반복 사고)
    expect(CONSENT).toMatch(/var ID = 'automationConsentSheet';/);
    expect(CONSENT).toMatch(/_registerSheet\(ID,/);
    expect(CONSENT).toMatch(/_markSheetOpen\(ID\)/);
    expect(CONSENT).toMatch(/_markSheetClosed\(ID\)/);
  });

  test('배경 탭은 취소(안전한 쪽)로 닫는다', () => {
    expect(CONSENT).toMatch(/if \(e\.target === ov\) \{ finish\(false\); return; \}/);
  });

  test('safe-area 를 반영한다 (홈바에 버튼이 가리지 않게)', () => {
    expect(CONSENT).toMatch(/safe-area-inset-bottom/);
  });

  test('자동발송 동의 문구가 서버 동작과 어긋나지 않는다', () => {
    // 각 문구는 코드 근거가 있다. 근거 없는 약속을 화면에 쓰면 그게 사고다.
    const block = CONSENT.slice(CONSENT.indexOf('automation_dm_autosend: {'),
                                CONSENT.indexOf('automation_dm_quick_reply: {'));
    expect(block).toMatch(/사장님 확인 없이/);        // 자동발송의 실제 의미
    expect(block).toMatch(/환불|민원/);               // dm_autoreply _RISK_KEYWORDS
    expect(block).toMatch(/화난 말투/);               // services/dm_safety.py
    expect(block).toMatch(/끄면 그 순간부터/);         // should_autosend 가 발송 시점 재조회
    expect(block).toMatch(/지어내지 않고/);            // 할루시네이션 가드
  });
});

describe('화면이 실제 상태를 말한다', () => {
  const render = fnBody(SRC, 'function _render');

  test('자동발송 ON 일 때 "마음대로 안 보내요" 문구가 남아 있지 않다', () => {
    // 🔴 이게 깨지면 화면이 거짓말을 한다 — 자동으로 보내는 중인데 안 보낸다고 적혀 있음
    expect(render).toMatch(/autoSendOn\s*\?/);
    const lie = /마음대로 안 보내요/;
    expect(render).toMatch(lie);                            // OFF 쪽 문구로는 남아 있어야 하고
    // ON/OFF 분기 안에 들어가 있어야 한다 (무조건 출력이면 거짓말이 된다)
    const idx = render.search(lie);
    const branch = render.slice(Math.max(0, idx - 400), idx);
    expect(branch).toMatch(/autoSendOn/);
  });

  test('초안이 꺼져 있으면 자동발송도 꺼진 것으로 그린다', () => {
    // 서버도 `autoreply_disabled` 로 막는다 — 화면이 같은 규칙이어야 한다
    expect(render).toMatch(/const autoSendOn = aiOn && !!\(_ai && _ai\.dm_autosend_enabled\)/);
  });

  test('토글이 autosend kind 로 렌더된다', () => {
    expect(render).toMatch(/_tgHtml\(autoSendOn, 'autosend', ''\)/);
  });
});

describe('아이콘은 Lucide SVG — 이모지 금지 (레포 규칙)', () => {
  /* 규칙 대상은 **손님·원장이 보는 마크업**이다. 코드 주석의 🔴 같은 표시는 해당 없다.
     그래서 innerHTML 템플릿 리터럴만 잘라서 본다. */
  function markup(fnName, endName) {
    const chunk = SRC.slice(SRC.indexOf(fnName), SRC.indexOf(endName));
    const open = chunk.indexOf('innerHTML = `');
    expect(open).toBeGreaterThan(-1);
    return chunk.slice(open, chunk.indexOf('`;', open));
  }

  test('동의 시트 마크업에 이모지가 없다 (Lucide SVG 만)', () => {
    // [2026-08-26] 시트는 js/automation-consent.js 로 이동. 마크업은 ov.innerHTML 문자열 결합.
    const CONSENT = fs.readFileSync(
      path.join(__dirname, '..', '..', 'automation-consent.js'), 'utf8');
    const m = CONSENT.slice(CONSENT.indexOf('function sheetHtml('),
                            CONSENT.indexOf('function wire('));
    expect(m).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(m).toMatch(/<svg /);                 // 아이콘은 인라인 SVG 로
  });

  test('B묶음 카드 마크업에도 이모지가 없다', () => {
    const m = markup('function _render', 'function _onClick');
    expect(m).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
