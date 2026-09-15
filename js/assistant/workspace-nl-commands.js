/* 잇비 자연어 → 작업실(V2 WorkspaceFlow) 명령 브릿지 — [구조 통합 Phase 1]
   원칙:
   - WorkspaceFlow.command() 공개 API 만 호출(작업실 내부 로직/저장 스키마 미변경).
   - 작업실 플로우가 "열려 있을 때만" 동작 → 일반 채팅/다른 의도 가로채기 0.
   - 매칭 안 되면 false 반환 → 잇비 기존 파이프라인(LLM 포함)으로 그대로 흘려보냄.
   확장: COMMANDS 에 {test, cmd, label} 추가하면 새 자연어 명령이 늘어남. */
(function () {
  'use strict';

  // cmd 는 객체 또는 (text)=>객체. WorkspaceFlow.command(cmd) 스키마를 그대로 사용.
  var COMMANDS = [
    // ── 꾸미기(스티커·텍스트·그리기·누끼) → 현재 인스타식 편집기(ItdEditor). [2026-07-22] ──
    //   '붙여줘'가 고객연결 규칙에 먼저 잡히지 않게 맨 위에 둔다.
    { test: /후\s*사진.*(다시\s*)?(편집|보정|열)|after\s*photo.*(edit|open)/i, cmd: { type: 'storyedit', targetRole: 'after' }, label: '후 사진 편집기를 열었어요' },
    { test: /전\s*사진.*(다시\s*)?(편집|보정|열)|before\s*photo.*(edit|open)/i, cmd: { type: 'storyedit', targetRole: 'before' }, label: '전 사진 편집기를 열었어요' },
    { test: /(스티커|이모지|데코|꾸며|꾸미|예쁘게\s*꾸)/, cmd: { type: 'storyedit' }, label: '편집기를 열었어요 — 스티커·꾸미기를 넣어보세요' },
    { test: /(글씨|글자|텍스트|타이포)\s*(넣|써|추가|올)|문구\s*이미지/, cmd: { type: 'storyedit' }, label: '편집기를 열었어요 — 텍스트를 넣어보세요' },
    { test: /(그리기|그려|낙서|펜으로|손글씨)/, cmd: { type: 'storyedit' }, label: '편집기를 열었어요 — 그리기를 해보세요' },
    { test: /(누끼|배경)\s*(제거|지워|따|빼|없애|흐림|흐리게|블러|바꿔|바꾸)|누끼/, cmd: { type: 'storyedit' }, label: '편집기를 열었어요 — 배경·누끼를 조정하세요' },
    { test: /(사진\s*편집|편집기|꾸미기\s*열|이미지\s*편집)/, cmd: { type: 'storyedit' }, label: '편집기를 열었어요' },

    // ── 고객 연결(이름 추출) ──
    { test: /(고객|손님|님).*(연결|연동|붙여)|(연결|붙여)\s*(해|줘)/, cmd: function (q) {
      var m = q.match(/([가-힣A-Za-z]{2,12})\s*(손님|고객|님)?\s*(이?랑|와|과|에게|을|를|한테)?\s*(연결|연동|붙여)/);
      var name = m && m[1] ? m[1].replace(/(손님|고객|님)$/, '').trim() : '';
      if (/^(고객|손님|연결|연동)$/.test(name)) name = '';
      return name ? { type: 'customer', name: name } : { type: 'goto', screen: 'connect' };
    }, label: null },
    { test: /(미리보기|인스타.*미리|preview)/, cmd: { type: 'goto', screen: 'caption' }, label: '미리보기로 이동했어요' },   // [요청6] 미리보기=캡션 화면에 통합 → caption 으로
    // [버그수정 2026-07-06] "사진 올려줘"·"블로그에 올려줘"가 인스타 발행으로 오발동하던 것 —
    //   발행 대상(인스타/sns/피드/스토리) 또는 명확한 '발행해'만 매칭.
    { test: /(인스타|sns|피드|스토리).*(올려|게시|발행|업로드)|(발행)\s*(해|줘|할래|해줘)/, cmd: { type: 'publish' }, label: '인스타에 올릴게요' },
    // [버그수정 2026-07-06] "메모 저장해줘"·"고객 정보 저장해줘"가 작업실 저장으로 오발동하던 것 —
    //   '작업실 저장' 또는 앞에 다른 대상 없는 '저장해'만 매칭(^ 앵커).
    { test: /작업실.*저장|^\s*(?:이거|이것|이걸|현재|지금|여기)?\s*저장\s*(?:해|할래|해줘)$/, cmd: { type: 'save' }, label: '작업실에 저장했어요' },

    // ── 레이아웃/템플릿 → 현재 워크플로의 레이아웃 고르기 화면(옛 템플릿 적용 아님) ──
    //   '후기 게시글'처럼 캡션 요청을 삼키지 않게, 뒤에 템플릿/카드/레이아웃 키워드가 있을 때만 매칭.
    { test: /(레이아웃|배치|구도)\s*(고르|골라|바꿔|바꾸|선택|열)|(전후|비포\s*애프터|before\s*after|시술\s*자랑|완성컷|후기|리뷰|이벤트|스토리|피드)\s*(템플릿|카드|레이아웃)/, cmd: { type: 'goto', screen: 'layout' }, label: '레이아웃 고르기로 이동했어요' },

    // ── 정밀(부위) 보정 ──
    { test: /(피부|잡티|붉은기|피부톤)\s*(보정|정리|매끈|살려|좋게)?/, cmd: { type: 'adjust', beauty: { skin: 35, blemish: 40, textureSmooth: 28 } }, label: '피부를 자연스럽게 정리했어요' },
    { test: /(머리|헤어|모발|머릿결).*(볼륨|풍성|윤기|결|살려|보정)?/, cmd: { type: 'adjust', beauty: { hairDetail: 38, hairVolume: 34, hairShine: 40 } }, label: '머릿결과 볼륨을 살렸어요' },
    { test: /(눈|눈썹|눈가|속눈썹).*(또렷|선명|맑게|살려|보정)?/, cmd: { type: 'adjust', beauty: { browSharp: 34, lashSharp: 32, eyeRedness: 24 } }, label: '눈가를 또렷하게 보정했어요' },

    // ── 기본 보정(방향) ──
    { test: /(자동\s*보정|자동보정|예쁘게|알아서\s*보정|한\s*번에)/, cmd: { type: 'adjust', set: { brightness: 12, saturation: 16, sharpness: 18, color: 6 } }, label: '빠른 자동 보정을 적용했어요' },
    { test: /(더\s*)?(밝게|환하게)|밝기\s*(올|높)/, cmd: { type: 'adjust', delta: { brightness: 25 } }, label: '밝기를 올렸어요' },
    { test: /(어둡게|어둡)|밝기\s*(낮|내)/, cmd: { type: 'adjust', delta: { brightness: -25 } }, label: '밝기를 낮췄어요' },
    { test: /(채도|색).*(올|높|진하|선명)|쨍하게/, cmd: { type: 'adjust', delta: { saturation: 25 } }, label: '채도를 올렸어요' },
    { test: /(채도|색).*(낮|내|연하|차분)/, cmd: { type: 'adjust', delta: { saturation: -25 } }, label: '채도를 낮췄어요' },
    { test: /(대비|뚜렷)\s*(올|높)?/, cmd: { type: 'adjust', delta: { contrast: 25 } }, label: '대비를 올렸어요' },
    { test: /(은은|대비\s*낮)/, cmd: { type: 'adjust', delta: { contrast: -25 } }, label: '대비를 낮췄어요' },
    { test: /(선명|또렷|샤프)\s*(하게|올|높)?/, cmd: { type: 'adjust', delta: { sharpness: 25 } }, label: '선명도를 올렸어요' },
    { test: /(부드럽게|소프트|뭉개)/, cmd: { type: 'adjust', delta: { sharpness: -25 } }, label: '부드럽게 했어요' },
    { test: /(따뜻|웜톤|노란빛|따숩)/, cmd: { type: 'adjust', delta: { color: 25 } }, label: '따뜻한 톤으로 맞췄어요' },
    { test: /(차갑|쿨톤|시원|푸른빛)/, cmd: { type: 'adjust', delta: { color: -25 } }, label: '시원한 톤으로 맞췄어요' },

    // ── 보정 되돌리기/초기화 (즉석 보정용, headless) ──
    { test: /(되돌려|이전으로|보정\s*취소|언두)/, cmd: { type: 'edit', action: '되돌리기' }, label: '한 단계 되돌렸어요' },
    { test: /(다시\s*실행|리두)/, cmd: { type: 'edit', action: '다시실행' }, label: '다시 실행했어요' },
    { test: /(보정\s*(초기화|지워|리셋))/, cmd: { type: 'edit', action: '초기화' }, label: '보정을 초기화했어요' },

    // ── 캡션(게시글) ──
    { test: /(게시글|캡션|문구).*(초기화|지워|리셋)/, cmd: { type: 'capvar', variant: 'reset' }, label: '게시글을 초기화했어요' },
    { test: /(더\s*길게|길게\s*(써|해)|분량\s*(늘|많))/, cmd: { type: 'capvar', variant: 'long' }, label: '더 길게 다시 썼어요' },
    { test: /(짧게|간결|줄여)/, cmd: { type: 'capvar', variant: 'short' }, label: '짧게 다시 썼어요' },
    { test: /(해시태그|태그).*(더|많이|추가)/, cmd: { type: 'capvar', variant: 'hashtags' }, label: '해시태그를 더 가져왔어요' },
    { test: /(인스타스럽게|인스타\s*(말투|느낌|st|스타일))/, cmd: { type: 'capvar', variant: 'insta' }, label: '인스타 말투로 다시 썼어요' },
    { test: /(게시글|캡션|문구).*(다시|새로|재생성)|(다시)\s*(써|생성|만들)/, cmd: { type: 'capvar', variant: 'regen' }, label: '게시글을 다시 만들었어요' },
    // [잇비 이어받기] 작업실 열린 상태에서 "이어서/계속/방금 사진 게시글" → 진행 중 draft의 시술내용을 이어받아 캡션.
    { test: /(이어서|계속|방금\s*(사진|것|거)?).*(게시글|캡션|글|문구)|(이어서|계속)\s*(써|쓰|만들|생성)/, cmd: function (_q) {
      var out = { type: 'caption' };
      try {
        var slot = (window.WorkspaceFlow && typeof window.WorkspaceFlow.getActiveSlot === 'function') ? window.WorkspaceFlow.getActiveSlot() : null;
        if (slot && slot.service) out.service = slot.service;   // 진행 중 작업실 시술내용 이어받기
      } catch (_e) { void _e; }
      return out;
    }, label: '이어서 게시글을 만들고 있어요' },
    { test: /(게시글|캡션|문구).*(만들|써|생성|작성)/, cmd: function (q) {
      var out = { type: 'caption' };
      var m = q.match(/(.+?)\s*(으로|로)?\s*(게시글|캡션|문구)\s*(써|쓰|작성|만들|생성)/);
      var svc = m && m[1] ? m[1].replace(/(으로|로|을|를)$/, '').trim() : '';
      if (svc && !/^(이|그|저|새|다시)$/.test(svc)) out.service = svc;   // 시술명/키워드를 말에서 추출
      var sit = /신규|첫\s*방문|처음/.test(q) ? '신규 고객' : (/재방문|단골|또\s*오/.test(q) ? '재방문' : (/완성|시술\s*완료/.test(q) ? '시술 완성' : ''));
      if (sit) out.axes = { situation: sit };
      return out;
    }, label: '게시글을 만들고 있어요' },
  ];

  // [구조 통합 P2] 작업실이 "닫혀 있을 때" 자연어로 여는 명령 — 명시 발화만(작업실/게시글만)이라
  //   기존 잇비 사진모드(photo-mode, "사진 편집해줘"류)와 충돌 안 함.
  var OPEN_COMMANDS = [
    // [Phase 4 2026-07-20] "오늘 사진으로 게시글" — 오늘 로컬 갤러리 저장분을 모아 작업실에 주입(업로드 스킵).
    //   _collectToday 플래그는 tryOpen 이 async 로 처리(loadGalleryItems). flow.js 무수정, 공개 open 만 사용.
    { test: /오늘.*(사진|찍은|시술|작업).*(게시글|올려|만들|글\b|홍보)|오늘.*(거|것|한\s*거).*(게시글|올려|만들)/, cmd: { type: 'open', _collectToday: true }, label: null },
    { test: /작업실.*(전후|비포\s*애프터)|전후.*작업실/, cmd: { type: 'open', cat: 'ba' }, label: '작업실에서 전후 만들기를 열었어요' },
    { test: /작업실.*(후기|리뷰)|후기.*작업실/, cmd: { type: 'open', cat: 'review' }, label: '작업실에서 고객 후기 만들기를 열었어요' },
    { test: /작업실.*(이벤트|할인|혜택)/, cmd: { type: 'open', cat: 'event' }, label: '작업실에서 이벤트 만들기를 열었어요' },
    { test: /작업실.*(시술\s*자랑|자랑|완성컷|피드)/, cmd: { type: 'open', cat: 'flex' }, label: '작업실에서 시술 자랑 만들기를 열었어요' },
    // [버그수정 2026-07-06] "작업실 게시글 지워/삭제/보여줘"가 쓰기 화면으로 열리던 것 — 삭제·조회 동사면 미매칭.
    { test: /^(?=[\s\S]*작업실)(?=[\s\S]*(?:게시글|글|캡션|문구))(?![\s\S]*(?:지워|지울|삭제|없애|취소|초기화|리셋|보여\s*줘|알려\s*줘))[\s\S]*/, cmd: { type: 'open', textOnly: true, screen: 'caption' }, label: '작업실에서 게시글 쓰기를 열었어요' },
    // [2026-07-22] 닫힌 상태에서 꾸미기/누끼/편집 발화 → 현재 인스타식 편집기(ItdEditor)로 (채팅 사진 함께 투입).
    { test: /(스티커|이모지|데코|꾸며|꾸미|글씨\s*넣|글자\s*넣|텍스트\s*넣|그리기|그려|낙서|누끼|사진\s*편집|이미지\s*편집|편집기\s*열)/, cmd: { type: 'storyedit' }, label: '편집기를 열었어요' },
    { test: /작업실\s*(열어?\s*줘?|열기|시작|보여\s*줘?|들어가|가자|가\s*줘|이동|켜\s*줘?|만들|편집)/, cmd: { type: 'open' }, label: '작업실을 열었어요' },
    { test: /^작업실(로|에|좀)?\s*$/, cmd: { type: 'open' }, label: '작업실을 열었어요' },
    { test: /(게시글만|글만|문구만|캡션만)\s*(써|쓰|작성|만들|생성)/, cmd: { type: 'open', textOnly: true, screen: 'caption' }, label: '게시글 쓰기를 열었어요' },
  ];

  function _toast(m) { if (m && window.showToast) window.showToast(m); }
  function _flowOpen() {
    try { return !!(window.WorkspaceFlow && window.WorkspaceFlow.isOpen && window.WorkspaceFlow.isOpen()); }
    catch (_e) { return false; }
  }

  function _roleFrom(q) {
    var t = String(q || '');
    if (/후\s*사진|애프터|after/i.test(t)) return 'after';
    if (/전\s*사진|비포|before/i.test(t)) return 'before';
    return '';
  }

  // [Phase 4] 오늘(자정 이후) 로컬 갤러리에 저장된 시술 사진들의 dataUrl 을 최대 max 장 수집.
  //   daily-briefing.js 의 loadGalleryItems + savedAt 컷오프 패턴과 동일. 없으면 [].
  function _collectTodayPhotos(max) {
    try {
      if (typeof window.loadGalleryItems !== 'function') return Promise.resolve([]);
      var s = new Date(); s.setHours(0, 0, 0, 0);
      var cutoff = s.getTime();
      return window.loadGalleryItems().then(function (all) {
        var urls = [];
        (all || []).forEach(function (it) {
          if (!it || (it.savedAt || 0) < cutoff) return;   // savedAt desc 정렬이지만 전량 필터(안전)
          (it.photos || []).forEach(function (p) { if (p && p.dataUrl) urls.push(p.dataUrl); });
        });
        return urls.slice(0, max || 10);   // open 의 photoUrls 는 10장 상한(flow.js:4143)
      }).catch(function () { return []; });
    } catch (_e) { return Promise.resolve([]); }
  }

  // [Phase 4] "오늘 사진" 명령 — async 수집 후 open. tryOpen 은 이미 true 를 돌려주고 여기서 뒤늦게 연다.
  function _openWithTodayPhotos(baseCmd) {
    var base = Object.assign({}, baseCmd);
    delete base._collectToday;               // 내부 플래그는 flow 로 넘기지 않음
    _collectTodayPhotos(10).then(function (urls) {
      if (urls && urls.length) {
        base.photoUrls = urls;
        _toast('오늘 사진 ' + urls.length + '장으로 작업실을 열었어요');
      } else {
        _toast('오늘 저장된 사진이 없어요. 사진을 올려 시작해 주세요.');
      }
      try { window.WorkspaceFlow.command(base); } catch (_e) { void _e; }
    });
  }
  // 닫힌 작업실을 자연어로 연다. 명시 발화만 처리, 아니면 false(기존 파이프라인으로 통과).
  function tryOpen(input, q, deps) {
    var text = String(q || (input && input.value) || '').trim();
    if (!text || !window.WorkspaceFlow || typeof window.WorkspaceFlow.command !== 'function') return false;
    if (_flowOpen()) return false;   // 이미 열려 있으면 in-flow(tryRun)에 맡김
    // 잇비 채팅에 올린 사진이 있으면 작업실로 함께 투입(게시글만 흐름 제외).
    var photoUrls = null;
    try {
      if (window.ItdasySourceImage && typeof window.ItdasySourceImage.resolve === 'function') {
        var src = window.ItdasySourceImage.resolve();
        if (src && src.dataUrl) photoUrls = [src.dataUrl];
      }
    } catch (_e) { photoUrls = null; }
    for (var i = 0; i < OPEN_COMMANDS.length; i++) {
      var c = OPEN_COMMANDS[i];
      if (!c.test.test(text)) continue;
      // [Phase 4] "오늘 사진" 은 async 수집 후 열기 — 입력창은 비우고 즉시 handled 반환.
      if (c.cmd && c.cmd._collectToday) {
        _openWithTodayPhotos(c.cmd);
        if (deps && typeof deps.clearInput === 'function') deps.clearInput(input);
        else if (input) input.value = '';
        return true;
      }
      var ocmd = Object.assign({}, c.cmd);
      if (photoUrls && !ocmd.textOnly) ocmd.photoUrls = photoUrls;
      try { window.WorkspaceFlow.command(ocmd); }
      catch (_e2) { return false; }
      if (deps && typeof deps.clearInput === 'function') deps.clearInput(input);
      else if (input) input.value = '';
      _toast(c.label);
      return true;
    }
    return false;
  }

  // 자연어 1건 처리. 작업실 열려 있고 명령 매칭 시 실행 → {handled, message}. 아니면 {handled:false}.
  function run(text) {
    var q = String(text == null ? '' : text).trim();
    if (!q || !_flowOpen() || !window.WorkspaceFlow || typeof window.WorkspaceFlow.command !== 'function') return { handled: false };
    for (var i = 0; i < COMMANDS.length; i++) {
      var c = COMMANDS[i];
      if (!c.test.test(q)) continue;
      var cmd = typeof c.cmd === 'function' ? c.cmd(q) : c.cmd;
      if (!cmd) continue;
      if (cmd.type === 'adjust') {
        var role = _roleFrom(q);
        if (role) cmd = Object.assign({}, cmd, { targetRole: role });
      }
      var res;
      try { res = window.WorkspaceFlow.command(cmd); }
      catch (_e) { res = { ok: false, reason: 'error' }; }
      if (res && res.ok) return { handled: true, message: c.label || '' };
      // 명령은 맞았지만 현재 단계에서 불가(예: 캡션 화면 아님) → 안내만, 가로채지 않음.
      return { handled: false, reason: (res && res.reason) || 'failed' };
    }
    return { handled: false };
  }

  // 잇비 _send 체인용 래퍼 — 처리 시 입력창 비우고 true.
  function tryRun(input, q, deps) {
    var text = String(q || (input && input.value) || '').trim();
    var r = run(text);
    if (!r.handled) return false;
    if (deps && typeof deps.clearInput === 'function') deps.clearInput(input);
    else if (input) input.value = '';
    _toast(r.message);
    return true;
  }

  window.ItdasyWorkspaceNL = { run: run, tryRun: tryRun, tryOpen: tryOpen, COMMANDS: COMMANDS, OPEN_COMMANDS: OPEN_COMMANDS };
})();
