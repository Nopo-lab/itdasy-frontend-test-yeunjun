/**
 * @jest-environment jsdom
 *
 * perf-frontend-05 (2026-10-01) — '지연 로딩' 그룹(204파일·4.3MB)이 실제로는 load 직후 전부 내려받혔다.
 *
 * 실측: 무스로틀에서 assistant 801ms·features 816·revenue 838·extras 928·photo 1312ms 에 로드 완료
 * (홈 .hv5 1329ms) — 홈이 뜨기도 전에 308 파일 전부. Fast 3G 첫 방문은 photo 116파일 요청이
 * 콜드 script 완료 10초 전인 1.8s 에 시작돼 홈 API(건당 570~590ms)와 연결 슬롯을 다퉜다.
 *
 * 원인: js/loader.js 가 window load 직후 requestIdleCallback(timeout 4000) 로 체인을 시작했다.
 * 'idle' 은 메인스레드 기준이라 네트워크가 바쁜지(홈 API in-flight) 보지 않는다.
 *
 * 수정: 선로딩 시작 조건 = 홈 하이드레이션 완료(#homeV41Root .hv5, 또는 로그인 화면=토큰 없음)
 *       **그리고** 진행 중 apiFetch GET 0건. 상한(load+20s)이 있어 홈이 깨져도 영영 막히진 않는다.
 *       saveData 또는 effectiveType 2g/3g 면 photo 는 선로딩하지 않는다(작업실 진입 스텁이 ensure 하므로 안전).
 *       순서는 매일 쓰는 features(예약)·revenue 먼저, photo 는 마지막.
 */
const fs = require('fs');
const path = require('path');

const LOADER = fs.readFileSync(path.join(__dirname, '..', 'js', 'loader.js'), 'utf8');

function setup({ token = 'tok', inflight = 0, connection = undefined, hv5 = false } = {}) {
  jest.useFakeTimers();
  document.body.innerHTML = '<div id="lockOverlay" class="lock-overlay hidden"></div><div id="homeV41Root">' + (hv5 ? '<div class="hv5"></div>' : '') + '</div>';
  window.APP_LOAD_GROUPS = { assistant: ['a.js'], features: ['f.js'], revenue: ['r.js'], extras: ['e.js'], photo: ['p.js'] };
  delete window.AppLoader;
  ['initWorkshopTab', 'initFinishTab', 'initAiRecommendTab', 'openGalleryWrite', 'openAssistant', 'openDMConversations',
    'openKakaoHub', 'openNaverTalkLink', 'openDMThread', 'openSupportChat', 'openDMManualReplies', 'openReport',
    'openReviewRequests', 'openReminderSettings', 'openRetentionAI', 'openVoiceCaption', 'openCalendarView',
    'openBooking', 'openRevenue', 'openRevenueHub', 'openRevenueInput'].forEach((n) => { delete window[n]; });
  const state = { inflight };
  window.getToken = () => token;
  window.__itdasyInflightGET = () => state.inflight;
  window.requestIdleCallback = (fn) => setTimeout(fn, 0);
  Object.defineProperty(window.navigator, 'connection', { value: connection, configurable: true });
  const srcs = [];
  const origAppend = document.head.appendChild.bind(document.head);
  document.head.appendChild = (el) => {
    if (el && el.tagName === 'SCRIPT') { srcs.push(el.getAttribute('src')); setTimeout(() => el.onload && el.onload(), 0); return el; }
    return origAppend(el);
  };
  // eslint-disable-next-line no-new-func
  new Function(LOADER)();
  window.dispatchEvent(new Event('load'));
  return { srcs, state, showHome: () => { document.getElementById('homeV41Root').innerHTML = '<div class="hv5"></div>'; } };
}

afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

describe('지연 그룹 선로딩은 홈이 그려지고 API 가 조용해진 뒤에 시작한다', () => {
  test('★ 토큰 부팅: 홈(.hv5) 이 아직 없으면 10초가 지나도 script 요청 0건 → 홈이 뜨면 시작', async () => {
    const h = setup({ hv5: false });
    await jest.advanceTimersByTimeAsync(10000);
    expect(h.srcs).toEqual([]);
    h.showHome();
    await jest.advanceTimersByTimeAsync(3000);
    expect(h.srcs.length).toBeGreaterThan(0);
  });

  test('★ 홈은 떴지만 apiFetch GET 이 진행 중이면 기다린다 → 0건이 되면 시작', async () => {
    const h = setup({ hv5: true, inflight: 2 });
    await jest.advanceTimersByTimeAsync(5000);
    expect(h.srcs).toEqual([]);
    h.state.inflight = 0;
    await jest.advanceTimersByTimeAsync(3000);
    expect(h.srcs.length).toBeGreaterThan(0);
  });

  test('순서: features → revenue → assistant → extras → photo (매일 쓰는 것 먼저, 사진 마지막)', async () => {
    const h = setup({ hv5: true });
    await jest.advanceTimersByTimeAsync(5000);
    expect(h.srcs).toEqual(['f.js', 'r.js', 'a.js', 'e.js', 'p.js']);
  });

  test('★ saveData 면 photo 는 선로딩하지 않는다 — 단 스텁/ensure 로 들어오면 로드한다', async () => {
    const h = setup({ hv5: true, connection: { saveData: true, effectiveType: '4g' } });
    await jest.advanceTimersByTimeAsync(5000);
    expect(h.srcs).toEqual(['f.js', 'r.js', 'a.js', 'e.js']);
    const p = window.AppLoader.ensure('photo');
    await jest.advanceTimersByTimeAsync(100);
    await expect(p).resolves.toBe(true);
    expect(h.srcs).toContain('p.js');
  });

  test.each(['2g', 'slow-2g', '3g'])('effectiveType %s 면 photo 제외', async (et) => {
    const h = setup({ hv5: true, connection: { saveData: false, effectiveType: et } });
    await jest.advanceTimersByTimeAsync(5000);
    expect(h.srcs).not.toContain('p.js');
    expect(h.srcs).toContain('f.js');
  });

  test('로그인 화면(토큰 없음)에서는 홈을 기다리지 않는다 — 기존 동작 유지', async () => {
    const h = setup({ token: null, hv5: false });
    await jest.advanceTimersByTimeAsync(3000);
    expect(h.srcs.length).toBeGreaterThan(0);
  });

  test('상한: 홈이 영영 안 그려져도(연결 오류 카드 등) 20초 뒤엔 시작한다', async () => {
    const h = setup({ hv5: false });
    await jest.advanceTimersByTimeAsync(15000);
    expect(h.srcs).toEqual([]);
    await jest.advanceTimersByTimeAsync(10000);
    expect(h.srcs.length).toBeGreaterThan(0);
  });
});
