/* [잇비 전수 대화 QA · 2026-09-11] "질문을 가로채서 엉뚱하게 답하던" 6건의 회귀 가드.
 *
 * 배경: 실 Chrome(배포본 6926ff0) 으로 조회 질문 27개를 실제로 쳐 본 결과,
 * **9개가 백엔드에 닿지도 못했다.** 전부 FE 앞단 지름길이 먼저 삼킨 것이고,
 * 그중 6개는 틀린 답·회피·화면이동으로 끝났다. 백엔드엔 전부 정답 즉답이 있었다.
 *
 *   "오늘 예약 알려줘"            머리글 3건 / 카드 2장   (취소 예약을 셈)
 *   "이번 달 지출 얼마야?"        "매출 385,000원"        (실제 지출 0원)
 *   "오래 안 온 손님 누구야?"     "고객 화면에서 확인…"    (죽은 분기 — 항상 같은 회피)
 *   "회원권 만료 임박한 사람 있어?" 대화가 닫히고 시트만 열림 (추천칩인데)
 *   "이번 달 생일인 손님 있어?"   "'이번'님을 못 찾았어요"  (스타터 칩인데)
 *   "리뷰 현황 어때?"             작업실 사진 업로드로 이동
 *
 * 이 파일은 문구가 아니라 **라우팅 판정 함수를 실제로 실행**해서 막는다.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CORE = path.join(ROOT, 'js', 'assistant', 'core');

function cut(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('함수를 못 찾음: ' + name);
  let depth = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) return src.slice(i, k + 1); }
  }
  throw new Error('중괄호가 안 닫힘: ' + name);
}
function consts(src, indent = '  ') {
  const re = new RegExp('^' + indent + '(?:const|var|let)\\s+[A-Z_][A-Z0-9_]*\\s*=[^\\n]*$', 'gm');
  // 한 줄로 끝나는 선언만 (배열/객체 리터럴 시작 줄은 잘려서 문법이 깨진다)
  return [...src.matchAll(re)].map((m) => m[0]).filter((l) => /;\s*$/.test(l)).join('\n');
}
function build(src, names, helpers) {
  const code = [consts(src), ...(helpers || []).map((h) => cut(src, h)),
    ...names.map((n) => cut(src, n))].join('\n');
  const ret = '{' + names.map((n) => `${JSON.stringify(n)}: ${n}`).join(', ') + '}';
  // eslint-disable-next-line no-new-func
  return new Function(`${code}\nreturn ${ret};`)();
}

const ROUTER_SRC = fs.readFileSync(path.join(ROOT, 'assistant-intent-router.js'), 'utf8');
const GUARD_SRC = fs.readFileSync(path.join(CORE, 'customer-add-guard.js'), 'utf8');
const PHOTO_SRC = fs.readFileSync(path.join(CORE, 'photo-mode-support.js'), 'utf8');
const SAVED_SRC = fs.readFileSync(path.join(CORE, 'saved-cards-intent.js'), 'utf8');
const STATUS_SRC = fs.readFileSync(path.join(CORE, 'customer-status-card.js'), 'utf8');
const ASSISTANT_SRC = fs.readFileSync(path.join(ROOT, 'app-assistant.js'), 'utf8');

// ── 1. 예약 건수: 머리글과 카드가 같은 배열을 봐야 한다 ────────────────────
describe('오늘 예약 건수 — 취소·노쇼를 세지 않는다', () => {
  const R = build(ROUTER_SRC, ['activeBookings', '_formatBookings']);
  const items = [
    { starts_at: '2026-09-11T00:00:00Z', customer_name: 'A', status: 'confirmed' },
    { starts_at: '2026-09-11T02:00:00Z', customer_name: 'B', status: 'cancelled' },
    { starts_at: '2026-09-11T12:31:00Z', customer_name: 'C', status: 'confirmed' },
    { starts_at: '2026-09-11T13:00:00Z', customer_name: 'D', status: 'no_show' },
  ];
  test('activeBookings 가 취소·노쇼를 걷어낸다', () => {
    expect(R.activeBookings(items).map((b) => b.customer_name)).toEqual(['A', 'C']);
  });
  test('머리글 건수 == 살아있는 예약 수 (실측 FAIL: 3건이라 했는데 카드는 2장)', () => {
    const live = R.activeBookings(items);
    expect(R._formatBookings(live, '오늘')).toContain(`오늘 예약 ${live.length}건`);
    expect(R._formatBookings(live, '오늘')).toContain('오늘 예약 2건');
  });
  test('execAsyncRule 이 bookings_* 결과를 한 곳에서 필터한다 (두 갈래 금지)', () => {
    expect(ROUTER_SRC).toMatch(/\/\^bookings_\/\.test\(rule\.type[\s\S]{0,200}activeBookings\(data\.items\)/);
  });
});

// ── 2. 지출을 물으면 매출 규칙이 가로채면 안 된다 ──────────────────────────
describe('지출 질문이 매출 답으로 새지 않는다', () => {
  const E = build(ROUTER_SRC, ['_isExpenseQ']);
  const EXPENSE_QS = ['이번 달 지출 얼마야?', '오늘 지출 얼마야?', '이번 주 비용 얼마야?',
    '재료비 얼마 썼어?', '지난 달 매입 얼마야?', '이번 달 나간 돈 얼마야?'];
  test.each(EXPENSE_QS)('지출 질문으로 판정: %s', (q) => {
    expect(E._isExpenseQ(q)).toBe(true);
  });
  const REVENUE_QS = ['이번 달 매출 얼마야?', '오늘 매출 얼마야?', '이번 주 매출 얼마야?', '지난 달 매출 얼마야?'];
  test.each(REVENUE_QS)('매출 질문은 그대로 매출: %s', (q) => {
    expect(E._isExpenseQ(q)).toBe(false);
  });
  test('4개 매출 규칙 전부에 지출 가드가 붙어 있다', () => {
    const hits = ROUTER_SRC.match(/test:\s*\(q\)\s*=>\s*!_isExpenseQ\(q\)/g) || [];
    expect(hits.length).toBe(4);
  });
});

// ── 3. '오래 안 온 손님' 은 백엔드(단일 판정기)로 양보한다 ─────────────────
describe('이탈 고객 질문은 로컬에서 죽은 답을 만들지 않는다', () => {
  test('run() 이 at_risk 목록 요청을 양보한다', () => {
    expect(STATUS_SRC).toMatch(/if \(r\.list && r\.kind === 'at_risk'\) return null;/);
  });
  test("_listMessage 에 at_risk 를 []로 두는 죽은 분기가 없다", () => {
    // 주석에 실측 기록이 남아 있으므로 **실행되는 코드만** 본다.
    const code = STATUS_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/kind === 'retouch' \? \(b\.retouch_due_customers \|\| \[\]\) : \[\]/);
    expect(code).not.toContain('한동안 안 오신 고객 정보는 고객 화면에서 확인할 수 있어요');
  });
});

// ── 4. 집계 질문을 사람 이름으로 읽지 않는다 ───────────────────────────────
describe('고객 찾기 가드 — 집계어를 이름으로 집지 않는다', () => {
  const G = build(GUARD_SRC, ['_looksFindCustomer'], ['_trim']);
  const AGGREGATE = ['이번 달 생일인 손님 있어?', '단골 손님 있어?', '오늘 온 손님 있어?',
    '신규 고객 있어?', '회원권 남은 손님 있어?', '오래 안 온 고객 있나?'];
  test.each(AGGREGATE)('가로채지 않는다: %s', (q) => {
    expect(G._looksFindCustomer(q)).toBe(false);
  });
  const NAMED = ['김호영 찾아줘', '박지우 고객 검색', '김호영 고객 찾아줘'];
  test.each(NAMED)('이름 조회는 그대로 동작: %s', (q) => {
    expect(G._looksFindCustomer(q)).toBe(true);
  });
});

// ── 5. '리뷰/후기/전후' 단어만으로 사진편집 모드가 시작되면 안 된다 ────────
describe('사진편집 모드 시작 조건', () => {
  const P = build(PHOTO_SRC, ['shouldStart'], ['isExcluded']);
  const LOOKUPS = ['리뷰 현황 어때?', '리뷰 요청 현황 알려줘', '후기 현황 알려줘',
    '전후 고객 몇 명이야?', '리뷰 몇 개나 왔어?'];
  test.each(LOOKUPS)('조회 질문은 작업실을 열지 않는다: %s', (q) => {
    expect(P.shouldStart(q, { hasPhoto: false })).toBe(false);
  });
  const CREATES = ['후기 카드 만들어줘', '전후 사진 만들어줘', '리뷰 만들어줘', '후기 템플릿 보여줘'];
  test.each(CREATES)('만들기 발화는 그대로 열린다: %s', (q) => {
    expect(P.shouldStart(q, { hasPhoto: false })).toBe(true);
  });
});

// ── 6. '작업실' 상태 질문은 답을 주는 쪽으로 ───────────────────────────────
describe('작업실 상태 질문', () => {
  const S = build(SAVED_SRC, ['classify']);
  test('"작업실에 작업 중인 거 있어?" 는 작업실을 열지 않고 양보한다', () => {
    expect(S.classify('작업실에 작업 중인 거 있어?')).toBeNull();
    expect(S.classify('작업실에 뭐 있어?')).toBeNull();
  });
  test('"작업실 열어줘" 는 그대로 연다', () => {
    expect(S.classify('작업실 열어줘')).toEqual({ matched: true, mode: 'open' });
  });
});

// ── 7. 완전 일치 이름이 접두사형과 동점이 되면 안 된다 ─────────────────────
describe('고객 이름 매칭 — 완전 일치 우선', () => {
  const N = build(ROUTER_SRC, ['_nameMatches', '_decideCustomer']);
  test('"김호영" 은 "E2E_C_김호영" 보다 높은 점수', () => {
    expect(N._nameMatches('김호영', '김호영')).toBeGreaterThan(N._nameMatches('김호영', 'E2E_C_김호영'));
  });
  test('접두사형이 같이 있어도 되묻지 않는다 (실측 FAIL: "같은 이름 2명 있어요")', () => {
    const scored = [
      { c: { id: 675, name: '김호영' }, score: N._nameMatches('김호영', '김호영') },
      { c: { id: 710, name: 'E2E_C_김호영' }, score: N._nameMatches('김호영', 'E2E_C_김호영') },
    ].sort((a, b) => b.score - a.score);
    const picked = N._decideCustomer(scored);
    expect(picked.askText).toBeUndefined();
    expect(picked.customer.id).toBe(675);
  });
  test('진짜 동명이인은 여전히 되묻는다', () => {
    const scored = [
      { c: { id: 705, name: 'E2E_G_김민수', phone: '010-0000-0007' }, score: 110 },
      { c: { id: 706, name: 'E2E_G_김민수', phone: '010-0000-0008' }, score: 110 },
    ];
    expect(N._decideCustomer(scored).askText).toContain('같은 이름 2명');
  });
});

// ── 8. 질문형이면 화면이동 지름길을 쓰지 않는다 ────────────────────────────
describe('화면이동 지름길은 명령에만', () => {
  // app-assistant.js 는 거대 IIFE 라 상수를 통째로 끌어오면 무관한 참조가 딸려온다.
  //   필요한 두 정규식 + 함수만 잘라 실행한다.
  const A = (() => {
    const pick = (name) => ASSISTANT_SRC.match(new RegExp('^  const ' + name + ' = [^\\n]*;$', 'm'))[0];
    const code = [pick('_ASK_RE'), pick('_OPEN_VERB_RE'), cut(ASSISTANT_SRC, '_isStatusQuestion')].join('\n');
    // eslint-disable-next-line no-new-func
    return new Function(code + '\nreturn { _isStatusQuestion };')();
  })();
  const ASKS = ['회원권 만료 임박한 사람 있어?', '이탈 고객 누구야?', '재방문 안 한 손님 알려줘',
    '매출 분석 어때?', '리뷰 요청 현황 알려줘'];
  test.each(ASKS)('질문으로 판정: %s', (q) => expect(A._isStatusQuestion(q)).toBe(true));
  const CMDS = ['회원권 만료 관리 화면 열어줘', '이탈 고객 관리 열어줘', '인사이트 화면으로 이동',
    '리뷰 요청 보내줘'];
  test.each(CMDS)('명령으로 판정: %s', (q) => expect(A._isStatusQuestion(q)).toBe(false));
  test('회원권·이탈·인사이트·리뷰 지름길이 askOnly 로 감싸져 있다', () => {
    const block = ASSISTANT_SRC.slice(ASSISTANT_SRC.indexOf('function _trySimpleOpenShortcut'),
      ASSISTANT_SRC.indexOf('function _runFirstShortcutPair'));
    expect((block.match(/askOnly \? \[\] :/g) || []).length).toBe(4);
  });
});


// ── 9. 잇비가 시킨 말을 잇비가 알아들어야 한다 (배포후 라이브 게이트에서 발견) ──────
describe('서수로 고객 지목 — "첫 번째 손님"', () => {
  const UNSUP_SRC = fs.readFileSync(path.join(CORE, 'unsupported-intent.js'), 'utf8');
  const U = build(UNSUP_SRC, ['classify']);

  /* 목록 뒤 "그 고객 …" 에 잇비가 되묻는다:
       "(이름을 그대로 말씀하시거나 "첫 번째 손님" 처럼 말씀해 주세요)"
     그대로 따라 말했더니 **"새로 만들려면 '후기 카드 만들어줘'처럼…"** 이 나왔다.
     앱이 알려준 대로 했는데 못 알아듣는 건, 그냥 못 알아듣는 것보다 나쁘다. */
  test.each([
    '첫 번째 손님 마지막 방문은?',
    '두 번째 고객 예약 있어?',
    '세 번째 분 잔액 얼마야?',
    '첫번째 손님 누구야?',
  ])('사람을 가리키는 서수는 가로채지 않는다: %s', (q) => {
    expect(U.classify(q)).toBeNull();
  });

  test.each([
    ['첫 번째가 나았어', 'retry_alt'],
    ['두 번째 디자인으로 바꿔', 'retry_alt'],
  ])('디자인 대안 서수는 그대로 안내한다: %s', (q, kind) => {
    expect(U.classify(q)).toEqual({ kind });
  });
});

