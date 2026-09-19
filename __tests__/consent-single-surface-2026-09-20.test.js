/**
 * T-915 — 첫 화면에 동의 팝업이 2개 겹쳐 뜨던 것 (2026-09-20)
 *
 * 로그인 직후 홈에 `AI 기능을 켜둘까요?` 카드와 `🍪 더 나은 서비스 제공 안내`
 * 쿠키 배너가 **동시에** 떴다. 심사관 첫인상이 동의 두 겹이고, 사용자도
 * 같은 걸 두 번 묻는다고 느낀다(연준님 지적).
 *
 * 합친 규칙:
 *   · AI 카드가 뜨면 → 쿠키 배너는 접는다 (`deferToCombined`)
 *   · AI 카드가 안 뜨기로 하면 → 배너를 되돌린다 (`releaseDeferred`)
 *   · '전체 동의' = AI + 오류진단 둘 다 허용 / '필수 기능만' = 둘 다 거부
 *   · 안내문이 두 목적을 **모두** 적는다 (묶어 받으려면 안내가 둘 다 있어야 한다)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

describe('T-915 · 동의 표면은 하나다', () => {
  const cookie = read('app-cookie-consent.js');
  const ai = read('js/ai-consent-home.js');
  const html = read('index.html');

  test('쿠키 모듈이 defer/release 를 공개한다', () => {
    expect(cookie).toMatch(/deferToCombined\s*\(/);
    expect(cookie).toMatch(/releaseDeferred\s*\(/);
  });

  test('AI 카드가 뜰 때 배너를 접고, 숨을 때 되돌린다', () => {
    // _show 에 defer, _hide 에 release 가 걸려 있어야 한다
    const show = ai.slice(ai.indexOf('function _show()'), ai.indexOf('function _renderLoading'));
    const hide = ai.slice(ai.indexOf('function _hide()'), ai.indexOf('function _show()'));
    expect(show).toMatch(/_deferCookieBanner\(\)/);
    expect(hide).toMatch(/_releaseCookieBanner\(\)/);
  });

  test('저장 시 오류진단 동의도 같이 반영한다', () => {
    expect(ai).toMatch(/if \(aiProcessing\) cc\.grant\(\); else cc\.deny\(\);/);
  });

  test('AI 모듈이 죽어도 동의를 영영 못 받는 일은 없다 (안전장치 타임아웃)', () => {
    // 조용한 실패가 제일 나쁘다 — 카드가 아무 말 없으면 배너를 띄워야 한다
    expect(cookie).toMatch(/setTimeout\([\s\S]{0,200}_injectBanner\(\)/);
  });

  test('카드 안내문이 AI 처리와 오류 진단을 **둘 다** 적는다', () => {
    // 묶어서 받으려면 두 목적이 모두 안내돼야 한다
    for (const src of [html, ai]) {
      expect(src).toMatch(/Vertex AI/);
      expect(src).toMatch(/오류/);
    }
  });

  test('배너는 로그인 + 카드 존재일 때만 양보한다 (비로그인은 그대로 배너)', () => {
    expect(cookie).toMatch(/aiConsentHomeCard/);
    expect(cookie).toMatch(/getToken/);
  });
});
