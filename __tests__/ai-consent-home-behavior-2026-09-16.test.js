/** @jest-environment jsdom */

const fs = require('fs');
const path = require('path');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'js', 'ai-consent-home.js'), 'utf8');

function response(payload, ok = true, status = 200) {
  return { ok, status, json: async () => payload };
}

function mountCard() {
  document.body.innerHTML = `
    <section id="aiConsentHomeCard" hidden>
      <h2 data-ai-consent-title></h2><p data-ai-consent-copy></p><p data-ai-consent-status></p>
      <button data-ai-consent-action="all"></button>
      <button data-ai-consent-action="partial"></button>
    </section>`;
  window.getToken = jest.fn(() => 'jwt-account-a');
  window.getMyUserId = jest.fn(() => 42);
  window.showToast = jest.fn();
  window.apiFetch = jest.fn().mockResolvedValue(response({ status: {
    pipa_collect: true, ai_processing: false, all_agreed: false,
  } }));
  window.eval(SOURCE);
  return document.getElementById('aiConsentHomeCard');
}

describe('홈 AI 동의 카드 실제 동작', () => {
  beforeEach(() => {
    localStorage.clear();
    delete window.AiConsentHome;
  });

  test('필수 기능만 선택하면 AI를 끈 상태로 남고 서버에 false를 저장한다', async () => {
    const card = mountCard();
    await window.AiConsentHome.refresh({ force: true });
    expect(card.hidden).toBe(false);
    card.querySelector('[data-ai-consent-action="partial"]').click();
    await new Promise(resolve => setTimeout(resolve, 0));
    const post = window.apiFetch.mock.calls.find(call => call[0] === '/persona/consent' && call[1].method === 'POST');
    expect(post).toBeTruthy();
    expect(JSON.parse(post[1].body).ai_processing).toBe(false);
    expect(card.dataset.state).toBe('partial');
  });

  test('전체 동의하면 서버 저장 뒤 카드를 숨긴다', async () => {
    const card = mountCard();
    await window.AiConsentHome.refresh({ force: true });
    card.querySelector('[data-ai-consent-action="all"]').click();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(card.hidden).toBe(true);
    expect(localStorage.getItem('itdasy_ai_consent_decision_v1:42')).toBe('all');
  });

  test('저장 중 계정이 바뀌면 동의를 기록하지 않고 사용자에게 알린다', async () => {
    const card = mountCard();
    await window.AiConsentHome.refresh({ force: true });
    window.apiFetch.mockImplementation(async (url) => {
      if (url === '/persona/consent') {
        window.getToken.mockReturnValue('jwt-account-b');
        return response({ saved: [] });
      }
      return response({ status: { pipa_collect: true, ai_processing: false, all_agreed: false } });
    });
    card.querySelector('[data-ai-consent-action="all"]').click();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(localStorage.getItem('itdasy_ai_consent_decision_v1:42')).toBeNull();
    expect(window.showToast).toHaveBeenCalledWith(expect.stringContaining('계정이 바뀌어'));
  });
});
