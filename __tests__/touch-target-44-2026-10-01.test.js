/* [2026-10-01 mobile-ux-03] 핵심 화면 곳곳의 44×44 미만 터치 대상.
 *
 *  감사(evidence/mobile-ux/pw-hit.js, 390×844, 보이는 박스가 아니라 elementFromPoint 로 잰 **실제 손가락 영역**):
 *    로그인 '회원가입' 52×16 · '비밀번호를 잊으셨나요?' 81×28 · 비밀번호 보기 40×40
 *    고객상세 액션(.d-act) 40 · 예약관리 '오늘' 40 · 월/주 토글 32 · 통계바 36
 *    예약폼 뒤로 30 · 소요시간 칩 34 · '전체' 40×16
 *    매출입력 +1만/결제수단/시술 칩 34~42 · DM 큐 설정(아이콘 폰트 미로드 시 8×8) · 채널 탭 32
 *    잇비 액션 허브 40 · 댓글큐/DM큐 '인스타 연결하기' 42 · 작업실 .wshc-who 42
 *  원인: 각 모듈이 인라인 스타일로 아이콘 크기+padding 4px 만 잡고, 최소 히트 영역 공용 규칙이 없었다.
 *  수정: style-components.css 에 공용 규칙(.tap44 = 보이는 크기 그대로 두고 ::after 로 44 확보,
 *        + 실제 높이를 44 로 올려도 되는 버튼 목록) 을 두고 각 화면에 적용.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

/** 첫 `sel {` 블록 본문 (중첩 없는 평범한 규칙만) */
function block(css, sel) {
  const i = css.indexOf(sel);
  if (i < 0) return '';
  const s = css.indexOf('{', i);
  const e = css.indexOf('}', s);
  return css.slice(s + 1, e);
}
const has = (txt, prop, val) => new RegExp(prop.replace(/[-]/g, '\\-') + '\\s*:\\s*' + val).test(txt);

