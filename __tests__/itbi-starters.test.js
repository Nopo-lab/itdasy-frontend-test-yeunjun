/* [연준님 2026-08-16 · 2차 안정화 8·9번] 빈 채팅방 초기 추천질문 회귀 방지.
 *
 * 왜 이 테스트가 필요했나 — 실측 사고:
 *   app-assistant.js 의 `SUGGESTIONS` 배열을 계정상태 기반으로 바꿨는데 화면은 그대로 옛 5개였다.
 *   캐시를 의심해 SW·캐시를 다 뒤졌지만 **네트워크 파일도 SW 캐시도 새 코드**였다.
 *   진짜 출처는 js/assistant/kind-core.js 의 _suggestions() 였고,
 *   app-assistant.js 쪽은 `window.ItdasyAssistant.SUGGESTIONS || [...]` 라
 *   이 모듈이 항상 값을 채워서 **도달조차 안 하는 죽은 폴백**이었다.
 *   → "고쳤는데 화면 그대로" 를 캐시로 단정하지 말 것. 소스가 두 군데였다.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// 폐기된 고정칩 — 계정 상태와 무관하게 몇 달째 떠 있던 것들
const LEGACY_CHIPS = ['캡션 만들어줘', '사진 보정해줘', '내일 예약 뭐 있어?'];

function loadKindCoreSuggestions() {
  const src = read('js/assistant/kind-core.js');
  const m = src.match(/function _suggestions\(\)\s*\{[\s\S]*?return\s*(\[[\s\S]*?\]);/);
  if (!m) throw new Error('kind-core.js 의 _suggestions() 를 못 찾음 — 구조가 바뀌었다');
  // eslint-disable-next-line no-eval
  return eval(m[1]);
}

describe('잇비 초기 추천질문(A) 폴백', () => {
  test('kind-core 의 _suggestions 에 구버전 고정칩이 없다', () => {
    const list = loadKindCoreSuggestions();
    const found = list.filter((q) => LEGACY_CHIPS.includes(q));
    expect(found).toEqual([]);
  });

  test('폴백은 계정 상태와 무관하게 항상 참인 조회형만 둔다', () => {
    const list = loadKindCoreSuggestions();
    expect(list.length).toBeGreaterThan(0);
    expect(list.length).toBeLessThanOrEqual(4); // 모바일 한 줄
    // 사진/캡션류는 사진이 없으면 헛걸음 → 폴백에 두지 않는다
    list.forEach((q) => {
      expect(q).not.toMatch(/캡션|보정|사진/);
    });
  });

  test('app-assistant 의 폴백 배열에도 구버전 칩이 없다', () => {
    const src = read('app-assistant.js');
    const m = src.match(/const SUGGESTIONS = _assistantCore\.SUGGESTIONS \|\|\s*(\[[\s\S]*?\]);/);
    expect(m).toBeTruthy();
    // eslint-disable-next-line no-eval
    const list = eval(m[1]);
    expect(list.filter((q) => LEGACY_CHIPS.includes(q))).toEqual([]);
  });

  test('두 폴백 목록이 서로 어긋나지 않는다(출처 이원화 재발 방지)', () => {
    const a = loadKindCoreSuggestions();
    const src = read('app-assistant.js');
    const m = src.match(/const SUGGESTIONS = _assistantCore\.SUGGESTIONS \|\|\s*(\[[\s\S]*?\]);/);
    // eslint-disable-next-line no-eval
    const b = eval(m[1]);
    expect(new Set(a)).toEqual(new Set(b));
  });
});

describe('잇비 초기 추천질문(A) 서버 연동', () => {
  test('_loadStarters 가 /assistant/starters 를 부르고 렌더를 갱신한다', () => {
    const src = read('app-assistant.js');
    expect(src).toContain("apiFetch('/assistant/starters'");
    expect(src).toContain('_loadStarters');
    // 응답을 받으면 이미 열려 있는 빈 화면도 갈아끼워야 한다
    const fn = src.slice(src.indexOf('async function _loadStarters'), src.indexOf('async function _loadStarters') + 900);
    expect(fn).toContain('_syncQuickSuggestVisibility');
  });

  test('채팅방을 열 때 starters 를 불러온다', () => {
    const src = read('app-assistant.js');
    expect(src).toMatch(/_loadProactiveSuggestions\(\);[\s\S]{0,300}_loadStarters\(\);/);
  });
});

describe('서버 후속칩(B) 렌더 배관', () => {
  test('응답의 hub_actions 가 메시지로 옮겨진다', () => {
    // 렌더러는 진작 있었는데 필드를 안 실어서 버튼이 영영 0개였던 실측 버그
    const src = read('app-assistant.js');
    expect(src).toContain('msg.hub_actions = data.hub_actions');
  });

  test('응답의 related_questions 가 후속칩으로 옮겨진다', () => {
    const src = read('app-assistant.js');
    expect(src).toContain('msg.related = data.related_questions');
  });
});

describe('초기 추천질문 렌더 경로 단일화', () => {
  test('renderSuggest 를 부르는 곳은 _renderSuggest 하나뿐이다', () => {
    // 두 갈래로 그리면 나중 호출이 앞 호출을 덮는다 —
    // 실측: 서버가 4개를 주는데 _renderSuggest 가 폴백으로 되돌려 화면은 3개 고정이었다.
    const src = read('app-assistant.js');
    const calls = src.match(/_assistantSuggestionControls\.renderSuggest\(/g) || [];
    expect(calls.length).toBe(1);
  });

  test('_renderSuggest 는 서버값(_starters)을 우선한다', () => {
    const src = read('app-assistant.js');
    const i = src.indexOf('function _renderSuggest()');
    expect(src.slice(i, i + 320)).toContain('_starters || SUGGESTIONS');
  });
});

describe('초기 추천질문 표시 조건', () => {
  test('"메시지 0건" 이 아니라 "사용자 질문 0건" 으로 판정한다', () => {
    // 채팅방을 열면 '오늘의 브리핑' 이 자동으로 올라온다. 그걸 대화로 치는 바람에
    // 신규 계정에서 초기칩이 아예 안 떴다(실측: display:none).
    const src = read('app-assistant.js');
    const i = src.indexOf('function _syncQuickSuggestVisibility');
    const body = src.slice(i, i + 1400);
    expect(body).toContain("m.role === 'user'");
    expect(body).not.toMatch(/const show = !_history \|\| _history\.length === 0/);
  });

  test('첫 질문 후 접히도록 전송 지점에 연결돼 있다', () => {
    const src = read('app-assistant.js');
    // 사용자 메시지를 push 하는 곳마다 바로 뒤에서 부른다
    const pushes = src.match(/_history\.push\(\{ role: 'user', text: q \}\);\s*\n\s*try \{ _syncQuickSuggestVisibility/g) || [];
    expect(pushes.length).toBeGreaterThan(0);
  });

  test('렌더 핫패스(_renderHistory RAF)에는 걸지 않는다', () => {
    // 실측: 여기 걸었더니 메시지 렌더가 통째로 멈췄다(브리핑만 남고 질문·답변이 안 그려짐)
    const src = read('app-assistant.js');
    const i = src.indexOf('_lastRenderedSig = _historySig();');
    expect(src.slice(i, i + 220)).not.toContain('_syncQuickSuggestVisibility');
  });

  test('매 프레임 재렌더를 막는 지문 가드가 있다', () => {
    const src = read('app-assistant.js');
    expect(src).toContain('_quickSuggestSig');
  });
});

describe('계정 전환 시 잇비 세션 리셋', () => {
  test('assistant_session_id 가 계정 전환 purge 목록에 있다', () => {
    // 없으면 로그아웃→다른 계정 로그인 후에도 이전 계정 session_id 가 남는다.
    // 서버가 user_id 로 걸러 유출은 없지만 그 상태 자체가 틀렸고 실측에서 UI 가 꼬였다.
    const src = read('app-core.js');
    const m = src.match(/const _USER_KEY_EXACT = \[([\s\S]*?)\];/);
    expect(m).toBeTruthy();
    expect(m[1]).toContain('assistant_session_id');
  });

  test('잇비도 _resetIfUserChanged 로 메모리 상태를 버린다', () => {
    // localStorage purge 는 requestIdleCallback 으로 미뤄서 돌기 때문에,
    // 리로드 없는 계정 전환에서는 클로저 변수(_sessionId/_history)가 그대로 남는다.
    const src = read('app-assistant.js');
    const i = src.indexOf('function _resetIfUserChanged()');
    expect(i).toBeGreaterThan(-1);
    const body = src.slice(i, i + 700);
    ['_sessionId = null', '_history = []', '_historyLoadedFromServer = false',
      '_starters = null', "removeItem('assistant_session_id')"].forEach((frag) => {
      expect(body).toContain(frag);
    });
  });

  test('채팅방 열 때 가장 먼저 계정 변경을 확인한다', () => {
    const src = read('app-assistant.js');
    expect(src).toMatch(/_resetIfUserChanged\(\);[\s\S]{0,220}_loadStarters\(\);/);
  });
});
