/* Phase 9 P4 — small encrypted local storage helper */
(function () {
  'use strict';

  const PREFIX = 'sec:v1:';
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  function _uid() {
    try {
      const saved = localStorage.getItem('last_user_id');
      if (saved) return saved;
      const token = window.getToken && window.getToken();
      if (!token) return '';
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload && payload.sub ? String(payload.sub) : '';
    } catch (_) {
      return '';
    }
  }

  function _canEncrypt() {
    return !!(window.crypto && crypto.subtle && _uid());
  }

  function _b64(buf) {
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
  }

  function _fromB64(str) {
    return Uint8Array.from(atob(str), c => c.charCodeAt(0));
  }

  async function _key(storageKey) {
    const material = await crypto.subtle.importKey(
      'raw', enc.encode('itdasy:' + _uid()), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: enc.encode(location.host + '|' + storageKey), iterations: 120000, hash: 'SHA-256' },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function get(storageKey) {
    const raw = localStorage.getItem(storageKey) || '';
    if (!raw || !raw.startsWith(PREFIX)) return raw;
    if (!_canEncrypt()) return '';
    try {
      const [, , iv64, data64] = raw.split(':');
      const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: _fromB64(iv64) },
        await _key(storageKey),
        _fromB64(data64)
      );
      return dec.decode(plain);
    } catch (e) {
      console.warn('[secure-storage] decrypt failed:', e);
      return '';
    }
  }

  async function set(storageKey, value) {
    const next = value == null ? '' : String(value);
    if (!next || !_canEncrypt()) {
      localStorage.setItem(storageKey, next);
      return;
    }
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      await _key(storageKey),
      enc.encode(next)
    );
    localStorage.setItem(storageKey, PREFIX + _b64(iv) + ':' + _b64(data));
  }

  function remove(storageKey) {
    localStorage.removeItem(storageKey);
  }

  function isEncrypted(storageKey) {
    return (localStorage.getItem(storageKey) || '').startsWith(PREFIX);
  }

  window.SecureStorage = { get, set, remove, isEncrypted };
})();
