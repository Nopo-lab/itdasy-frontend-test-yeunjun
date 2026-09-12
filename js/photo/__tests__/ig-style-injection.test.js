/* 스타일 화면의 **주입 방어**.  [2026-09-04 릴리즈 게이트]
 *
 * 이 화면은 문자열을 조립해 innerHTML 로 넣는다. 값 셋이 밖에서 온다:
 *   · 스타일 이름   — 원장이 직접 타이핑 (서버 왕복)
 *   · 팔레트 색     — 분석 결과 (서버 왕복)
 *   · 썸네일 주소   — 인스타 CDN (백엔드 경유)
 *
 * `_esc` 는 **속성 밖으로 나가는 것**만 막는다. style 속성 *안*에서
 * `red;background-image:url(...)` 이나 `url(a.jpg) ; background:url(evil)` 로
 * CSS 를 이어 붙이는 건 못 막는다 — 브라우저 리허설에서 썸네일 경로가 실제로 뚫려 있었다.
 * 그래서 색과 주소는 **모양을 검사해서 아니면 안 쓴다.**
 */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../..');
const sheet = fs.readFileSync(path.join(ROOT, 'js/photo/ig-style-sheet.js'), 'utf8');
const card = fs.readFileSync(path.join(ROOT, 'js/photo/ig-style-card-page2.js'), 'utf8');

function loadSheet() {
  const win = { localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } };
  new Function('window', sheet)(win);
  return win.IgStyleSheet;
}

const S = loadSheet();

describe('팔레트 색 — hex 만 통과', () => {
  test('두 파일 모두 _hexOnly 가드를 갖는다', () => {
    expect(sheet).toMatch(/function _hexOnly\(c\)/);
    expect(card).toMatch(/function _hexOnly\(c\)/);
  });

  test('색을 style 안에 넣을 때 _esc 가 아니라 검증된 값을 쓴다', () => {
    // `_esc(c)` 로 되돌아가면 CSS 주입이 다시 열린다
    expect(sheet).not.toMatch(/background:' \+ _esc\(c\)/);
    expect(card).not.toMatch(/background:' \+ _esc\(c\)/);
  });
});

describe('썸네일 주소 — http(s) + CSS 이어붙이기 불가 문자 없음', () => {
  test('_safeUrl 가드가 있고 url() 에 검증된 값만 들어간다', () => {
    expect(sheet).toMatch(/function _safeUrl\(u\)/);
    expect(sheet).toMatch(/url\(' \+ t \+ '\)/);
    expect(sheet).not.toMatch(/url\(' \+ _esc\(t\)/);
  });

  test('_safeUrl 실동작', () => {
    // 모듈 내부 함수라 공개 API 로는 못 부른다 — 같은 정규식을 여기서 재현해 계약을 고정한다.
    const safe = (u) => {
      const v = String(u || '').trim();
      if (!/^https?:\/\//i.test(v)) return null;
      if (/[)"'\s;\\]/.test(v)) return null;
      return v;
    };
    expect(safe('https://cdn.example.com/ok.jpg')).toBe('https://cdn.example.com/ok.jpg');
    expect(safe('x") ; background:url(evil')).toBeNull();
    expect(safe('javascript:alert(1)')).toBeNull();
    expect(safe('https://cdn.example.com/a.jpg) ; background:url(evil')).toBeNull();
    expect(safe('')).toBeNull();
    expect(safe(null)).toBeNull();
    // 소스의 정규식과 여기 재현본이 같은지 — 다르면 이 테스트가 거짓 안심이 된다
    expect(sheet).toMatch(/\^https\?:\\\/\\\/\/i\.test\(v\)/);
  });
});

describe('이름 — 마크업으로 해석되지 않는다', () => {
  test('이름은 항상 _esc 를 거친다', () => {
    const rows = sheet.match(/g\.name/g) || [];
    const escaped = sheet.match(/_esc\(g\.name\)/g) || [];
    expect(escaped.length).toBeGreaterThanOrEqual(3);
    // 이스케이프 없이 이름을 이어붙이는 곳이 없어야 한다
    expect(sheet).not.toMatch(/\+ g\.name \+/);
    expect(card).not.toMatch(/\+ g\.name \+/);
    expect(rows.length).toBeGreaterThan(0);
  });

  test('_esc 는 HTML 특수문자 다섯 개를 전부 막는다', () => {
    expect(sheet).toMatch(/'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'/);
  });
});

describe('공개 API 는 그대로', () => {
  test('가드 추가가 기능을 안 없앴다', () => {
    ['openList', 'openDetail', 'openCreate', 'close'].forEach((k) => {
      expect(typeof S[k]).toBe('function');
    });
  });
});
