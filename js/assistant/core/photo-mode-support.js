/* 잇비 사진편집 모드 공통 도우미
   옛 photo-chain 의 문구/추천/버튼 조각만 재사용하고, 즉시 실행 흐름은 만들지 않는다. */
(function () {
  'use strict';
  if (window.ItdasyPhotoModeSupport) return;

  /* [잇비 전수QA 2026-09-11 · P1] 둘째 갈래의 **뒤 그룹이 전부 `?` 였다.**

     그래서 `(전후|…|후기|리뷰)` 다음에 아무것도 없어도 매칭된다 = 문장에 '리뷰'·'후기'·'전후'
     라는 **단어만 있으면** 사진편집 모드가 시작됐다. 실측(실 Chrome, 배포본 6926ff0):
       "리뷰 현황 어때?" → 잇비가 닫히고 **작업실 사진 업로드 화면**이 열린다.
       "전후 고객 몇 명이야?" 도 같다. `shouldStart` 6개 중 5개가 조회 질문인데 전부 true 였다.
     그 바람에 백엔드의 `review_status` 즉답은 **채팅에서 도달 자체가 불가능**했다.

     고친 방식: 목적 명사(사진/카드/템플릿) **또는** 생성 동사(만들/해줘/…) 중
     하나는 반드시 있어야 한다. "후기 카드"·"리뷰 만들어줘" 는 그대로 들어가고,
     "리뷰 현황 어때?" 는 이제 백엔드로 간다. */
  var START_RE = /(사진|이미지|포토|촬영본).*(편집|만들|꾸미|시켜|보정|수정|홍보|예쁘|카드|전후|후기|리뷰|인스타|sns|피드|스토리|캡션|문구|해시\s*태그|올릴|게시)|(전후|비포\s*애프터|before\s*after|후기|리뷰)\s*(?:(?:사진|카드|템플릿)|(?:만들|해줘|뽑아|꾸며|보정|제작))/i;
  var CAPTION_RE = /(캡션|홍보\s*글|홍보글|해시\s*태그|문구|인스타\s*(글|피드\s*글)|sns\s*글)/i;
  // [qa-F] 인스타 '미리보기'(화면 띄우기) vs '인스타스럽게'(문구 톤 수정) 분리.
  //   미리보기는 명시적 단어가 있을 때만 — "인스타 미리보기/피드에서 보기/업로드 화면/올린 모습".
  //   "인스타스럽게·인스타 말투로·인스타 느낌으로"는 미리보기가 아니라 톤 수정이므로 false.
  var PREVIEW_RE = /(미리\s*보기|피드.*(보여|어떻게|모습|올린)|피드에서|업로드\s*(화면|모습)|올린\s*모습|올리면\s*어떻게|게시.*(화면|모습))/;
  var TONE_INSTA_RE = /인스타\s*(말투|스럽|식|느낌)/;
  // 사진편집 모드로 보내면 안 되는 의도(가격표/메뉴판/문자/DM/발송 + 영수증·매출 OCR).
  var BLOCK_RE = /(가격표|메뉴판|문자|디엠|\bdm\b|메시지|메세지|카톡|알림톡|발송|영수증|매출|정산)/i;

  var EFFECT = {
    nail_focus: '손끝 라인과 광택이 사진에서 더 또렷해 보이도록 정리했어요.',
    hair_focus: '머릿결 윤기와 전체 분위기를 자연스럽게 살렸어요.',
    lash_focus: '눈매가 더 또렷해 보이도록 디테일을 정리했어요.',
    natural: '피부결과 톤을 과하지 않게 정리했어요.',
    glam: '입술·눈가 색감이 사진에서 자연스럽게 살아나도록 정리했어요.',
    brow_focus: '눈썹 라인이 사진에서 또렷해 보이도록 정리했어요.',
    lip_focus: '입술 색감이 사진에서 자연스럽게 살아나도록 정리했어요.',
  };
  var INDUSTRY = {
    nail_focus: '네일', hair_focus: '헤어', lash_focus: '속눈썹',
    natural: '피부', glam: '메이크업', brow_focus: '눈썹', lip_focus: '메이크업',
  };

  function isExcluded(text) { return BLOCK_RE.test(String(text || '')); }

  // [qa-F] 명시적 인스타 미리보기 요청인지. "인스타스럽게/말투/느낌"(톤 수정)은 false.
  function looksPreviewRequest(text) {
    var t = String(text || '');
    if (TONE_INSTA_RE.test(t) && !PREVIEW_RE.test(t)) return false;   // 톤 수정 단독은 미리보기 아님
    return PREVIEW_RE.test(t);
  }

  function shouldStart(text, opts) {
    var q = String(text || '').trim();
    if (isExcluded(q)) return false;        // 가격표/메뉴판/문자/DM/발송/영수증·매출 차단
    // [이슈1/6] 사진이 함께 올라오면(차단어 아닌 한) 사진편집 모드로 일원화 — 텍스트 동사 유무 무관.
    //   레거시 BA(전후) 흐름이 사진을 가로채 "전 사진 사라짐"·"처음으로 돌아감" 나던 동선을 제거.
    if (opts && opts.hasPhoto) return true;
    if (!q) return false;
    return START_RE.test(q);                // 텍스트 단독은 명사+동사(START_RE) 필요
  }

  function recipeFromText(text, preset) {
    var t = String(text || '');
    if (/(네일|손톱|젤네일|패디)/.test(t) || preset === 'nail') return 'nail_focus';
    if (/(헤어|머리|모발|펌|염색|컬러|붙임머리)/.test(t) || preset === 'hair') return 'hair_focus';
    if (/(속눈썹|래쉬|연장)/.test(t) || preset === 'lash') return 'lash_focus';
    if (/(메이크업|화장|입술|눈가)/.test(t)) return 'glam';
    if (/(눈썹|반영구)/.test(t)) return 'brow_focus';
    return 'natural';
  }

  function buildCaptionDraft(recipeId) {
    var P = window.ItdasyMarketingDraftPolicy;
    if (P && typeof P.caption === 'function') return P.caption(recipeId);
    return '시술 결과가 잘 보이도록 자연스럽게 정리한 사진이에요. 편하게 둘러보고 마음에 드시면 예약 문의 주세요.';
  }

  function buildTemplateRecos(text, ctx) {
    try {
      var MD = window.PhotoEditorTemplateMarketData;
      if (MD && typeof MD.recommendTemplates === 'function') {
        return MD.recommendTemplates(text, ctx, 3).map(function (t) { return t.id; });
      }
    } catch (_e) { void 0; }
    return ['ba-cream', 'feed-showcase', 'feed-review'].slice(0, 3);
  }

  function buildEffectText(recipeId) { return EFFECT[recipeId] || '홍보용으로 자연스럽게 정리했어요.'; }

  function buildIndustryLabel(recipeId) { return INDUSTRY[recipeId] || '뷰티'; }

  function buildActions(ctx, recipeId, caption, recoIds, dataUrl) {
    var cust = ctx && ctx.currentCustomer;
    var retouchText = cust && cust.name
      ? cust.name + '님 리터치 안내 문구까지 만들어줘'
      : '고객 리터치 안내 문구까지 만들어줘';
    var acts = [
      { id: 'ig_preview', kind: 'open_instagram', label: '인스타 미리보기', phase: 'safe', payload: { caption: caption, dataUrl: dataUrl } },
      { id: 'export', kind: 'export_image', label: '내보내기', phase: 'safe', payload: { dataUrl: dataUrl } },
      { id: 'pe_template', kind: 'open_template_panel', label: '템플릿 보기', phase: 'safe', payload: { recommendedIds: recoIds || [], dataUrl: dataUrl } },
      { id: 'save_customer', kind: 'save_photo_to_customer', label: '고객기록에 저장', phase: 'confirm', payload: { customerName: (cust && cust.name) || '' } },
      { id: 'retouch_draft', kind: 'chat_suggest', label: '리터치 안내 초안', phase: 'safe', payload: { text: retouchText } },
    ];
    return (window.ItdasyActionHub && window.ItdasyActionHub.normalizeActions)
      ? window.ItdasyActionHub.normalizeActions(acts, 'hub') : acts;
  }

  window.ItdasyPhotoModeSupport = {
    START_RE: START_RE,
    CAPTION_RE: CAPTION_RE,
    PREVIEW_RE: PREVIEW_RE,
    isExcluded: isExcluded,
    looksPreviewRequest: looksPreviewRequest,
    shouldStart: shouldStart,
    recipeFromText: recipeFromText,
    buildCaptionDraft: buildCaptionDraft,
    buildTemplateRecos: buildTemplateRecos,
    buildEffectText: buildEffectText,
    buildIndustryLabel: buildIndustryLabel,
    buildActions: buildActions,
  };
})();
