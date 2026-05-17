/*
 * app-brand-kit.js
 * Brand Kit 저장/모달 모듈 (샵명·인스타·전화·워터마크·브랜드컬러)
 * 의존성: 없음 (window.showToast 있으면 사용)
 * 저장소: localStorage 키 `itdasy_brand_kit` (JSON)
 * 이벤트: `itdasy:brand-kit:updated` (detail = 저장된 객체)
 * 스타일: css/screens/brand-kit.css (첫 open() 시 자동 주입)
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'itdasy_brand_kit';
  var CSS_HREF = 'css/screens/brand-kit.css';
  var CSS_FLAG = 'brand-kit-css-loaded';
  var MODAL_ID = 'brand-kit-modal';

  var DEFAULTS = {
    shop_name: '',
    instagram_handle: '',
    phone: '',
    watermark_text: '',
    watermark_position: 'br',
    watermark_opacity: 0.85,
    brand_color: '#F18091',
  };

  var POS_KEYS = ['tl', 'tr', 'bl', 'br'];
  var POS_LABELS = { tl: '왼쪽 위', tr: '오른쪽 위', bl: '왼쪽 아래', br: '오른쪽 아래' };

  function _cleanHandle(h) { return h ? String(h).trim().replace(/^@+/, '') : ''; }
  function _clampOp(v) { var n = parseFloat(v); if (isNaN(n)) return DEFAULTS.watermark_opacity; return Math.max(0, Math.min(1, n)); }
  function _hex(c) { return typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c.trim()); }

  function _normalize(o) {
    var out = {};
    Object.keys(DEFAULTS).forEach(function (k) {
      out[k] = (o && o[k] !== undefined && o[k] !== null) ? o[k] : DEFAULTS[k];
    });
    out.instagram_handle = _cleanHandle(out.instagram_handle);
    out.watermark_opacity = _clampOp(out.watermark_opacity);
    if (!_hex(out.brand_color)) out.brand_color = DEFAULTS.brand_color;
    if (POS_KEYS.indexOf(out.watermark_position) === -1) out.watermark_position = DEFAULTS.watermark_position;
    return out;
  }

  function _read() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return _normalize(raw ? JSON.parse(raw) : {});
    } catch (_e) { return _normalize({}); }
  }

  function _autoWm(s) {
    if (s.watermark_text && s.watermark_text.trim()) return s.watermark_text.trim();
    var name = (s.shop_name || '').trim();
    var ig = _cleanHandle(s.instagram_handle);
    if (name && ig) return name + ' · @' + ig;
    if (name) return name;
    return ig ? '@' + ig : '';
  }

  function get() { return _read(); }

  function save(partial) {
    var next = _normalize(Object.assign({}, _read(), partial || {}));
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (_e) {
      if (typeof window.showToast === 'function') window.showToast('⚠️ 저장에 실패했어요');
      return null;
    }
    try { window.dispatchEvent(new CustomEvent('itdasy:brand-kit:updated', { detail: next })); } catch (_e2) { void _e2; }
    return next;
  }

  function _injectCss() {
    if (document.documentElement.dataset[CSS_FLAG.replace(/-/g, '')]) return;
    var existing = document.querySelector('link[data-brand-kit-css]');
    if (!existing) {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = CSS_HREF;
      link.setAttribute('data-brand-kit-css', '1');
      document.head.appendChild(link);
    }
    document.documentElement.dataset[CSS_FLAG.replace(/-/g, '')] = '1';
  }

  function _chips(active) {
    return POS_KEYS.map(function (k) {
      return '<button type="button" class="bk-chip' + (k === active ? ' is-active' : '')
        + '" data-pos="' + k + '">' + POS_LABELS[k] + '</button>';
    }).join('');
  }

  function _escAttr(s) { return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

  function _build(state) {
    var auto = _autoWm(state);
    var wrap = document.createElement('div');
    wrap.className = 'bk-backdrop';
    wrap.id = MODAL_ID;
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-label', '브랜드 키트 설정');
    wrap.innerHTML = [
      '<div class="bk-card" role="document">',
      '  <div class="bk-header">',
      '    <div>',
      '      <h2 class="bk-title">브랜드 키트</h2>',
      '      <p class="bk-sub">샵 정보를 한 번에 설정해 주세요.</p>',
      '    </div>',
      '    <button type="button" class="bk-close" data-action="close" aria-label="닫기">',
      '      <svg width="18" height="18" aria-hidden="true"><use href="#ic-x"/></svg>',
      '    </button>',
      '  </div>',
      '  <div class="bk-field">',
      '    <label class="bk-label" for="bk-shop-name">샵 이름</label>',
      '    <input class="bk-input" id="bk-shop-name" type="text" maxlength="40" placeholder="예) 잇데이 뷰티" />',
      '  </div>',
      '  <div class="bk-field">',
      '    <label class="bk-label" for="bk-instagram">인스타그램 아이디</label>',
      '    <div class="bk-row">',
      '      <span class="bk-prefix">@</span>',
      '      <input class="bk-input" id="bk-instagram" type="text" maxlength="40" placeholder="itdasy_beauty" autocapitalize="off" autocorrect="off" />',
      '    </div>',
      '  </div>',
      '  <div class="bk-field">',
      '    <label class="bk-label" for="bk-phone">전화번호</label>',
      '    <input class="bk-input" id="bk-phone" type="tel" maxlength="20" placeholder="010-0000-0000" />',
      '  </div>',
      '  <div class="bk-field">',
      '    <label class="bk-label" for="bk-watermark">워터마크 문구</label>',
      '    <input class="bk-input" id="bk-watermark" type="text" maxlength="60" placeholder="' + _escAttr(auto) + '" />',
      '    <p class="bk-hint">비워 두시면 샵 이름과 인스타 아이디로 자동 생성됩니다.</p>',
      '  </div>',
      '  <div class="bk-field">',
      '    <label class="bk-label">워터마크 위치</label>',
      '    <div class="bk-chips" data-role="position">' + _chips(state.watermark_position) + '</div>',
      '  </div>',
      '  <div class="bk-field">',
      '    <label class="bk-label" for="bk-opacity">워터마크 투명도</label>',
      '    <div class="bk-slider-row">',
      '      <input class="bk-slider" id="bk-opacity" type="range" min="0" max="1" step="0.05" />',
      '      <span class="bk-slider-val" data-role="opacity-val"></span>',
      '    </div>',
      '  </div>',
      '  <div class="bk-field">',
      '    <label class="bk-label" for="bk-color">브랜드 컬러</label>',
      '    <div class="bk-color-row">',
      '      <input class="bk-color-input" id="bk-color" type="color" />',
      '      <input class="bk-input bk-color-hex" id="bk-color-hex" type="text" maxlength="7" placeholder="#F18091" autocapitalize="off" autocorrect="off" />',
      '    </div>',
      '  </div>',
      '  <div class="bk-field">',
      '    <label class="bk-label">브랜드 템플릿</label>',
      '    <button type="button" class="bk-btn bk-btn-secondary" data-action="open-templates" style="width:100%;">저장된 템플릿 열기 (<span data-role="templates-count">0</span>)</button>',
      '    <p class="bk-hint">사진 편집기에서 만든 텍스트·워터마크·색상 조합을 저장하고 1-탭으로 다시 적용해요.</p>',
      '  </div>',
      '  <div class="bk-footer">',
      '    <button type="button" class="bk-btn bk-btn-secondary" data-action="close">취소</button>',
      '    <button type="button" class="bk-btn bk-btn-primary" data-action="save">저장</button>',
      '  </div>',
      '</div>',
    ].join('');
    return wrap;
  }

  function _countTemplates() {
    try {
      if (window.BrandTemplates && typeof window.BrandTemplates.list === 'function') {
        return window.BrandTemplates.list().length;
      }
      var kit = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return Array.isArray(kit.templates) ? kit.templates.length : 0;
    } catch (_e) { return 0; }
  }

  function _bind(modal, state) {
    var $ = function (sel) { return modal.querySelector(sel); };
    var els = {
      name: $('#bk-shop-name'), ig: $('#bk-instagram'), phone: $('#bk-phone'),
      wm: $('#bk-watermark'), op: $('#bk-opacity'), opVal: $('[data-role="opacity-val"]'),
      color: $('#bk-color'), hex: $('#bk-color-hex'), pos: $('[data-role="position"]'),
    };
    els.name.value = state.shop_name || '';
    els.ig.value = _cleanHandle(state.instagram_handle);
    els.phone.value = state.phone || '';
    els.wm.value = state.watermark_text || '';
    els.op.value = String(state.watermark_opacity);
    els.opVal.textContent = Math.round(state.watermark_opacity * 100) + '%';
    els.color.value = state.brand_color;
    els.hex.value = state.brand_color;

    var current = { position: state.watermark_position };

    els.op.addEventListener('input', function () {
      els.opVal.textContent = Math.round(parseFloat(els.op.value) * 100) + '%';
    });
    els.pos.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-pos]');
      if (!btn) return;
      current.position = btn.getAttribute('data-pos');
      els.pos.querySelectorAll('.bk-chip').forEach(function (c) {
        c.classList.toggle('is-active', c === btn);
      });
    });
    els.color.addEventListener('input', function () { els.hex.value = els.color.value; });
    els.hex.addEventListener('change', function () {
      var v = els.hex.value.trim();
      if (_hex(v)) els.color.value = v; else els.hex.value = els.color.value;
    });

    // 템플릿 개수 채우기
    try {
      var countEl = modal.querySelector('[data-role="templates-count"]');
      if (countEl) countEl.textContent = String(_countTemplates());
    } catch (_e3) { void _e3; }

    modal.addEventListener('click', function (e) {
      if (e.target === modal) { close(); return; }
      var act = e.target.closest('[data-action]');
      if (!act) return;
      var a = act.getAttribute('data-action');
      if (a === 'close') return close();
      if (a === 'open-templates') {
        if (window.BrandTemplates && typeof window.BrandTemplates.openPicker === 'function') {
          window.BrandTemplates.openPicker();
        } else if (typeof window.showToast === 'function') {
          window.showToast('브랜드 템플릿 모듈을 불러오는 중이에요');
        }
        return;
      }
      if (a === 'save') {
        var hex = els.hex.value.trim();
        if (!_hex(hex)) hex = els.color.value;
        var saved = save({
          shop_name: els.name.value.trim(),
          instagram_handle: els.ig.value,
          phone: els.phone.value.trim(),
          watermark_text: els.wm.value.trim(),
          watermark_position: current.position,
          watermark_opacity: parseFloat(els.op.value),
          brand_color: hex,
        });
        if (saved && typeof window.showToast === 'function') {
          window.showToast('✅ 브랜드 키트를 저장했어요', 'success');
        }
        close();
      }
    });
    document.addEventListener('keydown', _onEsc);
  }

  function _onEsc(e) { if (e.key === 'Escape') close(); }

  function open() {
    close();
    _injectCss();
    var state = _read();
    var modal = _build(state);
    document.body.appendChild(modal);
    _bind(modal, state);
    setTimeout(function () {
      var first = modal.querySelector('#bk-shop-name');
      if (first) first.focus();
    }, 80);
  }

  function close() {
    var ex = document.getElementById(MODAL_ID);
    if (ex && ex.parentNode) ex.parentNode.removeChild(ex);
    document.removeEventListener('keydown', _onEsc);
  }

  window.BrandKit = { get: get, save: save, open: open, close: close };
})();
