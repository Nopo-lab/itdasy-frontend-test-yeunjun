/* 인스타 토큰 상태 — 백엔드 응답 하나를 화면이 읽을 수 있는 상태로 바꾼다.
 *
 * ## 왜 따로 뒀나
 *
 * 배너·연동관리 카드·작업실이 각자 `expires_at` 을 계산하고 각자 문구를 만들면 반드시
 * 어긋난다. 실제로 어긋나 있었다 — 배너는 `expires_at` 만 보고 "지금 갱신하세요" 를
 * 띄웠는데, 백엔드는 그 시점에 **자동갱신을 이미 하고 있었다.** 원장님한테는 손으로
 * 뭔가 하라는 뜻으로 읽힌다.
 *
 * 그래서 판정은 여기 한 곳에서만 한다. 순수 함수라 jest 로 직접 테스트한다.
 *
 * ## 백엔드 contract (배포 SHA 020fd51 에서 실측)
 *
 *   미연동  { connected:false, token_valid:false, shop_name }
 *           → expires_at·reconnect_required 가 **아예 없다.** 없는 걸 false 로 읽지 말 것.
 *   연동됨  { connected:true, token_valid:bool, reconnect_required:bool,
 *            expires_at:ISO|null, handle, capabilities{...} }
 *
 * `reconnect_required` 는 백엔드에서 `not token_valid` 로 파생된다. 둘 다 보는 이유는
 * 구버전 백엔드(필드 없음) 호환 — 없으면 token_valid 로 판정한다.
 *
 * ## 상태
 *
 *   NOT_CONNECTED       한 번도 연동 안 했거나 해제함
 *   RECONNECT_REQUIRED  자동갱신이 실패했다. 사람이 재연동해야 한다 — **최우선 표시**
 *   REFRESHING          만료됐거나 임박했는데 백엔드가 아직 자동갱신 중 (유예 안)
 *   EXPIRING            갱신 창 안 — 곧 자동으로 갱신된다. 재연동 요구 금지
 *   VALID               여유 있음
 */
