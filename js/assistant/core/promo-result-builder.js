/* 잇비 홍보 결과 카드 데이터 빌더 */
(function () {
  'use strict';
  if (window.ItdasyPromoResultBuilder) return;

  function _recipeFromText(text, preset) {
    const t = String(text || '');
    if (/(네일|손톱|젤네일|패디)/.test(t) || preset === 'nail') return 'nail_focus';
    if (/(헤어|머리|모발|펌|염색|컬러)/.test(t) || preset === 'hair') return 'hair_focus';
    if (/(속눈썹|래쉬|연장)/.test(t) || preset === 'lash') return 'lash_focus';
    if (/(메이크업|화장|입술|눈가)/.test(t)) return 'glam';
    return 'natural';
  }

  function _caption(recipeId) {
    const C = window.ItdasyPromoPhotoChain;
    if (C && typeof C.buildPromoCaptionDraft === 'function') return C.buildPromoCaptionDraft(recipeId);
    return '시술 결과가 잘 보이도록 자연스럽게 정리한 사진이에요. 예약 문의 주세요.';
  }

  function _effect(recipeId) {
    const C = window.ItdasyPromoPhotoChain;
    if (C && typeof C.buildPromoEffectText === 'function') return C.buildPromoEffectText(recipeId);
    return '홍보용으로 자연스럽게 정리했어요.';
  }

  function _industry(recipeId) {
    const C = window.ItdasyPromoPhotoChain;
    if (C && typeof C.buildPromoIndustryLabel === 'function') return C.buildPromoIndustryLabel(recipeId);
    return '뷰티';
  }

  function _templateRecos(text, ctx) {
    const C = window.ItdasyPromoPhotoChain;
    if (C && typeof C.buildPromoTemplateRecos === 'function') return C.buildPromoTemplateRecos(text, ctx);
    return [];
  }

  function _actions(ctx, recipeId, caption, recos, dataUrl) {
    const C = window.ItdasyPromoPhotoChain;
    if (C && typeof C.buildPromoActions === 'function') return C.buildPromoActions(ctx, recipeId, caption, recos, dataUrl);
    return [];
  }

  function fromAutoEdit(opts) {
    const result = opts && opts.result;
    if (!result || !result.dataUrl) return null;
    const question = opts.question || '';
    const ctx = { currentCustomer: opts.customerCtx || null };
    const recipeId = _recipeFromText(question, opts.preset);
    const caption = _caption(recipeId);
    const recos = _templateRecos(question, ctx);
    return {
      text: '',
      photoResult: { dataUrl: result.dataUrl, ratio: result.ratio || '4:5', preset_label: result.preset_label || '' },
      promoResult: {
        recipeId, caption, templateRecos: recos,
        industryLabel: _industry(recipeId), effect: _effect(recipeId),
        afterDataUrl: result.dataUrl,
        customerName: (ctx.currentCustomer && ctx.currentCustomer.name) || '',
      },
      hubActions: _actions(ctx, recipeId, caption, recos, result.dataUrl),
    };
  }

  window.ItdasyPromoResultBuilder = { fromAutoEdit };
})();
