/**
 * @jest-environment jsdom
 */
/* 사진 업로드가 재시도되지 않던 것 (2026-09-07 미디어감사)
 *
 * 실측 (배포본, 로컬 실패주입 서버):
 *   JSON body + 503   → 요청 5회 (재시도 O, 백오프 8초)
 *   FormData + 503    → 요청 **1회** (재시도 X, 즉시 실패)
 *   FormData + 무응답 → 20초에 abort, 재시도 X, **토스트도 없음**
 *     (토스트가 `if (retryable && attempt >= 1)` 안에 있어 retryable=false 면 아예 안 뜬다)
 *
 * 원인: `_bodyReusable` 이 "FormData/Blob 은 한 번만 읽을 수 있다" 고 단정했다. 사실이 아니다 —
 *   브라우저는 fetch 마다 FormData/Blob 을 새로 직렬화한다(같은 객체로 3회 POST → 서버 수신 3회).
 *   한 번만 읽히는 건 ReadableStream 뿐이다.
 *   그래서 Cloud Run 콜드스타트 503 한 번에 원장 사진이 그냥 안 올라갔다.
 *
 * 열면서 같이 잠근 것: portfolio·background 는 컬렉션 POST 로 **DB 행을 만든다** →
 *   응답만 유실된 경우 재시도가 사진을 2장 만든다. CREATE_NO_RETRY_RE 에 넣어 막는다.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'app-core.js'), 'utf8');

/** app-core.js 의 재시도 판정부만 떼어 실제로 실행한다 */
function loadPredicates() {
  const start = src.indexOf('  /* [미디어감사 2026-09-07] FormData·Blob 은');
  expect(start).toBeGreaterThan(-1);
  const endMark = '  function _sleep(ms)';
  const end = src.indexOf(endMark);
  expect(end).toBeGreaterThan(start);
  const noRetryStart = src.indexOf('  const CREATE_NO_RETRY_RE');
  const noRetryEnd = src.indexOf('\n', src.indexOf(';', noRetryStart));
  const body = src.slice(start, end) + '\n' + src.slice(noRetryStart, noRetryEnd) + `
    function _isNonIdempotentCreate(input, init) {
      const m = (init && init.method ? String(init.method).toUpperCase() : 'GET');
      if (m !== 'POST') return false;
      return CREATE_NO_RETRY_RE.test(String(input));
    }
    return { _isRetryableMethod, _bodyReusable, _isUploadBody, _isNonIdempotentCreate };`;
  // eslint-disable-next-line no-new-func
  return new Function(body)();
}

const P = loadPredicates();
const fd = () => { const f = new FormData(); f.append('image', new Blob(['x']), 'a.jpg'); return f; };
const post = (body) => ({ method: 'POST', body });
/** 래퍼가 실제로 쓰는 판정식과 동일하게 조합 */
const retryable = (url, init) =>
  P._isRetryableMethod(init) && P._bodyReusable(init) && !P._isNonIdempotentCreate(url, init);

describe('업로드 body 는 재사용 가능하다 (재시도 허용)', () => {
  test('★ FormData POST 가 재시도 대상이다 (이번 버그)', () => {
    expect(P._bodyReusable(post(fd()))).toBe(true);
    expect(P._isRetryableMethod(post(fd()))).toBe(true);
  });

  test('Blob / ArrayBuffer / URLSearchParams 도 재사용 가능', () => {
    expect(P._bodyReusable(post(new Blob(['x'])))).toBe(true);
    expect(P._bodyReusable(post(new ArrayBuffer(8)))).toBe(true);
    expect(P._bodyReusable(post(new Uint8Array(8)))).toBe(true);
    expect(P._bodyReusable(post(new URLSearchParams('a=1')))).toBe(true);
  });

  test('ReadableStream 만 1회성 — 계속 제외', () => {
    if (typeof ReadableStream === 'undefined') return;
    expect(P._bodyReusable(post(new ReadableStream()))).toBe(false);
    expect(P._isRetryableMethod(post(new ReadableStream()))).toBe(false);
  });

  test('_isUploadBody 는 FormData·Blob 만 (문자열 JSON 은 아님)', () => {
    expect(P._isUploadBody(post(fd()))).toBe(true);
    expect(P._isUploadBody(post(new Blob(['x'])))).toBe(true);
    expect(P._isUploadBody(post('{"a":1}'))).toBe(false);
  });
});

describe('행을 만드는 업로드는 여전히 재시도 금지 (중복 생성 방지)', () => {
  test('★ /portfolio · /background POST 는 재시도하지 않는다', () => {
    expect(retryable('https://api.test/portfolio', post(fd()))).toBe(false);
    expect(retryable('https://api.test/background', post(fd()))).toBe(false);
  });

  test('기존 규칙(bookings·revenue·customers)은 그대로', () => {
    expect(retryable('https://api.test/bookings', post('{}'))).toBe(false);
    expect(retryable('https://api.test/revenue', post('{}'))).toBe(false);
    expect(retryable('https://api.test/customers', post('{}'))).toBe(false);
  });

  test('멱등한 업로드는 재시도한다 — 내용해시 dedupe / 객체만 생성', () => {
    expect(retryable('https://api.test/workspace/slots/image', post(fd()))).toBe(true);
    expect(retryable('https://api.test/image/upload', post(fd()))).toBe(true);
  });

  test('하위경로(PATCH/DELETE 대상)는 컬렉션 POST 가 아니라 막히지 않는다', () => {
    expect(retryable('https://api.test/portfolio/12', post(fd()))).toBe(true);
    expect(retryable('https://api.test/customers/import-business-card', post(fd()))).toBe(true);
  });
});

describe('업로드 타임아웃은 일반 요청보다 길다', () => {
  test('★ UPLOAD_TIMEOUT_* 이 정의돼 있고 20초보다 길다', () => {
    const first = /const UPLOAD_TIMEOUT_FIRST_MS = (\d+);/.exec(src);
    const retry = /const UPLOAD_TIMEOUT_RETRY_MS = (\d+);/.exec(src);
    expect(first).toBeTruthy();
    expect(retry).toBeTruthy();
    expect(Number(first[1])).toBeGreaterThan(20000);
    expect(Number(retry[1])).toBeGreaterThan(12000);
  });

  test('업로드 경로가 실제로 그 상수를 쓴다 (배선 확인)', () => {
    expect(src).toMatch(/_isUp\s*\?\s*\(attempt === 0 \? UPLOAD_TIMEOUT_FIRST_MS : UPLOAD_TIMEOUT_RETRY_MS\)/);
  });

  test('★ 타임아웃 abort 에 한국어 사유가 실린다 (영어 원문 노출 방지)', () => {
    expect(src).toMatch(/ctl\.abort\(_timeoutReason\(timeoutMs\)\)/);
    const reason = /function _timeoutReason[\s\S]*?\n  }/.exec(src)[0];
    expect(reason).toMatch(/네트워크가 느려서/);
    expect(reason).toMatch(/'AbortError'/);   // name 유지 → 기존 분기 안 깨짐
  });
});
