/**
 * [2026-09-12] 인스타 연동 두 가지 결함의 회귀 고정.
 *
 *  ① "연동하면 앱으로 돌아와야 하는데 인스타에 그대로 남는다"
 *     - 취소·실패는 백엔드가 `?ig_error=<슬러그>` 로 **앱에 302** 한다(BE 테스트가 별도로 고정).
 *       프론트는 그 슬러그마다 **사람이 읽는 문구**를 갖고 있어야 한다.
 *     - 콜백이 아예 안 오는 경우(인스타 자기 화면에서 막힘)는 `itdasy_oauth_inflight` 로
 *       "나갔다가 그냥 왔다"를 알아채고 안내한다 — 그 배선이 살아 있는지 본다.
 *
 *  ② "인스타 미연동이라고 써 있는데 인스타 프사가 보인다"
 *     - 프사는 **연동돼 있을 때만** 쓴다(window.igCachedProfilePic).
 *     - 설정 계정 카드는 배지·아바타·핸들을 **같은 기준 하나**로 그린다.
 */
const fs = require('fs');
const path = require('path');
const R = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

// ── ① 실패 문구 — 백엔드가 보내는 슬러그를 하나도 빠짐없이 받는다 ──────────
describe('① 연동 실패 안내 문구', () => {
  let MESSAGES;
  beforeAll(() => {
    const m = R('app-instagram.js').match(/const IG_FAIL_MESSAGES = \{[\s\S]*?\n\};/);
    expect(m).toBeTruthy();
    // eslint-disable-next-line no-new-func
    MESSAGES = new Function(m[0] + '; return IG_FAIL_MESSAGES;')();
  });

  // 백엔드 routers/instagram.py 가 실제로 싣는 슬러그 전부.
  test.each(['denied', 'blocked', 'profile', 'expired', 'no_code', 'failed', 'left'])(
    '%s 슬러그에 제목·설명이 있다', (slug) => {
      expect(Array.isArray(MESSAGES[slug])).toBe(true);
      const [title, body] = MESSAGES[slug];
      expect(title.length).toBeGreaterThan(4);
      expect(body.length).toBeGreaterThan(10);
    });

  test('개인 계정 문제는 "프로페셔널 계정" 을 콕 집어 말한다 — 이게 인스타에 남는 제일 흔한 원인', () => {
    expect(MESSAGES.blocked[1]).toMatch(/프로페셔널/);
    expect(MESSAGES.left[1]).toMatch(/프로페셔널/);
  });

  test('내부 용어(HTTP 코드·영문 에러)를 원장님께 그대로 보이지 않는다', () => {
    Object.values(MESSAGES).forEach(([title, body]) => {
      expect(`${title} ${body}`).not.toMatch(/HTTPException|OAuth|access_denied|50\d\b/);
    });
  });
});

// ── ① 배선 — 되돌아온 신호를 실제로 읽는가 ──────────────────────────────
describe('① 복귀 신호 배선', () => {
  const core = R('app-core.js');
  const ret = R('app-oauth-return.js');

  test('웹: ?ig_error 를 읽어 안내를 띄운다', () => {
    expect(core).toMatch(/params\.get\('ig_error'\)/);
    expect(core).toMatch(/showIgReturnFailModal/);
  });

  test('네이티브: 딥링크의 ig_error 도 같은 모달을 쓴다 (문구 두 벌 금지)', () => {
    expect(ret).toMatch(/searchParams\.get\('ig_error'\)/);
    expect(ret).toMatch(/showIgReturnFailModal/);
  });

  test('네이티브: 계정 충돌(ig_conflict)도 받는다 — 예전엔 앱에서 아무 일도 안 일어났다', () => {
    expect(ret).toMatch(/searchParams\.get\('ig_conflict'\)/);
    expect(ret).toMatch(/showInstaConflictModal/);
  });

  test('콜백이 안 온 경우: inflight 플래그를 지우기 전에 기억해서 미연동이면 안내한다', () => {
    expect(core).toMatch(/_leftForOAuth = sessionStorage\.getItem\('itdasy_oauth_inflight'\)/);
    // 판정은 반드시 status 를 기다린 뒤에 — 성공했는데 실패 안내를 띄우면 더 나쁘다.
    const idxAwait = core.indexOf('await checkInstaStatus()');
    const idxJudge = core.indexOf('_leftForOAuth && !_justOAuthed');
    expect(idxAwait).toBeGreaterThan(-1);
    expect(idxJudge).toBeGreaterThan(idxAwait);
  });

  test('연동 시작 버튼이 화면에 없어도 재시도가 죽지 않는다 (btn 널가드)', () => {
    expect(core.length).toBeGreaterThan(0);
    const ig = R('app-instagram.js');
    expect(ig).not.toMatch(/\n {2}btn\.textContent = '연결 중\.\.\.';/);
    expect(ig).toMatch(/if \(btn\) \{\n\s+btn\.textContent = '연결 중\.\.\.';/);
  });
});

// ── ② 미연동인데 프사 ────────────────────────────────────────────────
describe('② 미연동이면 인스타 프사를 쓰지 않는다', () => {
  let pick;
  beforeAll(() => {
    const m = R('app-core.js').match(/window\.igCachedProfilePic = function \(\) \{[\s\S]*?\n\};/);
    expect(m).toBeTruthy();
    const store = { 'itdasy:ig_profile_pic': 'https://cdn.example/face.jpg' };
    const w = { localStorage: { getItem: (k) => (k in store ? store[k] : null) } };
    // eslint-disable-next-line no-new-func
    new Function('window', 'localStorage', m[0])(w, w.localStorage);
    pick = (state) => { w._lastIgState = state; return w.igCachedProfilePic(); };
  });

  test('미연동이면 빈 값', () => {
    expect(pick({ connected: false })).toBe('');
  });

  test('연동돼 있으면 캐시된 프사', () => {
    expect(pick({ connected: true })).toBe('https://cdn.example/face.jpg');
  });

  test('상태를 아직 못 받았으면 기존 동작 유지(캐시 사용) — 깜빡임 방지', () => {
    expect(pick(null)).toBe('https://cdn.example/face.jpg');
  });

  test('프사를 읽는 화면들이 전부 이 통로를 쓴다 (직접 localStorage 읽기 금지)', () => {
    ['js/home/v41-renderers.js', 'app-myshop-v3.js'].forEach((f) => {
      const src = R(f);
      expect(src).toMatch(/igCachedProfilePic/);
      expect(src).not.toMatch(/localStorage\.getItem\('itdasy:ig_profile_pic'\)/);
    });
  });
});

describe('② 설정 계정 카드는 한 기준으로만 그린다', () => {
  const hub = R('app-settings-hub.js');

  test('배지·핸들·아바타가 모두 connected 를 본다 (핸들 캐시 단독 판정 금지)', () => {
    expect(hub).toMatch(/const badge = connected/);
    expect(hub).toMatch(/const isUrl = connected &&/);
    expect(hub).toMatch(/\$\{connected && handle \?/);
  });

  test('라이브 상태(_lastIgState)가 캐시보다 우선이다', () => {
    expect(hub).toMatch(/window\._lastIgState/);
    expect(hub).toMatch(/if \(!st\.connected\) return \{ handle: '', pic: '', connected: false \}/);
  });
});
