/* [2026-09-02] 인스타 연동 경고+확인 카드.
 *
 * 시안: 기획/35_연동경고_확인카드_목업_v1.html (원영 확정본)
 *
 * 언제 뜨나: **기존 인스타 분석 데이터가 있을 때만.** 처음 연동하는 원장에게까지 띄우면
 *   그냥 팝업 남발이다. 데이터가 없으면 조용히 통과시킨다.
 *
 * 왜 필요한가: BE 가 계정 교체를 감지하면 이전 계정 분석 데이터를 전부 지운다.
 *   지우기 전에 "다른 계정을 연동하면 이게 사라진다 / 같은 계정이면 유지된다" 를
 *   한 번은 보여줘야 한다.
 *
 * 사용: await window.IgConnectWarn.maybeConfirm()  → true 면 OAuth 진행, false 면 중단.
 */
(function () {
  'use strict';
  if (window.IgConnectWarn) return;

  var OVERLAY_ID = 'igConnectWarnOverlay';

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function _ls(k) { try { return localStorage.getItem(k) || ''; } catch (_e) { return ''; } }

  /* 기존 계정 데이터가 있나 — 셋 중 하나라도 있으면 경고 대상. */
  function hasExistingData() {
    if (_ls('itdasy:ig_handle')) return true;
    if (_ls('itdasy_latest_analysis')) return true;
    try {
      if (window.InstagramTextStyle && window.InstagramTextStyle.get()) return true;
    } catch (_e) { void _e; }
    return false;
  }

  var ROW_ICONS = [
    // 말투 분석 리포트
    '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    // 자주 쓰는 말끝·이모지·해시태그
    '<path d="M4 20h16"/><path d="m6 16 6-12 6 12"/><path d="M8 12h8"/>',
    // 꼭 쓰는 고정문구
    '<path d="M17 6.1H3"/><path d="M21 12.1H3"/><path d="M15.1 18H3"/>',
    // 프로필 사진·핸들
    '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>'
  ];
  var ROW_TEXTS = [
    '말투 분석 리포트',
    '자주 쓰는 말끝 · 이모지 · 해시태그',
    '꼭 쓰는 고정문구',
    '프로필 사진 · 핸들'
  ];

  function _rowsHtml() {
    return ROW_ICONS.map(function (path, i) {
      return '<div style="display:flex;align-items:center;gap:10px;padding:10px 0;'
        + (i > 0 ? 'border-top:.5px solid var(--border);' : '') + '">'
        + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
        + 'stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;color:var(--text-subtle);" '
        + 'aria-hidden="true">' + path + '</svg>'
        + '<span style="font-size:15px;color:var(--text);word-break:keep-all;">' + ROW_TEXTS[i] + '</span></div>';
    }).join('');
  }

  var SIL = '<svg viewBox="0 0 24 24" width="34" height="34" fill="#C9CDD4" aria-hidden="true">'
    + '<path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2.2c-4.5 0-8 2.6-8 5.9V21h16v-.9c0-3.3-3.5-5.9-8-5.9Z"/></svg>';

  function _cardHtml() {
    var handle = String(_ls('itdasy:ig_handle') || '').replace(/^@/, '').trim();
    var pic = _ls('itdasy:ig_profile_pic');
    // 기존 계정은 흑백 — "떠나는 계정" 시각 신호.
    var avatar = pic
      ? '<img src="' + _esc(pic) + '" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">'
      : SIL;
    var IG_GLYPH = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#D62976" stroke-width="2" '
      + 'aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4.5"/>'
      + '<circle cx="17.5" cy="6.5" r="1" fill="#D62976" stroke="none"/></svg>';

    return '<div style="background:var(--surface);border-radius:26px;width:100%;max-width:340px;'
      + 'box-shadow:0 24px 60px rgba(0,0,0,.18);overflow:hidden;max-height:88vh;overflow-y:auto;">'
      // 히어로
      + '<div style="position:relative;text-align:center;padding:30px 20px 20px;'
      + 'background:linear-gradient(180deg,#FDF3F6 0%,#FBEAF0 100%);">'
      + '<button data-igw="cancel" aria-label="닫기" style="position:absolute;top:14px;right:14px;width:32px;height:32px;'
      + 'border:none;border-radius:50%;background:rgba(255,255,255,.75);color:var(--text-muted);cursor:pointer;'
      + 'display:flex;align-items:center;justify-content:center;padding:0;">'
      + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">'
      + '<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>'
      + '<div style="width:78px;height:78px;border-radius:50%;padding:3.5px;margin:0 auto 12px;box-sizing:border-box;'
      + 'background:conic-gradient(from 210deg,#FEDA75,#FA7E1E,#D62976,#962FBF,#4F5BD5,#FEDA75);">'
      + '<div style="width:100%;height:100%;border-radius:50%;border:3px solid #fff;box-sizing:border-box;'
      + 'overflow:hidden;background:#F2F4F6;display:flex;align-items:center;justify-content:center;'
      + 'filter:grayscale(1);opacity:.75;">' + avatar + '</div></div>'
      + (handle ? '<div style="font-size:15px;font-weight:800;color:var(--text);">@' + _esc(handle) + '</div>' : '')
      + '<div style="display:inline-flex;align-items:center;gap:6px;margin-top:8px;background:rgba(255,255,255,.85);'
      + 'border-radius:999px;padding:6px 14px;font-size:13px;font-weight:600;color:var(--text-muted);">'
      + IG_GLYPH + '<span>이 계정의 분석 데이터가 있어요</span></div></div>'
      // 절취선
      + '<div style="position:relative;height:22px;background:var(--surface);">'
      + '<div style="position:absolute;left:22px;right:22px;top:50%;border-top:1.5px dashed var(--border-strong);">'
      + '</div></div>'
      // 본문
      + '<div style="padding:0 20px 20px;">'
      + '<div style="font-size:13px;color:var(--text-muted);line-height:1.7;word-break:keep-all;padding:2px 0 12px;">'
      + '<b style="color:var(--text);font-weight:700;">다른 인스타 계정</b>을 연동하면 아래 데이터가 '
      + '<b style="color:var(--text);font-weight:700;">모두 삭제</b>되고 새 계정으로 새로 시작해요.</div>'
      + '<div style="font-size:11px;font-weight:600;color:var(--text-subtle);padding-bottom:4px;">삭제되는 것</div>'
      + _rowsHtml()
      + '<div style="display:flex;align-items:flex-start;gap:8px;margin-top:12px;padding:10px 12px;'
      + 'background:var(--surface-2, #F7F8FA);border-radius:14px;">'
      + '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" '
      + 'stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;color:#16B55E;margin-top:2px;" '
      + 'aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>'
      + '<div style="font-size:13px;color:var(--text-muted);line-height:1.6;word-break:keep-all;">'
      + '<b style="font-weight:700;">같은 계정</b>을 다시 연동하면 데이터는 그대로 유지돼요.</div></div>'
      + '<div style="display:flex;flex-direction:column;gap:8px;padding-top:16px;">'
      + '<button data-igw="ok" style="border:none;border-radius:16px;padding:15px;font-size:15px;font-weight:700;'
      + 'color:#fff;background:linear-gradient(135deg,var(--brand),var(--brand-strong));cursor:pointer;">'
      + '확인했어요, 연동 계속하기</button>'
      + '<button data-igw="cancel" style="border:none;border-radius:16px;padding:13px;font-size:13px;'
      + 'font-weight:600;color:var(--text-subtle);background:none;cursor:pointer;">취소</button>'
      + '</div></div></div>';
  }

  /* 데이터가 있으면 카드를 띄우고 사용자의 선택을 기다린다. 없으면 즉시 true. */
  function maybeConfirm() {
    if (!hasExistingData()) return Promise.resolve(true);
    if (document.getElementById(OVERLAY_ID)) return Promise.resolve(false);  // 중복 진입 방어

    return new Promise(function (resolve) {
      var ov = document.createElement('div');
      ov.id = OVERLAY_ID;
      // z-index 10060: 말투 리포트(10050) 보다 위. PC 사이드바에 안 잘리게 position:fixed + inset:0.
      ov.setAttribute('style', 'position:fixed;inset:0;z-index:10060;background:rgba(25,31,40,.35);'
        + '-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);display:flex;align-items:center;'
        + 'justify-content:center;padding:20px 16px;box-sizing:border-box;');
      ov.innerHTML = _cardHtml();

      var done = false;
      function close(val) {
        if (done) return;
        done = true;
        try { ov.remove(); } catch (_e) { void _e; }
        document.removeEventListener('keydown', onKey);
        resolve(val);
      }
      function onKey(e) { if (e.key === 'Escape') close(false); }

      ov.addEventListener('click', function (e) {
        var t = e.target.closest ? e.target.closest('[data-igw]') : null;
        if (t) { close(t.getAttribute('data-igw') === 'ok'); return; }
        if (e.target === ov) close(false);          // 백드롭 탭 = 취소
      });
      document.addEventListener('keydown', onKey);
      document.body.appendChild(ov);
    });
  }

  window.IgConnectWarn = { maybeConfirm: maybeConfirm, hasExistingData: hasExistingData };
})();
