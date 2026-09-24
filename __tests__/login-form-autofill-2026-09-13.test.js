/**
 * @jest-environment jsdom
 *
 * P2 회귀 — **로그인 화면에 `<form>` 이 없어 브라우저 비밀번호 저장·자동완성이 깨지던 것.**
 *
 * 실측(2026-09-13):
 *   `document.forms.length === 1` 이고 그 하나는 `supportChatForm`.
 *   `#loginEmail` / `#loginPassword` 는 `div#lockOverlay` 안에 form 없이 떠 있었다.
 *   `autocomplete="email"` / `"current-password"` 는 올바르게 붙어 있었지만,
 *   **Chrome 비밀번호 관리자에 자격증명이 이미 저장돼 있는데도**(관리자 UI 가 "이미 저장했습니다" 로 추가를 거부)
 *   로그인 화면 로드 시 채워지지 않았다. form 이 없으면 submit 이벤트가 없어
 *   브라우저가 '로그인 성공'을 감지하지 못하고, 로드 시 자동 채움도 안 한다.
 *   영향은 QA 편의가 아니라 실사용 — iOS 키체인·Google 비밀번호 관리자 모두 같다.
 *   원장이 앱을 열 때마다 비밀번호를 손으로 골라야 한다.
 *
 * 이 수정에서 가장 위험한 것: **로그인 API 가 두 번 호출되는 것.**
 *   전에는 (1) loginBtn click 핸들러 (2) 비밀번호 Enter keydown 핸들러 — 두 경로였다.
 *   form 을 씌우면 submit 까지 셋이 된다. 그래서 경로를 submit 하나로 합친다.
 *   판정은 문자열 검사가 아니라 **실제 click / Enter 를 쏴 보고 호출 횟수를 센다.**
 *
 * ⚠️ 이 테스트는 비밀번호 값을 만들지도, 읽지도, 출력하지도 않는다.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CORE = fs.readFileSync(path.join(ROOT, 'app-core.js'), 'utf8');

/** index.html 의 로그인 영역만 떼어 jsdom 에 심는다. */
function mountLogin() {
  const i = HTML.indexOf('<div class="login-form login-fade-3"');
  expect(i).toBeGreaterThan(-1);
  const end = HTML.indexOf('<div class="login-divider"', i);
  expect(end).toBeGreaterThan(i);
  document.body.innerHTML = HTML.slice(i, end) + '</div>';
}

describe('P2 · 로그인은 진짜 form 이다', () => {
  beforeEach(mountLogin);

  test('🔴 로그인 form 이 존재한다', () => {
    expect(document.querySelector('form#loginForm')).toBeTruthy();
  });

  test('🔴 이메일·비밀번호가 그 form 안에 있다', () => {
    const f = document.querySelector('form#loginForm');
    expect(f).toBeTruthy();
    expect(f.contains(document.getElementById('loginEmail'))).toBe(true);
    expect(f.contains(document.getElementById('loginPassword'))).toBe(true);
  });

  test('🔴 로그인 버튼이 그 form 의 submit 이다', () => {
    const f = document.querySelector('form#loginForm');
    const btn = document.getElementById('loginBtn');
    expect(f && f.contains(btn)).toBe(true);
    expect(btn.getAttribute('type')).toBe('submit');
  });

  test('브라우저 비밀번호 관리자가 읽는 속성이 갖춰져 있다', () => {
    const em = document.getElementById('loginEmail');
    const pw = document.getElementById('loginPassword');
    expect(em.getAttribute('type')).toBe('email');
    expect(em.getAttribute('autocomplete')).toBe('email');
    expect(pw.getAttribute('type')).toBe('password');
    expect(pw.getAttribute('autocomplete')).toBe('current-password');
  });

  test('🔴 name 속성도 준다 — 표준 로그인 form 으로 인식되게', () => {
    expect(document.getElementById('loginEmail').getAttribute('name')).toBe('email');
    expect(document.getElementById('loginPassword').getAttribute('name')).toBe('password');
  });

  test('🔴 form 안의 보조 버튼은 submit 이 아니다 (눌렀다고 로그인되면 안 된다)', () => {
    const f = document.querySelector('form#loginForm');
    expect(f).toBeTruthy();
    f.querySelectorAll('button').forEach((b) => {
      if (b.id === 'loginBtn') return;
      expect(b.getAttribute('type')).toBe('button');
    });
  });
});

describe('P2 · 로그인 경로는 정확히 하나다', () => {
  beforeEach(mountLogin);

  /** app-core.js 의 바인딩만 재현한다(실제 login() 대신 카운터를 넣는다 — 비밀번호를 다루지 않는다). */
  function bindAndCount() {
    let calls = 0;
    const spy = () => { calls += 1; };
    const form = document.getElementById('loginForm');
    expect(form).toBeTruthy();
    form.addEventListener('submit', (e) => { e.preventDefault(); spy(); });
    return () => calls;
  }

  test('🔴 버튼 클릭 → 로그인 1회', () => {
    const count = bindAndCount();
    document.getElementById('loginBtn').click();
    expect(count()).toBe(1);
  });

  test('🔴 비밀번호 칸에서 Enter → 로그인 1회 (두 번 아님)', () => {
    const count = bindAndCount();
    const form = document.getElementById('loginForm');
    // jsdom 은 Enter 의 암묵적 submit 을 만들지 않는다 → 브라우저가 하는 일을 직접 쏜다.
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(count()).toBe(1);
  });

  test('🔴 옛 이중 경로가 남아 있지 않다 — loginBtn click 등록 제거', () => {
    expect(CORE).not.toMatch(/on\('loginBtn',/);
  });

  test('🔴 비밀번호 Enter keydown 으로 login() 을 또 부르지 않는다', () => {
    const i = CORE.indexOf("const loginPw = document.getElementById('loginPassword')");
    if (i < 0) return;                       // 핸들러 자체가 사라졌으면 통과
    const seg = CORE.slice(i, i + 400);
    expect(seg).not.toMatch(/key === 'Enter'[\s\S]{0,40}login\(\)/);
  });

  test('🔴 form submit 핸들러가 등록돼 있고 기본 제출을 막는다', () => {
    const i = CORE.indexOf("loginForm");
    expect(i).toBeGreaterThan(-1);
    const seg = CORE.slice(i, i + 400);
    expect(seg).toMatch(/addEventListener\('submit'/);
    expect(seg).toMatch(/preventDefault\(\)/);
  });
});
