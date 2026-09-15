const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const consent = fs.readFileSync(path.join(ROOT, 'app-cookie-consent.js'), 'utf8');
const caption = fs.readFileSync(path.join(ROOT, 'app-caption.js'), 'utf8');
const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

describe('선택 오류 진단 동의', () => {
  test('한국을 포함한 모든 지역에서 직접 허용 전에는 꺼 둔다', () => {
    expect(consent).toMatch(/_applyState\('denied'\);\s*_injectBanner\(\);/);
    expect(consent).not.toMatch(/if \(region === 'EU'\)[\s\S]*else[\s\S]*_set\('granted'\)/);
  });

  test('동의 확인 코드를 읽지 못해도 오류 진단을 켜지 않는다', () => {
    expect(index).toMatch(/isAnalyticsAllowed\(\) : false;/);
  });

  test('과거 자동 허용 기록은 버리고 다시 직접 선택받는다', () => {
    expect(consent).toMatch(/const KEY = 'itdasy_consent_v2';/);
    expect(consent).toMatch(/LEGACY_KEYS\.forEach\(\(key\) => localStorage\.removeItem\(key\)\);\s*const \{ state \} = _get\(\);/);
    expect(consent).not.toMatch(/const KEY = 'itdasy_consent_v1';/);
  });

  test('AI 사용은 가입 동의로 대신하지 않고 현재 버전을 직접 받는다', () => {
    expect(caption).toMatch(/ai_processing: '2\.0'/);
    expect(caption).not.toMatch(/가입 시 약관에 이미 동의하신 내용/);
    expect(caption).toMatch(/외부 AI 제공자에게 전송/);
  });
});
