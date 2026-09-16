const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const caption = fs.readFileSync(path.join(ROOT, 'app-caption.js'), 'utf8');
const instant = fs.readFileSync(path.join(ROOT, 'app-instant-caption.js'), 'utf8');
const voice = fs.readFileSync(path.join(ROOT, 'app-voice-caption.js'), 'utf8');
const assistant = fs.readFileSync(path.join(ROOT, 'app-assistant.js'), 'utf8');

function extractPersonaFetch() {
  const start = caption.indexOf('async function _personaFetch');
  const end = caption.indexOf('\n\n/* ═══', start);
  if (start < 0 || end < 0) throw new Error('_personaFetch section missing');
  return caption.slice(start, end);
}

describe('캡션 AI 동의 안내', () => {
  test('기본 캡션 요청은 공통 요청 통로를 사용하고 결과를 그대로 처리한다', async () => {
    const apiFetch = jest.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ caption: '동의 후 생성된 캡션' }),
    });
    const nativeFetch = jest.fn(() => { throw new Error('direct fetch must not run'); });
    const factory = new Function('deps', `
      const _PERSONA_TIMEOUT_MS = 120000;
      const window = { authHeader: deps.authHeader, apiFetch: deps.apiFetch };
      const fetch = deps.nativeFetch;
      ${extractPersonaFetch()}
      return _personaFetch;
    `);
    const personaFetch = factory({
      authHeader: () => ({ Authorization: 'Bearer test-account' }),
      apiFetch,
      nativeFetch,
    });

    await expect(personaFetch('POST', '/persona/generate', { category: 'nail' }))
      .resolves.toEqual({ caption: '동의 후 생성된 캡션' });
    expect(apiFetch).toHaveBeenCalledWith('/persona/generate', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer test-account' }),
    }));
    expect(nativeFetch).not.toHaveBeenCalled();
  });

  test('모든 캡션 진입점이 공통 요청 통로를 거치며 동의 누락은 홈 카드로 안내한다', () => {
    for (const source of [caption, instant, voice, assistant]) {
      expect(source).not.toMatch(/fetch\([^\n]*['"]\/persona\/generate/);
    }
    expect(caption).toMatch(/window\.apiFetch\(path,/);
    expect(caption).toMatch(/AiConsentHome\.open/);
    expect(caption).not.toMatch(/_inlineConfirm\(/);
    expect(instant).toMatch(/window\.apiFetch\(path,/);
    expect(voice).toMatch(/window\.apiFetch\(path,/);
    expect((assistant.match(/window\.apiFetch\('\/persona\/generate'/g) || []).length).toBe(2);
  });
});
