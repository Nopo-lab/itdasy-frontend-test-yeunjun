/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.resolve(__dirname, '../app-oauth-return.js'), 'utf8');

describe('인스타 연결 뒤 앱의 로그인 창 닫기', () => {
  let openUrl;
  let close;
  beforeEach(() => {
    jest.useFakeTimers();
    close = jest.fn().mockResolvedValue();
    window.Capacitor = {
      isNativePlatform: () => true,
      Plugins: {
        Browser: { close },
        App: { addListener: jest.fn((_, handler) => { openUrl = handler; }) },
      },
    };
    window.showToast = jest.fn();
    window.checkInstagramStatus = jest.fn().mockResolvedValue();
    window.showIgReturnFailModal = jest.fn();
    window.showInstaConflictModal = jest.fn();
    sessionStorage.setItem('itdasy_oauth_inflight', '1');
    window.eval(source);
  });
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

  test.each(['connected=success', 'ig_error=denied', 'ig_conflict=1'])('%s는 앱의 로그인 창을 닫는다', query => {
    openUrl({ url: 'itdasy://oauth/callback?' + query });
    expect(close).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('itdasy_oauth_inflight')).toBeNull();
  });

  test('취소 안내는 기존 앱 화면에 표시된다', () => {
    openUrl({ url: 'itdasy://oauth/callback?ig_error=denied' });
    expect(window.showIgReturnFailModal).toHaveBeenCalledWith('denied');
  });

  test('로그인 창을 못 닫아도 연결 상태를 다시 읽는다', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    close.mockRejectedValue(new Error('unavailable'));
    openUrl({ url: 'itdasy://oauth/callback?connected=success' });
    await Promise.resolve();
    expect(window.checkInstagramStatus).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  test('외부 웹 주소는 앱의 연결 상태를 변경하지 않는다', () => {
    openUrl({ url: 'https://evil.example/?connected=success' });
    expect(close).not.toHaveBeenCalled();
    expect(window.checkInstagramStatus).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('itdasy_oauth_inflight')).toBe('1');
  });
});
