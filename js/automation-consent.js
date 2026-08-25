/* 자동화 켜기 전 안내 + 명시적 승인 — 4개 토글 공용.
 *
 * [2026-08-26] 왜 만들었나
 *   자동응답 토글이 4개인데 승인 시트는 2개뿐이었고(빠른안내·자동발송), 그나마도
 *   "확인" 한 번이면 켜졌다. 그리고 **가장 중요한 것**이 빠져 있었다 — 서버가 승인을
 *   확인하지 않아서, 안내를 보지 않고도 `{"enabled": true}` 를 보내면 그냥 켜졌다.
 *
 *   이제 순서가 이렇다:
 *     토글 ON 클릭 → 안내 시트 → 체크박스 → [사용 시작]
 *       → POST /persona/consent  (서버에 승인 기록)
 *       → POST 설정 저장         (서버가 승인을 확인하고서야 켠다)
 *
 *   ⚠️ 이 파일은 **화면**이다. 여기서 무슨 짓을 해도 서버가 승인을 확인한다
 *      (services/automation_gate.assert_consent_for_enable). 화면은 원장이 무엇에
 *      동의하는지 알게 하는 게 일이고, 방어는 서버가 한다.
 *
 * 🔴 문구는 **실제 동작만** 적는다. 화면이 코드보다 세게 약속하면 그게 사고다.
 *    각 항목에 근거 파일을 달아 뒀다. 고칠 땐 그 코드를 먼저 확인할 것.
 */
