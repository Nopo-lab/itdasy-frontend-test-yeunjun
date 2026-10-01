/**
 * @jest-environment jsdom
 */
/* [AI 품질 감사 2026-10-01 · ai-quality-03/04/05/07] 캡션 진입점 5곳이 **같은 payload 빌더·같은 요청 통로**를 쓴다.
 *
 * 여기서 잠그는 것 (전부 Playwright 로 실측된 결함이다 — evidence/fe-d2/pw-fe-d2-caption-before.log):
 *   ③ 글쓰기 시트·잇비 대화·잇비 사진·즉석·음성이 use_persona 를 안 보내 원장 말투가 항상 꺼진 채
 *      로더만 '원장님 말투로 쓰는 중…' 을 보여줬다. → 공통 빌더가 use_persona(인스타 연동 기준)·
 *      strict_user_context·treatment_keyword·variation_seed 를 항상 싣고, 로더 문구는 payload 를 따라간다.
 *   ④ 잇비 대화형 캡션이 status:'clarification' 안내문을 캡션으로 표시(칩·c.last 저장)했다.
 *      → 잇비 두 경로가 app-caption 의 공용 통로(_capRequestGenerate)를 타고, 안내문이면 칩 없이 되묻는다.
 *   ⑤ 레거시 /caption/generate 응답에 status 가 생기면(백엔드 변경 중) 온보딩 팝업·설문 드로어가 안내문을
 *      결과에 꽂지 않는다. status 가 없으면 기존 동작(하위 호환).
 *   ⑦ 잇비 사진·즉석·온보딩이 입력에 없는 '24인치'·'손님께서 좋아하셨음'·'결과 대만족' 을 주입하고
 *      미매핑 업종을 'extension'/'wax' 로 강제했다. → 사실 출처는 원장 문구뿐, 미매핑 category 는 null.
 *
 * ITDASY_SRC_ROOT 환경변수로 소스 루트를 바꿔 수정 전 사본에 대해 돌리면 전부 빨강이어야 한다(수정 전 실패 증거).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = process.env.ITDASY_SRC_ROOT || path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const CAPTION_SRC = read('app-caption.js');
const ASSISTANT_SRC = read('app-assistant.js');
const INSTANT_SRC = read('app-instant-caption.js');
const VOICE_SRC = read('app-voice-caption.js');
const SURVEY_SRC = read('app-persona-survey.js');
const ONBOARDING_SRC = read('js/caption/caption-onboarding.js');
const LOADER_SRC = read('js/caption/caption-loader-ui.js');
const CATEGORIES_SRC = read('js/service-categories.js');

// 소스 계약 검사는 주석을 뺀 코드만 본다(설명문이 옛 결함 문구를 인용한다).
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/[^\n]*$/gm, '');

const CLARIFY_TEXT = '입력하신 키워드만으로는 정확한 시술 내용을 파악하기 어려워요. 시술명이나 강조 포인트를 조금 더 적어주시면 자연스럽게 캡션을 만들어드릴게요.';
const GENERATED = { status: 'generated', caption: '젤네일 완성샷이에요. 오늘도 예쁘게 마무리했어요.', body: '', hashtags: ['젤네일', '네일'], log_id: 7 };
const CLARIFICATION = { status: 'clarification', caption: CLARIFY_TEXT, body: '', hashtags: [] };

/** 200 JSON 응답을 돌려주는 apiFetch 가짜 — 보낸 body 를 기록한다. */
function fakeApiFetch(responder, calls) {
  return jest.fn(async (p, init) => {
    const body = init && init.body ? JSON.parse(init.body) : null;
    calls.push({ path: p, body });
    const data = typeof responder === 'function' ? responder(p, body) : responder;
    return { ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) };
  });
}

