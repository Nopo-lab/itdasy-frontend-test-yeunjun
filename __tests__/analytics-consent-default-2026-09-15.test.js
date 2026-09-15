const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const consent = fs.readFileSync(path.join(ROOT, 'app-cookie-consent.js'), 'utf8');
const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

describe('선택 오류 진단 동의', () => {
  test('한국을 포함한 모든 지역에서 직접 허용 전에는 꺼 둔다', () => {
    expect(consent).toMatch(/_applyState\('denied'\);\s*_injectBanner\(\);/);
    expect(consent).not.toMatch(/if \(region === 'EU'\)[\s\S]*else[\s\S]*_set\('granted'\)/);
  });

  test('동의 확인 코드를 읽지 못해도 오류 진단을 켜지 않는다', () => {
    expect(index).toMatch(/isAnalyticsAllowed\(\) : false;/);
  });
});
