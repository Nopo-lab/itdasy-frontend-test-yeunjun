/* 뷰티 템플릿 팩 — 데이터 전용 (BP-2, 2026-06-09)

   업로드 레퍼런스를 editable 캔버스 템플릿으로 재현하기 위한 TOP3 메타데이터.
   - 이 파일은 "데이터"만 소유한다(렌더 X / 연결 X).
   - market-data.js 가 window.PhotoEditorBeautyPackData.TEMPLATES 를 읽어 "조회(lookupById/v3ById)"
     리스트에만 합류시킨다(갤러리 visibleTemplates 에는 미노출 = apply-only).
   - 렌더는 template-renderer-beauty-pack.js(window.PhotoEditorBeautyPack)가, 매핑은 premium-templates META 가 담당.
   - 좌표/카피 고퀄 튜닝은 BP-3. 현재(BP-2)는 skeleton 검증용 메타데이터.

   엔트리 형태(= V3_TOP5 와 동일 키 + 선택 키):
     { id, cat, tier, label, kind, industry, accent, prefillText, palette{bg,ink,sub,accent,line,badge},
       ratio, defaultCopy{...}(BP-3에서 사용, 현재 inert), previewMeta{decor[],photoSlots[]} }

   참고: apply 시 slotValues 는 template-slots.getDefaultValues(kind 기반)에서 생성된다(defaultCopy 미사용).
        그래서 BP-2 에서는 defaultCopy 가 inert 여도 가격/후기/전후 기본 카피로 skeleton 이 의미있게 그려진다.
*/
(function () {
  'use strict';
  if (window.PhotoEditorBeautyPackData) return;

  var TEMPLATES = [
    {
      id: 'bp-price-blackgold', cat: 'price', tier: 'free',
      label: '가격표 · 블랙골드 프리미엄', kind: 'price', purpose: 'price', industry: 'skin',
      accent: 'gold', prefillText: 'PREMIUM CARE', ratio: '4:5',
      palette: { bg: '#14110E', ink: '#F3E9D6', sub: '#B9A98C', accent: '#C9A24B', line: '#3A3024', badge: '#C9A24B' },
      previewMeta: { decor: ['gold-emblem', 'diamond-divider', 'ribbon-badge', 'gold-pill', 'light-streak'], photoSlots: ['main'] },
      // [BP-3] 레퍼런스(⑲ 에끌레르) 카피로 채움 — 현재 inert.
      defaultCopy: {
        shop_name: '에끌레르 에스테틱', shop_name_en: 'ÉCLAT ESTHETIC',
        headline: '프리미엄 케어 프로그램', subtitle: '고객 맞춤 집중 관리',
        services: [
          { name: '리프팅 탄력 케어', desc: '탄탄한 인상을 위한 집중 탄력 관리', origPrice: '220,000원', price: '189,000원', badge: 'PREMIUM' },
          { name: '수분 광채 케어', desc: '촉촉하고 맑은 윤기를 살리는 보습 관리', origPrice: '', price: '129,000원' },
          { name: '문제성 진정 관리', desc: '예민한 피부를 차분하게 정돈하는 밸런싱', origPrice: '', price: '149,000원' },
          { name: '화이트 브라이트 케어', desc: '환하고 깨끗한 인상을 위한 톤 정리', origPrice: '', price: '159,000원' },
        ],
        cta: '카카오 예약', phone: '예약 문의 010-9876-4321',
      },
    },
    {
      id: 'bp-ba-nail-polaroid', cat: 'ba', tier: 'free',
      label: '시술 전후 · 네일 SNS 폴라로이드', kind: 'before_after', purpose: 'before_after', industry: 'nail',
      accent: 'primary', prefillText: 'Before & After', ratio: '4:5',
      palette: { bg: '#FCDDE9', ink: '#4A3B3B', sub: '#9B7E86', accent: '#F2789F', line: '#F6D3DD', badge: '#EC4E86' },
      previewMeta: { decor: ['watercolor', 'sparkle', 'heart', 'polaroid', 'washi-tape', 'paperclip', 'torn-paper'], photoSlots: ['before', 'after'] },
      defaultCopy: {
        shop_name: '루미네일', shop_name_en: 'LUMI NAIL',
        headline: '전후 변화', headline_accent: '네일', subtitle: '손끝 분위기가 달라지는 순간 ♡',
        before_caption: '밋밋한 손끝,\n생기 없는 컬러 :(', after_caption: '',
        tags: ['컬러 정리', '광택 포인트', '손끝 무드 업 ↗'],
        cta: 'DM / 예약문의 ♡', footer_left: '예쁜 네일은 기분까지 빛나게 해줘요♥', footer_right: '오늘의 네일, 내일의 기분♥',
      },
    },
    {
      id: 'bp-ba-nail-pink-polaroid', cat: 'ba', tier: 'free',
      label: '시술 전후 · 네일 핑크 수채화 폴라로이드', kind: 'before_after', purpose: 'before_after', industry: 'nail',
      accent: 'primary', prefillText: 'Before & After', ratio: '4:5',
      palette: { bg: '#FCE9EE', ink: '#3F2C32', sub: '#A2868E', accent: '#F24E86', line: '#F6D3DD', badge: '#F24E86' },
      previewMeta: { decor: ['watercolor', 'sparkle', 'heart', 'polaroid', 'washi-tape', 'paperclip', 'torn-paper', 'speech-bubble'], photoSlots: ['before', 'after'] },
      // [BP] 레퍼런스(루미네일 "네일 전후 변화") 카피 — 현재 inert(getDefaultValues 사용).
      defaultCopy: {
        shop_name: '루미네일', shop_name_en: 'LUMI NAIL',
        headline: '전후 변화', headline_accent: '네일', subtitle: '손끝 분위기가 달라지는 순간 ♡',
        before_caption: '밋밋한 손끝,\n생기 없는 컬러 :(', after_caption: 'AFTER',
        tags: ['컬러 정리', '광택 포인트', '손끝 무드 업 ↗'],
        cta: 'DM / 예약문의', footer_left: '예쁜 네일은 기분까지 빛나게 해줘요 ♥', footer_right: '오늘의 네일, 내일의 기분♡',
      },
    },
    {
      id: 'bp-review-lash-blue', cat: 'card', tier: 'free',
      label: '후기 · 속눈썹 블루 카드', kind: 'review', purpose: 'review', industry: 'lash',
      accent: 'primary', prefillText: 'REAL REVIEW', ratio: '4:5',
      palette: { bg: '#EAF1F8', ink: '#4E6E8E', sub: '#8A98A8', accent: '#6E93B4', line: '#DCE6F0', badge: '#6E93B4' },
      previewMeta: { decor: ['watercolor-flower', 'sparkle', 'soft-card', 'quote', 'stars', 'line-icon'], photoSlots: ['main'] },
      defaultCopy: {
        shop_name: '모어래쉬', shop_name_en: 'MORE LASH',
        headline: '속눈썹 후기', subtitle: '또렷하고 자연스러운 눈매 변화',
        review_text: '원하던 느낌을 정확히 잡아주셔서 너무 만족했어요. 과하지 않게 또렷해 보여서 데일리로 딱 좋아요.',
        customer_label: '서연님', service_name: '속눈썹 펌', date: '2026.06', rating: 5,
        thanks: '소중한 후기 감사합니다. ♡', cta: '상담 / 예약',
      },
    },
    {
      id: 'bp-ba-skin-acne-pink', cat: 'ba', tier: 'free',
      label: '시술 전후 · 여드름 케어 핑크', kind: 'before_after', purpose: 'before_after', industry: 'skin',
      accent: 'primary', prefillText: 'Before & After', ratio: '4:5',
      palette: { bg: '#FCE9EF', ink: '#4A3A40', sub: '#B98A99', accent: '#F24E86', line: '#F6D3DD', badge: '#F24E86' },
      previewMeta: { decor: ['watercolor', 'sparkle', 'heart', 'rounded-card', 'arrow', 'review-card', 'hashtags'], photoSlots: ['before', 'after'] },
      // [BP] 레퍼런스(여드름 케어 2주 집중관리) — headline/subtitle/before·after_label·caption/cta 는 시트 편집,
      //   나머지(headline_accent/badge/hashtags/review_*/profile_handle/top_sticker)는 defaultCopy 고정 카피.
      defaultCopy: {
        headline: '여드름 케어', headline_accent: '전후',
        subtitle: '깨끗한 피부, 자신감 UP!',
        badge: '2주 집중 관리 결과',
        hashtags: ['#여드름진정', '#피부결개선', '#민감성피부OK', '#자신감회복'],
        before_label: 'BEFORE', after_label: 'AFTER',
        before_caption: '붉은 트러블·울퉁불퉁한 결', after_caption: '피부 진정·매끈해진 결',
        review_quote: '화장 밀림이 줄었어요!',
        review_body: '평소 트러블 때문에 화장도 잘 안 먹고 스트레스였는데, 2주 만에 피부가 진정되고 결이 매끈해졌어요!',
        profile_handle: '@softglow_skin', top_sticker: '맑고 깨끗한 피부로!',
        cta: '피부 변화 직접 경험',
      },
    },
    {
      id: 'bp-ba-hair-extension-polaroid', cat: 'ba', tier: 'free',
      label: '시술 전후 · 붙임머리 폴라로이드', kind: 'before_after', purpose: 'before_after', industry: 'hair',
      accent: 'primary', prefillText: 'Before & After', ratio: '4:5',
      palette: { bg: '#EFE6F6', ink: '#2E2A36', sub: '#9B8AA8', accent: '#F24E86', line: '#E6DCEC', badge: '#A678C8' },
      previewMeta: { decor: ['watercolor', 'sparkle', 'heart', 'polaroid', 'ribbon', 'best-badge', 'chip', 'arrow'], photoSlots: ['before', 'after'] },
      // [BP] 레퍼런스(붙임머리 전후 BEST) — headline/subtitle/before·after_label·caption/cta 는 시트 편집,
      //   나머지(headline_accent/shop_label/best_badge/ribbon/tags/bottom_memo/footer)는 defaultCopy 고정 카피.
      defaultCopy: {
        headline: '붙임머리', headline_accent: '전후',
        subtitle: '자연스럽게 길어지고, 예뻐지는 마법',
        shop_label: '#HAIR EXTENSION',
        best_badge: 'BEST', ribbon: '볼륨감이 달라지는 순간',
        before_label: 'BEFORE', after_label: 'AFTER',
        before_caption: '밋밋하고 힘없는 모발', after_caption: '풍성하고 자연스러운 볼륨',
        tags: ['자연스러운 연결', '풍성한 볼륨감', '긴머리 변신 완성'],
        bottom_memo: '나에게 딱 맞는 디자인으로 인생머리 완성!',
        footer: 'YOUR BEAUTY, OUR PASSION', cta: '상담 가능',
      },
    },
    {
      id: 'bp-event-spring-mixed', cat: 'price', tier: 'free',
      label: '이벤트 · 봄 시즌 (가격+혜택 믹스)', kind: 'price', purpose: 'price', industry: 'hair',
      accent: 'pink', prefillText: 'SPRING EVENT', ratio: '4:5',
      palette: { bg: '#FBE9EE', ink: '#2A2230', sub: '#8A7580', accent: '#EC4E86', line: '#F3D9E2', badge: '#EC4E86' },
      previewMeta: { decor: ['news-collage', 'brush', 'heart', 'star', 'polaroid', 'washi-tape', 'kraft-note', 'tulip', 'icon-box'], photoSlots: ['main'] },
      // [BP-6] 레퍼런스(봄 시즌 이벤트 · Beauty Room) — services/main_photo 는 시트 편집(kind=price 스키마),
      //   나머지 장식문구(hashtag/headline/sub_banner/benefits/cta 등)는 draw 함수의 한글 기본값으로 렌더(시트 미편집).
      defaultCopy: {
        shop_label: 'BEAUTY ROOM', shop_sub: 'HAIR SALON',
        hashtag: '#봄맞이 변신은 지금이 기회!',
        headline_top: '봄 시즌', headline_bottom: '이벤트',
        sub_banner: '설레는 봄, 예뻐질 시간',
        sub1: '다가오는 봄, 스타일로 꽃 피워보세요.', sub2: '지금이 가장 예뻐질 타이밍!',
        services: [
          { name: '염색', price: '120,000~', desc: '디자인 염색 / 탈색 별도' },
          { name: '클리닉', price: '90,000', desc: '모발케어 맞춤 클리닉' },
          { name: '커트', price: '30,000', desc: '디자인 커트' },
          { name: '붙임머리', price: '상담 문의', desc: '자연스러운 변신, 맞춤 상담' },
        ],
        benefit_title: 'EVENT 혜택',
        benefits: ['시술 시 홈케어 샘플 증정', '리뷰 작성 시 10% 할인', '신규 고객 10% 할인'],
        cta: '예약은 프로필 링크 / DM',
      },
    },
  ];

  window.PhotoEditorBeautyPackData = { VERSION: 'bp-2026060902', TEMPLATES: TEMPLATES };
  if (typeof module !== 'undefined' && module.exports) module.exports = window.PhotoEditorBeautyPackData;
})();