/** app-caption.js 를 jsdom 컨텍스트에서 실제로 실행한다(ai-caption-truth 테스트와 같은 방식). */
function loadCaption(opts) {
  opts = opts || {};
  const ctx = {
    window, document, localStorage, console,
    setTimeout, clearTimeout, setInterval, clearInterval,
    AbortController, fetch: () => Promise.reject(new Error('no network in test')),
    Math, Date, JSON, Object, Array, String, Number, Set, Map, Promise, Error, RegExp,
  };
  ctx.window.API = 'https://api.test';
  ctx.window.authHeader = () => ({ Authorization: 'Bearer t' });
  ctx.window.showToast = jest.fn();
  ctx.showToast = (...a) => ctx.window.showToast(...a);
  ctx.window.apiFetch = opts.apiFetch || fakeApiFetch(GENERATED, []);
  ctx.window.WorkspaceAdapter = opts.adapter || undefined;
  vm.createContext(ctx);
  // 분류 사전은 실제 파일로(백엔드 복제본) — 카테고리 추론이 진짜로 돌아야 '미매핑 null' 을 검증할 수 있다.
  vm.runInContext(CATEGORIES_SRC, ctx);
  const STUBS = [
    'showOnboardingCaptionPopup', 'saveOnboardingCaption', 'showCaptionLoader',
    'hideCaptionLoader', 'openInstagramProfile', 'closeUploadDone', 'doActualPublish',
    'copyCaption', 'copyAll', 'flashBtn', 'saveCaptionToGallery', 'publishFromCaption',
    'getSel', 'saveSlotToDB', 'SHOP_CONFIG',
  ];
  const prelude = STUBS.map((n) => {
    if (n === 'SHOP_CONFIG') return 'var SHOP_CONFIG = { "붙임머리": { tagLabel: "인치 선택", defaultTag: "24인치" } };';
    if (n === 'getSel') return 'var getSel = function(){ return []; };';
    if (n === 'showCaptionLoader') return 'var showCaptionLoader = globalThis.__loader = function(o){ globalThis.__loaderArgs = o; };';
    return `var ${n} = function(){};`;
  }).join('\n');
  vm.runInContext(
    prelude + '\n' + CAPTION_SRC + '\n;globalThis.__t = { '
      + 'build: (typeof _capBasePayload === "function" ? _capBasePayload : null), '
      + 'request: (typeof _capRequestGenerate === "function" ? _capRequestGenerate : null), '
      + 'personaOn: (typeof _capPersonaOn === "function" ? _capPersonaOn : null), '
      + 'doGenerate: _doGenerateCaption, regenerate: regenerateCaption, '
      + 'lastPayload: () => _lastGeneratePayload };',
    ctx,
  );
  return { t: ctx.__t, ctx };
}

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
});

