/**
 * T-918 — Meta 검수자용 안내가 실사용자(그리고 애플 심사관) 화면에 노출되던 것.
 *
 * 홈 하단에 이런 게 떠 있었다:
 *
 *     [Instagram 다시 연결]
 *     App Review: Meta 권한 테스트는 "Instagram 다시 연결"을 눌러 진행하세요.
 *     App Review: Use "Reconnect Instagram" to test the Meta permission flow.
 *
 * 노출 조건이 `last_login_email === 'review@itdasy.com'` 이었는데, 그 계정은
 * **애플 심사 데모 계정**이다. 즉 애플 심사관이 들어오면 Meta 심사 안내문을 본다.
 * 남 얘기인 데다 개발용 문구라 지저분하다.
 *
 * 지워도 재연결 경로는 남아 있다(실측 4곳):
 *   · 설정 시트 `settings-connect-instagram` — "인스타 연결하기 / 다시 연결"
 *   · 연결된 서비스 허브 `app-integrations-hub.js` — "인스타그램 연결 / 재연결"
 *   · 댓글 문의 큐의 `crq-reconnect` CTA
 *   · 홈 고객메시지 토큰 끊김 배너
 * 그래서 이 테스트는 **지웠다**와 **대체 경로가 남아 있다**를 같이 잠근다.
 * 하나만 잠그면 다음 사람이 재연결 경로까지 같이 지울 수 있다.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('T-918 검수자 전용 안내 제거', () => {
  test('홈에 App Review 안내문이 없다', () => {
    const html = read('index.html');
    expect(html).not.toMatch(/App Review:/);
    expect(html).not.toMatch(/metaReconnectRow/);
    expect(html).not.toMatch(/Reconnect Instagram/);
  });

  test('노출 토글 코드도 같이 사라졌다 (죽은 코드로 남기지 않는다)', () => {
    const js = read('app-home-v41.js');
    expect(js).not.toMatch(/_syncMetaReviewRow/);
    expect(js).not.toMatch(/metareview=1/);
  });

  test('⚠️ 재연결 경로는 남아 있어야 한다 — 같이 지우면 Meta 검수가 막힌다', () => {
    expect(read('index.html')).toMatch(/settings-connect-instagram/);
    expect(read('app-integrations-hub.js')).toMatch(/인스타그램 연결 \/ 재연결/);
    expect(read('app-comment-reply-queue.js')).toMatch(/crq-reconnect/);
  });
});