// ── 10. 질문이 영구 기억으로 저장되면 안 된다 (배포후 라이브 게이트 P1) ─────────
describe('메모 인텐트 — 묻는 문장은 저장이 아니다', () => {
  const MEM_SRC = fs.readFileSync(path.join(CORE, 'memory-intent.js'), 'utf8');
  // CUSTOMER_SCOPE_RE 는 여러 줄 `new RegExp(...)` 이라 한 줄 상수 추출에 안 잡힌다 — 통째로 가져온다.
  const M = (() => {
    const multi = MEM_SRC.slice(MEM_SRC.indexOf('  var CUSTOMER_SCOPE_RE'),
      MEM_SRC.indexOf('  function _isCustomerScoped'));
    // SAVE_TRIG 는 여러 줄 배열 리터럴이라 역시 따로 가져온다.
    const arr = MEM_SRC.slice(MEM_SRC.indexOf('  var SAVE_TRIG'),
      MEM_SRC.indexOf('  // 회상(= "뭐 기억해?")'));
    const code = [consts(MEM_SRC), arr, multi,
      cut(MEM_SRC, '_stripTail'), cut(MEM_SRC, '_isCustomerScoped'),
      cut(MEM_SRC, '_extractMemo'), cut(MEM_SRC, 'classify')].join('\n');
    // eslint-disable-next-line no-new-func
    return new Function(code + '\nreturn { classify };')();
  })();

  /* 실측(배포본 1fa49ff):
       Q "김호영님 010-7001-0012 이메일 qa-test@example.com 메모해둔 거 있어?"
       A "기억했어요 🧠 "김호영님 010-7001-0012 …" — 앞으로 참고할게요."
     물어본 문장이 그대로 원장 기억에 박혔고, 거기 전화번호와 이메일이 들어 있었다. */
  test.each([
    '김호영님 010-7001-0012 이메일 qa-test@example.com 메모해둔 거 있어?',
    '김호영님 메모해둔 거 있어?',
    '메모해둔 거 뭐 있어?',
    '박지우님 알러지 메모 있나?',
  ])('질문은 저장하지 않는다: %s', (q) => {
    const r = M.classify(q);
    expect(r && r.mode).not.toBe('save');
  });

  test.each([
    '보정 전에 항상 확인하는 거 기억해줘',
    '월요일은 오후 2시부터라고 메모해줘',
  ])('진짜 저장 요청은 그대로 저장한다: %s', (q) => {
    expect(M.classify(q).mode).toBe('save');
  });

  test('고객 메모는 길어져도 원장 기억으로 새지 않는다 (창 24자 → 60자)', () => {
    const long = '김호영님 010-7001-0012 이메일 qa-test@example.com 알러지 있다고 메모해줘';
    expect(M.classify(long)).toBeNull();
  });
});