describe('③ 공통 payload 빌더 — 다섯 진입점이 같은 키 집합을 보낸다', () => {
  test('빌더가 있고, 작업실 flow 와 같은 키(use_persona·strict_user_context·treatment_keyword·variation_seed)를 싣는다', () => {
    localStorage.setItem('shop_type', '네일아트');
    const { t } = loadCaption();
    expect(typeof t.build).toBe('function');
    const p = t.build({ user_text: '젤네일', length_tier: 'medium', tone_override: 'natural' });
    expect(p).toEqual(expect.objectContaining({
      category: 'nail',
      photo_context: '젤네일.',
      length_tier: 'medium',
      tone_override: 'natural',
      treatment_keyword: '젤네일',
      strict_user_context: true,
      caption_intent: 'generate',
    }));
    expect(typeof p.use_persona).toBe('boolean');
    expect(typeof p.variation_seed).toBe('string');
    expect(p.variation_seed.length).toBeGreaterThan(8);
  });

  test('use_persona 는 작업실과 같은 기준 — 인스타 연동(WorkspaceAdapter.instagram().connected)일 때만 true', () => {
    const on = loadCaption({ adapter: { instagram: () => ({ connected: true }) } });
    expect(on.t.build({ user_text: '젤네일' }).use_persona).toBe(true);
    const off = loadCaption({ adapter: { instagram: () => ({ connected: false }) } });
    expect(off.t.build({ user_text: '젤네일' }).use_persona).toBe(false);
    // 어댑터가 아직 안 올라온 화면(글쓰기 시트·잇비)에선 어댑터와 같은 캐시 키를 본다.
    localStorage.setItem('itdasy:ig_connected_cache', '1');
    expect(loadCaption().t.build({ user_text: '젤네일' }).use_persona).toBe(true);
    localStorage.removeItem('itdasy:ig_connected_cache');
    expect(loadCaption().t.build({ user_text: '젤네일' }).use_persona).toBe(false);
    // 호출자가 boolean 을 주면 그 값(작업실 토글 OFF 존중).
    expect(on.t.build({ user_text: '젤네일', use_persona: false }).use_persona).toBe(false);
  });

  test('variation_seed 는 요청마다 다르다(같은 입력 반복 → 같은 글 방지)', () => {
    const { t } = loadCaption();
    const a = t.build({ user_text: '젤네일' }).variation_seed;
    const b = t.build({ user_text: '젤네일' }).variation_seed;
    expect(a).not.toBe(b);
    expect(t.build({ user_text: '젤네일', variation_seed: 'rewrite-1-1' }).variation_seed).toBe('rewrite-1-1');
  });

  test('글쓰기 시나리오 시트가 빌더를 거쳐 보낸다 — payload 에 use_persona/strict_user_context/treatment_keyword 가 있다', async () => {
    localStorage.setItem('shop_type', '붙임머리');
    localStorage.setItem('itdasy:ig_connected_cache', '1');
    const calls = [];
    const { t } = loadCaption({ apiFetch: fakeApiFetch(GENERATED, calls) });
    await t.doGenerate({ axes: { customer: '단골', situation: '시술 완성', photo: '완성샷' }, special_context: '젤네일' }, () => {}, null);
    const sent = calls.find(c => c.path === '/persona/generate');
    expect(sent).toBeTruthy();
    expect(sent.body).toEqual(expect.objectContaining({
      category: 'nail',
      treatment_keyword: '젤네일',
      strict_user_context: true,
      use_persona: true,
      tone_override: 'natural',
    }));
    expect(sent.body.photo_context).toBe('젤네일. 단골 손님. 시술 완성. 완성샷.');
    expect(typeof sent.body.variation_seed).toBe('string');
  });

  test('로더 문구는 payload 를 따라간다 — 페르소나가 안 실리면 "원장님 말투" 라고 하지 않는다', async () => {
    localStorage.setItem('shop_type', '붙임머리');
    const off = loadCaption({ apiFetch: fakeApiFetch(GENERATED, []) });
    await off.t.doGenerate({ axes: {}, special_context: '젤네일' }, () => {}, null);
    expect(off.ctx.__loaderArgs).toEqual({ usePersona: false });
    localStorage.setItem('itdasy:ig_connected_cache', '1');
    const on = loadCaption({ apiFetch: fakeApiFetch(GENERATED, []) });
    await on.t.doGenerate({ axes: {}, special_context: '젤네일' }, () => {}, null);
    expect(on.ctx.__loaderArgs).toEqual({ usePersona: true });
  });

  test('재생성은 새 variation_seed 로 간다', async () => {
    localStorage.setItem('shop_type', '붙임머리');
    const calls = [];
    const { t } = loadCaption({ apiFetch: fakeApiFetch(GENERATED, calls) });
    await t.doGenerate({ axes: {}, special_context: '젤네일' }, () => {}, null);
    const first = calls[calls.length - 1].body.variation_seed;
    await t.regenerate({});
    const second = calls[calls.length - 1].body.variation_seed;
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);
  });
});

