/* ─────────────────────────────────────────────────────────────
   E4 — 노쇼 자동 감지 + 예약 확인 (2026-04-26)

   기능:
   1) 24시간 안 예약 페이지 진입 시 auto-send-confirmations 호출
      → 발송 대상 카톡 메시지 클립보드 복붙 시트 자동 노출
   2) 새 예약 시 customer_id 선택 후 noShowWarning(id) 로 빨간 경고 카드
   3) 예약 카드에서 단일 '확인 메시지 보내기' 버튼 (sendConfirmation)
   4) '노쇼 표시' / '정상 방문' 버튼 (markNoShow / markAttended)

   전역 노출:
     window.NoShow = {
       warning(customerId)       — Promise<{level, message, score, count}>
       sendConfirmation(bookingId)  — 카톡 복붙 시트 오픈
       autoSend(hoursAhead=24)      — 일괄 발송 시트
       markNoShow(bookingId)
       markAttended(bookingId)
       openManagerCopySheet(items)  — 카톡 복붙 시트
     }
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[ch];
    });
  }

  function _toast(msg) {
    if (window.showToast) window.showToast(msg);
    else console.log('[no-show]', msg);
  }

  async function _api(method, path, body) {
    if (!window.API || !window.authHeader) throw new Error('no-auth');
    var auth = window.authHeader();
    if (!auth || !auth.Authorization) throw new Error('no-token');
    var opts = { method: method, headers: Object.assign({}, auth, { 'Content-Type': 'application/json' }) };
    if (body) opts.body = JSON.stringify(body);
    var res = await fetch(window.API + path, opts);
    if (!res.ok) {
      var detail = '';
      try { var j = await res.json(); detail = (j && j.detail) || ''; } catch (_) { /* ignore */ }
      throw new Error('HTTP ' + res.status + (detail ? ' · ' + detail : ''));
    }
    if (res.status === 204) return null;
    return await res.json();
  }

  // ── 1) 노쇼 이력 경고 ─────────────────────────────────────
  async function warning(customerId) {
    if (!customerId) return null;
    try {
      var d = await _api('GET', '/customers/' + customerId + '/no-show-warning');
      return d;
    } catch (e) {
      console.warn('[no-show] warning 조회 실패:', e.message);
      return null;
    }
  }

  function renderWarningCard(d) {
    if (!d || d.warning_level === 'none') return '';
    var bg = d.warning_level === 'danger'
      ? 'background:rgba(217,95,95,0.10);border:1px solid #f3c1c1;color:#7a2c2c;'
      : 'background:rgba(255,193,7,0.10);border:1px solid #f3dba0;color:#7a5a10;';
    return ''
      + '<div class="ns-warning" data-no-show-warning style="' + bg
      + 'border-radius:12px;padding:10px 12px;margin:8px 0;font-size:13px;line-height:1.5;">'
      + '  <strong>' + (d.warning_level === 'danger' ? '노쇼 위험 고객' : '주의 — 노쇼 이력') + '</strong><br>'
      + _esc(d.message || ('노쇼 ' + (d.no_show_count || 0) + '회 · 매너 ' + (d.manner_score || 0) + '점'))
      + '</div>';
  }

  // ── 2) 카톡 복붙 시트 ─────────────────────────────────────
  function openManagerCopySheet(items) {
    if (!Array.isArray(items) || !items.length) {
      _toast('보낼 메시지가 없어요');
      return;
    }
    var sheet = document.getElementById('nsCopySheet');
    if (sheet) sheet.remove();
    sheet = document.createElement('div');
    sheet.id = 'nsCopySheet';
    sheet.style.cssText = 'position:fixed;inset:0;z-index:10001;background:rgba(0,0,0,0.5);display:flex;align-items:flex-end;justify-content:center;';
    var rows = items.map(function (it, i) {
      var when = it.starts_at ? new Date(it.starts_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
      return ''
        + '<div style="border:1px solid #eee;border-radius:12px;padding:12px;margin-bottom:10px;">'
        + '  <div style="font-size:12px;color:#888;margin-bottom:4px;">' + _esc(when) + ' · ' + _esc(it.customer_name || '이름 없음') + '</div>'
        + '  <textarea readonly style="width:100%;min-height:90px;font-size:12px;padding:8px;border:1px solid #eee;border-radius:8px;background:#fafafa;resize:none;" data-ns-msg="' + i + '">' + _esc(it.message_template || '') + '</textarea>'
        + '  <div style="display:flex;gap:6px;margin-top:6px;">'
        + '    <button type="button" data-ns-copy="' + i + '" style="flex:1;padding:8px;border:none;border-radius:8px;background:var(--brand);color:#fff;font-weight:700;cursor:pointer;">메시지 복사</button>'
        + '    <a href="kakaotalk://" style="padding:8px 12px;border:1px solid #FEE500;border-radius:8px;background:#FEE500;color:#3C1E1E;font-weight:700;font-size:13px;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;">카카오톡 열기</a>'
        + '  </div>'
        + '</div>';
    }).join('');
    sheet.innerHTML = ''
      + '<div style="background:#fff;width:100%;max-width:500px;border-radius:20px 20px 0 0;padding:18px;max-height:85vh;display:flex;flex-direction:column;">'
      + '  <div style="display:flex;align-items:center;margin-bottom:12px;">'
      + '    <strong style="flex:1;font-size:16px;">예약 확인 메시지 (' + items.length + '건)</strong>'
      + '    <button type="button" id="nsCopyClose" style="background:#eee;border:none;border-radius:50%;width:30px;height:30px;cursor:pointer;">✕</button>'
      + '  </div>'
      + '  <div style="font-size:12px;color:var(--text-muted);margin-bottom:10px;">메시지를 복사해서 카톡으로 붙여넣어 주세요.</div>'
      + '  <div style="overflow-y:auto;flex:1;">' + rows + '</div>'
      + '</div>';
    document.body.appendChild(sheet);
    document.getElementById('nsCopyClose').addEventListener('click', function () { sheet.remove(); });
    sheet.addEventListener('click', function (e) { if (e.target === sheet) sheet.remove(); });
    sheet.querySelectorAll('[data-ns-copy]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = +btn.getAttribute('data-ns-copy');
        var ta = sheet.querySelector('[data-ns-msg="' + idx + '"]');
        if (!ta) return;
        ta.select();
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(ta.value);
          } else {
            document.execCommand('copy');
          }
          _toast('복사됐어요. 카톡에 붙여넣어 주세요.');
          if (window.hapticLight) window.hapticLight();
        } catch (_) {
          _toast('복사 실패 — 직접 길게 눌러 복사해주세요');
        }
      });
    });
  }

  // ── 3) 단일 발송 ──────────────────────────────────────────
  async function sendConfirmation(bookingId) {
    if (!bookingId) return;
    try {
      var d = await _api('POST', '/bookings/' + bookingId + '/send-confirmation');
      openManagerCopySheet([{
        booking_id: d.booking_id,
        customer_name: '',
        starts_at: null,
        message_template: d.message_template,
        confirmation_link: d.confirmation_link,
      }]);
      _toast('확인 링크가 준비됐어요');
      try { window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'update_booking' } })); } catch (_) { void 0; }
    } catch (e) {
      _toast('발송 실패: ' + e.message);
    }
  }

  // ── 4) 일괄 발송 (24시간) ─────────────────────────────────
  async function autoSend(hoursAhead) {
    var h = hoursAhead || 24;
    try {
      var d = await _api('POST', '/bookings/auto-send-confirmations?hours_ahead=' + h);
      if (!d.count) {
        _toast('발송 대상 예약이 없어요');
        return d;
      }
      openManagerCopySheet(d.items || []);
      try { window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'update_booking' } })); } catch (_) { void 0; }
      return d;
    } catch (e) {
      _toast('일괄 발송 실패: ' + e.message);
      return null;
    }
  }

  // ── 5) 노쇼/정상 표시 ────────────────────────────────────
  async function markNoShow(bookingId) {
    if (!bookingId) return;
    try {
      var d = await _api('POST', '/bookings/' + bookingId + '/mark-no-show');
      _toast('노쇼로 표시했어요 (매너 점수 -10)');
      if (window.hapticMedium) window.hapticMedium();
      try { window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'update_booking' } })); } catch (_) { void 0; }
      return d;
    } catch (e) {
      _toast('처리 실패: ' + e.message);
      return null;
    }
  }

  async function markAttended(bookingId) {
    if (!bookingId) return;
    try {
      var d = await _api('POST', '/bookings/' + bookingId + '/mark-attended');
      _toast('정상 방문으로 표시했어요 (매너 점수 +5)');
      if (window.hapticLight) window.hapticLight();
      try { window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'update_booking' } })); } catch (_) { void 0; }
      return d;
    } catch (e) {
      _toast('처리 실패: ' + e.message);
      return null;
    }
  }

  // ── 매너 점수 라벨 ───────────────────────────────────────
  function mannerLabel(score, count) {
    var s = (score == null) ? 100 : +score;
    var c = +count || 0;
    if (c >= 3 || s < 60) return { tone: 'danger', text: '매너 ' + s + '점 · 노쇼 ' + c + '회', color: '#d95f5f' };
    if (c >= 1 || s < 80) return { tone: 'caution', text: '매너 ' + s + '점 · 노쇼 ' + c + '회', color: '#e89000' };
    return { tone: 'ok', text: '매너 ' + s + '점', color: '#2faa6f' };
  }

  // 예약 행 노쇼 위험 배지 렌더 (booking 객체 기반)
  function bookingBadge(b) {
    if (!b) return '';
    if (b.no_show_flagged) {
      return '<span style="display:inline-block;padding:2px 6px;background:rgba(217,95,95,0.15);color:#d95f5f;border-radius:6px;font-size:10px;font-weight:700;margin-left:6px;">응답 없음</span>';
    }
    if (b.confirmation_response === 'yes') {
      return '<span style="display:inline-block;padding:2px 6px;background:rgba(47,170,111,0.12);color:#2faa6f;border-radius:6px;font-size:10px;font-weight:700;margin-left:6px;">확인됨</span>';
    }
    if (b.confirmation_response === 'no') {
      return '<span style="display:inline-block;padding:2px 6px;background:rgba(217,95,95,0.12);color:#d95f5f;border-radius:6px;font-size:10px;font-weight:700;margin-left:6px;">취소 요청</span>';
    }
    if (b.confirmation_sent_at) {
      return '<span style="display:inline-block;padding:2px 6px;background:rgba(241,128,145,0.12);color:var(--brand-strong);border-radius:6px;font-size:10px;font-weight:700;margin-left:6px;">대기중</span>';
    }
    return '';
  }

  window.NoShow = {
    warning: warning,
    renderWarningCard: renderWarningCard,
    sendConfirmation: sendConfirmation,
    autoSend: autoSend,
    markNoShow: markNoShow,
    markAttended: markAttended,
    openManagerCopySheet: openManagerCopySheet,
    mannerLabel: mannerLabel,
    bookingBadge: bookingBadge,
  };
})();
