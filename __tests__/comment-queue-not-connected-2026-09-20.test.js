/**
 * @jest-environment jsdom
 */
/* T-916 — 인스타 미연동 계정에서 '댓글 문의 응대' 가 영영 스켈레톤만 돌던 것.
 *
 * 실측(2026-09-20, 아이패드 시뮬레이터 · 심사 데모 계정 review@itdasy.com):
 *   화면을 열면 "인스타에서 문의 댓글을 모으는 중이에요..." 배너 + 회색 카드 2장이
 *   뜬 채로 1분 넘게 그대로였다. 앱 심사관이 이 화면에 들어오면 '버그' 로 본다.
 *
 * 원인은 네트워크도 느린 API 도 아니었다 — `_loadReal()` 이
 *   `_state = 'NOT_CONNECTED'` 까지 세워놓고 **_render() 를 안 부르고 return** 했다.
 *   상태는 바뀌었는데 DOM 은 직전(로딩) 렌더 그대로. 조용한 no-op.
 *
 * 그래서 이 테스트는 '상태 변수' 가 아니라 **화면에 글자가 나오는가**로 잠근다.
 * 내부 상태만 보면 버그가 있어도 통과한다.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'app-comment-reply-queue.js'), 'utf8');

function boot(opts) {
  opts = opts || {};
  document.body.innerHTML = '';
  localStorage.clear();
  localStorage.setItem('itdasy:crq_settings', JSON.stringify({ enabled: true }));

  window.apiUrl = (p) => 'https://api.test' + p;
  window.authHeader = () => ({ Authorization: 'Bearer t' });
  window.showToast = jest.fn();
  window.hapticLight = () => {};
  window._registerSheet = () => {};
  window._markSheetOpen = () => {};
  window._markSheetClosed = () => {};
  window._esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  window.requestAnimationFrame = (fn) => fn();

  // 'ig' 자체가 아직 없는 경우(=상태 미도착)와 연동 안 된 경우를 구분해서 재현한다.
  if (opts.adapter === 'missing') window.WorkspaceAdapter = undefined;
  else window.WorkspaceAdapter = { instagram: () => ({ connected: false }) };

  window.apiFetch = jest.fn((url) => {
    if (url.indexOf('/comment-reply-settings') >= 0) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ settings: {} }) });
    }
    // 미연동이면 큐 API 는 애초에 불리면 안 된다.
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
  });

  // eslint-disable-next-line no-new-func
  new Function(SRC).call(window);
  window.openCommentReplyQueue();
}

const body = () => document.getElementById('commentReplyQueueScreen').querySelector('.ss-body');
const flush = () => new Promise((r) => setTimeout(r, 0)).then(() => new Promise((r) => setTimeout(r, 0)));

describe('T-916 인스타 미연동 — 스켈레톤에 갇히지 않는다', () => {
  test('연동 안 된 계정은 안내 문구가 실제로 화면에 그려진다', async () => {
    boot({ adapter: 'disconnected' });
    await flush();

    const txt = body().textContent;
    expect(txt).toContain('인스타가 연결되어 있지 않아요');
    expect(body().querySelector('.crq-reconnect')).toBeTruthy();
  });

  test('로딩 안내 배너와 스켈레톤이 남아 있지 않다', async () => {
    boot({ adapter: 'disconnected' });
    await flush();

    const txt = body().textContent;
    // 버그가 되살아나면 이 문구가 화면에 남는다
    expect(txt).not.toContain('모으는 중이에요');
    // 스켈레톤 카드는 클래스가 없고 인라인 스타일뿐이라 그 지문으로 잡는다
    expect(body().innerHTML).not.toContain('width:38px;height:38px;border-radius:50%');
  });

  test('인스타 상태가 끝내 안 와도(어댑터 부재) 로딩에서 빠져나온다', async () => {
    jest.useFakeTimers();
    try {
      boot({ adapter: 'missing' });
      // 재시도 루프는 1.2초 × 12회. 넉넉히 굴린다.
      for (let i = 0; i < 16; i += 1) jest.advanceTimersByTime(1200);
      jest.runOnlyPendingTimers();
      expect(body().textContent).toContain('인스타가 연결되어 있지 않아요');
    } finally {
      jest.useRealTimers();
    }
  });

  test('소스 가드 — NOT_CONNECTED 로 바꾸는 줄은 _render() 를 같이 부른다', () => {
    /* ⚠️ 처음엔 블록 전체를 훑어 '_render()' 가 있는지만 봤는데, **바로 위에 내가 쓴
       주석 안의 `_render()` 글자**에 걸려 버그가 있어도 통과했다(네거티브 테스트로 발견).
       그래서 주석을 걷어내고 **상태를 바꾸는 그 줄 자체**만 본다. */
    const noComments = SRC
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

    const lines = noComments.split('\n').filter((l) => l.includes("_state = 'NOT_CONNECTED'"));
    expect(lines.length).toBeGreaterThan(0);

    // `_loadReal` 의 동기 분기(= 그 자리에서 return 하는 쪽)는 반드시 스스로 그려야 한다.
    const syncBranch = lines.filter((l) => l.includes('!silent'));
    expect(syncBranch.length).toBe(1);
    expect(syncBranch[0]).toContain('_render()');
    expect(syncBranch[0]).toContain('_loading = false');
  });
});
