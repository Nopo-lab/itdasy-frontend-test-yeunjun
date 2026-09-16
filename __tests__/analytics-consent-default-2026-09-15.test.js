const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const consent = fs.readFileSync(path.join(ROOT, 'app-cookie-consent.js'), 'utf8');
const caption = fs.readFileSync(path.join(ROOT, 'app-caption.js'), 'utf8');
const core = fs.readFileSync(path.join(ROOT, 'app-core.js'), 'utf8');
const assistant = fs.readFileSync(path.join(ROOT, 'app-assistant.js'), 'utf8');
const instagram = fs.readFileSync(path.join(ROOT, 'app-instagram.js'), 'utf8');
const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

function cacheVersion(source, filename) {
  const escaped = filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return source.match(new RegExp(`${escaped}\\?v=([^"',]+)`))?.[1] || '';
}

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

  test('AI 동의는 가입 또는 홈에서 한 번 선택하고 캡션 화면은 반복 팝업을 띄우지 않는다', () => {
    const home = fs.readFileSync(path.join(ROOT, 'js/ai-consent-home.js'), 'utf8');
    expect(index).toMatch(/id="signupAiConsent"/);
    expect(index).toMatch(/Google Cloud Vertex AI\(Gemini\)/);
    expect(home).toMatch(/ai_processing: !!aiProcessing/);
    expect(caption).toMatch(/AiConsentHome\.open/);
    expect(caption).not.toMatch(/_inlineConfirm\(/);
  });

  test('공통 요청은 consent_missing 을 숨기거나 자동 재시도하지 않는다', () => {
    expect(core).not.toMatch(/ensureAiProcessingConsent/);
    expect(core).not.toMatch(/_fetchWithAiConsent/);
  });

  test('AI 동의 카드는 현재 계정에만 저장하고 선택 결과를 기록한다', () => {
    const home = fs.readFileSync(path.join(ROOT, 'js/ai-consent-home.js'), 'utf8');
    expect(home).toMatch(/_sameAccount\(snapshot\)/);
    expect(home).toMatch(/Authorization: snapshot\.authorization/);
    expect(home).toMatch(/_remember\(aiProcessing \? 'all' : 'partial'/);
  });

  test('AI 비서도 동의 재시도가 적용되는 공통 요청 통로를 쓴다', () => {
    expect(assistant).toMatch(/apiFetch\('\/assistant\/ask'/);
  });

  test('새 동의 코드가 이전 배포 캐시에 가리지 않는다', () => {
    const groups = fs.readFileSync(path.join(ROOT, 'js/load-groups.js'), 'utf8');
    const versions = [
      cacheVersion(index, 'app-core.js'),
      cacheVersion(index, 'app-caption.js'),
      cacheVersion(groups, 'app-assistant.js'),
      cacheVersion(index, 'js/ai-consent-home.js'),
    ];
    expect(versions.every(Boolean)).toBe(true);
    expect(new Set(versions).size).toBe(1);
  });

  test('인스타 설명 화면을 보기 전에 동의를 미리 기록하지 않는다', () => {
    expect(instagram).not.toMatch(/apiFetch\('\/instagram\/consent'/);
    expect(cacheVersion(index, 'app-instagram.js')).toBeTruthy();
  });
});
