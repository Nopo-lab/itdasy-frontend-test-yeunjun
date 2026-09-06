/**
 * @jest-environment jsdom
 */
/* 자동화 토글 OFF 경로 — 화면과 서버가 어긋나는가 (2026-09-06 릴리즈 게이트)
 *
 * 잠그는 것:
 *   ① 댓글 마스터 토글 OFF 저장이 실패하면 화면도 되돌려야 한다.
 *      (지금은 결과를 안 본다 → 화면 OFF · 서버 ON = 원장은 껐다고 믿는데 계속 돈다)
 *   ② 빠르게 ON→OFF 를 누르면 **마지막 의도(OFF)** 가 서버에 가야 한다.
 *      (지금은 진행 중 저장이 있으면 그 promise 를 그대로 돌려주고 새 PUT 을 안 쏜다)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'app-comment-reply-queue.js'), 'utf8');

let puts;      // PUT /comment-reply-settings 로 실제 나간 것들
let getCtl;    // 설정 GET 의 resolve (늦게 도착하는 응답 재현)
let putCtl;    // 각 PUT 의 resolve 를 손으로 쥔다 (in-flight 재현)

function boot(opts) {
  opts = opts || {};
  document.body.innerHTML = '';
  localStorage.clear();
  puts = [];
  putCtl = [];
  getCtl = [];
  localStorage.setItem('itdasy:crq_settings', JSON.stringify({ enabled: !!opts.startOn }));

  window.apiUrl = (p) => 'https://api.test' + p;
  window.authHeader = () => ({ Authorization: 'Bearer t' });
  window.showToast = jest.fn();
  window.toastIt = jest.fn();
  window.hapticLight = () => {};
  window._registerSheet = () => {};
  window._markSheetOpen = () => {};
  window._markSheetClosed = () => {};
  window._esc = (s) => String(s == null ? '' : s);
  window.requestAnimationFrame = (fn) => fn();
  window.WorkspaceAdapter = { instagram: () => ({ connected: true }) };
  // 동의 시트는 항상 통과 — 여기서 보는 건 시트가 아니라 저장 경로다
  window.AutomationConsent = {
    COMMENT_AUTOREPLY: 'automation_comment_autoreply',
    ask: () => Promise.resolve(true),
  };

  window.apiFetch = jest.fn((url, o) => {
    const method = (o && o.method) || 'GET';
    if (url.indexOf('/comment-reply-settings') >= 0) {
      if (method === 'PUT') {
        const body = JSON.parse(o.body);
        puts.push(body.settings);
        if (opts.manualPut) {
          return new Promise((res) => putCtl.push(() => res({ ok: !opts.putFails, status: opts.putFails ? 500 : 200 })));
        }
        return Promise.resolve({ ok: !opts.putFails, status: opts.putFails ? 500 : 200 });
      }
      // GET — 서버에 저장된 값 없음(신규).
      if (opts.holdGet) {
        return new Promise((res) => getCtl.push((body) => res({
          ok: true, status: 200, json: () => Promise.resolve(body),
        })));
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ settings: {} }) });
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ connected: true, items: [] }) });
  });

  new Function(SRC).call(window);
  window.openCommentReplyQueue();
  // 설정 화면으로
  document.querySelector('.crq-gear').click();
}

const master = () => document.querySelector('.crq-master');
const flush = () => new Promise((r) => setTimeout(r, 0));

test('① OFF 저장이 실패하면 화면도 되돌아온다 (지금은 성공처럼 보인다)', async () => {
  boot({ startOn: true, putFails: true });
  expect(master().getAttribute('aria-checked')).toBe('true');

  master().click();                       // 끄기
  await flush(); await flush();

  expect(puts).toEqual([expect.objectContaining({ enabled: false })]);
  // 서버가 거부했으므로 화면은 ON 으로 돌아와 있어야 한다
  expect(master().getAttribute('aria-checked'))
    .toBe('true');                        // 🔴 실패하면: 화면 OFF · 서버 ON
});

test('② ON 직후 OFF 를 누르면 마지막 의도(OFF)가 서버에 간다', async () => {
  boot({ startOn: false, manualPut: true });
  expect(master().getAttribute('aria-checked')).toBe('false');

  master().click();                       // 켜기 → PUT(enabled:true) 진행 중
  await flush(); await flush();
  expect(puts.length).toBe(1);
  expect(puts[0].enabled).toBe(true);

  master().click();                       // 그 사이 끄기
  await flush(); await flush();

  putCtl.forEach((r) => r());             // 진행 중이던 PUT 들 완료
  await flush(); await flush();

  const last = puts[puts.length - 1];
  expect(last.enabled).toBe(false);       // 🔴 실패하면: 서버엔 ON 만 남고 화면은 OFF
});

/* ③ 서버가 "저장된 설정 없음" 이라고 하면 화면도 꺼짐이어야 한다.
   백엔드 `_crq_enabled` 는 crq_settings_json 의 `enabled is True` 를 요구하므로
   **서버가 비었다 = 자동화는 확실히 OFF** 다. 그런데 로컬 localStorage 에 옛 ON 이
   남아 있으면(계정 전환 purge 가 rIC 라 늦거나 못 돌면) 화면만 켜진 것으로 보인다.
   원장은 "댓글 모아주는 중" 이라고 믿는데 큐는 영원히 비어 있다. */
