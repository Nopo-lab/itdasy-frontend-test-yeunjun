/* T-602 — Customer care: server records, dates and safe display helpers. */
(function () {
  'use strict';
  const C = window.CustomerCare = window.CustomerCare || {};
  const id = value => encodeURIComponent(String(value));
  C.paths = {
    care: value => '/customers/' + id(value) + '/care',
    plan: value => '/customers/' + id(value) + '/care-plan',
    referrer: value => '/customers/' + id(value) + '/referrer',
    records: (value, offset = 0) => '/customers/' + id(value) + '/treatments?limit=10&offset=' + offset,
    record: value => value ? '/treatments/' + id(value) : '/treatments',
    search: value => '/customers?limit=20&q=' + encodeURIComponent(value),
    due: '/customer-care/due?days=30'
  };
  C.escape = value => String(value == null ? '' : value).replace(/[&<>"']/g,
    ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  C.date = value => {
    if (!value) return '';
    const d = new Date(value);
    if (!Number.isFinite(d.getTime())) return '';
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(d);
  };
  C.today = () => C.date(new Date());
  C.dateLabel = value => {
    const date = C.date(value);
    if (!date) return '날짜 미정';
    const [y, m, d] = date.split('-');
    return y + '.' + m + '.' + d;
  };
  C.dateHint = value => {
    const date = C.date(value);
    if (!date) return '';
    const days = Math.round((Date.parse(date) - Date.parse(C.today())) / 86400000);
    return days === 0 ? '오늘' : days > 0 ? days + '일 후' : Math.abs(days) + '일 지남';
  };
  C.photoUrl = value => {
    try {
      const u = new URL(String(value));
      return u.protocol === 'https:' ? u.href : '';
    } catch (_error) { return ''; }
  };
  C.errorText = error => {
    if (error?.name === 'AbortError') return '응답이 늦어지고 있어요. 잠시 후 다시 시도해 주세요.';
    if (error?.status === 401) return '다시 로그인한 뒤 이용해 주세요.';
    if (error?.status === 404) return '기록을 찾을 수 없어요. 다시 불러와 주세요.';
    return error?.userMessage || '연결하지 못했어요. 잠시 후 다시 시도해 주세요.';
  };
  C.request = async (path, method = 'GET', body) => {
    if (!window.apiFetch || !window.getToken?.()) throw Object.assign(new Error('auth'), { status: 401 });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 22000);
    try {
      const response = await window.apiFetch(path, {
        method, signal: controller.signal,
        headers: { ...window.authHeader(), ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
      const data = response.status === 204 ? null : await response.json();
      if (!response.ok) {
        const detail = data?.detail;
        const message = typeof detail === 'string' && /[가-힣]/.test(detail) ? detail : '';
        throw Object.assign(new Error('request failed'), { status: response.status, userMessage: message });
      }
      return data;
    } finally { clearTimeout(timeout); }
  };
  C.newKey = () => {
    if (crypto.randomUUID) return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('');
    return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
  };
})();
