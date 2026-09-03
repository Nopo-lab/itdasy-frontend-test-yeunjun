/* dev/qa-photo-harness.js — 사진 작업실/편집기 실사용 감사 하네스 (2026-09-03)
 * 배포에 안 실린다(index.html·load-groups.js 에 등록하지 않음). 브라우저 콘솔/자동화에서 fetch+eval 로 주입해 쓴다.
 *   const t = await (await fetch('/dev/qa-photo-harness.js')).text(); eval(t); await QA.boot();
 * 목적: "테스트 통과"가 아니라 **실제 DOM 측정·픽셀 비교**로 증거를 남긴다.
 */
(function () {
  'use strict';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const QA = { errors: [], rejections: [] };

  window.addEventListener('error', (e) => QA.errors.push(String(e.message)));
  window.addEventListener('unhandledrejection', (e) => QA.rejections.push(String((e.reason && e.reason.message) || e.reason)));

  // ── 픽스처 ────────────────────────────────────────────────
  QA.img = function (color, label, w, h) {
    w = w || 800; h = h || 1000;
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const x = cv.getContext('2d');
    x.fillStyle = color; x.fillRect(0, 0, w, h);
    // 방향 판별용 비대칭 마커: 좌상단만 흰 사각형
    x.fillStyle = '#fff'; x.fillRect(w * 0.04, h * 0.04, w * 0.18, h * 0.10);
    x.fillStyle = '#000'; x.font = 'bold ' + Math.round(h * 0.09) + 'px sans-serif';
    x.textAlign = 'center'; x.fillText(label, w / 2, h / 2);
    return cv.toDataURL('image/jpeg', 0.9);
  };
  QA.file = function (color, label, w, h, name, type) {
    return new Promise((res) => {
      const url = QA.img(color, label, w, h);
      fetch(url).then((r) => r.blob()).then((b) => res(new File([b], name || (label + '.jpg'), { type: type || 'image/jpeg' })));
    });
  };

  /* ── EXIF 회전 픽스처 ────────────────────────────────────
     canvas 가 만든 JPEG 은 EXIF 가 없다. 실제 아이폰 사진은 세로로 찍어도 픽셀은 가로이고
     Orientation 태그(6=시계 90°)로 돌려 보여준다 — 그래서 "미리보기는 세로인데 저장본은 가로"
     같은 사고가 난다. 여기서 APP1(Exif) 세그먼트를 직접 끼워 그 조건을 만든다. */
  QA.jpegWithOrientation = async function (dataUrl, orientation) {
    const buf = new Uint8Array(await (await fetch(dataUrl)).arrayBuffer());
    // TIFF 헤더(little-endian) + IFD0 1엔트리(0x0112 Orientation, SHORT, count 1)
    const tiff = [
      0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,   // "II", 42, IFD0 offset=8
      0x01, 0x00,                                        // 엔트리 1개
      0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00,    // tag=0x0112 type=SHORT count=1
      orientation & 0xff, 0x00, 0x00, 0x00,              // value
      0x00, 0x00, 0x00, 0x00,                            // next IFD = 0
    ];
    const payload = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00].concat(tiff);   // "Exif\0\0" + TIFF
    const len = payload.length + 2;
    const app1 = [0xff, 0xe1, (len >> 8) & 0xff, len & 0xff].concat(payload);
    const out = new Uint8Array(2 + app1.length + (buf.length - 2));
    out.set(buf.subarray(0, 2), 0);                       // SOI
    out.set(app1, 2);                                     // APP1
    out.set(buf.subarray(2), 2 + app1.length);            // 나머지
    return new File([out], 'exif' + orientation + '.jpg', { type: 'image/jpeg' });
  };
  /** 지정 픽셀 크기의 파일 — 대용량/세로긴/가로긴 케이스용. */
  QA.bigFile = function (w, h, color, label) {
    return QA.file(color || '#8e44ad', label || (w + 'x' + h), w, h, w + 'x' + h + '.jpg');
  };
  /** 잇데이가 못 읽는 파일(HEIC 흉내) — 확장자·MIME 만 heic 이고 내용은 디코드 불가. */
  QA.fakeHeic = function () {
    return new File([new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 104, 101, 105, 99])], 'IMG_0001.heic', { type: 'image/heic' });
  };

  // ── 부팅: 인증 게이트 우회 + photo 그룹 로드 ─────────────
  /* 🔴 숨은 탭에선 requestAnimationFrame 이 정지한다. 편집기는 레이어를 rAF 안에서 그리므로
     패치하지 않으면 "레이어 0개" 를 정상으로 오독한다(실제로 이 감사에서 한 번 속았다).
     자동화 브라우저는 패널이 숨겨지는 순간 hidden 이 되므로 부팅 때 무조건 건다. */
  QA.patchRaf = function () {
    if (window.__qaRafPatched) return false;
    window.__qaRafPatched = true;
    window.__qaOrigRaf = window.requestAnimationFrame;
    window.requestAnimationFrame = function (f) { return setTimeout(function () { f(performance.now()); }, 16); };
    return true;
  };

  /* 🔴 숨은 탭에선 CSS transition 도 얼어붙는다(합성 스레드가 안 돌아서 시작값에 머문다).
     실측: 그리기 패널이 `.is-open` 인데 computed transform 이 translateY(112%) 그대로라
     "패널이 화면 밖에 있다"는 **가짜 P1** 을 잡을 뻔했다. 측정 전엔 전환을 꺼서 최종값을 본다. */
  QA.freezeTransitions = function () {
    if (document.getElementById('__qaNoTransition')) return false;
    const st = document.createElement('style'); st.id = '__qaNoTransition';
    st.textContent = '*,*::before,*::after{transition:none !important;animation:none !important}';
    document.head.appendChild(st);
    return true;
  };

  QA.boot = async function () {
    QA.patchRaf();
    QA.freezeTransitions();
    for (let i = 0; i < 100 && !window.AppLoader; i++) await sleep(150);
    try { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); } catch (_e) { /* SW 없음 */ }
    await window.AppLoader.ensure('photo');
    try { window._setAuthGateLocked(false); } catch (_e) { /* 게이트 없음 */ }
    const lo = document.getElementById('lockOverlay'); if (lo) lo.style.display = 'none';
    QA.hookEditor();
    return { flow: !!window.WorkspaceFlow, editor: !!window.ItdEditor, build: window.APP_BUILD, tabHidden: document.hidden, rafPatched: !!window.__qaRafPatched, transitionsFrozen: !!document.getElementById('__qaNoTransition') };
  };

  // ── ItdEditor.open 후킹: 들어간 editState / 나온 editState 캡처 ──
  QA.cap = { opens: [], dones: [] };
  QA.hookEditor = function () {
    if (QA._hooked) return; QA._hooked = true;
    const orig = window.ItdEditor.open;
    window.ItdEditor.open = function (opts) {
      QA.cap.opens.push({ ratio: opts && opts.ratio, editState: opts && opts.editState ? JSON.parse(JSON.stringify(opts.editState)) : null });
      if (opts && typeof opts.onDone === 'function') {
        const od = opts.onDone;
        opts.onDone = function (dataUrl, meta) {
          try { QA.cap.dones.push({ dataUrl: dataUrl, editState: meta && meta.editState ? JSON.parse(JSON.stringify(meta.editState)) : null, meta: meta }); } catch (_e) { /* 순환 참조 */ }
          return od.apply(this, arguments);
        };
      }
      return orig.apply(this, arguments);
    };
  };

  // ── 편집기 직접 열기(플로우 없이) — 상태 격리 테스트용 ───
  QA.openEditor = async function (opts) {
    const out = { done: null, cancelled: false };
    window.ItdEditor.open(Object.assign({
      onDone: function (u, m) { out.done = { dataUrl: u, editState: m && m.editState }; },
      onCancel: function () { out.cancelled = true; },
    }, opts));
    await sleep(opts && opts.wait ? opts.wait : 1400);
    return out;
  };

  // ── 현재 편집기 DOM 측정 ─────────────────────────────────
  QA.measure = function () {
    const stage = document.querySelector('.itded__stage');
    if (!stage) return null;
    const R = stage.getBoundingClientRect();
    const layers = [...document.querySelectorAll('.itded__layers > .itl')].map((h) => {
      const b = h.getBoundingClientRect();
      const inner = h.querySelector('.itl-text, .itl-sticker, .itl-shape');
      const cs = inner ? getComputedStyle(inner) : null;
      return {
        text: (h.textContent || '').trim().slice(0, 24),
        cx: +(((b.left - R.left) + b.width / 2) / R.width).toFixed(4),
        cy: +(((b.top - R.top) + b.height / 2) / R.height).toFixed(4),
        w: +(b.width / R.width).toFixed(4),
        h: +(b.height / R.height).toFixed(4),
        color: cs ? cs.color : null,
        fontSize: cs ? cs.fontSize : null,
        fontFamily: cs ? (cs.fontFamily || '').split(',')[0] : null,
        align: cs ? cs.textAlign : null,
      };
    });
    return { stageAR: +(R.width / R.height).toFixed(4), stageW: Math.round(R.width), stageH: Math.round(R.height), layers: layers };
  };

  // ── 헤드리스 합성 → 픽셀 비교 (저장 전/후 '보이는 결과'가 같은가) ──
  QA.composeToPixels = async function (spec, size) {
    const url = await window.ItdEditor.compose(spec);
    if (!url) return null;
    size = size || 96;
    return await new Promise((res) => {
      const im = new Image();
      im.onload = function () {
        const cv = document.createElement('canvas'); cv.width = size; cv.height = size;
        const cx = cv.getContext('2d');
        cx.fillStyle = '#fff'; cx.fillRect(0, 0, size, size);
        cx.drawImage(im, 0, 0, size, size);
        res({ data: cx.getImageData(0, 0, size, size).data, w: im.naturalWidth, h: im.naturalHeight });
      };
      im.onerror = function () { res(null); };
      im.src = url;
    });
  };
  /** 두 합성 결과의 픽셀 차이율(%) — 0 이면 완전 동일. */
  QA.pixelDiff = function (a, b) {
    if (!a || !b) return null;
    let diff = 0; const n = a.data.length / 4;
    for (let i = 0; i < a.data.length; i += 4) {
      const d = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
      if (d > 24) diff++;   // 압축 노이즈 허용
    }
    return +(100 * diff / n).toFixed(2);
  };

  // ── 터치 타깃 실측: 아이콘이 아니라 **실제 hit box** ──────
  QA.hitBox = function (el, span) {
    span = span || 40;
    const r = el.getBoundingClientRect();
    if (!r.width) return null;
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, hits = 0;
    for (let dx = -span; dx <= span; dx += 1) {
      for (let dy = -span; dy <= span; dy += 1) {
        const x = r.left + r.width / 2 + dx, y = r.top + r.height / 2 + dy;
        if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
        const e = document.elementFromPoint(x, y);
        if (e === el || el.contains(e)) { hits++; if (dx < minX) minX = dx; if (dx > maxX) maxX = dx; if (dy < minY) minY = dy; if (dy > maxY) maxY = dy; }
      }
    }
    if (!hits) return { icon: [Math.round(r.width), Math.round(r.height)], hit: [0, 0], blocked: true };
    return { icon: [Math.round(r.width), Math.round(r.height)], hit: [maxX - minX + 1, maxY - minY + 1], blocked: false };
  };

  /** 화면 하단 고정 UI 전수 — 홈 인디케이터(기본 34px) 침범/작은 타깃 탐지. */
  QA.bottomAudit = function (homeInset) {
    homeInset = homeInset == null ? 34 : homeInset;
    document.documentElement.style.setProperty('--safe-area-inset-bottom', homeInset + 'px');
    document.documentElement.style.setProperty('--safe-area-inset-top', '47px');
    const vh = innerHeight, out = [];
    document.querySelectorAll('button,[role=button],a[href],[data-fl],[data-r],[data-tool],[data-lyr],[data-lay],input[type=range]').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 6 || r.height < 6) return;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0 || cs.pointerEvents === 'none') return;
      if (r.bottom <= 0 || r.top >= vh) return;
      const mid = document.elementFromPoint(Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), Math.min(vh - 1, Math.max(0, r.top + r.height / 2)));
      if (!(mid === el || el.contains(mid))) return;   // 가려진 요소는 건너뜀(별도 검사)
      const gap = vh - r.bottom;
      const inHome = r.bottom > vh - homeInset - 4;
      const small = Math.min(r.width, r.height) < 44;
      if (inHome || small) {
        // hitBox 는 elementFromPoint 를 수천 번 돌려 느리다 — 스윕에선 안 재고, 걸린 항목만 따로 잰다(QA.hitBox).
        out.push({ cls: (el.className || '').toString().slice(0, 30), label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 14),
          size: Math.round(r.width) + 'x' + Math.round(r.height), gap: Math.round(gap), inHome, small });
      }
    });
    return out;
  };
  QA.resetInsets = function () {
    document.documentElement.style.removeProperty('--safe-area-inset-bottom');
    document.documentElement.style.removeProperty('--safe-area-inset-top');
  };

  // ── 네트워크 카오스: fetch 를 지정 시나리오로 바꿔치기 ────
  QA.net = { calls: [] };
  QA.netChaos = function (mode, pathRe) {
    if (!QA._origFetch) QA._origFetch = window.fetch.bind(window);
    pathRe = pathRe || /./;
    window.fetch = function (input, init) {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      if (!pathRe.test(url)) return QA._origFetch(input, init);
      QA.net.calls.push({ url, method: (init && init.method) || 'GET', mode });
      if (mode === 'offline') return Promise.reject(new TypeError('Failed to fetch'));
      if (mode === 'timeout') return new Promise(() => {});   // 영영 안 옴
      if (mode === 'abort') { const e = new Error('aborted'); e.name = 'AbortError'; return Promise.reject(e); }
      const code = +mode;
      if (code >= 100) return Promise.resolve(new Response(JSON.stringify({ detail: 'qa-' + code }), { status: code, headers: { 'Content-Type': 'application/json' } }));
      return QA._origFetch(input, init);
    };
    return 'chaos:' + mode;
  };
  QA.netRestore = function () { if (QA._origFetch) window.fetch = QA._origFetch; return 'restored'; };

  // ── objectURL 회계: 만든 수 / 회수한 수 ──────────────────
  QA.trackObjectUrls = function () {
    if (QA._urlTracked) return QA.urlStats();
    QA._urlTracked = true;
    QA._created = 0; QA._revoked = 0; QA._live = new Set();
    const c = URL.createObjectURL.bind(URL), r = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = function (b) { const u = c(b); QA._created++; QA._live.add(u); return u; };
    URL.revokeObjectURL = function (u) { if (QA._live.delete(u)) QA._revoked++; return r(u); };
    return QA.urlStats();
  };
  QA.urlStats = function () { return { created: QA._created || 0, revoked: QA._revoked || 0, live: QA._live ? QA._live.size : 0 }; };

  QA.listenerCount = function () {
    // getEventListeners 는 DevTools 전용 → 프록시로 직접 센다.
    return QA._lsn || null;
  };
  QA.trackListeners = function () {
    if (QA._lsnTracked) return QA._lsn;
    QA._lsnTracked = true; QA._lsn = { added: 0, removed: 0, byType: {} };
    const A = EventTarget.prototype.addEventListener, R = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function (t) { QA._lsn.added++; QA._lsn.byType[t] = (QA._lsn.byType[t] || 0) + 1; return A.apply(this, arguments); };
    EventTarget.prototype.removeEventListener = function (t) { QA._lsn.removed++; QA._lsn.byType[t] = (QA._lsn.byType[t] || 0) - 1; return R.apply(this, arguments); };
    return QA._lsn;
  };

  /* ── [2026-09-04] 앱 전체 화면 스윕 ──────────────────────────
     사진편집만 보는 하네스였는데, "실수하는 신규 사용자" 관점 감사는 전 화면이 대상이다.
     화면을 열고 → 하단/터치/오버플로/에러를 재고 → **원래 화면으로 안전하게 돌아온다.**
     ⚠️ history.back() 을 여러 번 돌리면 앱 이전의 페이지까지 넘어가 세션이 날아간다
        (실측으로 당했다: ?api=staging 로 되감겨 토큰키가 바뀌어 로그아웃 상태가 됐다).
        그래서 시트 레지스트리 스택이 빌 때까지만, 최대 횟수를 정해 되감는다. */
  QA.sheetDepth = function () {
    try { return (window._sheetBackStack || []).length; } catch (_e) { return 0; }
  };
  QA.closeAllSheets = async function (max) {
    max = max || 6;
    for (let i = 0; i < max && QA.sheetDepth() > 0; i++) { history.back(); await sleep(360); }
    await sleep(300);
    return QA.sheetDepth();
  };
  /** 한 화면 감사 — 열기 함수를 받아 열고, 재고, 닫는다. */
  QA.auditScreen = async function (name, open, waitMs) {
    QA.clearErrors();
    const before = QA.sheetDepth();
    let openError = null;
    try { await open(); } catch (e) { openError = String(e && e.message); }
    await sleep(waitMs || 2000);
    const a = QA.bottomAudit(34);
    const iconOnly = a.filter((x) => {
      const [w, h] = x.size.split('x').map(Number);
      return Math.max(w, h) < 44;   // 폭도 좁은 = 진짜 아이콘 버튼(텍스트 링크는 폭이 넓다)
    });
    const res = {
      name, openError, depth: before + '→' + QA.sheetDepth(),
      inHome: a.filter((x) => x.inHome).map((x) => (x.label || x.cls) + ' ' + x.size + ' gap' + x.gap),
      tinyTargets: iconOnly.map((x) => (x.label || x.cls || '(무명)') + ' ' + x.size),
      hOverflow: document.documentElement.scrollWidth > innerWidth + 2,
      errors: QA.errors.slice(0, 3), rejections: QA.rejections.slice(0, 2),
    };
    await QA.closeAllSheets();
    return res;
  };

  QA.sleep = sleep;
  QA.flowScreen = function () { const s = window.WorkspaceFlow.getActiveSlot(); return s ? s.screen : null; };
  QA.clearErrors = function () { QA.errors = []; QA.rejections = []; };

  window.QA = QA;
  return QA;
})();