(function () {
  'use strict';

  var CONSENT_VERSION = 'v1';   // services/automation_gate.CONSENT_VERSION 와 같아야 한다

  /* feature → 안내 문구.
     what  : 이 기능이 무엇을 하나
     uses  : 무엇을 읽고 쓰나 (과장 금지 · 누락 금지)
     notes : 원장이 반드시 알아야 할 것
     send  : 손님에게 **자동으로 나가는가** — 이 한 줄이 제일 중요하다 */
  var FEATURES = {
    // 근거: routers/dm_autoreply.py _process_message (초안만 만들고 status=pending_confirm)
    automation_dm_autoreply: {
      title: 'DM 답장 초안 만들기',
      lead: '손님이 인스타 DM 으로 물어보면, 잇비가 내용을 읽고 <b>답장 초안</b>을 만들어 둡니다.',
      send: { ok: true, text: '초안은 손님에게 <b>바로 나가지 않아요.</b> 확인 목록에 쌓이고, 사장님이 [보내기]를 눌러야 나갑니다.' },
      uses: [
        '인스타 DM 으로 받은 <b>메시지 내용</b>과 그 손님과의 이전 대화',
        '저장된 <b>내 샵 정보</b> — 영업시간 · 주소 · 가격표 · 시술 종류',
        '예약 확인이 필요하면 <b>그날의 예약 현황</b>',
        '사장님 <b>말투 설정</b>(있으면) — 초안을 사장님처럼 쓰기 위해',
      ],
      notes: [
        '초안을 만들 때 <b>AI 사용량이 들어가요</b> (요금제 한도에서 차감)',
        '환불 · 민원 · 부작용 같은 얘기는 초안을 만들지 않고 <b>사장님께 바로 넘겨요</b>',
        '언제든 설정에서 끌 수 있고, 끄면 그 순간부터 초안을 안 만들어요',
      ],
      cta: '초안 만들기 시작',
    },
    // 근거: services/dm_autosend.should_autosend (토글·승인·안전판정·표준창을 발송 직전 재조회)
    automation_dm_autosend: {
      title: '잇비가 직접 답장 보내기',
      lead: '잇비가 만든 답장이 <b>사장님 확인 없이</b> 손님에게 바로 나갑니다.',
      send: { ok: false, text: '이 기능은 <b>손님에게 실제로 메시지를 보냅니다.</b> 사장님을 대신해 응답하게 됩니다.' },
      uses: [
        '위 <b>답장 초안</b> 기능이 읽는 것 전부',
        '보내기 직전에 <b>지금도 켜져 있는지</b> 다시 확인해요',
      ],
      notes: [
        '환불 · 민원 · 법적 · 부작용 얘기, 화난 말투는 <b>자동으로 안 나가요</b> → 확인 목록으로',
        '손님이 말을 멈춘 뒤 <b>한 번만</b> 답장해요',
        '아직 안 채운 샵 정보는 <b>지어내지 않고</b> 확인하겠다고 답해요',
        '끄면 그 순간부터 안 나가요 — 이미 만들어 둔 초안도 확인 목록에 남아요',
      ],
      cta: '자동 답장 시작',
    },
    // 근거: services/dm_menu.py + routers/dm_autoreply.py _handle_dm_menu_payload (LLM 안 거침)
    automation_dm_quick_reply: {
      title: '버튼 누르면 바로 안내',
      lead: '손님이 대화창의 버튼(영업시간 · 오시는 길 등)을 누르면, <b>사장님이 써두신 답</b>이 그대로 나갑니다.',
      send: { ok: false, text: '이 기능은 <b>손님에게 실제로 메시지를 보냅니다.</b> 버튼을 누르는 순간 확인 없이 나가요.' },
      uses: [
        '메뉴마다 <b>사장님이 직접 써둔 문구</b>',
        '저장된 <b>영업시간 · 주소 · 가격표</b> (문구 안에 자동으로 채워져요)',
      ],
      notes: [
        'AI 가 글을 지어내지 않아요 — <b>써두신 문장만</b> 나가요 (AI 사용량 안 들어요)',
        '아직 안 채운 값이 있으면 <b>그 자리가 비어서 나가요</b>',
        '‘상세문의’ 버튼은 확인 멘트만 보내고 사장님께 넘어와요',
      ],
      cta: '버튼 안내 시작',
    },
    // 근거: routers/instagram.py get_comment_queue / post_comment_reply (발송은 원장 탭)
    automation_comment_autoreply: {
      title: '게시물 댓글 문의 모으기',
      lead: '게시물에 달린 댓글 중 <b>문의</b>를 골라 모아주고, 답글 초안을 만들어 둡니다.',
      send: { ok: true, text: '답글은 <b>자동으로 달리지 않아요.</b> 사장님이 확인하고 [보내기]를 눌러야 올라갑니다.' },
      uses: [
        '내 인스타 <b>게시물과 거기 달린 댓글</b> (글쓴이 아이디 · 내용)',
        '저장된 <b>내 샵 정보</b>와 시술 종류 — 답글 초안에 쓰려고',
        '사장님 <b>말투 설정</b>(있으면)',
      ],
      notes: [
        '문의인지 아닌지 가려낼 때 <b>AI 사용량이 들어가요</b>',
        '불만 · 건강 관련 댓글은 초안을 만들지 않고 <b>사장님이 직접 보시게</b> 넘겨요',
        '끄면 목록도 홈 알림도 안 떠요',
      ],
      cta: '댓글 문의 모으기 시작',
    },
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function toast(msg) {
    if (typeof window.toastIt === 'function') window.toastIt(msg);
    else if (typeof window.showToast === 'function') window.showToast(msg);
  }

  /* 서버에 승인 기록. 기존 PIPA 동의 테이블(UserConsent)을 그대로 쓴다 —
     감사 이력이 두 군데로 갈라지면 나중에 "언제 뭘 동의했나" 를 못 맞춘다. */
  function recordConsent(feature) {
    if (!window.apiFetch || !window.apiUrl) return Promise.resolve(false);
    var h = (window.authHeader ? window.authHeader() : {}) || {};
    h['Content-Type'] = 'application/json';
    return window.apiFetch(window.apiUrl('/persona/consent'), {
      method: 'POST', headers: h,
      body: JSON.stringify({ consent_type: feature, version: CONSENT_VERSION, agreed: true }),
    }).then(function (r) { return !!(r && r.ok); }).catch(function () { return false; });
  }

  function revokeConsent(feature) {
    if (!window.apiFetch || !window.apiUrl) return Promise.resolve(false);
    var h = (window.authHeader ? window.authHeader() : {}) || {};
    h['Content-Type'] = 'application/json';
    return window.apiFetch(window.apiUrl('/persona/consent'), {
      method: 'POST', headers: h,
      body: JSON.stringify({ consent_type: feature, version: CONSENT_VERSION, agreed: false }),
    }).then(function (r) { return !!(r && r.ok); }).catch(function () { return false; });
  }

  function li(items) {
    return items.map(function (t) { return '<li>' + t + '</li>'; }).join('');
  }

  /* 안내 시트를 띄우고 승인을 받는다.
     resolve(true)  = 원장이 체크하고 [사용 시작] 을 눌렀고, 서버 승인 기록까지 성공
     resolve(false) = 취소 · 배경 탭 · 뒤로가기 · 승인 기록 실패
     ⚠️ true 여도 **켜진 건 아니다.** 켜는 건 호출자가 설정 저장으로 한다. */
  /* 시트 마크업. `ask()` 에서 떼어냈다 — 문구를 고칠 때 흐름 제어 코드를 안 보게 하려고. */
  function sheetHtml(cfg) {
      var sendBox = cfg.send.ok
        ? '<div style="background:#F0FDF4;border-radius:14px;padding:12px 14px;margin-bottom:12px;font-size:12.5px;color:#166534;line-height:1.65;">' + cfg.send.text + '</div>'
        : '<div style="background:#FEF3C7;border-radius:14px;padding:12px 14px;margin-bottom:12px;font-size:12.5px;color:#92400E;line-height:1.65;">' + cfg.send.text + '</div>';

      return ''
        + '<div role="dialog" aria-modal="true" aria-label="' + esc(cfg.title) + ' 켜기"'
        + ' style="width:100%;max-width:460px;max-height:88vh;overflow-y:auto;background:#fff;border-radius:20px 20px 0 0;'
        + 'padding:22px 20px max(20px,var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)));'
        + 'transform:translateY(14px);transition:transform .22s cubic-bezier(.32,.72,0,1);">'
        + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">'
        +   '<span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:#F7EFF0;color:#BC6675;flex-shrink:0;">'
        +     '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>'
        +   '</span>'
        +   '<strong style="font-size:17px;color:#191F28;letter-spacing:-.01em;">' + esc(cfg.title) + '</strong>'
        + '</div>'
        + '<p style="margin:0 0 12px;font-size:13.5px;color:#4E5968;line-height:1.65;">' + cfg.lead + '</p>'
        + sendBox
        + '<div style="background:#F7F8FA;border-radius:14px;padding:12px 14px;margin-bottom:10px;">'
        +   '<div style="font-size:12px;font-weight:700;color:#6B7684;margin-bottom:7px;">무엇을 보게 되나요</div>'
        +   '<ul style="margin:0;padding-left:16px;font-size:12.5px;color:#4E5968;line-height:1.75;">' + li(cfg.uses) + '</ul>'
        + '</div>'
        + '<div style="background:#F7F8FA;border-radius:14px;padding:12px 14px;margin-bottom:14px;">'
        +   '<div style="font-size:12px;font-weight:700;color:#6B7684;margin-bottom:7px;">알고 계셔야 할 것</div>'
        +   '<ul style="margin:0;padding-left:16px;font-size:12.5px;color:#4E5968;line-height:1.75;">' + li(cfg.notes) + '</ul>'
        + '</div>'
        + '<label data-ac="agree-row" style="display:flex;align-items:flex-start;gap:10px;padding:12px 14px;border:1px solid #E5E8EB;border-radius:14px;margin-bottom:14px;cursor:pointer;">'
        +   '<input type="checkbox" data-ac="agree" style="width:19px;height:19px;margin:1px 0 0;flex-shrink:0;accent-color:#BC6675;cursor:pointer;">'
        +   '<span style="font-size:13px;color:#191F28;line-height:1.6;">위 안내를 확인했고, <b>' + esc(cfg.title) + '</b> 기능과 인스타그램 정보 사용에 동의합니다.</span>'
        + '</label>'
        + '<div style="display:flex;gap:8px;">'
        +   '<button type="button" data-ac="no" style="flex:1;padding:13px;border:1px solid #E5E8EB;background:#fff;color:#4E5968;font-weight:600;font-size:14px;border-radius:14px;cursor:pointer;font-family:inherit;">취소</button>'
        +   '<button type="button" data-ac="yes" disabled style="flex:1.5;padding:13px;border:none;background:#D1D6DB;color:#fff;font-weight:700;font-size:14px;border-radius:14px;cursor:not-allowed;font-family:inherit;">' + esc(cfg.cta) + '</button>'
        + '</div>'
        + '<p style="margin:12px 0 0;font-size:11.5px;color:#8B95A1;line-height:1.6;text-align:center;">언제든 이 설정에서 다시 끌 수 있어요.</p>'
        + '</div>';
  }

  /* 체크박스 → 버튼 활성, 버튼 → 승인 기록. `ask()` 에서 떼어냈다. */
  function wire(ov, feature, finish) {
    var chk = ov.querySelector('[data-ac="agree"]');
    var yes = ov.querySelector('[data-ac="yes"]');
    ov.addEventListener('change', function () {
      var on = !!(chk && chk.checked);
      yes.disabled = !on;
      yes.style.background = on ? '#191F28' : '#D1D6DB';
      yes.style.cursor = on ? 'pointer' : 'not-allowed';
    });
    ov.addEventListener('click', function (e) {
      if (e.target === ov) { finish(false); return; }      // 배경 탭 = 취소(안전한 쪽)
      var b = e.target.closest ? e.target.closest('[data-ac]') : null;
      if (!b) return;
      var v = b.getAttribute('data-ac');
      if (v === 'no') { finish(false); return; }
      if (v !== 'yes') return;
      // 체크 안 했으면 버튼이 disabled 라 여기 안 온다. 그래도 한 번 더 본다 —
      // disabled 는 화면 규칙이고, 이 검사는 코드 규칙이다.
      if (!chk || !chk.checked) { toast('안내 확인에 체크해 주세요'); return; }
      yes.disabled = true;
      yes.textContent = '켜는 중…';
      recordConsent(feature).then(function (ok) {
        if (!ok) {
          toast('동의 기록에 실패했어요 — 잠시 뒤 다시 시도해 주세요');
          finish(false);
          return;
        }
        finish(true);
      });
    });
  }

  function ask(feature) {
    var cfg = FEATURES[feature];
    if (!cfg) return Promise.resolve(false);

    return new Promise(function (resolve) {
      var ID = 'automationConsentSheet';
      var prev = document.getElementById(ID);
      if (prev) prev.remove();

      var ov = document.createElement('div');
      ov.id = ID;
      ov.style.cssText = 'position:fixed;inset:0;z-index:12000;display:flex;align-items:flex-end;justify-content:center;'
        + 'background:rgba(0,0,0,.45);opacity:0;transition:opacity .18s ease;';
      ov.innerHTML = sheetHtml(cfg);

      document.body.appendChild(ov);
      requestAnimationFrame(function () {
        ov.style.opacity = '1';
        var card = ov.firstElementChild;
        if (card) card.style.transform = 'translateY(0)';
      });

      var done = false;
      function finish(v) {
        if (done) return;
        done = true;
        ov.style.opacity = '0';
        setTimeout(function () { ov.remove(); }, 180);
        if (typeof window._markSheetClosed === 'function') window._markSheetClosed(ID);
        resolve(v);
      }
      // 뒤로가기 등록 — 빠뜨리면 안드로이드에서 뒤로가기가 앱을 종료시킨다
      if (typeof window._registerSheet === 'function') window._registerSheet(ID, function () { finish(false); });
      if (typeof window._markSheetOpen === 'function') window._markSheetOpen(ID);

      wire(ov, feature, finish);
    });
  }

  window.AutomationConsent = {
    ask: ask,
    record: recordConsent,
    revoke: revokeConsent,
    FEATURES: FEATURES,
    VERSION: CONSENT_VERSION,
    DM_AUTOREPLY: 'automation_dm_autoreply',
    DM_AUTOSEND: 'automation_dm_autosend',
    DM_QUICK_REPLY: 'automation_dm_quick_reply',
    COMMENT_AUTOREPLY: 'automation_comment_autoreply',
  };
})();