(function (root) {
  'use strict';

  var STATE = {
    NOT_CONNECTED: 'NOT_CONNECTED',
    RECONNECT_REQUIRED: 'RECONNECT_REQUIRED',
    REFRESHING: 'REFRESHING',
    EXPIRING: 'EXPIRING',
    VALID: 'VALID',
  };

  // 백엔드 IG_REFRESH_WINDOW_DAYS 와 같은 값. 여기 숫자를 바꾸면 화면만 바뀌고
  // 실제 갱신 시점은 안 바뀐다 — 백엔드 쪽도 같이 봐야 한다.
  var REFRESH_WINDOW_DAYS = 7;
  var DAY_MS = 86400000;
  var HOUR_MS = 3600000;
  var MIN_MS = 60000;

  function _parseMs(v) {
    if (v === null || v === undefined || v === '') return null;
    var ms = (v instanceof Date) ? v.getTime() : new Date(v).getTime();
    // Invalid Date → NaN. 여기서 걸러야 화면에 NaN·1970 이 안 나온다.
    return (typeof ms === 'number' && isFinite(ms)) ? ms : null;
  }

  /* 서버 시각 기준 now. 기기 시계가 틀어져 있어도 남은 기간이 이상해지지 않게.
   *
   * status 응답의 HTTP `Date` 헤더가 곧 서버 시각이라 그걸 쓴다(추가 API 0회).
   * 못 구하면 기기 시계로 떨어진다 — 없는 것보단 낫다. */
  function resolveNow(opts) {
    opts = opts || {};
    var skew = (typeof opts.skewMs === 'number' && isFinite(opts.skewMs)) ? opts.skewMs : 0;
    var base = (typeof opts.nowMs === 'number' && isFinite(opts.nowMs)) ? opts.nowMs : Date.now();
    return base + skew;
  }

  /* 백엔드 응답 → 상태 한 덩어리.
   * data 가 null/undefined 여도 죽지 않는다(아직 응답 전). */
  function resolve(data, opts) {
    data = data || {};
    var now = resolveNow(opts);
    var expMs = _parseMs(data.expires_at);
    var remainMs = (expMs === null) ? null : (expMs - now);

    if (!data.connected) {
      return { state: STATE.NOT_CONNECTED, expiresAtMs: null, remainMs: null,
               handle: '', canPublish: false };
    }

    // 구버전 백엔드는 reconnect_required 를 안 준다 → token_valid 로 판정.
    var needsReconnect = (typeof data.reconnect_required === 'boolean')
      ? data.reconnect_required
      : (data.token_valid === false);

    var caps = data.capabilities || null;
    var base = {
      expiresAtMs: expMs,
      remainMs: remainMs,
      handle: data.handle || '',
      // 상태를 아직 모르면 낙관적 true — 기존 동작을 바꾸지 않으려고.
      canPublish: caps ? !!caps.publish : true,
    };

    if (needsReconnect) {
      // [실 Meta 게이트 2026-09-06] 백엔드가 준 사유를 그대로 들고 간다.
      //   구버전 백엔드는 이 필드가 없다 → '' (describe 가 기존 문구로 떨어진다).
      return Object.assign(base, {
        state: STATE.RECONNECT_REQUIRED,
        reconnectReason: (typeof data.reconnect_reason === 'string') ? data.reconnect_reason : '',
      });
    }
    if (remainMs === null) return Object.assign(base, { state: STATE.VALID });
    // 만료됐는데 아직 무효 판정이 아니다 = 백엔드가 유예 안에서 자동갱신 중.
    if (remainMs <= 0) return Object.assign(base, { state: STATE.REFRESHING });
    if (remainMs <= REFRESH_WINDOW_DAYS * DAY_MS) {
      return Object.assign(base, { state: STATE.EXPIRING });
    }
    return Object.assign(base, { state: STATE.VALID });
  }

  /* 남은 기간을 사람 말로. 절대 NaN·음수·1970 이 나오지 않는다.
   *
   * ⚠️ 올림(ceil)이다. 내림으로 하면 만료가 5일 남았는데 "4일" 이라고 나온다
   *    (5일에서 몇 밀리초만 지나도 floor 는 4). 원장님은 달력으로 세는데 화면이
   *    하루 적게 말하면 그냥 틀린 값으로 읽힌다 — 실측으로 잡았다. */
  function formatRemain(remainMs) {
    if (remainMs === null || remainMs === undefined) return '';
    if (typeof remainMs !== 'number' || !isFinite(remainMs)) return '';
    if (remainMs <= 0) return '';
    if (remainMs > HOUR_MS * 23) return Math.ceil(remainMs / DAY_MS) + '일';
    if (remainMs >= HOUR_MS) return Math.ceil(remainMs / HOUR_MS) + '시간';
    return Math.max(1, Math.ceil(remainMs / MIN_MS)) + '분';
  }

  function formatDate(ms) {
    if (ms === null || ms === undefined || !isFinite(ms)) return '';
    var d = new Date(ms);
    if (isNaN(d.getTime())) return '';
    return (d.getMonth() + 1) + '월 ' + d.getDate() + '일';
  }

  /* 상태 → 화면 문구. 내부 용어(OAuth·access token·subcode·HTTP)는 절대 넣지 않는다.
   *
   * tone: 'danger' 는 사람이 지금 뭔가 해야 하는 경우에만. 자동으로 해결되는 상태를
   *       빨갛게 칠하면 원장님이 매번 놀란다 — 그게 예전 배너의 문제였다. */
  function describe(st) {
    st = st || {};
    var remain = formatRemain(st.remainMs);
    switch (st.state) {
      case STATE.NOT_CONNECTED:
        return { tone: 'idle', title: '인스타그램 미연결',
                 detail: '연결하면 말투 분석과 게시를 쓸 수 있어요.',
                 cta: '인스타그램 연결하기', showCta: true, badge: '미연결' };

      case STATE.RECONNECT_REQUIRED:
        /* [실 Meta 게이트 2026-09-06] **재연동으로 안 풀리는 경우가 있다.**
         *   실제 Meta 를 불러 보니 code 10 =
         *   "instagram account type is not business or creator" 가 돌아왔다.
         *   이건 인스타 앱에서 계정을 프로페셔널로 되돌려야 한다 — 그런데 화면은
         *   "다시 연결하기" 만 띄웠다. 눌러도 같은 오류로 실패하는 버튼이다.
         *   원장님이 "왜 안 되지 / 무엇을 해야 하지" 에 답을 얻지 못한다. */
        if (st.reconnectReason === 'account_type') {
          return {
            tone: 'danger',
            title: '인스타그램 계정 설정을 바꿔야 해요',
            detail: '지금 계정이 개인 계정이라 잇데이가 연결할 수 없어요. '
              + '인스타그램 앱 → 설정 → 계정 유형에서 프로페셔널(비즈니스·크리에이터) '
              + '계정으로 바꾼 뒤 다시 연결해주세요.',
            cta: '바꾸고 다시 연결하기', showCta: true, badge: '계정 유형',
          };
        }
        if (st.reconnectReason === 'app_removed') {
          return {
            tone: 'danger',
            title: '인스타그램 연결이 해제됐어요',
            detail: '인스타그램에서 잇데이 앱 연결이 해제됐어요. '
              + '다시 연결하면 DM 자동응답과 게시를 이어서 쓸 수 있어요.',
            cta: '인스타그램 다시 연결하기', showCta: true, badge: '연결 해제됨',
          };
        }
        /* [실 Meta 게이트 2026-09-07] **만료일이 아직 안 지났는데 "만료됐어요" 라고 하던 것.**
         *   토큰은 만료 전에도 죽는다(계정 유형 변경·권한 철회·비번 변경). 그걸 감지하도록
         *   백엔드에 생존 확인을 넣은 뒤로, **만료일이 미래인 채 재연동 필요**인 상태가
         *   정상적으로 생긴다. 그때 이 문구는 "10월 11일에 만료됐어요"(오늘 9월 7일)처럼
         *   원장님께 거짓말을 한다 — 배포본을 실제로 렌더해 보고 잡았다.
         *   지난 날짜일 때만 만료라고 말하고, 아니면 '끊어졌다' 로 말한다. */
        var _reallyExpired = (st.remainMs !== null && st.remainMs <= 0);
        return {
          tone: 'danger',
          title: '인스타그램 재연동이 필요해요',
          detail: ((st.expiresAtMs && _reallyExpired)
            ? '인스타그램 연결이 ' + formatDate(st.expiresAtMs)
              + '에 만료됐어요. 자동으로 갱신하지 못해서 '
            : '인스타그램 연결이 끊어졌어요. 다시 연결하기 전까지 ')
            + 'DM 자동응답과 게시가 멈춰 있어요.',
          cta: '인스타그램 다시 연결하기', showCta: true, badge: '재연동 필요',
        };

      case STATE.REFRESHING:
        return { tone: 'info', title: '인스타그램 연결 갱신 중',
                 detail: '자동으로 갱신하고 있어요. 따로 하실 일은 없어요.',
                 cta: '', showCta: false, badge: '갱신 중' };

      case STATE.EXPIRING:
        return { tone: 'info', title: '인스타그램 연결됨',
                 detail: remain
                   ? '자동 갱신까지 ' + remain + ' — 따로 하실 일은 없어요.'
                   : '곧 자동으로 갱신돼요. 따로 하실 일은 없어요.',
                 cta: '', showCta: false, badge: '자동 갱신 예정' };

      default:
        return { tone: 'ok', title: '인스타그램 연결됨',
                 detail: '연결이 정상이에요. 만료 전에 자동으로 갱신돼요.',
                 cta: '', showCta: false, badge: '정상' };
    }
  }

  /* 배너를 띄울 상태인가 — 전역 배너 우선순위의 기준.
   * 정상·자동갱신 예정은 배너로 방해하지 않는다(연동관리 화면에서만 보여준다). */
  function needsBanner(st) {
    return !!st && st.state === STATE.RECONNECT_REQUIRED;
  }

  var api = { STATE: STATE, REFRESH_WINDOW_DAYS: REFRESH_WINDOW_DAYS,
              resolve: resolve, describe: describe, formatRemain: formatRemain,
              formatDate: formatDate, needsBanner: needsBanner, resolveNow: resolveNow };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.IgTokenStatus = api;
})(typeof window !== 'undefined' ? window : null);
