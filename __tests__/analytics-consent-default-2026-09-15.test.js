const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const consent = fs.readFileSync(path.join(ROOT, 'app-cookie-consent.js'), 'utf8');
const caption = fs.readFileSync(path.join(ROOT, 'app-caption.js'), 'utf8');
const core = fs.readFileSync(path.join(ROOT, 'app-core.js'), 'utf8');
const assistant = fs.readFileSync(path.join(ROOT, 'app-assistant.js'), 'utf8');
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
    expect(caption).toMatch(/Google Cloud Vertex AI\(Gemini\)로 전송/);
  });

  test('공통 AI 동의창은 제공자를 밝히고 현재 버전으로 저장한다', () => {
    expect(core).toMatch(/const ensureAiProcessingConsent = function/);
    expect(core).toMatch(/Google Cloud Vertex AI\(Gemini\)/);
    expect(core).toMatch(/ai_processing: '2\.0'/);
    expect(core).toMatch(/if \(_aiConsentPromptPromise\) return _aiConsentPromptPromise/);
  });

  test('공통 요청은 동의 누락일 때 동의 후 한 번만 다시 보낸다', () => {
    expect(core).toMatch(/detail !== 'consent_missing'/);
    expect(core).toMatch(/return _fetchWithAiConsent\(url, opts, true\)/);
    expect(core).toMatch(/if \(consentRetried/);
    expect(core).toMatch(/\/persona\\\/consent/);
  });

  test('AI 비서도 동의 재시도가 적용되는 공통 요청 통로를 쓴다', () => {
    expect(assistant).toMatch(/apiFetch\('\/assistant\/ask'/);
  });

  test('새 동의 코드가 이전 배포 캐시에 가리지 않는다', () => {
    expect(index).toMatch(/app-core\.js\?v=20260915-ai-consent/);
    expect(index).toMatch(/app-caption\.js\?v=20260915-ai-consent/);
    const groups = fs.readFileSync(path.join(ROOT, 'js/load-groups.js'), 'utf8');
    expect(groups).toMatch(/app-assistant\.js\?v=20260915-ai-consent/);
  });
});
