/* Home v4.1 톤다운 렌더러 — 헤더/캐러셀/오늘의 예약/운영 3카드.
   SWR: 캐시 즉시 → 백그라운드 fetch. 데이터: /assistant/brief + loadSlotsFromDB().
   외부 hidden anchor (#home-today-brief 등) 손대지 않음.
   window.HomeV41 = { render(containerId), refresh() } */
(function () {
  'use strict';

  const SWR_KEY = 'hv41_cache::brief';
  const SWR_TTL = 60 * 1000;

  function _readSWR() {
    try {
      const raw = localStorage.getItem(SWR_KEY) || sessionStorage.getItem(SWR_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      return { d: obj.d, fresh: Date.now() - obj.t < SWR_TTL };
    } catch (_e) { return null; }
  }
  function _writeSWR(data) {
    try {
      const payload = JSON.stringify({ t: Date.now(), d: data });
      try { localStorage.setItem(SWR_KEY, payload); }
      catch (_e1) { try { sessionStorage.setItem(SWR_KEY, payload); } catch (_e2) { void _e2; } }
    } catch (_e) { /* silent */ }
  }

  // ─────────── fetch ───────────
  function _authHeaders() {
    try {
      const headers = window.authHeader ? window.authHeader() : {};
      return headers && headers.Authorization ? headers : null;
    } catch (_e) { return null; }
  }
  async function _fetchBrief() {
    // [2026-06-25] 콜드스타트/인증헤더 레이스 방어 — "연결이 불안정해요" 오발생 차단.
    //   apiFetch 는 글로벌 재시도 래퍼를 안 거쳐서 1회 실패 시 그대로 null 이 됐고,
    //   로그인 직후 인증헤더가 아직 안 붙었거나 BE 콜드스타트 5xx 면 새로고침해야만 떴음.
    //   → 에러화면 띄우기 전 백오프로 최대 3회 재시도 (인증 대기 + 일시 5xx/네트워크 모두 흡수).
    // [출시감사 2026-08-01] 인증 대기와 API 재시도를 **분리**한다.
    //   예전엔 헤더가 아직 없으면 `continue` 로 재시도 횟수를 까먹었다. 로그인 직후처럼
    //   헤더가 늦게 붙는 상황에서 attempt 0·1 이 대기로 소모되면 **진짜 API 시도는 1번뿐**이라
    //   그 한 번이 삐끗하면 바로 "연결이 불안정해요" 카드가 떴다. 재시도 3회의 의미가 없었다.
    //   → 헤더는 별도로 최대 3초 기다리고, 그 다음에 API 재시도 3회를 온전히 쓴다.
    const AUTH_WAIT_MS = 3000, AUTH_POLL_MS = 100;
    const _waitStart = Date.now();
    while (!_authHeaders() && Date.now() - _waitStart < AUTH_WAIT_MS) {
      await new Promise(r => setTimeout(r, AUTH_POLL_MS));
    }
    if (!_authHeaders()) console.warn('[brief] 인증 헤더가 3초 안에 안 붙음');

    const BACKOFF = [0, 800, 2000];
    for (let attempt = 0; attempt < BACKOFF.length; attempt++) {
      if (BACKOFF[attempt]) await new Promise(r => setTimeout(r, BACKOFF[attempt]));
      const headers = _authHeaders();
      if (!window.API || !headers) {
        if (!headers) console.warn('[brief] 인증 헤더 없음 (attempt ' + attempt + ')');
        continue;
      }
      try {
        const res = await apiFetch('/assistant/brief', { headers });
        /* [2026-08-17 보스] 401/403 은 네트워크 문제가 아니다 — "연결이 불안정해요" 오진 금지.
           만료 토큰으로 부팅하면 재시도 3회가 전부 401 로 소모돼 실패 카드가 떴고, 세션 게이트가
           로그인을 받아도 홈을 다시 안 그려 카드가 고정됐다(재렌더 훅은 app-core 로그인 성공부에 추가).
           여기선 즉시 중단하고 AUTH 를 돌려줘 에러 카드를 안 띄운다. */
        if (res.status === 401 || res.status === 403) {
          console.warn('[brief] 인증 실패(' + res.status + ') — 세션 게이트에 맡기고 중단');
          return 'AUTH';
        }
        if (!res.ok) {
          console.warn('[brief] API 응답 실패:', res.status, '(attempt ' + attempt + ')');
          continue;
        }
        const data = await _withBookingRevenue(await res.json());
        _writeSWR(data);
        return data;
      } catch (_e) {
        console.warn('[brief] fetch 예외 (attempt ' + attempt + '):', _e);
      }
    }
    return null;
  }
  async function _withBookingRevenue(data) {
    if (!window.BookingRevenueOverlay || typeof window.BookingRevenueOverlay.enrichBrief !== 'function') return data;
    try { return await window.BookingRevenueOverlay.enrichBrief(data); }
    catch (err) {
      console.warn('[brief] 예약금 보강 실패:', err);
      return data;
    }
  }
  async function _fetchSlots() {
    if (typeof window.loadSlotsFromDB !== 'function') return [];
    try { return await window.loadSlotsFromDB(); }
    catch (_e) { return []; }
  }
  // DM 자동응답 승인 대기 큐 — 사장 확인 필요한 답장 N건
  async function _fetchDMQueueCount() {
    const headers = _authHeaders();
    if (!window.API || !headers) return 0;
    try {
      const res = await apiFetch('/dm-confirm-queue', { headers });
      if (!res.ok) return 0;
      const data = await res.json();
      return Array.isArray(data) ? data.length : (Array.isArray(data.items) ? data.items.length : 0);
    } catch (_e) { return 0; }
  }
  // [2026-07-20 v785] 답 안 한 댓글 문의 N건 — "AI 잇비가 챙겼어요" 카드용.
  //   비용 방어: 인스타 미연동이면 API 호출 자체를 안 함 (0 반환).
  async function _fetchCommentQueueCount() {
    // [2026-07-24] 인스타 연동 게이트 — 부팅 때 있는 신호로 판정한다.
    //   예전엔 window.WorkspaceAdapter.instagram() 를 봤는데, WorkspaceAdapter 는 lazy 'photo'
    //   그룹(맨 마지막 로드)이라 홈 최초 렌더 시점엔 없다 → 항상 0 → 미답 댓글이 있어도
    //   부팅 홈에 안 떴다(재렌더도 안 돼서 수동 이동 전엔 영영 안 보임). 원장님이 지적한
    //   '홈 실시간 반영 안 됨' 부류. ig_connected_cache 는 app-instagram.js(eager)가 부팅 때 쓴다.
    try {
      if (localStorage.getItem('itdasy:ig_connected_cache') !== '1') return 0;
    } catch (_e) { return 0; }
    const headers = _authHeaders();
    if (!window.API || !headers) return 0;
    // [v789] 자동 응대 마스터 꺼짐 → 홈 줄 숨김 + API 호출도 스킵 (비용 방어)
    try {
      const s0 = JSON.parse(localStorage.getItem('itdasy:crq_settings') || 'null');
      if (s0 && s0.enabled === false) return 0;
    } catch (_e) { /* ignore */ }
    // [2026-07-21] 방해금지 시간대(운영시간 밖) → 홈 넛지·API 호출 스킵. 큐 열면 다 보임(유실 아님)
    try { if (window.crqQuietNow && window.crqQuietNow()) return 0; } catch (_e) { /* ignore */ }
    try {
      const res = await apiFetch('/instagram/comment-queue', { headers });
      if (!res.ok) return 0;
      const data = await res.json();
      const items = Array.isArray(data && data.items) ? data.items : [];
      // 큐 화면과 같은 필터 적용 (설정에서 끈 문의 종류 제외 — itdasy:crq_settings, 기본 hours=off)
      let intents = { hours: false };
      try {
        const s = JSON.parse(localStorage.getItem('itdasy:crq_settings') || 'null');
        if (s && s.intents) intents = Object.assign(intents, s.intents);
      } catch (_e) { /* ignore */ }
      return items.filter(it => intents[it.intent] !== false).length;
    } catch (_e) { return 0; }
  }

  // [F1] _fetchProjectedTotal 제거 — 홈 상단 매출 표시 삭제됨

  // [v6] 카운트업 (easeOutCubic 0.8s) — 히어로 / stat 값
  function _countUp(el, target, ms) {
    if (!el || !Number.isFinite(target) || target <= 0) return;
    if (el.dataset.hvCountDone === '1') return;
    el.dataset.hvCountDone = '1';
    const start = performance.now();
    function tick(now) {
      const p = Math.min((now - start) / ms, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * ease).toLocaleString('ko-KR') + '원';
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
  function _runCountUps(container) {
    const targets = container.querySelectorAll('[data-hv-count]');
    targets.forEach(el => {
      const t = parseInt(el.dataset.hvCount, 10);
      _countUp(el, t, 800);
    });
  }

  // ─────────── 캐러셀 점 인디케이터 ───────────
  function _setupCarousel(container) {
    const car = container.querySelector('[data-hv-carousel]');
    const dots = container.querySelectorAll('[data-hv-dots] .hv-dot');
    const counter = container.querySelector('[data-hv-counter]');
    if (!car || !dots.length) return;
    let raf = 0;
    car.addEventListener('scroll', () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const cards = car.querySelectorAll('.hv-card');
        if (!cards.length) return;
        const cw = cards[0].getBoundingClientRect().width + 10;
        const idx = Math.min(dots.length - 1, Math.max(0, Math.round(car.scrollLeft / cw)));
        dots.forEach((d, i) => d.classList.toggle('is-on', i === idx));
        if (counter) counter.textContent = (idx + 1) + ' / ' + cards.length;
      });
    }, { passive: true });
    dots.forEach((d, i) => {
      d.addEventListener('click', () => {
        const cards = car.querySelectorAll('.hv-card');
        if (!cards[i]) return;
        car.scrollTo({ left: cards[i].offsetLeft - car.offsetLeft, behavior: 'smooth' });
      });
    });
    // 2026-05-01 ── 좌우 화살표 버튼 핸들러
    const wrap = car.parentElement;
    if (wrap && wrap.classList.contains('hv-carousel-wrap')) {
      const goByCard = (dir) => {
        const cards = car.querySelectorAll('.hv-card');
        if (!cards.length) return;
        const cw = cards[0].getBoundingClientRect().width + 10;
        const idx = Math.round(car.scrollLeft / cw);
        const next = Math.max(0, Math.min(cards.length - 1, idx + dir));
        car.scrollTo({ left: cards[next].offsetLeft - car.offsetLeft, behavior: 'smooth' });
      };
      wrap.querySelector('[data-hv-nav="prev"]')?.addEventListener('click', () => goByCard(-1));
      wrap.querySelector('[data-hv-nav="next"]')?.addEventListener('click', () => goByCard(1));
    }
  }

  // ─────────── 이벤트 바인딩 ───────────
  function _handleSlotClick(booking) {
    if (typeof window.showTab === 'function') {
      const btn = document.querySelector('.tab-bar__btn[data-tab="calendar"]');
      try { window.showTab('calendar', btn); } catch (_e) { /* ignore */ }
    }
    const ymd = (booking && booking.starts_at) ? booking.starts_at.split('T')[0] : '';
    if (ymd && typeof window.openBooking === 'function') {
      try { window.openBooking(ymd); } catch (_e) { /* ignore */ }
    }
    // TODO[v1.5]: 예약 상세 sheet 자동 오픈 — 현재 미구현
  }

  function _bindEvents(container, brief) {
    const bookings = window.HomeV41Render.todayBookings(brief);
    container.querySelectorAll('[data-hv-slot]').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.hvSlot, 10);
        const b = bookings[idx];
        if (b) _handleSlotClick(b);
      });
    });
    container.querySelectorAll('[data-hv-act]').forEach(el => {
      // 슬롯 안의 act는 슬롯 핸들러가 처리하므로 중복 방지
      if (el.hasAttribute('data-hv-slot')) return;
      el.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        window.HomeV41Actions.run(el.dataset.hvAct || '');
      });
    });
    _bindItbiCardInput(container);
    // [2026-08-16] AI 캐러셀(_bindAiCarousel)·정상카드 접기 토글 삭제 — 실시간 분석이 잇비 카드로 흡수됨
  }

  // [2026-05-28] 메인홈 잇비 카드 입력 — 카메라/스왑버튼(빈 상태=음성, 입력 중=전송) → 시트 진입
  function _bindItbiCardInput(container) {
    const input = container.querySelector('[data-itbi-input]');
    const fileInput = container.querySelector('[data-itbi-file]');
    const bar = container.querySelector('.hv5-itbi-input');
    const swapBtn = container.querySelector('[data-itbi-act="swap"]');
    const openSheet = (opts) => {
      const open = (window.AssistantSheet && window.AssistantSheet.open) || window.openAssistant;
      if (typeof open === 'function') open(opts || {});
    };
    const startVoice = () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        if (window.showToast) window.showToast('이 브라우저는 음성 입력을 지원하지 않아요');
        return;
      }
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => { stream.getTracks().forEach(t => t.stop()); openSheet({ startVoice: true }); })
        .catch(() => { if (window.showToast) window.showToast('마이크 권한이 필요해요'); });
    };
    container.querySelectorAll('[data-itbi-act]').forEach(btn => {
      btn.addEventListener('click', (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        const act = btn.dataset.itbiAct;
        if (act === 'photo') {
          fileInput?.click();
        } else if (act === 'swap') {
          const text = (input?.value || '').trim();
          if (!text) { startVoice(); return; }
          openSheet({ sendImmediate: text });
          input.value = '';
          if (bar) bar.classList.remove('has-text');
          if (swapBtn) swapBtn.setAttribute('aria-label', '음성 입력');
        }
      });
    });
    if (input) {
      // 입력 여부에 따라 마이크 ↔ 전송 스왑
      input.addEventListener('input', () => {
        const has = Boolean(input.value.trim());
        if (bar) bar.classList.toggle('has-text', has);
        if (swapBtn) swapBtn.setAttribute('aria-label', has ? '보내기' : '음성 입력');
      });
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' && !ev.shiftKey) {
          ev.preventDefault();
          const text = input.value.trim();
          openSheet(text ? { sendImmediate: text } : {});
          input.value = '';
          if (bar) bar.classList.remove('has-text');
          if (swapBtn) swapBtn.setAttribute('aria-label', '음성 입력');
        }
      });
      // 카드 자체 클릭 라우팅이 input 포커스 막지 않도록
      input.addEventListener('click', (ev) => ev.stopPropagation());
    }
    _bindItbiFileInput(fileInput, openSheet);
  }

  function _bindItbiFileInput(fileInput, openSheet) {
    if (!fileInput) return;
    fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      const sendImmediate = fileInput.dataset.itbiPrompt || '';
      if (file) openSheet(sendImmediate ? { attachPhoto: file, sendImmediate } : { attachPhoto: file });
      fileInput.dataset.itbiPrompt = '';
      fileInput.value = '';
    });
  }

  // ─────────── 메인 렌더 ───────────
  let _lastContainerId = null;
  let _inFlight = false;

  function _hydrateHome(container, brief, dmQueueCount) {
    container.innerHTML = window.HomeV41Render.compose(brief, dmQueueCount);
    _setupCarousel(container);
    _bindEvents(container, brief);
    window.HomeV41Render.syncAvatar(container);
    _scheduleAvatarRetry(container);
    _runCountUps(container);
    // [2026-06-07] 고객 메시지 카드 줄 채우기 (DOM 재생성됐으니 매 렌더마다 갱신)
    try { window.HomeCustomerMsgs && window.HomeCustomerMsgs.refresh(); } catch (_e) { void _e; }
  }

  /* [2026-08-17 보스] "Instagram 다시 연결"(#metaReconnectRow)은 Meta 검수자 전용 —
     일반 사용자 홈에 App Review 안내가 상시 노출되던 것 숨김. 검수자는 데모 계정으로
     로그인하므로 자동 노출되고, 화면녹화(보스 계정)는 ?metareview=1 로 강제 노출. */
  function _syncMetaReviewRow() {
    try {
      const row = document.getElementById('metaReconnectRow');
      if (!row) return;
      const demo = (localStorage.getItem('last_login_email') || '').toLowerCase() === 'review@itdasy.com';
      const forced = /[?&]metareview=1/.test(location.search);
      row.style.display = (demo || forced) ? '' : 'none';
    } catch (_e) { /* ignore */ }
  }

  function _showConnectionError(container) {
    container.innerHTML = `
      <div style="text-align:center;padding:60px 20px;color:var(--text-muted)">
        <div style="font-size:40px;margin-bottom:12px">📡</div>
        <div style="font-size:16px;font-weight:600;margin-bottom:8px">연결이 불안정해요</div>
        <div style="font-size:14px">인터넷 연결을 확인하고 다시 시도해주세요</div>
        <button data-home-reload style="margin-top:16px;padding:10px 24px;background:var(--brand);color:#fff;border:none;border-radius:10px;font-size:14px;cursor:pointer">다시 시도</button>
      </div>`;
    container.querySelector('[data-home-reload]')?.addEventListener('click', () => location.reload());
  }

  async function _doRender(containerId, opts) {
    const force = !!(opts && opts.force);
    const container = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
    if (!container) return;
    _lastContainerId = container.id || _lastContainerId;
    _syncMetaReviewRow();   // [2026-08-17] 홈 그릴 때마다 검수자 전용 행 노출 여부 동기화

    // SWR: 캐시 즉시 (DM 큐 카운트는 캐시에 없으니 0 으로 시작)
    const swr = _readSWR();
    if (swr && swr.d) {
      try {
        _hydrateHome(container, swr.d, swr.d._dmQueueCount || 0);
        _watchHeaderAvatar();
        // [2026-07-24] force(=홈 복귀·앱 포그라운드·수동 새로고침)면 fresh 여도 네트워크 재요청.
        //   안 그러면 DM/댓글이 60초 SWR 창에 갇혀 "최신 아님"으로 보였다(실측). refresh() 는
        //   항상 force → 원장이 DM 보내고 홈 오면 즉시 반영.
        if (swr.fresh && !force) return;
      } catch (_e) { /* fall through */ }
    }

    if (_inFlight) return;
    _inFlight = true;
    try {
      const [briefRaw, slots, dmQueueCount, commentQueueCount] = await Promise.all([
        _fetchBrief().catch(() => null),
        _fetchSlots().catch(() => []),
        _fetchDMQueueCount().catch(() => 0),
        _fetchCommentQueueCount().catch(() => 0),
      ]);
      // [2026-08-17 보스] 세션 만료(AUTH) — 에러 카드 금지. 게이트가 로그인 화면을 띄우고,
      //   재로그인 훅(app-core)이 refresh() 로 다시 그린다. 캐시 있으면 그걸로 유지.
      if (briefRaw === 'AUTH' && !(swr && swr.d)) return;
      const brief = briefRaw === 'AUTH' ? null : briefRaw;
      // [2026-07-08] brief 실패 구분 — 실패인데 {}로 그리면 분석 카드가 전부
      //   "없어요/모두 정상" 가짜 초록불이 됨. 플래그 세워 재시도 카드로 렌더.
      const briefFailed = !brief && !(swr && swr.d) && briefRaw !== 'AUTH';
      const merged = brief || (swr && swr.d) || {};
      // [A12] 모든 API 실패 시 에러 안내
      if (briefFailed && (!slots || !slots.length)) {
        _showConnectionError(container);
        return;
      }
      if (briefFailed) merged._briefFailed = true;
      merged._dmQueueCount = dmQueueCount;
      merged._commentQueueCount = commentQueueCount;   // [v785] alertItems 가 brief 에서 읽음 (SWR 캐시에도 실림)
      // 실패한 빈 brief 는 SWR 캐시에 저장 금지 (캐시 오염 방지)
      if (!briefFailed) { try { _writeSWR(merged); } catch (_e) { void _e; } }
      _hydrateHome(container, merged, dmQueueCount);
      requestAnimationFrame(() => { window.scrollTo(0, 0); });
    } finally {
      _inFlight = false;
    }
  }

  // 인스타 fetch 가 v4.1 마운트보다 늦게 끝날 수 있어 한 번만 추가 sync.
  let _avatarRetryTimer = 0;
  function _scheduleAvatarRetry(container) {
    if (_avatarRetryTimer) clearTimeout(_avatarRetryTimer);
    _avatarRetryTimer = setTimeout(() => {
      _avatarRetryTimer = 0;
      const root = document.getElementById('homeV41Root');
      if (root && root.contains(container)) window.HomeV41Render.syncAvatar(container);
      else if (root) window.HomeV41Render.syncAvatar(root);
    }, 5000);
  }

  // 2026-05-01 ── 인스타 연동 후 #headerAvatar 변경 감지: MutationObserver.
  // updateHeaderProfile (app-core.js) 이 itdasy:data-changed 발사 안 해서
  // OAuth 끝나도 v4.1 헤더 아바타 갱신 안 되던 버그 픽스.
  let _avatarObserver = null;
  function _watchHeaderAvatar() {
    if (_avatarObserver) return;
    const target = document.getElementById('headerAvatar');
    if (!target) return;
    _avatarObserver = new MutationObserver(() => {
      const root = document.getElementById('homeV41Root');
      if (root) window.HomeV41Render.syncAvatar(root);
    });
    _avatarObserver.observe(target, {
      childList: true,        // <img> 추가/제거
      subtree: true,
      attributes: true,
      attributeFilter: ['src'],
    });
  }

  // ─────────── 공개 API ───────────
  window.HomeV41 = {
    async render(containerId) { return _doRender(containerId || 'homeV41Root'); },
    async refresh() {
      if (_lastContainerId) return _doRender(_lastContainerId, { force: true });
    },
  };

  // [2026-07-24] 홈 복귀 시 최신화 — 앱을 다른 앱에 갔다 돌아오거나(visibilitychange),
  //   창 포커스가 돌아오면 홈이 활성일 때 강제 새로고침. 없으면 초기 로드 카운트가
  //   60초 SWR 창 밖에서도 얼어붙어 DM/댓글이 "최신 아님"으로 보였다.
  function _isHomeActive() {
    const root = document.getElementById('homeV41Root');
    if (!root) return false;
    // 홈 탭이 화면에 보이는 상태인지(부모가 display:none 이 아닌지)
    return root.offsetParent !== null || root.getClientRects().length > 0;
  }
  let _lastVisRefresh = 0;
  function _refreshOnReturn() {
    if (document.hidden) return;
    if (!_isHomeActive()) return;
    // 과도한 재요청 방지 — 2초 디바운스
    const now = (window.performance && performance.now) ? performance.now() : 0;
    if (now && _lastVisRefresh && now - _lastVisRefresh < 2000) return;
    _lastVisRefresh = now;
    try { if (window.HomeV41 && window.HomeV41.refresh) window.HomeV41.refresh(); } catch (_e) { /* ignore */ }
  }
  document.addEventListener('visibilitychange', _refreshOnReturn);
  window.addEventListener('focus', _refreshOnReturn);

  // ─────────── 자동 부트스트랩 ───────────
  function _autoMount() {
    const el = document.getElementById('homeV41Root');
    if (el) _doRender(el);
    // [v206 2026-05-19] 모닝 브리핑 마운트 제거 — AI비서 실시간 분석과 중복.
    //   homeMorningMount div 자체는 호환성 위해 남겨둠 (display:none).
    //   TodayMorning 모듈은 유지 (다른 진입점에서 사용 가능).
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _autoMount, { once: true });
  } else {
    _autoMount();
  }

  // 데이터 변경 이벤트 — 홈 탭 활성 시 재렌더 + 아바타 즉시 동기화
  if (!window._homeV41DataListenerInit) {
    window._homeV41DataListenerInit = true;
    let _retryTimers = [];
    const _clearSWR = () => {
      try { localStorage.removeItem(SWR_KEY); } catch (_e) { void _e; }
      try { sessionStorage.removeItem(SWR_KEY); } catch (_e) { void _e; }
    };
    window.addEventListener('itdasy:data-changed', (ev) => {
      const kind = (ev && ev.detail && ev.detail.kind) || '';
      const isBookingish = /booking|revenue|completion|customer/.test(kind);
      // [v201] 안전망 — booking/revenue/completion 관련이면 brief SWR 캐시 즉시 삭제.
      //   booking-api 측 무효화가 있긴 하지만 racy 케이스 방어.
      if (isBookingish) _clearSWR();
      const root = document.getElementById('homeV41Root');
      if (!root) return;
      // 홈 탭 비활성이어도 아바타는 최신화 (다음 진입 시 깜빡임 방지)
      window.HomeV41Render.syncAvatar(root);
      // [2026-06-10 QA] 탭 활성 조건 제거 — 예약관리에서 예약 추가/취소 후 홈에 와도
      //   옛 DOM 이 그대로 남아 "반영이 한참 걸리는" 문제 픽스. 데이터 변경 이벤트는
      //   드물어서 백그라운드 재렌더 비용 무시 가능.
      _doRender(root);
      // [2026-06-14 QA] 예약 추가/완료 직후 /assistant/brief 가 옛 값을 반환(서버 반영
      //   지연)해 즉시 재fetch 가 stale 를 받던 문제. 수동 새로고침은 수 초 뒤라 정상이었음.
      //   → 지연 재fetch 안전망: 캐시 비우고 한두 번 더 갱신해 백엔드 지연을 따라잡음.
      if (isBookingish) {
        _retryTimers.forEach(clearTimeout); _retryTimers = [];
        [1500, 4000].forEach((ms) => {
          _retryTimers.push(setTimeout(() => {
            _clearSWR();
            const r = document.getElementById('homeV41Root');
            if (r) _doRender(r);
          }, ms));
        });
      }
    });
  }

  // [v201] 서비스 프리셋 사전 로드 — todayExpected 폴백 가격이 작동하려면 캐시 필요.
  //   loadServiceTemplates 완료 후 홈이 mount 됐으면 한번 더 렌더.
  if (typeof window.loadServiceTemplates === 'function' && !window._homeV41SvcWarmed) {
    window._homeV41SvcWarmed = true;
    window.loadServiceTemplates().then(() => {
      const root = document.getElementById('homeV41Root');
      if (root) _doRender(root);
    }).catch(() => { /* silent */ });
  }
})();
