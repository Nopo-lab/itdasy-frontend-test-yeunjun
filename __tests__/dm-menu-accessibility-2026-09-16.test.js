const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'app-dm-menu.js'), 'utf8');

describe('인스타 DM 설정 접근성', () => {
  test('토글은 기능별 이름과 switch 상태를 제공한다', () => {
    expect(SRC).toContain('role="switch"');
    expect(SRC).toContain('aria-checked="${on}"');
    expect(SRC).toContain('버튼과 기본 안내 자동응답');
    expect(SRC).toContain('잇비 답장 초안 만들기');
    expect(SRC).toContain('잇비가 손님에게 직접 답장');
    expect(SRC).not.toContain('aria-label="켜기"');
  });

  test('토글과 상단 조작 버튼은 44px 터치 영역을 가진다', () => {
    expect(SRC).toMatch(/\.dmm-tg\{width:44px;height:44px/);
    expect(SRC).toContain('.ss-back{width:44px;height:44px}');
    expect(SRC).toContain('.ss-action{min-height:44px;min-width:44px}');
  });
});
