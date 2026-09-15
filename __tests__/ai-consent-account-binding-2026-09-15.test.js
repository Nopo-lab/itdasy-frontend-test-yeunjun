const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'app-core.js'), 'utf8');

function extract(startText, endText) {
  const start = source.indexOf(startText);
  const end = source.indexOf(endText, start);
  if (start < 0 || end < 0) throw new Error(`source section missing: ${startText}`);
  return source.slice(start, end);
}

function createHarness() {
  const readAuthorization = extract('function _readAuthorization', '\n\nasync function _fetchWithAiConsent');
  const ensureConsent = extract('const ensureAiProcessingConsent', '\n\nfunction _inlinePrompt');
  const state = { authorization: 'Bearer account-a', onYes: null, onNo: null };
  const apiFetch = jest.fn().mockResolvedValue({ ok: true });
  const showToast = jest.fn();
  const factory = new Function('deps', `
    ${readAuthorization}
    let _aiConsentPrompt = null;
    const authHeader = () => ({ Authorization: deps.state.authorization });
    const apiFetch = deps.apiFetch;
    const window = { showToast: deps.showToast };
    const _inlineConfirm = (_message, onYes, onNo) => {
      deps.state.onYes = onYes;
      deps.state.onNo = onNo;
    };
    ${ensureConsent}
    return { ensureAiProcessingConsent };
  `);
  return { ...factory({ state, apiFetch, showToast }), state, apiFetch, showToast };
}

describe('AI 동의 계정 고정', () => {
  test('안내 중 계정이 바뀌면 다른 계정에 동의를 저장하지 않는다', async () => {
    const harness = createHarness();
    const result = harness.ensureAiProcessingConsent('Bearer account-a');
    harness.state.authorization = 'Bearer account-b';
    await harness.state.onYes();

    await expect(result).resolves.toBe(false);
    expect(harness.apiFetch).not.toHaveBeenCalled();
    expect(harness.showToast).toHaveBeenCalledWith(expect.stringContaining('계정이 바뀌어'));
  });

  test('같은 계정일 때만 그 계정 로그인표로 동의를 저장한다', async () => {
    const harness = createHarness();
    const result = harness.ensureAiProcessingConsent('Bearer account-a');
    await harness.state.onYes();

    await expect(result).resolves.toBe(true);
    expect(harness.apiFetch).toHaveBeenCalledWith('/persona/consent', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer account-a' }),
    }));
  });

  test('다른 계정 요청은 기존 계정 동의창을 함께 쓰지 않는다', async () => {
    const harness = createHarness();
    const first = harness.ensureAiProcessingConsent('Bearer account-a');
    harness.state.authorization = 'Bearer account-b';
    await expect(harness.ensureAiProcessingConsent('Bearer account-b')).resolves.toBe(false);
    harness.state.onNo();
    await expect(first).resolves.toBe(false);
  });
});
