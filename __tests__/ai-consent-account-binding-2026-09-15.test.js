const fs = require('fs');
const path = require('path');

const home = fs.readFileSync(path.join(__dirname, '..', 'js', 'ai-consent-home.js'), 'utf8');

describe('AI 동의 계정 고정', () => {
  test('동의 저장 전후에 같은 로그인표인지 확인한다', () => {
    expect(home).toMatch(/const snapshot = _snapshot\(\);/);
    expect(home).toMatch(/if \(!_sameAccount\(snapshot\)\) throw new Error\('account_changed'\)/);
  });

  test('다른 계정에 동의 결과를 남기지 않고 화면으로 안내한다', () => {
    expect(home).toMatch(/계정이 바뀌어 저장을 취소했어요/);
    expect(home).toMatch(/_remember\(aiProcessing \? 'all' : 'partial', snapshot\.userId\)/);
  });

  test('서버 요청에는 계정 로그인표와 동의 버전을 함께 보낸다', () => {
    expect(home).toMatch(/headers: \{ Authorization: snapshot\.authorization, 'Content-Type': 'application\/json' \}/);
    expect(home).toMatch(/ai_processing: !!aiProcessing/);
    expect(home).toMatch(/AI_VERSION = '2\.0'/);
  });
});
