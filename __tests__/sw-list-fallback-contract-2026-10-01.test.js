/**
 * @jest-environment node
 *
 * 리드 결정 4 (2026-10-02 BE-G2-B) — 목록 API 계약 변경(쿼리 추가)이 sw.js 오프라인 폴백의 뜻을 바꾸는가.
 *
 * 확인 결과(이 테스트가 고정한다): 바뀌지 않는다. sw.js 의 API 분류는 **경로(pathname)** 만 본다.
 *  · _isDynamicApi 정규식은 '/단어/' 형태라 GET /revenue · /bookings **목록**(뒤에 '/' 없음)은 애초에
 *    SW 를 거치지 않는다(_API_GET_FALLBACK_PATHS 에 적혀 있어도) — summary_only·offset·limit·from/to 를
 *    붙여도 pathname 이 같으니 그대로 '우회'.
 *  · 실제로 network-first + API 캐시를 타는 건 /revenue/<하위경로>(summary·forecast·refunds) 뿐이고 이것도 그대로.
 *  · 캐시 조회는 쿼리까지 같은 URL 만 맞는다(caches.match 기본 ignoreSearch=false).
 * 목록 응답(최대 2,000행)을 SW 가 clone+저장하기 시작하면 매 요청 비용이 생긴다(sw.js 주석의 '렉 주범') —
 * 그래서 목록을 SW 캐시 대상으로 끌어들이지 않는 것도 이 테스트가 지킨다.
 */
const fs = require('fs');
const path = require('path');

const SW = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

function cutDecl(src, startToken) {
  const i = src.indexOf(startToken);
  if (i < 0) throw new Error('못 찾음: ' + startToken);
  const open = src.indexOf(startToken.startsWith('const') ? '[' : '{', i);
  const [o, c] = startToken.startsWith('const') ? ['[', ']'] : ['{', '}'];
  let d = 0;
  for (let k = open; k < src.length; k++) {
    if (src[k] === o) d++;
    else if (src[k] === c) { d--; if (d === 0) return src.slice(i, k + 1) + (startToken.startsWith('const') ? ';' : ''); }
  }
  throw new Error('안 닫힘: ' + startToken);
}

// eslint-disable-next-line no-new-func
const fns = new Function(
  cutDecl(SW, 'const _API_GET_FALLBACK_PATHS') + '\n' +
  cutDecl(SW, 'function _isCacheableApiGet(') + '\n' +
  cutDecl(SW, 'function _isDynamicApi(') + '\n' +
  'return { _isCacheableApiGet, _isDynamicApi };',
)();

const API = 'http://127.0.0.1:8000';
function route(p) {
  const url = new URL(API + p);
  const dyn = fns._isDynamicApi(url);
  if (!dyn) return 'bypass';
  return fns._isCacheableApiGet({ method: 'GET' }, url) ? 'network-first+cache' : 'pass-through';
}

describe('목록 쿼리를 바꿔도 SW 분류는 그대로', () => {
  test.each([
    // 옛 호출                                         새 호출(같은 의도)
    ['/revenue?period=month',                         '/revenue?period=month&summary_only=1'],
    ['/revenue?period=today',                         '/revenue?period=today&summary_only=1'],
    ['/revenue?period=custom&from=2026-10-01&to=2026-10-31', '/revenue?period=custom&from=2026-10-01&to=2026-10-31&limit=2000&offset=2000'],
    ['/bookings',                                     '/bookings?from=2026-09-02T00%3A00%3A00Z&to=2026-12-31T00%3A00%3A00Z'],
    ['/bookings?from=a&to=b',                         '/bookings?from=a&to=b&limit=500'],
  ])('%s  ≡  %s', (oldP, newP) => {
    expect(route(newP)).toBe(route(oldP));
  });

  test('목록 경로는 SW 를 거치지 않는다(오프라인 폴백은 앱 레벨 캐시 몫)', () => {
    expect(route('/revenue?period=month&summary_only=1')).toBe('bypass');
    expect(route('/bookings?from=a&to=b')).toBe('bypass');
    expect(route('/bookings')).toBe('bypass');
  });

  test('실제로 SW API 캐시를 타는 매출 하위 경로는 그대로', () => {
    expect(route('/revenue/summary?period=month')).toBe('network-first+cache');
    expect(route('/revenue/forecast')).toBe('network-first+cache');
    expect(route('/revenue/12/refunds')).toBe('network-first+cache');
  });

  test('폴백 목록 자체는 손대지 않았다(/bookings · /revenue 항목 유지)', () => {
    const list = new Function(cutDecl(SW, 'const _API_GET_FALLBACK_PATHS') + 'return _API_GET_FALLBACK_PATHS;')();
    expect(list).toEqual(expect.arrayContaining(['/bookings', '/revenue']));
  });
});
