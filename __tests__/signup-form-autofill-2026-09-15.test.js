/**
 * @jest-environment jsdom
 *
 * T-904 회귀 — 회원가입 입력칸도 브라우저가 이해하는 표준 form 이어야 한다.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CORE = fs.readFileSync(path.join(ROOT, 'app-core.js'), 'utf8');

function mountSignup() {
  const start = HTML.indexOf('<div class="lock-overlay" id="signupOverlay"');
  const end = HTML.indexOf('<!-- ───── 온보딩 오버레이', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  document.body.innerHTML = HTML.slice(start, end);
}

describe('T-904 · 회원가입 표준 form', () => {
  beforeEach(mountSignup);

  test('이메일·비밀번호·가입 버튼이 하나의 form 안에 있다', () => {
    const form = document.getElementById('signupForm');
    expect(form).toBeTruthy();
    expect(form.contains(document.getElementById('signupEmail'))).toBe(true);
    expect(form.contains(document.getElementById('signupPassword'))).toBe(true);
    expect(form.contains(document.getElementById('signupBtn'))).toBe(true);
  });

  test('비밀번호 관리자가 읽을 이름과 자동완성 값이 있다', () => {
    const email = document.getElementById('signupEmail');
    const password = document.getElementById('signupPassword');
    expect(email.getAttribute('name')).toBe('email');
    expect(email.getAttribute('autocomplete')).toBe('email');
    expect(password.getAttribute('name')).toBe('password');
    expect(password.getAttribute('autocomplete')).toBe('new-password');
  });

  test('가입 버튼은 submit 이고 보조 버튼은 submit 이 아니다', () => {
    expect(document.getElementById('signupBtn').getAttribute('type')).toBe('submit');
    expect(document.getElementById('signupSendCode').getAttribute('type')).toBe('button');
  });

  test('가입 요청은 form submit 한 경로로만 연결한다', () => {
    const bind = CORE.slice(CORE.indexOf("const signupForm"), CORE.indexOf("// 비밀번호 보기 토글"));
    expect(bind).toMatch(/addEventListener\('submit'/);
    expect(bind).toMatch(/preventDefault\(\)/);
    expect(bind).toMatch(/signup\(\)/);
    expect(CORE).not.toMatch(/closest\('#signupBtn'\)/);
  });

  test('필수 약관 동의에 AI 국외이전 동의를 묶지 않는다', () => {
    const label = HTML.match(/<input type="checkbox" id="signupAgree"[\s\S]*?<\/label>/)?.[0] || '';
    expect(label).not.toMatch(/AI 분석|국외이전|Google LLC/);
    const aiLabel = HTML.match(/<input type="checkbox" id="signupAiConsent"[\s\S]*?<\/label>/)?.[0] || '';
    expect(aiLabel).toMatch(/AI 기능 사용 \(선택\)/);
    expect(aiLabel).toMatch(/Google Cloud Vertex AI\(Gemini\)/);
    expect(CORE).toMatch(/ai_processing_consent/);
  });
});