describe('공용 규칙 — style-components.css .tap44', () => {
  const css = read('style-components.css');
  test('.tap44::after 가 가로·세로 모두 max(100%, 44px) 로 히트 영역을 넓힌다', () => {
    const b = block(css, '.tap44::after');
    expect(b).toMatch(/content:\s*['"]{2}/);
    expect(b).toMatch(/position:\s*absolute/);
    expect(b).toMatch(/width:\s*max\(100%,\s*44px\)/);
    expect(b).toMatch(/height:\s*max\(100%,\s*44px\)/);
  });
  test('.tap44 는 position:relative (히트 박스 기준점)', () => {
    expect(has(block(css, '.tap44 {') || block(css, '.tap44,'), 'position', 'relative')).toBe(true);
  });
  test('실제 높이를 44 로 올리는 공용 목록 — 댓글큐/DM큐 재연결 · 잇비 액션 허브 · 작업실 연결 버튼', () => {
    for (const sel of ['.crq-reconnect', '[data-dcq-connect]', '.asst-chips--hub button', '.asst-chips--brief button', '.wshc-who']) {
      const i = css.indexOf(sel);
      expect(i).toBeGreaterThan(-1);
      const s = css.indexOf('{', i);
      expect(css.slice(s, css.indexOf('}', s))).toMatch(/min-height:\s*44px/);
    }
  });
});

describe('로그인 (index.html) — 문자 링크·눈 아이콘', () => {
  const html = read('index.html');
  test('.login-forgot 높이 ≥ 44 (+ position:relative — 위 비밀번호칸이 positioned 라 겹친 부분을 뺏기지 않게)', () => {
    expect(has(block(html, '.login-forgot{'), 'min-height', '44px')).toBe(true);
    expect(has(block(html, '.login-forgot{'), 'position', 'relative')).toBe(true);
  });
  test('.login-foot a (회원가입) 가 44×44 히트 영역', () => {
    const b = block(html, '.login-foot a{');
    expect(has(b, 'min-height', '44px')).toBe(true);
    expect(has(b, 'min-width', '44px')).toBe(true);
    expect(b).toMatch(/inline-flex/);
  });
  test('.login-pw-eye 44×44', () => {
    const b = block(html, '.login-pw-eye{');
    expect(has(b, 'width', '44px')).toBe(true);
    expect(has(b, 'height', '44px')).toBe(true);
  });
});

describe('고객상세 (customer-v4.css) — 액션 버튼', () => {
  test('.cv4-detail .d-act min-height 44', () => {
    expect(has(block(read('css/screens/customer-v4.css'), '.cv4-detail .d-act {'), 'min-height', '44px')).toBe(true);
  });
});

describe('예약관리 (booking-v4.css) — 오늘 · 월/주 · 통계바', () => {
  const css = read('css/screens/booking-v4.css');
  test('.bk-today-btn min-width 44', () => { expect(css).toMatch(/\.bk-today-btn[^{]*\{[^}]*min-width:\s*44px/); });
  test('.bk-view__btn min-width 44 (세그먼트는 ::after 가 아니라 실제 폭 — 옆 버튼을 뺏지 않는다)', () => {
    expect(css).toMatch(/\.bk-view__btn\s*\{[^}]*min-width:\s*44px/);
  });
  test('.bk-statbar__sum min-height 44', () => { expect(css).toMatch(/\n\.bk-statbar__sum \{[^}]*min-height:\s*44px/); });
});

describe('예약폼 (booking-form.css) — 뒤로 · 칩 · 전체', () => {
  const css = read('css/screens/booking-form.css');
  test('.cv-form-back min-height 44', () => { expect(has(block(css, '.cv-form-back {'), 'min-height', '44px')).toBe(true); });
  test('소요시간·시술 칩은 보이는 크기 그대로 ::after 로 세로 44', () => {
    const b = block(css, '.bf-dur-chip::after');
    expect(b).toMatch(/height:\s*max\(100%,\s*44px\)/);
    expect(css).toMatch(/\.bf-svc-chip::after/);
  });
  test('칩이 줄바꿈될 때 히트 영역이 겹치지 않게 row-gap ≥ 11px', () => {
    expect(block(css, '.bf-dur-chips {')).toMatch(/gap:\s*1[1-9]px 6px|row-gap:\s*1[1-9]px/);
    expect(block(css, '.bf-svc-chips {')).toMatch(/gap:\s*1[1-9]px 6px|row-gap:\s*1[1-9]px/);
  });
  test(".bf-svc-more('전체') 세로 44 — 위쪽 여유로", () => {
    expect(css).toMatch(/\.bf-svc-more::after\s*\{[^}]*height:\s*44px/);
  });
});

describe('매출 입력 (app-revenue.js) — 금액 칩·결제수단·시술 칩', () => {
  const js = read('app-revenue.js');
  test('[data-rf-add] / [data-rf-method] / [data-rf-svc] / #rfSvcCustomBtn 전부 .tap44', () => {
    expect(js).toMatch(/<button type="button" class="tap44" data-rf-add=/);
    expect(js).toMatch(/<button type="button" class="tap44" data-rf-method=/);
    expect(js).toMatch(/<button type="button" class="tap44" data-rf-svc=/);
    expect(js).toMatch(/<button type="button" class="tap44" id="rfSvcCustomBtn"/);
  });
  test('#rfServiceChips 줄 간격 row-gap 12 (칩 히트 영역 겹침 방지)', () => {
    expect(js).toMatch(/id="rfServiceChips" style="[^"]*gap:12px 6px/);
  });
});

describe('DM 큐 (app-dm-confirm-queue.js) — 설정 아이콘·닫기·채널 탭·연결 버튼', () => {
  const js = read('app-dm-confirm-queue.js');
  test('#dcqSettings 는 phosphor 폰트가 아니라 SVG 스프라이트(#ic-settings) — 폰트가 안 와도 0 크기로 사라지지 않는다', () => {
    expect(js).not.toMatch(/<i class="ph-duotone ph-gear"/);
    expect(js).toMatch(/id="dcqSettings"[^>]*>\s*<svg[^>]*><use href="#ic-settings"\/><\/svg>/);
  });
  test('#dcqSettings/#dcqClose 실제 박스 44×44 (세로 음수 마진으로 헤더 높이는 유지)', () => {
    expect(js).toMatch(/#dcqClose,\s*#dcqSettings\s*\{[^}]*width:44px;height:44px[^}]*position:relative/);
  });
  test('.dcq-tab ::after 세로 44 + #dcqTabs 가 overflow 로 잘리지 않게 padding-block', () => {
    expect(js).toMatch(/\.dcq-tab::after\s*\{[^}]*height:max\(100%,44px\)/);
    expect(js).toMatch(/#dcqTabs\s*\{[^}]*padding-block/);
  });
  test('빈 상태 연결 버튼 min-height 44', () => {
    expect(js).toMatch(/const BTN = '[^']*min-height:44px/);
  });
});
