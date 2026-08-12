/* 첫 로딩 분할 로더 (1단계 · 2026-06-11)
   목적: 첫 진입에 271개 스크립트를 전부 실행하던 것을 그룹 분리 —
   사진(편집기+갤러리) 그룹은 ①홈 렌더 후 유휴 시간에 선로딩 ②그 전에
   사진 기능 진입 시 ensure() 가 로드를 보장.

   사용: AppLoader.ensure('photo').then(...) / AppLoader.loaded('photo')
   매니페스트: js/load-groups.js (window.APP_LOAD_GROUPS — index.html 원래 순서 보존)

   동작 원리: 동적 script 에 async=false → 다운로드는 병렬, 실행은 삽입 순서 보장
   (기존 defer 와 동일한 순서 의미론. 전역 의존 모듈 안전). */
(function () {
  'use strict';
  if (window.AppLoader) return;

  const _done = {};     // group → true (전부 로드·실행 완료)
  const _inflight = {}; // group → Promise

  function _loadOne(src) {
    return new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = false; // 순서 보장 (ordered async)
      s.onload = () => resolve(true);
      s.onerror = () => {
        // 한 파일 실패로 전체 그룹을 막지 않음 — sw.js install 의 allSettled 와 동일 철학
        console.warn('[loader] 로드 실패:', src);
        resolve(false);
      };
      document.head.appendChild(s);
    });
  }

  function ensure(group) {
    if (_done[group]) return Promise.resolve(true);
    if (_inflight[group]) return _inflight[group];
    const list = (window.APP_LOAD_GROUPS || {})[group];
    if (!Array.isArray(list) || !list.length) {
      console.warn('[loader] 알 수 없는 그룹:', group);
      return Promise.resolve(false);
    }
    // [출시감사 2026-08-01] 예전엔 결과를 무시하고 무조건 `_done[group]=true` 로 굳혔다.
    //   그래서 파일 하나가 네트워크 문제로 못 뜨면 그 화면이 **그 세션 내내 영영 안 열렸다** —
    //   다시 눌러도 `_done` 이 true 라 재시도조차 안 하고, 스텁은 조용히 아무것도 안 했다.
    //   원장님 눈엔 "예약 눌러도 안 열림"이고 원인 표시도 없다.
    //   이제 하나라도 실패하면 _done 을 세우지 않고 _inflight 만 비워 **다음 탭에 재시도**된다.
    _inflight[group] = Promise.all(list.map(_loadOne)).then((results) => {
      const ok = results.every(Boolean);
      delete _inflight[group];
      if (!ok) {
        console.warn('[loader] 그룹 일부 실패 — 다음 시도에 재로드:', group);
        return false;
      }
      _done[group] = true;
      try { window.dispatchEvent(new CustomEvent('apploader:loaded', { detail: { group } })); }
      catch (_e) { void _e; }
      return true;
    });
    return _inflight[group];
  }

  function loaded(group) { return !!_done[group]; }

  window.AppLoader = { ensure, loaded };

  /* ── 사진 기능 진입 안전망 ──────────────────────────────
     유휴 선로딩이 끝나기 전(부팅 직후 수 초)에 사용자가 사진 기능에
     진입하면 그룹 로드 후 진짜 함수로 이어준다. 그룹 D 모듈이 로드되며
     아래 스텁을 자기 정의로 덮어쓰므로 1회성. */
  function _stub(name, group, toastMsg) {
    const stub = function () {
      const args = arguments;
      if (window.showToast) window.showToast(toastMsg || '준비 중…');
      // 실함수 반환값(Promise 등)을 그대로 전달 — await window.openCalendarView() 같은 호출 대응.
      return ensure(group).then(() => {
        const real = window[name];
        if (typeof real === 'function' && real !== stub) return real.apply(null, args);
        // [출시감사 2026-08-01] 여기 도달 = 로드 실패로 스텁이 자기 자신인 채 남았다는 뜻.
        //   예전엔 조용히 undefined 를 반환하고 끝나서 화면이 안 열리는데 **아무 표시도 없었다.**
        //   원장님은 손님 앞에서 몇 번을 눌러도 반응이 없는 걸 보게 된다.
        //   실패를 말해주고, ensure 가 _done 을 안 세웠으니 다시 누르면 재시도된다.
        if (window.showToast) {
          window.showToast('화면을 불러오지 못했어요. 인터넷 확인 후 다시 눌러주세요');
        }
        return undefined;
      });
    };
    stub._loaderStub = true;
    if (typeof window[name] !== 'function') window[name] = stub;
  }
  _stub('initWorkshopTab', 'photo', '사진 도구 준비 중…');
  _stub('initFinishTab', 'photo', '사진 도구 준비 중…');
  _stub('initAiRecommendTab', 'photo', '사진 도구 준비 중…');
  _stub('openGalleryWrite', 'photo', '사진 도구 준비 중…');
  /* [2단계] 잇비 — 외부 진입 함수는 openAssistant 하나 (조사 확인) */
  _stub('openAssistant', 'assistant', '잇비 준비 중…');
  /* [3단계] 주변 기능(extras: DM·SNS·임포트·OCR·지원 등) — 사이드바/메뉴 직행 진입만 스텁 */
  _stub('openDMConversations', 'extras', 'DM 준비 중…');
  /* [2026-08-12] `openSupport` 스텁 삭제 — **그런 함수는 어디에도 없다.**
     app-support.js 가 정의하는 건 `openSupportChat` 하나뿐인데, 여기서 유령 이름으로
     스텁을 만들어 두니 진입점들이 그걸 먼저 집었다:
       index.html  callFirst(['openSupport','openSupportChat'])
       app-myshop  window.openSupport || window.openSupportChat
     스텁은 '준비 중…' 을 띄우고 extras 를 로드한 뒤 window.openSupport 를 다시 보는데,
     실함수가 없으니 **여전히 자기 자신** → "화면을 불러오지 못했어요" 로 끝난다.
     즉 고객센터가 두 진입점(PC 사이드바 푸터·내샵관리 하단)에서 영영 안 열렸다.
     스텁을 없애면 두 호출부가 자동으로 openSupportChat 으로 떨어진다. */
  _stub('openSupportChat', 'extras', '준비 중…');
  _stub('openDMManualReplies', 'extras', '준비 중…');
  /* [P0-2 Phase3] 게이트된 주변 기능 화면(리포트·리마인더·리텐션·리뷰요청·음성캡션) → extras 그룹.
     assistant NL 명령 테이블이 openReviewRequests/openRetentionAI 를 값 캡처하나, 이 스텁이
     boot 시점에 이미 있어 스텁이 캡처됨 → 스텁이 실함수로 위임(안전). */
  _stub('openReport', 'extras', '준비 중…');
  _stub('openReviewRequests', 'extras', '준비 중…');
  _stub('openReminderSettings', 'extras', '준비 중…');
  _stub('openRetentionAI', 'extras', '준비 중…');
  _stub('openVoiceCaption', 'extras', '음성 캡션 준비 중…');
  /* [P0-2] 예약/달력(app-calendar-view 124KB) — features 그룹으로 오프로드.
     외부 진입점은 openCalendarView·openBooking 둘뿐(나머지 _cal*·closeBooking 은 열린 뒤 내부용). */
  _stub('openCalendarView', 'features', '예약 화면 준비 중…');
  _stub('openBooking', 'features', '예약 화면 준비 중…');
  /* [P0-2 Phase2] 매출 화면(app-revenue 계열 7파일) — revenue 그룹으로 오프로드.
     외부 진입점은 openRevenue·openRevenueHub·openRevenueInput. Revenue 엔진 소비처는
     API폴백(service-templates)·toast가드+ensure브리지(phase9)로 안전. */
  _stub('openRevenue', 'revenue', '매출 화면 준비 중…');
  _stub('openRevenueHub', 'revenue', '매출 화면 준비 중…');
  _stub('openRevenueInput', 'revenue', '매출 화면 준비 중…');

  /* ── 유휴 선로딩 — 홈 첫 페인트를 막지 않게 load 이후 idle 에 시작.
       잇비(매일 쓰는 기능) → 주변 기능 → 사진(106개, 최대 덩어리) 순서. ── */
  function _prefetch() {
    const go = () => { ensure('assistant').then(() => ensure('features')).then(() => ensure('revenue')).then(() => ensure('extras')).then(() => ensure('photo')); };
    if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 4000 });
    else setTimeout(go, 1500);
  }
  if (document.readyState === 'complete') _prefetch();
  else window.addEventListener('load', _prefetch, { once: true });
})();