test('③ 서버에 저장된 설정이 없으면 로컬의 옛 ON 을 따라가지 않는다', async () => {
  boot({ startOn: true });                // 이전 원장이 남긴 로컬 ON
  await flush(); await flush(); await flush();
  document.querySelector('.crq-gear').click();
  expect(master().getAttribute('aria-checked')).toBe('false');
});

/* ④ 설정 GET 이 도는 사이에 원장이 켜면, 늦게 온 GET(=누르기 전 상태)이 그걸 되돌리면 안 된다.
   되돌리면 PUT 은 이미 켜기로 나간 뒤라 **서버 ON · 화면 OFF** 로 또 어긋난다. */
test('④ 늦게 온 설정 GET 이 방금 누른 토글을 되돌리지 않는다', async () => {
  boot({ startOn: false, holdGet: true });
  document.querySelector('.crq-gear').click();

  master().click();                       // 켜기 (GET 은 아직 안 왔다)
  await flush(); await flush();
  expect(master().getAttribute('aria-checked')).toBe('true');

  getCtl.forEach((r) => r({ settings: {} }));   // 이제 도착 — 내용은 '저장된 것 없음'
  await flush(); await flush();

  expect(master().getAttribute('aria-checked')).toBe('true');
  expect(puts[puts.length - 1].enabled).toBe(true);
});

/* ⑤ 접근성 — 마스터 토글은 키보드로 닿아야 한다.
   `role="switch"` 만 붙은 <span> 은 tabindex 가 없으면 Tab 으로 못 간다.
   DM 쪽 토글은 <button> 이라 되는데 댓글 마스터만 안 됐다 — **끄는 길**이 막히는 셈이다. */
test('⑤ 마스터 토글이 키보드로 닿고 Enter/Space 로 눌린다', async () => {
  boot({ startOn: false });
  await flush(); await flush();
  document.querySelector('.crq-gear').click();

  const m = master();
  expect(m.tabIndex).toBe(0);
  expect(m.getAttribute('role')).toBe('switch');

  m.focus();
  expect(document.activeElement).toBe(m);

  // Enter 로 켜기 시도 → 동의 시트를 거쳐 켜진다 (클릭과 같은 경로)
  m.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await flush(); await flush(); await flush();
  expect(master().getAttribute('aria-checked')).toBe('true');
  expect(puts[puts.length - 1].enabled).toBe(true);
});

test('⑥ Space 로도 눌린다 — 그리고 페이지가 스크롤되지 않는다', async () => {
  boot({ startOn: false });
  await flush(); await flush();
  document.querySelector('.crq-gear').click();

  master().click();                                   // 먼저 켠다
  await flush(); await flush(); await flush();
  expect(master().getAttribute('aria-checked')).toBe('true');

  const ev = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
  master().dispatchEvent(ev);                         // Space 로 끈다
  await flush(); await flush();
  expect(ev.defaultPrevented).toBe(true);            // Space 기본동작(스크롤) 차단
  expect(master().getAttribute('aria-checked')).toBe('false');
  expect(puts[puts.length - 1].enabled).toBe(false); // 끄기가 서버까지 갔다
});
