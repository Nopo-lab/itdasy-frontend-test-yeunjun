/* ─────────────────────────────────────────────────────────────
   Google Play Integrity 연결

   Android 네이티브 앱에서 Play Integrity 토큰을 받아 서버가 확인한다.
   첫 배포는 report-only: 보안 신호를 수집하되 로그인/결제를 즉시 끊지 않는다.
   window.ITDASY_INTEGRITY_ENFORCE = true 로 켜면 실패 시 중요한 작업을 막을 수 있다.
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const state = {
    preparedProject: 0,
    warmupPromise: null,
    lastVerdict: null,
    lastError: '',
  };

  function _isAndroidNative() {
    try {
      return !!(window.Capacitor
        && window.Capacitor.isNativePlatform
        && window.Capacitor.isNativePlatform()
        && window.Capacitor.getPlatform
        && window.Capacitor.getPlatform() === 'android');
    } catch (_e) { return false; }
  }

  function _plugin() {
    return window.Capacitor?.Plugins?.PlayIntegrity || null;
  }

  function isAvailable() {
    return _isAndroidNative() && !!_plugin();
  }

  function _headers() {
    return { 'Content-Type': 'application/json', ...((window.authHeader && window.authHeader()) || {}) };
  }

  async function _fetchJson(path, options) {
    const fetcher = (typeof window.apiFetch === 'function') ? window.apiFetch : window.fetch;
    const res = await fetcher(path, options || {});
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error((data && data.detail) || ('HTTP ' + res.status));
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  async function _challenge(action) {
    const q = encodeURIComponent(action || 'app_start');
    return _fetchJson('/integrity/challenge?action=' + q, { headers: (window.authHeader && window.authHeader()) || {} });
  }

  async function _prepare(cloudProjectNumber) {
    const p = _plugin();
    if (!p || !cloudProjectNumber) return false;
    if (state.preparedProject === cloudProjectNumber) return true;
    if (state.warmupPromise) return state.warmupPromise;
    state.warmupPromise = p.prepare({ cloudProjectNumber }).then(() => {
      state.preparedProject = cloudProjectNumber;
      return true;
    }).catch((err) => {
      state.lastError = (err && err.message) || 'prepare failed';
      return false;
    }).finally(() => { state.warmupPromise = null; });
    return state.warmupPromise;
  }

  async function verify(action) {
    if (!isAvailable()) return { ok: false, skipped: true, reason: 'unavailable' };
    if (!window.getToken || !window.getToken()) return { ok: false, skipped: true, reason: 'no-login' };
    try {
      const ch = await _challenge(action || 'app_start');
      const prepared = await _prepare(Number(ch.cloud_project_number || 0));
      if (!prepared) return { ok: false, reason: 'prepare_failed' };
      const p = _plugin();
      const tokenRes = await p.requestToken({ requestHash: ch.request_hash });
      const verified = await _fetchJson('/integrity/verify', {
        method: 'POST',
        headers: _headers(),
        body: JSON.stringify({
          action: ch.action,
          challenge: ch.challenge,
          integrity_token: tokenRes && tokenRes.token,
        }),
      });
      state.lastVerdict = verified;
      window.dispatchEvent(new CustomEvent('itdasy:play-integrity', { detail: verified }));
      return verified;
    } catch (err) {
      state.lastError = (err && err.message) || 'verify failed';
      console.warn('[play-integrity] verify failed:', err);
      return { ok: false, reason: 'verify_failed', message: state.lastError };
    }
  }

  async function warmup() {
    if (!isAvailable()) return false;
    if (!window.getToken || !window.getToken()) return false;
    try {
      const ch = await _challenge('warmup');
      return _prepare(Number(ch.cloud_project_number || 0));
    } catch (err) {
      state.lastError = (err && err.message) || 'warmup failed';
      console.warn('[play-integrity] warmup failed:', err);
      return false;
    }
  }

  async function guard(action) {
    const result = await verify(action || 'protected_action');
    if (result.ok || window.ITDASY_INTEGRITY_ENFORCE !== true) return result;
    if (typeof window.showToast === 'function') {
      window.showToast('앱 보안 확인이 필요해요. Play 스토어에서 설치한 최신 앱인지 확인해 주세요.');
    }
    const err = new Error('Play Integrity check failed');
    err.integrity = result;
    throw err;
  }

  window.ItdasyPlayIntegrity = {
    isAvailable,
    warmup,
    verify,
    guard,
    getLastVerdict: () => state.lastVerdict,
    getLastError: () => state.lastError,
  };

  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      warmup().then((ok) => {
        if (ok) verify('app_start');
      });
    }, 2500);
  });
})();
