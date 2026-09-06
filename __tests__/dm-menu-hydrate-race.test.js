/**
 * @jest-environment jsdom
 */
/* DM 설정 화면 — 늦게 온 hydrate 가 방금 누른 토글을 되돌리는가 (2026-09-06 릴리즈 게이트)
 *
 * 실측으로 잡은 결함:
 *   화면을 열자마자 '버튼 자동 안내'를 끄면
 *     · PUT(enabled:false) 은 정상으로 나가서 **서버는 꺼진다**
 *     · 그런데 뒤늦게 도착한 `_hydrate()` 가 서버의 **누르기 전** 값으로 `_menu` 를
 *       통째로 갈아끼워 화면이 다시 '켜짐' 으로 돌아왔다
 *   → 원장은 켜져 있다고 믿는데 손님에겐 아무것도 안 나간다(화면·서버 불일치).
 *
 * 항목·인사말은 서버 것이 맞으므로 hydrate 자체는 유지하고, **켜짐/꺼짐만** 최신 의도를 지킨다.
 */
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'app-dm-menu.js'), 'utf8');
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async (n) => { for (let i = 0; i < (n || 6); i++) await tick(); };

test('열자마자 끄면 — 늦은 hydrate 가 화면을 다시 켜지 않는다', async () => {
  document.body.innerHTML = '';
  localStorage.clear();

  const puts = [];
  const MENU_ON = {
    enabled: true, greeting: 'g', ice_breakers: [],
    items: [{ key: 'HOURS', label: '영업시간', enabled: true, action: 'hours',
              resp: '', ack: '', image_urls: [], custom: false }],
  };
  let releaseHydrate = null;
  let heldOnce = false;

  window.apiUrl = (p) => 'https://api.test' + p;
  window.authHeader = () => ({ Authorization: 'Bearer t' });
  window.showToast = jest.fn();
  window.toastIt = jest.fn();
  window.hapticLight = () => {};
  window._registerSheet = () => {};
  window._markSheetOpen = () => {};
  window._markSheetClosed = () => {};
  window.requestAnimationFrame = (fn) => fn();
  window.AutomationConsent = { DM_QUICK_REPLY: 'automation_dm_quick_reply', ask: () => Promise.resolve(true) };

  window.apiFetch = window.fetch = jest.fn(async (url, o) => {
    const method = (o && o.method) || 'GET';
    if (url.indexOf('/shop/dm-menu') >= 0) {
      if (method === 'PUT') { puts.push(JSON.parse(o.body)); return { ok: true, status: 200 }; }
      // 화면 진입의 첫 GET(_hydrate) 만 붙잡는다. 토글의 read-modify-write GET 은 바로 준다.
      if (!heldOnce) {
        heldOnce = true;
        await new Promise((r) => { releaseHydrate = r; });
      }
      return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(MENU_ON)) };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  });

  new Function(SRC).call(window);

  // 화면을 서버상태(ON)로 한 번 맞춰 둔다
  window.openDMMenuSettings();
  await settle(2);
  releaseHydrate();
  await settle();
  const tg = () => document.querySelector('[data-tg="master"]');
  expect(tg().getAttribute('aria-pressed')).toBe('true');

  // 다시 열어 hydrate 가 아직 안 온 상태를 만든다
  heldOnce = false; releaseHydrate = null;
  window.openDMMenuSettings();
  await settle(2);

  // 그 사이 원장이 끈다 → 서버로 OFF 가 나가야 한다
  tg().click();
  await settle();
  expect(puts.map((p) => p.enabled)).toEqual([false]);
  expect(tg().getAttribute('aria-pressed')).toBe('false');

  // 이제 늦은 hydrate 도착 — 화면을 되돌리면 안 된다
  releaseHydrate();
  await settle();
  expect(tg().getAttribute('aria-pressed')).toBe('false');
  // 서버가 준 항목은 그대로 반영돼야 한다(hydrate 를 통째로 버리면 안 됨)
  expect(document.body.innerHTML).toContain('영업시간');
});
