/**
 * [실사용 제보 2026-09-07] 묶음 이름이 실제 동작과 **반대**였다.
 *
 * 보스가 "바로 나가요" 토글을 껐는데도 손님에게 답장이 나갔다.
 * 화면을 뜯어보니:
 *
 *   A묶음 "바로 나가요"      = 버튼 답장(+영업시간·위치 즉답). AI 아님.
 *   B묶음 "나한테 먼저 와요"  = 그 안의 "잇비가 직접 답장해요"(autosend)가 켜져 있으면
 *                             **손님에게 바로 나간다.**
 *
 * 즉 "나한테 먼저 와요" 가 실제로는 바로 나가고 있었다. 자동응답을 멈추려는 원장은
 * 당연히 "바로 나가요" 를 끄는데, 그건 버튼만 끄는 거라 AI 답장은 계속 나간다.
 * 로그 실측: 그날 `PUT /shop/dm-menu` 4건, `POST /instagram/dm-reply/settings` **0건**.
 *
 * 그래서 **묶음 제목이 현재 상태를 그대로 말하게** 했다. 이 테스트가 그걸 고정한다.
 */
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'app-dm-menu.js'), 'utf8');

describe('DM 메뉴 묶음 제목이 실제 동작을 말한다', () => {
  test('B묶음 제목은 autosend 상태에 따라 갈린다 (고정 문구 아님)', () => {
    // 켜져 있으면 "바로 나가요", 꺼져 있으면 "먼저 와요" — 둘 다 소스에 있어야 한다
    expect(SRC).toContain('잇비 답장이 바로 나가요');
    expect(SRC).toContain('잇비 초안이 나한테 먼저 와요');
    // 옛 고정 제목이 되살아나면 다시 거짓말이 된다
    expect(SRC).not.toMatch(/dmm-gh">나한테 먼저 와요</);
  });

  test('B묶음 제목이 autoSendOn 을 실제로 참조한다', () => {
    const i = SRC.indexOf('잇비 답장이 바로 나가요');
    expect(i).toBeGreaterThan(0);
    // 제목 바로 앞에 조건이 있어야 한다 — 상수로 박아두면 의미가 없다
    expect(SRC.slice(Math.max(0, i - 200), i)).toContain('autoSendOn');
  });

  test('autosend 가 켜졌을 때 "손님에게 바로" 를 부제에서도 말한다', () => {
    expect(SRC).toContain('손님에게 바로 보내요');
  });

  test('A묶음은 버튼뿐 아니라 영업시간·위치 문의에도 바로 나간다는 걸 밝힌다', () => {
    // 예전 부제는 "손님이 버튼을 누르면" 뿐이라, 글로 물어봐도 나가는 걸 숨겼다
    //   (dm_autoreply.py 의 hours/location 즉답이 _menu.enabled 만 보고 바로 발송한다)
    expect(SRC).toContain('영업시간·위치를 물어보면');
    expect(SRC).not.toMatch(/dmm-gs">손님이 버튼을 누르면 · 내가 써둔 답이 그대로/);
  });

  test('두 묶음 다 "바로 나가요" 를 쓸 수 있어야 한다 — 한쪽만 쓰면 다른 쪽이 안전해 보인다', () => {
    const aTitle = SRC.includes('버튼·기본 안내가 바로 나가요');
    const bTitle = SRC.includes('잇비 답장이 바로 나가요');
    expect(aTitle && bTitle).toBe(true);
  });
});
