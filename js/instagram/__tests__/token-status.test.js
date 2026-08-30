/* 인스타 토큰 상태 판정 — 화면에 나갈 문구까지 고정한다.
 *
 * 지키려는 실장애 두 가지:
 *  1. user_id=27 — 토큰이 66일 죽어 있었는데 화면은 "연결됨" 이었다.
 *  2. 자동갱신 창 안(만료 5일 전)인데 옛 배너가 "지금 갱신하세요" 를 띄웠다.
 *     백엔드는 그때 이미 자동으로 갱신하고 있다 → 원장님께 헛일을 시킨다.
 */
const S = require('../token-status.js');

const NOW = Date.parse('2026-08-31T00:00:00Z');
const DAY = 86400000;
const at = (ms) => new Date(NOW + ms).toISOString();
const opts = { nowMs: NOW };

const connected = (over) => Object.assign({
  connected: true, token_valid: true, reconnect_required: false,
  expires_at: at(60 * DAY), handle: '@shop', capabilities: { publish: true },
}, over || {});

describe('Test 1 — 정상', () => {
  test('만료 여유 → VALID, 재연동 요구 없음', () => {
    const st = S.resolve(connected(), opts);
    expect(st.state).toBe(S.STATE.VALID);
    const d = S.describe(st);
    expect(d.title).toBe('인스타그램 연결됨');
    expect(d.showCta).toBe(false);
    expect(d.tone).toBe('ok');
  });
});

describe('Test 2 — 만료 임박 (자동갱신 대상)', () => {
  test('5일 남음 → EXPIRING, 남은 기간 표시, 재연동 요구 X', () => {
    const st = S.resolve(connected({ expires_at: at(5 * DAY) }), opts);
    expect(st.state).toBe(S.STATE.EXPIRING);
    const d = S.describe(st);
    expect(d.detail).toContain('자동 갱신까지 5일');
    expect(d.showCta).toBe(false);
    expect(d.title).not.toContain('재연동');
    expect(S.needsBanner(st)).toBe(false);
  });

  test('만료 임박은 위험(danger)으로 칠하지 않는다', () => {
    const st = S.resolve(connected({ expires_at: at(2 * DAY) }), opts);
    expect(S.describe(st).tone).not.toBe('danger');
  });

  test('경계 — 정확히 7일은 EXPIRING, 7일 초과는 VALID', () => {
    expect(S.resolve(connected({ expires_at: at(7 * DAY) }), opts).state)
      .toBe(S.STATE.EXPIRING);
    expect(S.resolve(connected({ expires_at: at(7 * DAY + 1000) }), opts).state)
      .toBe(S.STATE.VALID);
  });
});

describe('Test 3 — 재연동 필요', () => {
  test('reconnect_required=true 면 만료일이 남아 있어도 최우선', () => {
    // 권한 취소 시나리오 — 만료일은 30일 남았는데 토큰은 죽었다.
    const st = S.resolve(connected({ expires_at: at(30 * DAY), reconnect_required: true, token_valid: false }), opts);
    expect(st.state).toBe(S.STATE.RECONNECT_REQUIRED);
    const d = S.describe(st);
    expect(d.title).toContain('재연동');
    expect(d.showCta).toBe(true);
    expect(d.cta).toBe('인스타그램 다시 연결하기');
    expect(S.needsBanner(st)).toBe(true);
  });

  test('사용자 문구에 내부 용어가 새지 않는다', () => {
    const st = S.resolve(connected({ reconnect_required: true, token_valid: false }), opts);
    const d = S.describe(st);
    const blob = [d.title, d.detail, d.cta, d.badge].join(' ');
    ['OAuth', 'access token', 'token', 'subcode', 'HTTP', '400', '190',
     'invalid_token', 'OAuthException'].forEach((w) => {
      expect(blob).not.toContain(w);
    });
  });

  test('DM·게시가 멈춘다는 사실을 알려준다', () => {
    const st = S.resolve(connected({ reconnect_required: true, token_valid: false }), opts);
    const d = S.describe(st);
    expect(d.detail).toContain('DM');
    expect(d.detail).toContain('게시');
  });
});

describe('Test 4 — 이미 만료 (user_id=27 재현)', () => {
  const u27 = connected({
    expires_at: '2026-06-25T05:28:50Z', token_valid: false, reconnect_required: true,
    handle: '@seoah._.han02',
  });

  test('만료 + 재연동 필요 → RECONNECT_REQUIRED', () => {
    const st = S.resolve(u27, opts);
    expect(st.state).toBe(S.STATE.RECONNECT_REQUIRED);
  });

  test('만료된 날짜를 사람 말로 알려준다 (음수 기간을 보여주지 않는다)', () => {
    const d = S.describe(S.resolve(u27, opts));
    expect(d.detail).toContain('6월 25일');
    expect(d.detail).not.toMatch(/-\d/);
    expect(d.detail).not.toContain('NaN');
  });

  test('만료됐지만 아직 무효 판정이 아니면 "갱신 중" — 유예 안이라 백엔드가 시도한다', () => {
    const st = S.resolve(connected({ expires_at: at(-3 * 3600000), token_valid: true, reconnect_required: false }), opts);
    expect(st.state).toBe(S.STATE.REFRESHING);
    const d = S.describe(st);
    expect(d.showCta).toBe(false);
    expect(d.detail).toContain('따로 하실 일은 없어요');
  });
});

