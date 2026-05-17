/* 고객별 추천 chip — 1차 (클라이언트 컴퓨트)
   2026-05-17 v166 · 뷰티업GPT 초고도화 P0 티켓 0-3
   설계 문서: ~/.claude/plans/zesty-snacking-clarke.md §5

   하나의 고객 객체를 받아 가장 시급한 chip 1개를 계산해 row에 노출.
   향후 백엔드 /recommendations/customer-chips 가 준비되면 그 응답을 우선 채택하도록 확장.

   chip 종류 (P0, 클라이언트만으로 계산 가능한 5종):
     chip_birthday_today        — 오늘 생일
     chip_at_risk_churn         — 평균주기 ×2 초과 + 누적 매출 상위
     chip_revisit_overdue       — 평균주기 ×1.2 초과 (or 35일+ 폴백)
     chip_first_visit_welcome   — 첫 방문 후 48h+ (감사 인사 타이밍)
     chip_membership_low        — 회원권 잔액 5만원 미만

   탭 동작: 챗봇을 열고 입력창에 고객명·의도를 미리 채워줌.
   P1에서는 draft_message 액션 카드를 직접 노출하도록 전환. */
(function () {
  'use strict';

  const SUPPRESS_DAYS = 7;
  const DISMISS_DAYS  = 30;
  const SUPPRESS_KEY  = (kind, cid) => 'chip_shown::' + kind + '::' + cid;
  const DISMISS_KEY   = (kind, cid) => 'chip_dismissed::' + kind + '::' + cid;

  function _daysBetween(iso, ref) {
    if (!iso) return null;
    const a = new Date(iso).getTime();
    if (isNaN(a)) return null;
    return Math.floor(((ref || new Date()).getTime() - a) / 86400000);
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
  }

  function _isBirthdayToday(birthday) {
    if (!birthday) return false;
    const raw = String(birthday).trim();
    const m = raw.match(/^(\d{1,2})[-/](\d{1,2})$/) || raw.match(/^\d{4}-(\d{1,2})-(\d{1,2})/);
    if (!m) return false;
    const today = new Date();
    return +m[1] === today.getMonth() + 1 && +m[2] === today.getDate();
  }

  function _avgCycleDays(c) {
    const w = +c.avg_cycle_weeks || 0;
    return w > 0 ? w * 7 : null;
  }

  // 후보 chip 전체를 만들고 urgency 내림차순으로 정렬. (P1에서는 백엔드 응답을 그대로 채택.)
  // suppress/dismiss 체크는 별도로 처리해서 다음 후보로 자연스럽게 떨어지게 함.
  function _candidates(c) {
    const out = [];
    const lastDays = _daysBetween(c.last_visit_at);
    const firstDays = _daysBetween(c.first_visit_at || c.created_at);
    const visits = +c.visit_count || 0;
    const spent  = +c.total_spent || 0;
    const avgD   = _avgCycleDays(c);

    if (_isBirthdayToday(c.birthday)) {
      out.push({ kind: 'chip_birthday_today', label: '오늘 생일! 축하 메시지', urgency: 0.95 });
    }
    if (visits === 1 && firstDays !== null && firstDays >= 2 && firstDays <= 14) {
      out.push({ kind: 'chip_first_visit_welcome', label: '첫 방문 감사 인사', urgency: 0.85 });
    }
    if (avgD && lastDays !== null && lastDays > avgD * 2 && spent >= 200000) {
      out.push({ kind: 'chip_at_risk_churn', label: lastDays + '일째 미방문 · VIP 케어', urgency: 0.9 });
    } else if (avgD ? (lastDays !== null && lastDays > avgD * 1.2) : (lastDays !== null && lastDays >= 35)) {
      out.push({ kind: 'chip_revisit_overdue', label: lastDays + '일째 미방문 · 안부 메시지', urgency: 0.75 });
    }
    const mem = +c.membership_balance || 0;
    if (mem > 0 && mem < 50000) {
      out.push({ kind: 'chip_membership_low', label: '회원권 잔액 부족 · 충전 제안', urgency: 0.6 });
    }

    out.sort((a, b) => b.urgency - a.urgency);
    return out;
  }

  function _now() { return Date.now(); }

  function _readTs(key) {
    try { return parseInt(localStorage.getItem(key), 10) || 0; } catch (_e) { return 0; }
  }

  function _isSuppressed(kind, cid) {
    const dismissAt = _readTs(DISMISS_KEY(kind, cid));
    if (dismissAt && _now() - dismissAt < DISMISS_DAYS * 86400000) return true;
    const shownAt = _readTs(SUPPRESS_KEY(kind, cid));
    if (shownAt && _now() - shownAt < SUPPRESS_DAYS * 86400000) return true;
    return false;
  }

  function _markShown(kind, cid) {
    try { localStorage.setItem(SUPPRESS_KEY(kind, cid), String(_now())); } catch (_e) { void _e; }
  }

  function _dismiss(kind, cid) {
    try { localStorage.setItem(DISMISS_KEY(kind, cid), String(_now())); } catch (_e) { void _e; }
  }

  function _pick(c) {
    const cid = c && c.id;
    if (!cid) return null;
    const list = _candidates(c);
    for (const chip of list) {
      if (!_isSuppressed(chip.kind, cid)) return chip;
    }
    return null;
  }

  // 추천 chip 전부 (suppress 통과한 것만, urgency 내림차순). AI 브리핑 같은 곳에서 N개 표시용.
  function _pickAll(c) {
    const cid = c && c.id;
    if (!cid) return [];
    return _candidates(c).filter(ch => !_isSuppressed(ch.kind, cid));
  }

  function _renderHTML(chip, cid) {
    if (!chip) return '';
    const k = _esc(chip.kind);
    const l = _esc(chip.label);
    const cidEsc = _esc(cid);
    // 둘 다 type=button — submit 폼 안에 있을 때 사고 방지.
    return ''
      + '<button type="button" class="cust-chip" data-cust-chip="' + k + '" data-cust-id="' + cidEsc + '"'
      + ' style="display:inline-flex;align-items:center;gap:4px;margin-left:6px;padding:4px 8px;'
      + 'background:rgba(241,128,145,.10);color:#a04050;border:1px solid rgba(241,128,145,.28);'
      + 'border-radius:999px;font-size:11px;font-weight:600;line-height:1;cursor:pointer;">'
      + '<span>' + l + '</span>'
      + '<span data-cust-chip-x="' + k + '" data-cust-id="' + cidEsc + '"'
      + ' style="margin-left:2px;opacity:.55;font-weight:400;font-size:13px;line-height:1;">×</span>'
      + '</button>';
  }

  // 캡처 단계 — 부모 row의 click 핸들러보다 먼저 가로채야 함.
  document.addEventListener('click', (e) => {
    const x = e.target.closest('[data-cust-chip-x]');
    if (x) {
      e.stopPropagation();
      e.preventDefault();
      _dismiss(x.getAttribute('data-cust-chip-x'), x.getAttribute('data-cust-id'));
      const host = x.closest('.cust-chip');
      if (host && host.parentNode) host.parentNode.removeChild(host);
      return;
    }
    const chip = e.target.closest('[data-cust-chip]');
    if (!chip) return;
    e.stopPropagation();
    e.preventDefault();
    const kind = chip.getAttribute('data-cust-chip');
    const cid  = chip.getAttribute('data-cust-id');
    _markShown(kind, cid);
    if (window.hapticLight) window.hapticLight();
    _openAssistantWithPrefill(kind, cid);
  }, true);

  // P0: 챗봇 열고 입력창에 의도 prefill — 실제 draft_message 액션 자동 발사는 P1.
  function _openAssistantWithPrefill(kind, cid) {
    const name = _lookupCustomerName(cid) || '고객';
    const ask = ({
      chip_birthday_today:      '오늘 생일인 ' + name + '님에게 축하 메시지 만들어줘',
      chip_first_visit_welcome: '첫 방문해주신 ' + name + '님에게 감사 메시지 만들어줘',
      chip_at_risk_churn:       name + '님 오래 안 오셨는데 자연스럽게 안부 메시지 만들어줘',
      chip_revisit_overdue:     name + '님에게 안부 메시지 만들어줘',
      chip_membership_low:      name + '님 회원권 잔액 부족한데 충전 안내 메시지 만들어줘',
    })[kind] || (name + '님 관련해서 추천 액션 알려줘');

    if (typeof window.openAssistant === 'function') window.openAssistant();
    // sheet 열리는 RAF 한 사이클 기다린 뒤 input 채우기.
    setTimeout(() => {
      const inp = document.getElementById('asstInput');
      if (inp) {
        inp.value = ask;
        inp.focus();
        try { inp.dispatchEvent(new Event('input', { bubbles: true })); } catch (_e) { void _e; }
      }
    }, 60);
  }

  function _lookupCustomerName(cid) {
    try {
      // app-customer-cache.js가 노출하는 캐시 우선.
      if (window.CustomerCache && typeof window.CustomerCache.get === 'function') {
        const list = window.CustomerCache.get() || [];
        const hit = list.find(c => String(c.id) === String(cid));
        if (hit && hit.name) return hit.name;
      }
    } catch (_e) { void _e; }
    return '';
  }

  window.CustomerChips = {
    pick: _pick,
    pickAll: _pickAll,
    renderHTML: function (c) {
      const chip = _pick(c);
      if (!chip) return '';
      return _renderHTML(chip, c.id);
    },
    renderTopN: function (c, n) {
      const list = _pickAll(c).slice(0, Math.max(1, +n || 3));
      return list.map(ch => _renderHTML(ch, c.id)).join('');
    },
    dismiss: _dismiss,
    markShown: _markShown,
  };
})();
