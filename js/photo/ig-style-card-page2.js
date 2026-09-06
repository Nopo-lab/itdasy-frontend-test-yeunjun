/* [2026-09-02] 인스타분석카드 페이지 2 — "사진편집 스타일" 렌더러.
 *
 * 시안: 기획/37_인스타분석카드_목업_v5_스와이프.html (원영 확정본)
 * 데이터: window.InstagramTextStyle.get() 이 돌려주는 관찰 프로필.
 *
 * 🔴 지어내지 않는다. profile 이 없거나 enough 가 falsy 면 '' 를 돌려주고,
 *    호출부(app-instagram.js)는 페이지 2·점·힌트·넛지를 전부 빼서 기존 1페이지 카드로 만든다.
 *    축(axes.*)이 null 인 항목도 그 표현만 생략한다 — 기본값으로 채우면 그게 거짓말이 된다.
 *
 * app-instagram.js 가 1300줄대라 여기로 분리했다(파일당 500줄 규칙).
 */
(function () {
  'use strict';
  if (window.IgStyleCardPage2) return;

  var ROSE = 'var(--brand-strong)';

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  /* 축 값 꺼내기 — axes 우선, 없으면 옛 평면 필드. 둘 다 없으면 null. */
  function _axisVal(profile, key) {
    var a = (profile.axes && profile.axes[key]) || profile[key] || null;
    return a && a.value != null ? a.value : null;
  }

  /* ── 샘플 문구 존의 위치 — position 9분할 매핑 ──
     세로 upper / center / lower × 가로 left / center / right.
     목업의 기본은 top 7% + 좌우 6% 여백이다. */
  function _zoneBox(position) {
    var p = String(position || '').toLowerCase();
    var vert = p.indexOf('upper') === 0 ? 'upper' : (p.indexOf('lower') === 0 ? 'lower' : 'center');
    var horiz = /right$/.test(p) ? 'right' : (/left$/.test(p) ? 'left' : 'center');

    var css = 'left:6%;right:6%;';           // 가로는 기본적으로 꽉 — 글자 정렬로 좌우를 표현한다
    if (horiz === 'left') css = 'left:6%;right:34%;';
    else if (horiz === 'right') css = 'left:34%;right:6%;';

    if (vert === 'upper') css += 'top:7%;';
    else if (vert === 'lower') css += 'bottom:7%;';
    else css += 'top:50%;transform:translateY(-50%);';
    return { css: css, vert: vert, horiz: horiz };
  }

  var _FONT_STACK = {
    serif: 'Georgia, "Nanum Myeongjo", "Noto Serif KR", serif',
    handwriting: '"Gaegu", "Nanum Pen Script", cursive',
    sans: '-apple-system, "Pretendard", "Noto Sans KR", sans-serif'
  };

  function _fontFamily(cls) {
    return _FONT_STACK[String(cls || '').toLowerCase()] || null;
  }

  function _fontWeight(w) {
    var v = String(w || '').toLowerCase();
    if (v === 'bold') return 800;
    if (v === 'medium') return 600;
    return v ? 400 : null;
  }

  /* 관찰된 색을 그대로 쓰되, 로즈 그라데이션 배경에서 안 보이면 --text 로 폴백.
     배경이 밝으므로(#FDF3F6~#FBEAF0) 밝은 글자색은 대비가 안 난다. */
  function _textColor(color) {
    var c = String(color || '').trim();
    if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c)) return 'var(--text)';
    var h = c.slice(1);
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    // 상대 휘도 — 0.62 넘으면 밝은 배경 위에서 안 읽힌다.
    var lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return lum > 0.62 ? 'var(--text)' : c;
  }

  /* 한 줄 요약 — textUsageRate + composition 조합. 둘 다 없으면 null(섹션 생략). */
  function _summary(profile) {
    var rate = profile.textUsageRate;
    var comp = _axisVal(profile, 'composition');
    if (rate == null) return null;
    var head = rate < 0.3
      ? '글자를 아껴 쓰는 깔끔한 피드예요. 사진이 주인공이 되는 스타일이에요.'
      : '사진 위에 글자로 정보를 잘 얹는 스타일이에요.';
    if (comp === 'single') head += ' 한 장으로 승부하는 편이에요.';
    else if (comp === 'grid' || comp === 'collage') head += ' 여러 장을 묶어 보여주는 편이에요.';
    return head;
  }

  /* 미리보기 안 샘플 문구 — 중립 고정값. 실명·실제 게시물 문구는 절대 쓰지 않는다. */
  var SAMPLE_MAIN = '가을 웰컴 이벤트 🤍';
  var SAMPLE_SUB = '이번 주 예약 오픈';

  function _preview(profile) {
    var pos = _zoneBox(_axisVal(profile, 'position'));
    var align = _axisVal(profile, 'align');
    var sizeRatio = _axisVal(profile, 'sizeRatio');
    var famCls = _axisVal(profile, 'fontClass');
    var weight = _fontWeight(_axisVal(profile, 'fontWeight'));
    var color = _axisVal(profile, 'color');

    var zoneStyle = pos.css;
    if (align) zoneStyle += 'text-align:' + _esc(String(align).toLowerCase()) + ';';

    /* 미리보기는 4:5. 모바일 카드(폭 360px) 안에서 높이 ≈ 375px 이라 그걸 기준으로 환산한다.
       🔴 예전엔 375 를 **상수로 박아** 놨는데, PC 2컬럼에서 미리보기 폭을 줄이자
          글자만 그대로 커서 점선 상자를 뚫고 나갔다(실측: '가을 웰컴 이벤트' 가 3줄로 접힘).
          기준 높이를 CSS 변수로 빼서 화면마다 맞춘다 — 값을 바꾸는 곳이 CSS 한 줄이 된다. */
    var sampleStyle = '';
    if (sizeRatio != null && isFinite(sizeRatio)) {
      var ratio = Math.min(0.25, Math.max(0.04, Number(sizeRatio)));
      sampleStyle += 'font-size:calc(var(--igs-pv-h, 375px) * ' + ratio.toFixed(4) + ');';
    } else {
      sampleStyle += 'font-size:calc(var(--igs-pv-h, 375px) * 0.0533);';
    }
    var fam = _fontFamily(famCls);
    if (fam) sampleStyle += 'font-family:' + fam + ';';
    sampleStyle += 'font-weight:' + (weight == null ? 800 : weight) + ';';
    sampleStyle += 'color:' + _textColor(color) + ';';

    // 콜아웃 — 해당 축이 실제로 있을 때만.
    var hasPlace = _axisVal(profile, 'position') != null || sizeRatio != null;
    var lowText = profile.textUsageRate != null && profile.textUsageRate < 0.3;
    var callouts = '';
    if (hasPlace) {
      // 존 반대편(세로 기준)에 붙여 겹치지 않게 한다.
      var c1Pos = pos.vert === 'lower' ? 'top:14%;' : 'top:' + (pos.vert === 'center' ? '14%' : '36%');
      callouts += '<span style="position:absolute;' + c1Pos + ';left:6%;display:inline-flex;align-items:center;gap:4px;'
        + 'background:' + ROSE + ';color:#fff;font-size:11px;font-weight:700;padding:5px 10px;border-radius:999px;'
        + 'box-shadow:0 4px 12px rgba(188,102,117,.4);">글자는 주로 여기에'
        + (sizeRatio != null ? ' · ' + (sizeRatio >= 0.12 ? '크게' : '작게') : '') + '</span>';
    }
    if (lowText) {
      var c2Pos = pos.vert === 'lower' ? 'top:8%;' : 'bottom:8%;';
      callouts += '<span style="position:absolute;' + c2Pos + 'left:6%;display:inline-flex;align-items:center;'
        + 'background:rgba(25,31,40,.55);color:#fff;font-size:11px;font-weight:700;padding:5px 10px;'
        + 'border-radius:999px;">아래는 여백 — 사진이 주인공</span>';
    }

    /* data-igs-preview — PC 에서 이 블록의 폭을 줄이려고 붙인 표식.
       인라인 style 을 CSS 로 겨냥하면 부서지기 쉬워서 속성으로 잡는다. */
    return '<div data-igs-preview style="position:relative;aspect-ratio:4/5;border-radius:16px;overflow:hidden;margin-top:10px;'
      + 'background:linear-gradient(180deg,#FDF3F6 0%,#FBEAF0 100%);">'
      // 잇비 — #ic-bot 스프라이트 그대로. 다른 모양·이모지 대체 금지.
      // [2026-09-03] 배경 워터마크로 — 진하게 두면 샘플 문구 존과 겹쳐 이상하다(원영 피드백).
      + '<div style="position:absolute;left:50%;bottom:24%;transform:translateX(-50%);color:' + ROSE + ';'
      + 'opacity:.18;filter:blur(1px);pointer-events:none;">'
      + '<svg width="96" height="96" aria-hidden="true"><use href="#ic-bot"/></svg></div>'
      + '<div style="position:absolute;' + zoneStyle + 'padding:12px 14px;border-radius:12px;'
      + 'border:1.5px dashed ' + ROSE + ';background:rgba(255,255,255,.28);">'
      + '<div style="' + sampleStyle + 'letter-spacing:-.01em;word-break:keep-all;line-height:1.25;">' + _esc(SAMPLE_MAIN)
      + '<small style="display:block;font-size:calc(var(--igs-pv-h, 375px) * 0.0347);font-weight:600;color:var(--text-muted);margin-top:4px;">'
      + _esc(SAMPLE_SUB) + '</small></div></div>'
      + callouts
      + '</div>';
  }

  /* ── [2026-09-04] 내 스타일 목록 ──────────────────────────────────
     카드 안이라 **작게** 둔다(§15). 상위 3개 + 전체 보기.
     이름 옆 색점은 그 스타일의 실제 팔레트다 — 이모지(🤍🤎)는 OS 마다 다르게 렌더돼서 금지.
     목록이 비어도 '만들기' 는 항상 보인다: 자동 그룹이 안 만들어지는 원장(톤이 제각각)이
     그렇다고 이 기능을 못 쓰면 안 된다. */
  /* 팔레트 색은 **hex 만**. `_esc` 는 속성 밖으로 나가는 것만 막고,
     style 속성 *안*에서 `red;background-image:url(...)` 로 CSS 를 이어 붙이는 건 못 막는다.
     서버 왕복을 거치는 값이라 모양이 아니면 아예 안 쓴다. */
  function _hexOnly(c) {
    return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(c || '').trim()) ? String(c).trim() : null;
  }

  function _swatch(g) {
    var pal = ((g && g.profile && g.profile.visual && g.profile.visual.palette) || [])
      .map(_hexOnly).filter(Boolean).slice(0, 3);
    if (!pal.length) {
      return '<span style="width:26px;height:26px;border-radius:9px;background:#F2F4F6;flex-shrink:0;"></span>';
    }
    return '<span style="display:flex;width:26px;height:26px;border-radius:9px;overflow:hidden;' +
      'flex-shrink:0;border:1px solid var(--border);">' +
      pal.map(function (c) {
        return '<span style="flex:1;background:' + c + ';"></span>';
      }).join('') + '</span>';
  }

  function renderStyles(groups) {
    var gs = groups || [];
    var label = '<div style="font-size:11px;font-weight:600;color:var(--text-subtle);">내 스타일</div>';
    var rows = gs.slice(0, 3).map(function (g) {
      return '<button type="button" data-igs-open="' + _esc(g.id) + '" ' +
        'style="width:100%;display:flex;align-items:center;gap:10px;padding:9px 0;background:none;border:none;' +
        'border-top:.5px solid var(--border);text-align:left;cursor:pointer;min-height:46px;">' +
        _swatch(g) +
        '<span style="flex:1;min-width:0;font-size:14px;font-weight:700;color:var(--text);' +
        'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + _esc(g.name) + '</span>' +
        '<span style="font-size:12px;color:var(--text-subtle);flex-shrink:0;">' +
        ((g.media_ids || []).length) + '개</span>' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ' +
        'style="color:var(--text-subtle);flex-shrink:0;"><path d="m9 6 6 6-6 6"/></svg></button>';
    }).join('');

    var empty = '<div style="font-size:13px;color:var(--text-subtle);line-height:1.7;margin-top:8px;">' +
      '아직 묶인 스타일이 없어요.<br>비슷한 게시물을 직접 골라 만들 수 있어요.</div>';

    var more = gs.length > 3
      ? '<button type="button" data-igs-all style="width:100%;margin-top:8px;padding:9px;background:var(--surface-2,#F7F8FA);' +
        'border:none;border-radius:11px;font-size:13px;font-weight:600;color:var(--text-muted);cursor:pointer;' +
        'min-height:44px;">전체 보기 (' + gs.length + '개)</button>'
      : '';

    return '<div style="padding:16px 20px;border-top:.5px solid var(--border);">' + label +
      (rows ? '<div style="margin-top:4px;">' + rows + '</div>' : empty) + more +
      '<button type="button" data-igs-new style="width:100%;margin-top:8px;padding:10px;' +
      'background:#FBEAF0;border:none;border-radius:11px;font-size:13px;font-weight:700;color:' + ROSE + ';' +
      'cursor:pointer;min-height:44px;">게시물 골라 스타일 만들기</button></div>';
  }

  /* 분석 전 첫 화면(§27). 인스타는 연결됐는데 아직 안 본 상태. */
  function renderNotAnalyzed() {
    return '<div style="display:flex;align-items:center;gap:6px;padding:14px 20px 0;color:var(--text-subtle);">'
      + _headIcon() + '<span style="font-size:11px;font-weight:700;color:var(--text-subtle);letter-spacing:.02em;">'
      + '사진편집 스타일</span></div>'
      + '<div style="padding:26px 20px;text-align:center;">'
      + '<div style="color:' + ROSE + ';"><svg width="64" height="64" aria-hidden="true"><use href="#ic-bot"/></svg></div>'
      + '<div style="margin-top:14px;font-size:15px;font-weight:700;color:var(--text);line-height:1.5;">'
      + '인스타 게시물 스타일을 분석해 보세요</div>'
      + '<div style="margin-top:8px;font-size:13px;color:var(--text-muted);line-height:1.7;word-break:keep-all;">'
      + '평소 올리던 사진의 색감과 글자 자리를 배워서<br>새 사진에도 똑같이 맞춰드려요.</div>'
      + '<button type="button" data-igs-analyze style="margin-top:16px;padding:12px 20px;background:' + ROSE + ';'
      + 'border:none;border-radius:12px;color:#fff;font-size:14px;font-weight:700;cursor:pointer;min-height:48px;">'
      + '스타일 분석 시작</button></div>'
      /* 자동 분석 전이어도 **이미 만든 스타일은 보여야** 한다.
         원장이 게시물을 직접 골라 만든 스타일이 있는데 "아직 분석 전이에요" 화면이
         그걸 통째로 가리면, 만든 사람 입장에선 스타일이 사라진 것이다.
         (계정 교체·캐시 삭제로 관찰 프로필만 날아가는 경우도 여기 걸린다) */
      + renderStyles(_groups());
  }

  function _headIcon() {
    return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
      + 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/>'
      + '<path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/></svg>';
  }

  /* 카드가 그려진 뒤 이벤트를 붙인다. innerHTML 로 만들어진 버튼이라 위임이 아니라 여기서.
     🔴 시트 모듈이 없으면 **버튼을 눌러도 아무 일이 안 일어난다** — 그건 고장으로 보인다.
        그래서 없으면 안내를 띄운다(조용한 무동작 금지). */
  function bind(root) {
    if (!root || !root.addEventListener) return;
    root.addEventListener('click', function (e) {
      var t = e.target;
      var S = window.IgStyleSheet;
      var open = t.closest && t.closest('[data-igs-open]');
      var all = t.closest && t.closest('[data-igs-all]');
      var nw = t.closest && t.closest('[data-igs-new]');
      var an = t.closest && t.closest('[data-igs-analyze]');
      if (!open && !all && !nw && !an) return;
      e.preventDefault();
      if (an) {
        if (typeof window.reAnalyzePersona === 'function') window.reAnalyzePersona();
        else if (window.showToast) window.showToast('잠시 후 다시 시도해 주세요');
        return;
      }
      if (!S) { if (window.showToast) window.showToast('잠시 후 다시 시도해 주세요'); return; }
      // 분석 카드 팝업을 닫고 시트를 연다 — 겹쳐 두면 뒤로가기가 꼬인다.
      try { var pop = document.getElementById('analyzeResultPopup'); if (pop) pop.style.display = 'none'; }
      catch (_e) { void _e; }
      if (open) S.openDetail(Number(open.getAttribute('data-igs-open')));
      else if (all) S.openList();
      else if (nw) S.openCreate();
    });
  }

  /* profile → 페이지 2 HTML. 렌더 불가면 '' */
  function render(profile) {
    if (!profile || !profile.enough) return '';

    var HEAD_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
      + 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/>'
      + '<path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/></svg>';

    var html = '<div style="display:flex;align-items:center;gap:6px;padding:14px 20px 0;color:var(--text-subtle);">'
      + HEAD_ICON + '<span style="font-size:11px;font-weight:700;color:var(--text-subtle);letter-spacing:.02em;">'
      + '사진편집 스타일</span></div>';

    var label = function (t) {
      return '<div style="font-size:11px;font-weight:600;color:var(--text-subtle);">' + t + '</div>';
    };

    var summary = _summary(profile);
    if (summary) {
      html += '<div style="padding:14px 20px;">' + label('잇비의 한 줄 요약')
        + '<div style="font-size:13px;color:var(--text-muted);line-height:1.7;word-break:keep-all;margin-top:8px;">'
        + _esc(summary) + '</div></div>';
    }

    var n = parseInt(profile.postsAnalyzed, 10) || 0;
    html += '<div style="padding:14px 20px;border-top:.5px solid var(--border);">'
      + label('원장님 스타일로 만들면 이런 느낌')
      + _preview(profile)
      + '<div style="margin-top:12px;padding:10px 12px;background:var(--surface-2, #F7F8FA);border-radius:14px;'
      + 'font-size:13px;color:var(--text-muted);line-height:1.6;word-break:keep-all;">'
      + (n > 0 ? '게시물 ' + n + '개에서 배운 습관이에요. ' : '')
      + '잇비가 사진에 글씨를 넣을 때 <b style="color:' + ROSE + ';font-weight:700;">이 자리, 이 크기</b>로 맞춰드려요.'
      + '</div></div>';

    // [2026-09-04] 내 스타일 목록 — 캐시에서 동기로 읽는다(카드는 문자열을 한 번에 만든다).
    html += renderStyles(_groups());

    return html;
  }

  /* 스타일 목록은 **캐시만** 본다. 여기서 서버를 기다리면 카드가 늦게 뜨고,
     그건 원장에겐 '멈춘 화면' 이다. 서버 갱신은 시트를 열 때 한다. */
  function _groups() {
    try {
      return (window.IgStyleLibrary && window.IgStyleLibrary.cached) ? window.IgStyleLibrary.cached() : [];
    } catch (_e) { void _e; return []; }
  }

  /* [2026-09-03] 분석은 했는데 스타일이 매번 달라 습관을 못 정한 경우(enough=false)의 빈 상태.
     예전엔 페이지 2 를 아예 안 그려서 원장이 "왜 없지?" 도 몰랐다(원영 피드백).
     🔴 여기도 지어내지 않는다 — "봤는데 갈렸다" 는 사실만 말한다.
     profile 이 null(분석 자체가 안 됨)이면 여전히 '' — 할 말이 없는 상태다. */
  function renderInsufficient(profile) {
    if (!profile || profile.enough) return '';

    var HEAD_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
      + 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/>'
      + '<path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/></svg>';

    var n = parseInt(profile.postsAnalyzed, 10) || 0;
    return '<div style="display:flex;align-items:center;gap:6px;padding:14px 20px 0;color:var(--text-subtle);">'
      + HEAD_ICON + '<span style="font-size:11px;font-weight:700;color:var(--text-subtle);letter-spacing:.02em;">'
      + '사진편집 스타일</span></div>'
      + '<div style="padding:28px 20px;text-align:center;">'
      // 잇비 — #ic-bot 스프라이트 그대로. 다른 모양·이모지 대체 금지.
      + '<div style="color:' + ROSE + ';"><svg width="72" height="72" aria-hidden="true"><use href="#ic-bot"/></svg></div>'
      + '<div style="margin-top:14px;font-size:15px;font-weight:700;color:var(--text);word-break:keep-all;line-height:1.5;">'
      + '아직 일관된 사진편집 스타일이 없어요 ㅠㅡㅠ</div>'
      + '<div style="margin-top:8px;font-size:13px;color:var(--text-muted);line-height:1.7;word-break:keep-all;">'
      + (n > 0 ? '게시물 ' + n + '개를 봤는데, ' : '')
      + '사진 속 글자 스타일이 매번 달라서<br>한 가지 습관으로 정하지 못했어요.</div>'
      + '<div style="margin-top:14px;display:inline-block;padding:8px 14px;background:var(--surface-2, #F7F8FA);'
      + 'border-radius:999px;font-size:11px;font-weight:600;color:var(--text-subtle);">'
      + '비슷한 스타일이 쌓이면 잇비가 다시 배워올게요</div>'
      + '</div>'
      /* 습관을 못 정했어도 **직접 만들기**는 열어둔다 — 여기서 막으면
         톤이 제각각인 원장은 이 기능을 영영 못 쓴다. */
      + renderStyles(_groups());
  }

  window.IgStyleCardPage2 = {
    render: render,
    renderInsufficient: renderInsufficient,
    renderNotAnalyzed: renderNotAnalyzed,
    renderStyles: renderStyles,
    bind: bind,
    // 테스트·디버그용 내부 노출 (동작은 render 로만 쓴다)
    _zoneBox: _zoneBox, _fontFamily: _fontFamily, _fontWeight: _fontWeight,
    _textColor: _textColor, _summary: _summary
  };
})();
