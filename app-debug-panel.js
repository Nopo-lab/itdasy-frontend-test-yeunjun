/* ─────────────────────────────────────────────────────────────
   인앱 디버그 패널 (Capacitor WebView 에서 콘솔 못 보는 문제 해결)

   - window.showDebug(title, payload)  — 팝업으로 JSON/텍스트 즉시 표시
   - window.showDiagnose()              — /instagram/diagnose 호출 후 결과 표시
   - window.showRecentErrors()          — /me/recent-errors (있으면) 표시
   - console.error/warn 훅: 마지막 50개를 링버퍼에 저장 → 패널에서 볼 수 있게
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const LOG_BUF = [];
  const MAX_LOGS = 50;
  const _origErr = console.error.bind(console);
  const _origWarn = console.warn.bind(console);
  const _origLog = console.log.bind(console);

  function _serialize(a) {
    if (typeof a === 'string') return a;
    if (a instanceof Error) {
      return `${a.name}: ${a.message}` + (a.stack ? '\n' + a.stack.split('\n').slice(0, 5).join('\n') : '');
    }
    if (a && typeof a === 'object') {
      // Error 특성 체크 (DOMException 등 instanceof 실패하는 경우 대비)
      if (a.message || a.name || a.code) {
        const parts = [];
        if (a.name) parts.push(a.name);
        if (a.code) parts.push('code=' + a.code);
        if (a.message) parts.push(a.message);
        if (a.stack) parts.push('\n' + String(a.stack).split('\n').slice(0, 5).join('\n'));
        if (parts.length) return parts.join(' ');
      }
      try { return JSON.stringify(a, null, 2); } catch (_) { return String(a); }
    }
    return String(a);
  }

  function _push(level, args) {
    try {
      const text = args.map(_serialize).join(' ');
      LOG_BUF.push({ t: new Date().toISOString().slice(11, 19), lvl: level, msg: text.slice(0, 2000) });
      while (LOG_BUF.length > MAX_LOGS) LOG_BUF.shift();
    } catch (_) {}
  }
  console.error = function () { _push('E', [...arguments]); _origErr(...arguments); };
  console.warn  = function () { _push('W', [...arguments]); _origWarn(...arguments); };
  // log 는 너무 많아서 PUBLISH/INSTAGRAM/NUKKI 같은 태그 있을 때만
  console.log = function () {
    try {
      const first = arguments[0];
      if (typeof first === 'string' && /\[(PUBLISH|INSTAGRAM|NUKKI|PUBLISH-FILE|SUPPORT)/.test(first)) {
        _push('L', [...arguments]);
      }
    } catch (_) {}
    _origLog(...arguments);
  };
  window.addEventListener('error', (e) => _push('E', ['[window.error]', e.message, e.filename + ':' + e.lineno]));
  window.addEventListener('unhandledrejection', (e) => _push('E', ['[unhandled]', String(e.reason)]));

  function _ensureModal() {
    let m = document.getElementById('debugPanelModal');
    if (m) return m;
    m = document.createElement('div');
    m.id = 'debugPanelModal';
    m.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:99999;
      display:none;align-items:center;justify-content:center;padding:16px;
    `;
    m.innerHTML = `
      <div style="background:#fff;border-radius:14px;max-width:560px;width:100%;max-height:86vh;display:flex;flex-direction:column;overflow:hidden;">
        <div style="padding:14px 16px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;">
          <strong id="debugPanelTitle" style="font-size:15px;">진단 정보</strong>
          <div>
            <button id="debugPanelCopy" style="border:0;background:#f18091;color:#fff;padding:6px 12px;border-radius:8px;font-size:12px;margin-right:6px;">복사</button>
            <button id="debugPanelClose" style="border:0;background:#e0e0e0;color:#333;padding:6px 12px;border-radius:8px;font-size:12px;">닫기</button>
          </div>
        </div>
        <pre id="debugPanelBody" style="margin:0;padding:14px 16px;overflow:auto;font-size:11.5px;line-height:1.5;white-space:pre-wrap;word-break:break-all;background:#f8f8f8;flex:1;"></pre>
      </div>
    `;
    document.body.appendChild(m);
    m.querySelector('#debugPanelClose').addEventListener('click', () => { m.style.display = 'none'; });
    m.addEventListener('click', (e) => { if (e.target === m) m.style.display = 'none'; });
    m.querySelector('#debugPanelCopy').addEventListener('click', () => {
      const text = document.getElementById('debugPanelBody').textContent || '';
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text);
        else {
          const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
          document.execCommand('copy'); document.body.removeChild(ta);
        }
        if (window.showToast) window.showToast('복사됐어요');
      } catch (_) {}
    });
    return m;
  }

  window.showDebug = function (title, payload) {
    const m = _ensureModal();
    m.querySelector('#debugPanelTitle').textContent = title || '진단';
    let txt;
    if (typeof payload === 'string') txt = payload;
    else {
      try { txt = JSON.stringify(payload, null, 2); }
      catch (_) { txt = String(payload); }
    }
    m.querySelector('#debugPanelBody').textContent = txt;
    m.style.display = 'flex';
  };

  window.showDiagnose = async function () {
    if (!window.API || !window.authHeader) {
      window.showDebug('진단', '로그인 필요');
      return;
    }
    window.showDebug('진단 중...', '/instagram/diagnose 호출 중');
    try {
      const r = await fetch(window.API + '/instagram/diagnose', { headers: window.authHeader() });
      const d = await r.json().catch(() => ({ error: 'JSON 파싱 실패', status: r.status }));
      window.showDebug('인스타 진단 결과', {
        http_status: r.status,
        api_base: window.API,
        ...d,
      });
    } catch (e) {
      window.showDebug('진단 실패', { error: String(e), message: e.message });
    }
  };

  window.showRecentLogs = function () {
    window.showDebug('최근 로그 ' + LOG_BUF.length + '개',
      LOG_BUF.slice().reverse().map(l => `[${l.t}] ${l.lvl} ${l.msg}`).join('\n\n')
    );
  };

  // Meta 가 Supabase URL 을 못 받는지, 외부 URL 이면 받는지 판정
  window.testMetaWithImgur = async function () {
    if (!window.API || !window.authHeader) {
      window.showDebug('테스트', '로그인 필요');
      return;
    }
    // 1:1 정사각 JPEG, 공개 접근 가능, 1080x1080 — IG 요구 스펙 충족
    const testUrl = 'https://picsum.photos/id/237/1080/1080.jpg';
    window.showDebug('Meta 테스트 중...', `외부 URL: ${testUrl}\n→ Meta 가 이 URL 을 받아들이는지 확인 중`);
    try {
      const r = await fetch(
        window.API + '/instagram/test-publish-url?image_url=' + encodeURIComponent(testUrl),
        { method: 'POST', headers: window.authHeader() }
      );
      const d = await r.json();
      window.showDebug('Meta 외부 URL 테스트', {
        ...d,
        conclusion: d.ok
          ? '✅ 외부 URL 은 성공 → Supabase 호스트가 Meta 에서 차단됨 (우리 측 호스팅 문제)'
          : '❌ 외부 URL 도 실패 → 계정/토큰/Meta 측 문제 (Facebook Page 연동 필요할 수 있음)',
      });
    } catch (e) {
      window.showDebug('테스트 실패', { error: String(e) });
    }
  };

  // 인스타 업로드 실패 시 자동 팝업 띄우는 헬퍼
  window.showPublishFailure = async function (httpStatus, responseBody) {
    const info = {
      when: new Date().toISOString(),
      http_status: httpStatus,
      response: responseBody,
      api_base: window.API,
      recent_logs: LOG_BUF.slice(-10).map(l => `[${l.t}] ${l.lvl} ${l.msg}`),
    };
    try {
      const r = await fetch(window.API + '/instagram/diagnose', { headers: window.authHeader() });
      info.diagnose = await r.json().catch(() => ({ error: 'JSON 실패' }));
    } catch (e) {
      info.diagnose_error = String(e);
    }
    window.showDebug('📤 인스타 업로드 실패 진단', info);
  };
})();
