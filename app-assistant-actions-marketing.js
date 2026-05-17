/* AI 비서 — 마케팅·고객 케어 액션 kind 8종 등록
   2026-05-17 v166 · 뷰티업GPT 초고도화 P0 티켓 0-2
   설계 문서: ~/.claude/plans/zesty-snacking-clarke.md §4.2

   목적: app-assistant.js의 CATEGORY/invalidate 매핑에 신규 kind 8종을 외부 등록.
   본체(179KB)를 더 부풀리지 않기 위해 별도 모듈로 분리.

   동작 보장:
   - app-assistant.js가 먼저 로드되어 window.ItdasyAssistant 노출 (index.html defer 순서)
   - 이 파일은 그 뒤에 로드되어 registerKindMeta + registerInvalidateKinds 호출
   - 카드 UI는 app-assistant.js의 _catMeta(kind)가 자동으로 CATEGORY에서 메타를 가져와 렌더

   각 kind는 payload 모양만 백엔드와 합의해 두고, execute 핸들러는 백엔드(staging)에 별도 구현.
   백엔드 미구현 상태에서는 POST /assistant/execute가 400/404를 던지며
   기존 app-assistant.js의 _runAction이 "실패: ..." 메시지로 친절히 표시함. */
(function () {
  'use strict';

  function _wait(cb, tries) {
    if (window.ItdasyAssistant && typeof window.ItdasyAssistant.registerKindMeta === 'function') {
      cb();
      return;
    }
    if (tries > 50) return; // 5s 이상이면 포기 (assistant 로드 실패 케이스)
    setTimeout(() => _wait(cb, tries + 1), 100);
  }

  _wait(_register, 0);

  // ──────────── CATEGORY 메타 (icon · label · color) ────────────
  // icon은 index.html의 <symbol id="ic-*"> sprite에 존재하는 것만 사용.
  // color 톤 — silent(파랑·그린), confirm(주황), 확인카드(빨강·핫핑크).
  const KIND_META = {
    draft_message:           { icon: 'ic-pen-line',      label: '메시지 초안', color: '#0EA5E9' },
    send_message:            { icon: 'ic-send',          label: '메시지 발송', color: '#DC3545' },
    create_treatment_record: { icon: 'ic-check-circle',  label: '시술 기록',   color: '#15803D' },
    apply_photo_enhance:     { icon: 'ic-wand-sparkles', label: '사진 보정',   color: '#A78BFA' },
    remove_bg_and_swap:      { icon: 'ic-scissors',      label: '배경 교체',   color: '#7C3AED' },
    make_before_after:       { icon: 'ic-layers',        label: '전·후 카드',  color: '#2B8C7E' },
    draft_caption:           { icon: 'ic-sparkles',      label: '캡션 초안',   color: '#F18091' },
    publish_instagram:       { icon: 'ic-upload',        label: '인스타 게시', color: '#DC3545' },
    // P0-PE (사진 편집기, 2026-05-17 v167)
    open_photo_editor:       { icon: 'ic-sliders-horizontal', label: '편집기 열기', color: '#F18091' },
    apply_photo_preset:      { icon: 'ic-wand-sparkles', label: '자동 보정',    color: '#A78BFA' },
    adjust_photo:            { icon: 'ic-sliders-horizontal', label: '수동 보정', color: '#A78BFA' },
    add_text_overlay:        { icon: 'ic-pen-line',      label: '텍스트 추가',  color: '#0EA5E9' },
    add_watermark:           { icon: 'ic-badge',         label: '워터마크',     color: '#0EA5E9' },
    export_marketing_image:  { icon: 'ic-upload',        label: '편집본 저장',  color: '#15803D' },
    // P0-CHATBOT-SHORTCUT (v175, 2026-05-18) — 챗봇 사진+텍스트 즉시 진입 트리오
    attach_photo_to_customer:        { icon: 'ic-image-plus', label: '고객 사진 첨부',     color: '#15803D' },
    analyze_photo_and_recommend_edit:{ icon: 'ic-sparkles',   label: '사진 분석',          color: '#A78BFA' },
    prepare_instagram_post_bundle:   { icon: 'ic-upload',     label: '인스타 게시 묶음',   color: '#DC3545' },
  };

  // ──────────── invalidate 매핑 (실행 후 화면 즉시 반영) ────────────
  // 키 토큰은 app-assistant.js의 _invalidateCachesFor가 'pv_cache::' + token으로 풀어씀.
  // 새 토큰: messages, treatments, portfolio, instagram_feed, content_calendar.
  // (실제 캐시 키가 없는 토큰은 removeItem이 noop이라 안전.)
  const INVALIDATE_MAP = {
    draft_message: [],
    send_message:            ['messages', 'customer', 'customers', 'today'],
    create_treatment_record: ['treatments', 'portfolio', 'customer', 'customers'],
    apply_photo_enhance:     ['portfolio'],
    remove_bg_and_swap:      ['portfolio'],
    make_before_after:       ['portfolio'],
    draft_caption:           [],
    publish_instagram:       ['instagram_feed', 'content_calendar'],
    // P0-PE (사진 편집기)
    open_photo_editor:       [],
    apply_photo_preset:      ['portfolio'],
    adjust_photo:            [],
    add_text_overlay:        [],
    add_watermark:           [],
    export_marketing_image:  ['portfolio'],
    // P0-CHATBOT-SHORTCUT (v175)
    attach_photo_to_customer:         ['treatments', 'portfolio', 'customer', 'customers'],
    analyze_photo_and_recommend_edit: [],
    prepare_instagram_post_bundle:    ['portfolio', 'instagram_feed', 'content_calendar'],
  };

  // app-assistant.js는 'itdasy:data-changed'만 발사함. 화면별로 더 세분화된 구독자
  // (갤러리·캡션·DM·인스타 피드 등)를 위해 piggyback 이벤트를 흘려보낸다.
  const EXTRA_EVENT = {
    send_message:            'itdasy:customer:activity-updated',
    create_treatment_record: 'itdasy:treatments:changed',
    apply_photo_enhance:     'itdasy:gallery:photo-replaced',
    remove_bg_and_swap:      'itdasy:gallery:photo-replaced',
    make_before_after:       'itdasy:gallery:ba-created',
    draft_caption:           'itdasy:caption:drafted',
    publish_instagram:       'itdasy:instagram:published',
    draft_message:           'itdasy:assistant:message-drafted',
    open_photo_editor:       'itdasy:editor:opened',
    apply_photo_preset:      'itdasy:gallery:photo-replaced',
    export_marketing_image:  'itdasy:gallery:photo-replaced',
    // P0-CHATBOT-SHORTCUT (v175)
    attach_photo_to_customer:         'itdasy:treatments:changed',
    analyze_photo_and_recommend_edit: 'itdasy:editor:opened',
    prepare_instagram_post_bundle:    'itdasy:instagram:published',
  };

  function _register() {
    window.ItdasyAssistant.registerKindMeta(KIND_META);
    window.ItdasyAssistant.registerInvalidateKinds(INVALIDATE_MAP);
    window.addEventListener('itdasy:data-changed', _onDataChanged);
  }

  function _onDataChanged(e) {
    const kind = e && e.detail && e.detail.kind;
    if (!kind || !(kind in INVALIDATE_MAP)) return;
    const extraEvent = EXTRA_EVENT[kind];
    if (!extraEvent) return;
    try {
      window.dispatchEvent(new CustomEvent(extraEvent, {
        detail: { kind, source: 'assistant', optimistic: !!e.detail.optimistic },
      }));
    } catch (_e) { void _e; }
  }
})();
