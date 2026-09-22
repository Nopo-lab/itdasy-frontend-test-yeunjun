/**
 * T-912 로그인 값 탈취 경로 회귀 방지.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const CORE = read('app-core.js');
const IG = read('app-instagram.js');
const OAUTH_RETURN = read('app-oauth-return.js');
const OAUTH_PAGE = read('oauth-return.html');
const PERSONA_SURVEY = read('app-persona-survey.js');

function extractFunction(source, name) {
  const start = source.indexOf('function ' + name + '(');
  expect(start).toBeGreaterThan(-1);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(name + ' body not closed');
}

async function nativeStoreHarness(plugin) {
  const context = {
    window: { Capacitor: { Plugins: { SecureStorage: plugin } } },
    _TOKEN_KEY: 'itdasy_token::staging',
    _secureStorePromise: null,
    _isNativePlatform: () => true,
  };
  vm.createContext(context);
  vm.runInContext(extractFunction(CORE, '_secureTokenStore') + '; this.run = _secureTokenStore;', context);
  return context.run();
}

describe('휴대폰 안전 저장', () => {
  test('주소나 브라우저 저장값으로 보호를 끌 수 없다', () => {
    expect(CORE).not.toMatch(/securetoken/);
    expect(CORE).not.toMatch(/itdasy_securetoken/);
  });

  test('원격 페이지에서 실패하는 npm 이름 import를 쓰지 않는다', () => {
    expect(CORE).not.toMatch(/import\(['"]@aparajita\/capacitor-secure-storage/);
  });

  test('앱 내장 안전 저장 연결로 읽기·쓰기·삭제한다', async () => {
    const calls = [];
    const plugin = {
      internalGetItem: async (options) => { calls.push(['get', options]); return { data: 'jwt' }; },
      internalSetItem: async (options) => { calls.push(['set', options]); },
      internalRemoveItem: async (options) => { calls.push(['remove', options]); return { success: true }; },
    };
    const store = await nativeStoreHarness(plugin);
    await expect(store.get()).resolves.toBe('jwt');
    await store.set('new-jwt');
    await store.remove();
    expect(calls.map((c) => c[0])).toEqual(['get', 'set', 'remove']);
    expect(calls[0][1].prefixedKey).toBe('capacitor-storage_itdasy_token::staging');
    expect(calls[1][1]).toMatchObject({ data: 'new-jwt', sync: false, access: 1 });
  });

  test('안전 저장 연결이 없으면 휴대폰 평문 저장으로 내려가지 않는다', () => {
    const start = CORE.indexOf('// 네이티브 → 보안저장만 사용한다.');
    const end = CORE.indexOf('function authHeader()', start);
    const nativeSave = CORE.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(nativeSave).not.toMatch(/localStorage\.setItem\(_TOKEN_KEY/);
    expect(nativeSave).toMatch(/localStorage\.removeItem\(_TOKEN_KEY/);
  });

  test('평문 로그인 정보 이관이 실패하면 해당 값을 버리고 다시 로그인을 요구한다', () => {
    const start = CORE.indexOf('// localStorage 에서 읽었는데 보안저장 가능');
    const end = CORE.indexOf('window._hydrateToken = _hydrateToken;', start);
    const migration = CORE.slice(start, end);
    expect(migration).toMatch(/평문 로그인 정보 안전 이관 실패/);
    expect(migration).toMatch(/localStorage\.removeItem\(_LEGACY_TOKEN_KEY\)/);
    expect(migration).toMatch(/token = null/);
  });
});

describe('주소를 통한 로그인 값 유출 차단', () => {
  test('인스타 1회용 표 요청에 로그인 확인값을 붙인다', () => {
    expect(IG).toMatch(/apiFetch\('\/instagram\/go-ticket', \{ method: 'POST', headers: authHeader\(\) \}\)/);
  });

  test('인스타 표 발급 실패 시 로그인 값을 주소에 싣지 않는다', () => {
    expect(IG).not.toMatch(/_entry\s*=\s*`token=/);
    expect(IG).toMatch(/throw new Error\('instagram_ticket_failed'\)/);
  });

  test('휴대폰 소셜 로그인 복귀는 공통 안전 저장 함수만 쓴다', () => {
    expect(OAUTH_RETURN).toMatch(/window\.setToken\(d\.access_token\)/);
    expect(OAUTH_RETURN).not.toMatch(/localStorage\.setItem\(['"]itdasy_token::/);
  });

  test('웹 로그인 복귀는 다른 환경 로그인 칸에 값을 복제하지 않는다', () => {
    expect(OAUTH_PAGE).toMatch(/itdasy_token::staging/);
    expect(OAUTH_PAGE).not.toMatch(/itdasy_token::prod/);
  });

  test('웹 로그인 복귀 주소는 다른 사이트에 전달하지 않는다', () => {
    expect(OAUTH_PAGE).toMatch(/<meta name="referrer" content="no-referrer">/);
  });

  test('페르소나 화면도 공통 로그인 확인 함수만 쓴다', () => {
    expect(PERSONA_SURVEY).toMatch(/window\.getToken/);
    expect(PERSONA_SURVEY).not.toMatch(/localStorage\.getItem\(['"]itdasy_token::/);
  });
});

describe('공개될 수 있는 화면 확인 파일', () => {
  test('비밀번호 글자를 직접 넣지 않는다', () => {
    const outputDir = path.join(__dirname, '..', 'output');
    const files = fs.readdirSync(outputDir).filter((name) => /^(?:_qa|qa-).*\.mjs$/.test(name));
    files.forEach((name) => {
      const source = fs.readFileSync(path.join(outputDir, name), 'utf8');
      expect(source).not.toMatch(/password\s*:\s*['"][^'"]+['"]/);
    });
  });
});