describe('Test 5 — 재연동 성공 후 즉시 정상', () => {
  test('새 expires_at + reconnect_required=false → VALID', () => {
    const before = S.resolve(connected({ reconnect_required: true, token_valid: false }), opts);
    expect(before.state).toBe(S.STATE.RECONNECT_REQUIRED);
    const after = S.resolve(connected({ expires_at: at(60 * DAY) }), opts);
    expect(after.state).toBe(S.STATE.VALID);
    expect(S.needsBanner(after)).toBe(false);
  });
});

describe('미연동 — 재연동 필요와 구분한다', () => {
  test('connected:false 응답에는 reconnect_required 가 아예 없다 (없음≠true)', () => {
    const st = S.resolve({ connected: false, token_valid: false, shop_name: 'x' }, opts);
    expect(st.state).toBe(S.STATE.NOT_CONNECTED);
    expect(S.needsBanner(st)).toBe(false);
    expect(S.describe(st).cta).toBe('인스타그램 연결하기');
  });

  test('응답이 아직 없어도 죽지 않는다', () => {
    expect(S.resolve(null, opts).state).toBe(S.STATE.NOT_CONNECTED);
    expect(S.resolve(undefined, opts).state).toBe(S.STATE.NOT_CONNECTED);
  });
});

describe('구버전 백엔드 호환', () => {
  test('reconnect_required 필드가 없으면 token_valid 로 판정', () => {
    const legacy = { connected: true, token_valid: false, expires_at: at(30 * DAY) };
    expect(S.resolve(legacy, opts).state).toBe(S.STATE.RECONNECT_REQUIRED);
  });

  test('token_valid 도 없으면 정상으로 본다 (낙관적 — 기존 동작 유지)', () => {
    const legacy = { connected: true, expires_at: at(30 * DAY) };
    expect(S.resolve(legacy, opts).state).toBe(S.STATE.VALID);
  });
});

describe('시간 표시 edge case — NaN·음수·1970 이 절대 안 나온다', () => {
  test.each([
    [30 * DAY, '30일'],
    [7 * DAY, '7일'],
    [1 * DAY, '1일'],
    [23 * 3600000, '23시간'],
    [1 * 3600000, '1시간'],
    [60000, '1분'],
    [1000, '1분'],          // 1분 미만도 "1분" — 0분/음수를 안 보여준다
    // 올림 확인 — 내림이면 "4일" 이 나온다(실제로 그렇게 나왔다).
    [5 * DAY - 1, '5일'],
    [5 * DAY - 3000, '5일'],
    [24 * 3600000 - 1, '1일'],
  ])('%i ms → %s', (ms, expected) => {
    expect(S.formatRemain(ms)).toBe(expected);
  });

  test.each([null, undefined, NaN, Infinity, -Infinity, 0, -1, -99999999, 'abc'])(
    '%p → 빈 문자열 (표시 안 함)', (bad) => {
      expect(S.formatRemain(bad)).toBe('');
    });

  test.each([null, undefined, '', 'not-a-date', 'Invalid Date', NaN, {}])(
    'expires_at=%p 여도 상태 판정이 죽지 않고 시간은 안 보여준다', (bad) => {
      const st = S.resolve(connected({ expires_at: bad }), opts);
      expect(st.remainMs).toBeNull();
      expect(st.state).toBe(S.STATE.VALID);
      const d = S.describe(st);
      expect(d.detail).not.toContain('NaN');
      expect(d.detail).not.toContain('1970');
      expect(d.detail).not.toContain('Invalid');
    });

  test('formatDate 는 잘못된 값에 빈 문자열', () => {
    [null, undefined, NaN, Infinity].forEach((bad) => {
      expect(S.formatDate(bad)).toBe('');
    });
  });

  test('어떤 상태의 문구에도 NaN·Invalid·1970 이 없다', () => {
    const cases = [
      connected(),
      connected({ expires_at: at(3 * DAY) }),
      connected({ expires_at: at(-1 * DAY), token_valid: false, reconnect_required: true }),
      connected({ expires_at: null }),
      connected({ expires_at: 'garbage' }),
      { connected: false, token_valid: false },
    ];
    cases.forEach((c) => {
      const d = S.describe(S.resolve(c, opts));
      const blob = [d.title, d.detail, d.cta, d.badge].join(' ');
      expect(blob).not.toMatch(/NaN|Invalid|1970|undefined|null/);
    });
  });
});

describe('서버 시각 보정 — 기기 시계가 틀어져도 이상해지지 않는다', () => {
  test('기기 시계가 3일 빠르면 보정으로 상쇄된다', () => {
    const exp = at(5 * DAY);
    // 기기가 3일 앞서 있음 → 보정 없으면 2일로 보인다
    const deviceNow = NOW + 3 * DAY;
    const skewed = S.resolve(connected({ expires_at: exp }), { nowMs: deviceNow, skewMs: -3 * DAY });
    expect(S.formatRemain(skewed.remainMs)).toBe('5일');
  });

  test('보정값이 이상하면(NaN) 무시하고 기기 시계를 쓴다', () => {
    const st = S.resolve(connected({ expires_at: at(5 * DAY) }), { nowMs: NOW, skewMs: NaN });
    expect(st.state).toBe(S.STATE.EXPIRING);
  });
});