describe('⑦ 프런트가 환각 재료를 만들지 않는다 — 입력에 없는 사실 주입 금지·미매핑 업종 null', () => {
  test('문구가 없으면 업종명만 — defaultTag(24인치)·만족 멘트 없음', () => {
    localStorage.setItem('shop_type', '붙임머리');
    const { t } = loadCaption();
    const p = t.build({ context: '신규 손님. 시술 완성.' });
    expect(p.photo_context).toBe('붙임머리 시술. 신규 손님. 시술 완성.');
    expect(p.photo_context).not.toMatch(/24인치|좋아하셨음|대만족/);
    expect(p.treatment_keyword).toBeUndefined();
    expect(p.category).toBe('extension');   // 업종 자체는 원장이 온보딩에서 고른 사실
  });

  test('글쓰기 시트에서 문구 없이 축만 고르면 더는 "인치 선택: 24인치" 가 들어가지 않는다', async () => {
    localStorage.setItem('shop_type', '붙임머리');
    const calls = [];
    const { t } = loadCaption({ apiFetch: fakeApiFetch(GENERATED, calls) });
    await t.doGenerate({ axes: { customer: '신규', situation: '시술 완성', photo: '완성샷' }, special_context: '' }, () => {}, null);
    const sent = calls.find(c => c.path === '/persona/generate');
    expect(sent.body.photo_context).not.toMatch(/24인치/);
    expect(sent.body.photo_context).toBe('붙임머리 시술. 신규 손님. 시술 완성. 완성샷.');
  });

  test('미매핑 업종(beauty)은 category null + 중립 "뷰티 시술." — extension 강제 폴백 없음', () => {
    localStorage.setItem('shop_type', 'beauty');
    const { t } = loadCaption();
    const p = t.build({});
    expect(p.category).toBeNull();
    expect(p.photo_context).toBe('뷰티 시술.');
    // 원장이 시술을 말하면 업종과 무관하게 그 시술로 분류(v561 유지).
    expect(t.build({ user_text: '젤네일 손님 자연스럽게' }).category).toBe('nail');
  });

  test('즉석·음성 캡션이 자체 업종표/고정 멘트 대신 공통 빌더와 공용 통로를 쓴다(소스 계약)', () => {
    for (const raw of [INSTANT_SRC, VOICE_SRC]) {
      const src = stripComments(raw);
      expect(src).toMatch(/window\._capBasePayload\(/);
      expect(src).toMatch(/window\._capRequestGenerate\(/);
      expect(src).not.toMatch(/손님께서 좋아하셨음/);
      expect(src).not.toMatch(/\|\|\s*'extension'/);
      expect(src).not.toMatch(/'왁싱':\s*'wax'/);   // 백엔드 enum 에 없는 값
      expect(src).not.toMatch(/\/persona\/generate',\s*payload\)/);   // 자체 _fetchJson 직접호출 금지
    }
  });

  test('온보딩 말투 팝업·설문은 사실 주장 없는 샘플만 청한다("결과 대만족"·"만족스러운 결과" 금지)', () => {
    expect(stripComments(ONBOARDING_SRC)).not.toMatch(/결과 대만족|오늘 새로운 손님/);
    expect(stripComments(ONBOARDING_SRC)).toMatch(/말투 테스트용/);
    expect(stripComments(SURVEY_SRC)).not.toMatch(/만족스러운 결과/);
  });
});

/* ── 잇비 — 대화형(_capGenerate/_tryCaptionConversation)·사진(_generateChatCaption) 경로를 실제로 돌린다 ── */
function sliceBetween(src, startMarker, endMarker) {
  const i = src.indexOf(startMarker);
  const j = src.indexOf(endMarker, i);
  if (i < 0 || j < 0) throw new Error('marker missing: ' + startMarker.slice(0, 40));
  return src.slice(i, j);
}

function loadChatCaption(opts) {
  // 잇비 IIFE 안의 캡션 관련 함수만 떼어 실행한다 — 나머지 의존은 stub.
  const convo = sliceBetween(ASSISTANT_SRC, '  let _capCtx = null;', '  /* [잇비 관측 2026-09-11]');
  const photoStart = ASSISTANT_SRC.indexOf('  function _chatPhotoService(q) {') >= 0 ? '  function _chatPhotoService(q) {' : '  async function _generateChatCaption(opts) {';
  const photo = sliceBetween(ASSISTANT_SRC, photoStart, '  function _normalizePhotoFiles(files) {');
  const win = {
    apiFetch: opts.apiFetch,
    _capBasePayload: opts.build,
    _capRequestGenerate: opts.request,
    _capPersonaOn: opts.personaOn || (() => false),
    ServiceCategories: window.ServiceCategories,   // loadCaption() 이 실제 사전을 올려 둔다
    AiConsentHome: null,
    SHOP_CONFIG: { '붙임머리': { tagLabel: '인치 선택', defaultTag: '24인치' } },
  };
  const factory = new Function('window', 'localStorage', 'console', 'setTimeout', `
    const _history = [];
    let _sendInFlight = false;
    const _renderHistory = () => {};
    const _clearAssistantInput = () => {};
    const _looksCaptionIntent = (q) => /캡션|해시태그|홍보글/.test(String(q || ''));
    const _esc = (s) => String(s == null ? '' : s);
    ${convo}
    ${photo}
    return { tryConvo: _tryCaptionConversation, ctx: () => _capCtx, history: _history, genPhoto: _generateChatCaption };
  `);
  return factory(win, localStorage, console, setTimeout);
}

describe('④ 잇비 대화형 캡션 — 안내문(clarification)은 캡션이 아니다', () => {
  function clarifyingDeps(calls) {
    const build = loadCaption().t.build;
    return {
      build,
      // 수정 전 코드는 apiFetch 를 직접 친다 → 200 안내문을 그대로 받게 해서 옛 결함이 재현되게 둔다.
      apiFetch: fakeApiFetch(CLARIFICATION, calls),
      // 수정 후 코드는 공용 통로를 탄다 → 가드가 CAPTION_CLARIFICATION 으로 던진다(app-caption 과 동일 계약).
      request: jest.fn(async (payload) => { calls.push({ path: '/persona/generate', body: payload }); const e = new Error(CLARIFY_TEXT); e.code = 'CAPTION_CLARIFICATION'; throw e; }),
    };
  }

  test('"젤네일 캡션 만들어줘" → 안내문이면 칩 없이 되묻고 c.last 를 비워 둔다', async () => {
    localStorage.setItem('shop_type', '네일아트');
    const calls = [];
    const chat = loadChatCaption(clarifyingDeps(calls));
    expect(await chat.tryConvo(null, '젤네일 캡션 만들어줘')).toBe(true);
    const last = chat.history[chat.history.length - 1];
    expect(last.role).toBe('assistant');
    expect(last.text).not.toBe(CLARIFY_TEXT);          // 안내문을 그대로 캡션 버블로 쓰지 않는다
    expect(last.text).toMatch(/조금 더 알려주세요/);
    expect(last.related).toBeUndefined();              // '더 길게/짧게/캡션 다시' 칩 없음
    expect(chat.ctx().last).toBe('');                  // 재생성 기준(previous_caption)으로 저장되지 않는다
    expect(chat.ctx().awaiting).toBe(true);            // 다음 메시지를 시술 내역으로 받는다
  });

  test('정상 생성이면 칩이 붙고 payload 는 공통 빌더 키 집합이다', async () => {
    localStorage.setItem('shop_type', '네일아트');
    const calls = [];
    const build = loadCaption().t.build;
    const chat = loadChatCaption({
      build,
      apiFetch: fakeApiFetch(GENERATED, calls),
      request: jest.fn(async (payload) => { calls.push({ path: '/persona/generate', body: payload }); return GENERATED; }),
    });
    await chat.tryConvo(null, '젤네일 캡션 만들어줘');
    const last = chat.history[chat.history.length - 1];
    expect(last.related).toEqual(expect.arrayContaining(['더 길게', '캡션 다시']));
    expect(chat.ctx().last).toMatch(/젤네일 완성샷/);
    const sent = calls.find(c => c.path === '/persona/generate').body;
    expect(sent).toEqual(expect.objectContaining({ category: 'nail', service: '젤네일', treatment_keyword: '젤네일', strict_user_context: true }));
    expect(typeof sent.use_persona).toBe('boolean');
    expect(typeof sent.variation_seed).toBe('string');
  });

  test('잇비 사진 캡션(_generateChatCaption)도 같은 통로 — 안내문은 caption 없이 돌려준다', async () => {
    localStorage.setItem('shop_type', '붙임머리');
    const calls = [];
    const chat = loadChatCaption(clarifyingDeps(calls));
    const r = await chat.genPhoto({ question: '이 사진 인스타에 올려줘', customerCtx: null });
    expect(r.caption).toBe('');
    expect(r.error).toMatch(/키워드만으로는/);
  });
});

describe('⑦ 잇비 사진 캡션 payload — 원장 메시지만 사실 출처', () => {
  test('"이 사진 인스타에 올려줘"(붙임머리 샵) → 24인치·좋아하셨음 없음, 공통 키 집합', async () => {
    localStorage.setItem('shop_type', '붙임머리');
    const calls = [];
    const build = loadCaption().t.build;
    const chat = loadChatCaption({
      build,
      apiFetch: fakeApiFetch(GENERATED, calls),
      request: jest.fn(async (payload) => { calls.push({ path: '/persona/generate', body: payload }); return GENERATED; }),
    });
    const r = await chat.genPhoto({ question: '이 사진 인스타에 올려줘', customerCtx: null });
    expect(r.error).toBeNull();
    const sent = calls.find(c => c.path === '/persona/generate').body;
    expect(sent.photo_context).not.toMatch(/24인치|인치 선택|좋아하셨음/);
    expect(sent.photo_context).toBe('붙임머리 시술. 이 사진 인스타에 올려줘.');   // 원문은 맥락으로만
    expect(sent.treatment_keyword).toBeUndefined();   // 요청어("인스타에 올려줘")는 시술 키워드가 아니다
    expect(sent).toEqual(expect.objectContaining({ category: 'extension', strict_user_context: true }));
    expect(typeof sent.use_persona).toBe('boolean');
  });

  test('미매핑 업종(beauty) → category null, 고객 이름은 customer_name 으로', async () => {
    localStorage.setItem('shop_type', 'beauty');
    const calls = [];
    const build = loadCaption().t.build;
    const chat = loadChatCaption({
      build,
      apiFetch: fakeApiFetch(GENERATED, calls),
      request: jest.fn(async (payload) => { calls.push({ path: '/persona/generate', body: payload }); return GENERATED; }),
    });
    await chat.genPhoto({ question: '젤네일 인스타 캡션', customerCtx: { id: 1, name: '김민지' } });
    const sent = calls.find(c => c.path === '/persona/generate').body;
    expect(sent.category).toBe('nail');            // 메시지에 시술이 있으면 그걸로
    expect(sent.treatment_keyword).toBe('젤네일');
    expect(sent.customer_name).toBe('김민지');
    expect(sent.photo_context).toBe('젤네일. 김민지 손님. 젤네일 인스타 캡션.');
    // 붙임머리 원장이 흔히 쓰는 인치·재시술 문구는 사전에 없어도 시술 문구로 인정한다.
    calls.length = 0;
    await chat.genPhoto({ question: '22인치 재시술 손상모 인스타 올려줘', customerCtx: null });
    expect(calls[0].body.treatment_keyword).toBe('22인치 재시술 손상모');
    calls.length = 0;
    await chat.genPhoto({ question: '이 사진 인스타에 올려줘', customerCtx: null });
    expect(calls[0].body.category).toBeNull();     // 시술도 업종도 못 맞추면 null(extension 강제 금지)
    expect(calls[0].body.photo_context).toMatch(/^뷰티 시술\./);
  });
});

/* ── ⑤ 레거시 /caption/generate — status 로 분기(백엔드가 붙이기 전엔 기존 동작) ── */
describe('⑤ 온보딩 말투 팝업 — status:clarification 을 textarea 에 꽂지 않는다', () => {
  function runOnboarding(responseData, calls) {
    document.body.innerHTML = '<div id="onboardingCaptionPopup" style="display:none"><textarea id="ocpTextarea"></textarea><button class="ocp-save"></button></div>';
    const ctx = {
      window, document, localStorage, console, setInterval, clearInterval, setTimeout,
      apiFetch: fakeApiFetch(responseData, calls),
      authHeader: () => ({ Authorization: 'Bearer t' }),
      showToast: jest.fn(),
      JSON, String, Error, Promise, Object,
    };
    vm.createContext(ctx);
    vm.runInContext(ONBOARDING_SRC + '\n;globalThis.__run = showOnboardingCaptionPopup;', ctx);
    return ctx.__run().then(() => ({ ta: document.getElementById('ocpTextarea').value, toast: ctx.showToast }));
  }

  test('안내문이면 토스트로만 알리고 textarea 는 직접 입력 안내로 둔다', async () => {
    localStorage.setItem('shop_type', '붙임머리');
    const calls = [];
    const r = await runOnboarding({ status: 'clarification', caption: CLARIFY_TEXT, hashtags: [], platform: 'instagram' }, calls);
    expect(r.ta).not.toMatch(/키워드만으로는/);
    expect(r.ta).toMatch(/직접 평소 쓰시는 말투/);
    expect(r.toast).toHaveBeenCalledWith(expect.stringMatching(/키워드만으로는/));
    expect(calls[0].body.description).not.toMatch(/대만족|새로운 손님/);
  });

  test('status 가 없는 옛 응답은 그대로 캡션으로 쓴다(하위 호환)', async () => {
    const r = await runOnboarding({ caption: '  오늘도 예쁘게 마무리했어요.  ', hashtags: [], platform: 'instagram' }, []);
    expect(r.ta).toBe('오늘도 예쁘게 마무리했어요.');
  });
});

describe('⑤ 말투 설문 드로어 — status:clarification 을 "테스트 메시지 완성" 으로 보여주지 않는다', () => {
  function loadSurvey(responseData, calls) {
    document.body.innerHTML = '';
    const fake = fakeApiFetch(responseData, calls);
    window.apiFetch = fake;
    window.API = 'https://api.test';
    window.authHeader = () => ({ Authorization: 'Bearer t' });
    window.showToast = jest.fn();
    const ctx = { window, document, localStorage, console, setTimeout, clearTimeout, JSON, String, Object, Error, Promise, fetch: fake };
    vm.createContext(ctx);
    vm.runInContext(SURVEY_SRC, ctx);
    return window.openPersonaSurveyModal;
  }
  const flush = () => new Promise(r => setTimeout(r, 0));

  test('안내문이면 되묻기 화면(결과 박스·"맘에 들어요" 없음)', async () => {
    localStorage.setItem('shop_type', '붙임머리');
    const calls = [];
    const open = loadSurvey({ status: 'clarification', caption: CLARIFY_TEXT, hashtags: [], platform: 'instagram' }, calls);
    open({ force: true });
    document.querySelector('.psv-card[data-survey="new"]').click();
    document.getElementById('psv-go-btn').click();
    await flush(); await flush(); await flush();
    const body = document.getElementById('psv-body');
    expect(body.querySelector('#psv-done-btn')).toBeNull();
    expect(body.querySelector('#psv-result')).toBeNull();
    expect(body.textContent).toMatch(/조금만 더 알려주세요/);
    expect(body.textContent).toMatch(/키워드만으로는/);
    expect(calls[0].body.description).not.toMatch(/만족스러운 결과/);
  });

  test('status 가 없는 옛 응답은 결과 화면 그대로(하위 호환)', async () => {
    localStorage.setItem('shop_type', '붙임머리');
    const open = loadSurvey({ caption: '오랜만이에요, 또 뵙고 싶어요.', hashtags: [], platform: 'instagram' }, []);
    open({ force: true });
    document.querySelector('.psv-card[data-survey="regular"]').click();
    document.getElementById('psv-go-btn').click();
    await flush(); await flush(); await flush();
    const body = document.getElementById('psv-body');
    expect(body.querySelector('#psv-done-btn')).not.toBeNull();
    expect(body.textContent).toMatch(/오랜만이에요/);
  });
});

/* ── ③ 로더 문구 — 페르소나 꺼진 경우 정직화 ── */
describe('③ 캡션 로더 — 페르소나가 안 실리면 "원장님 말투" 라고 하지 않는다', () => {
  function loadLoader() {
    document.body.innerHTML = '<div id="captionLoadingPopup" style="display:none"><div id="clMsg"></div>'
      + [0, 1, 2].map(i => `<div class="cl-chip" id="clChip${i}"><span class="cl-chip__v">…</span></div>`).join('') + '</div>';
    const ctx = { window, document, localStorage, console, setTimeout, clearTimeout, setInterval, clearInterval, JSON, String, parseInt, Math };
    vm.createContext(ctx);
    vm.runInContext(LOADER_SRC + '\n;globalThis.__show = showCaptionLoader; globalThis.__reset = _clReset;', ctx);
    return ctx;
  }

  test('usePersona:false → "잇데이 기본 말투로 쓰는 중…" + 저장 분석값으로 칩을 채우지 않는다', () => {
    jest.useFakeTimers();
    localStorage.setItem('itdasy_latest_analysis', JSON.stringify({ tone_summary: '다정한', avg_caption_length: 200, emojis: '🌸' }));
    const ctx = loadLoader();
    ctx.__show({ usePersona: false });
    expect(document.getElementById('clMsg').textContent).toBe('잇데이 기본 말투로 쓰는 중…');
    jest.advanceTimersByTime(3000);
    expect(document.getElementById('clChip0').textContent).toBe('자연스러운');
    expect(document.getElementById('clChip1').textContent).toBe('보통');
    ctx.__reset();
    jest.useRealTimers();
  });

  test('usePersona:true → 기존 연출("원장님 말투로 쓰는 중…" + 분석 칩)', () => {
    jest.useFakeTimers();
    localStorage.setItem('itdasy_latest_analysis', JSON.stringify({ tone_summary: '다정한', avg_caption_length: 200, emojis: '🌸' }));
    const ctx = loadLoader();
    ctx.__show({ usePersona: true });
    expect(document.getElementById('clMsg').textContent).toBe('원장님 말투로 쓰는 중…');
    jest.advanceTimersByTime(3000);
    expect(document.getElementById('clChip0').textContent).toBe('다정한');
    expect(document.getElementById('clChip1').textContent).toBe('길게');
    ctx.__reset();
    jest.useRealTimers();
  });

  test('app-caption 은 payload.use_persona 를 로더에 넘긴다(소스 계약)', () => {
    expect(CAPTION_SRC).toMatch(/showCaptionLoader\(\{ usePersona: payload\.use_persona === true \}\)/);
  });
});

/* ── 소스 계약 — 되돌리면 여기서 걸린다 ── */
describe('공용 통로 계약 — /persona/generate 를 부르는 모든 파일이 status 를 검사한다', () => {
  test('app-caption: 공용 통로 자체가 clarification 가드를 거친다', () => {
    const calls = CAPTION_SRC.match(/_personaFetch\('POST', '\/persona\/generate'/g) || [];
    const guarded = CAPTION_SRC.match(/_capAssertGenerated\(await _personaFetch\('POST', '\/persona\/generate'/g) || [];
    expect(guarded.length).toBe(calls.length);
    expect(CAPTION_SRC).toMatch(/async function _capRequestGenerate\(payload\)/);
    expect(CAPTION_SRC).toMatch(/_capBasePayload,\s*\n\s*_capRequestGenerate,\s*\n\s*_capAssertGenerated,\s*\n\s*_capPersonaOn,/);
  });

  test('잇비·즉석·음성은 apiFetch/_fetchJson 으로 /persona/generate 를 직접 치지 않는다', () => {
    expect(ASSISTANT_SRC).not.toMatch(/window\.apiFetch\('\/persona\/generate'/);
    expect((ASSISTANT_SRC.match(/window\._capRequestGenerate\(/g) || []).length).toBe(2);
    expect((ASSISTANT_SRC.match(/window\._capBasePayload\(/g) || []).length).toBe(2);
    expect(INSTANT_SRC).not.toMatch(/_fetchJson\('POST', '\/persona\/generate'/);
    expect(VOICE_SRC).not.toMatch(/_fetchJson\('POST', '\/persona\/generate'/);
  });

  test('레거시 /caption/generate 두 호출부가 status:clarification 으로 분기한다', () => {
    expect(ONBOARDING_SRC).toMatch(/d\.status === 'clarification'/);
    expect(SURVEY_SRC).toMatch(/data\.status === 'clarification'/);
    expect(SURVEY_SRC).toMatch(/function _renderClarify\(/);
  });

  test('공용 통로: 200 clarification 은 CAPTION_CLARIFICATION 으로 던지고, generated 는 그대로 돌려준다', async () => {
    const calls = [];
    const { t } = loadCaption({ apiFetch: fakeApiFetch((p, body) => (body.photo_context === 'X.' ? CLARIFICATION : GENERATED), calls) });
    await expect(t.request({ photo_context: 'X.' })).rejects.toMatchObject({ code: 'CAPTION_CLARIFICATION' });
    await expect(t.request({ photo_context: '젤네일.' })).resolves.toEqual(GENERATED);
  });
});
