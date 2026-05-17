/* AI 비서 — 백엔드 미구현 kind 로컬 mock 핸들러
   2026-05-18 v168 · staging 손가락 검증용

   마케팅·콘텐츠 액션 kind들이 등록은 됐지만 백엔드 /assistant/execute 핸들러가
   아직 없어 실행 시 400/404 실패. 흐름 체감을 위해 프론트 로컬 mock으로 "보낸 척"
   응답 + "[테스트]" 토스트.

   app-assistant.js의 registerLocalHandler API 사용 (본체 0줄 수정).
   로드 순서 보장: _wait 폴링 (app-assistant-actions-marketing.js 패턴).
   OCR 관련 kind는 건드리지 않음. 기존 18 kind 영향 0. */
(function () {
  'use strict';

  function _wait(cb, tries) {
    if (window.ItdasyAssistant && typeof window.ItdasyAssistant.registerLocalHandler === 'function') {
      cb();
      return;
    }
    if (tries > 50) return; // 5s 이상이면 포기
    setTimeout(() => _wait(cb, tries + 1), 100);
  }

  _wait(_registerAll, 0);

  // ──────────── 유틸 ────────────

  function _delay(ms) { return new Promise(r => setTimeout(r, ms)); }

  // 100~300ms 무작위 지연 — "실제 호출 같은" 체감.
  function _simLatency() { return _delay(100 + Math.floor(Math.random() * 200)); }

  function _toast(msg) {
    try { if (typeof window.showToast === 'function') window.showToast(msg); }
    catch (_e) { void _e; }
  }

  function _mockUndoId() { return 'mock-' + Date.now(); }

  // 고객 이름 조회 — payload.customer_name 우선, 없으면 CustomerCache에서 customer_id 매칭.
  function _resolveCustomerName(payload) {
    const p = payload || {};
    if (p.customer_name && String(p.customer_name).trim()) return String(p.customer_name).trim();
    if (p.name && String(p.name).trim()) return String(p.name).trim();
    const id = p.customer_id;
    if (!id) return '고객';
    try {
      const items = window.CustomerCache && typeof window.CustomerCache.get === 'function'
        ? window.CustomerCache.get()
        : null;
      if (Array.isArray(items)) {
        const hit = items.find(c => c && (c.id === id || String(c.id) === String(id)));
        if (hit && (hit.name || hit.customer_name)) return hit.name || hit.customer_name;
      }
    } catch (_e) { void _e; }
    return '고객';
  }

  // PhotoEditor 가용성 — open / 인스턴스 메서드 체크.
  function _hasPhotoEditor() {
    return !!(window.PhotoEditor && typeof window.PhotoEditor.open === 'function');
  }

  // ──────────── 메시지 초안 템플릿 ────────────
  // tone 기반 1~2 문장. {name} 치환.
  const DRAFT_TEMPLATES = {
    warm_checkin:
      '{name}님, 잘 지내고 계세요? 오랜만에 안부 드려요. 편하실 때 한 번 들러주세요. 💗',
    retouch_offer:
      '{name}님, 시술 후 한 달 가까이 됐어요. 리터치 시기인데 편하실 때 들러주세요.',
    vip_thanks:
      '{name}님 항상 찾아주셔서 감사해요. 다음 방문 때 더 정성껏 케어해드릴게요.',
    birthday:
      '{name}님 오늘 생일 축하드려요 🎉 곧 뵙길 바라요.',
  };

  function _draftFor(tone, name) {
    const tpl = DRAFT_TEMPLATES[tone]
      || '{name}님께 보낼 안부 메시지를 준비했어요. 편집해서 보내주세요.';
    return tpl.replace(/\{name\}/g, name || '고객');
  }

  // ──────────── 개별 mock 핸들러 ────────────

  async function _mockDraftMessage(action) {
    await _simLatency();
    const p = (action && action.payload) || {};
    const name = _resolveCustomerName(p);
    const tone = (p.tone || '').toString();
    const draft = _draftFor(tone, name);
    return {
      message: '[테스트 모드] 메시지 초안을 만들었어요.\n\n---\n' + draft,
      message_draft: draft,
    };
  }

  async function _mockSendMessage(action) {
    await _simLatency();
    void action;
    _toast('📩 [테스트] 메시지 발송 시뮬레이션');
    return {
      message: '[테스트 모드] 메시지 발송 시뮬레이션. 백엔드 결선 후 실제 전송돼요.',
      undo_log_id: _mockUndoId(),
    };
  }

  async function _mockPublishInstagram(action) {
    await _simLatency();
    void action;
    _toast('📷 [테스트] 인스타 게시 시뮬레이션');
    return {
      message: '[테스트 모드] 인스타 게시 시뮬레이션. 백엔드 결선 후 실제 업로드돼요.',
      undo_log_id: _mockUndoId(),
    };
  }

  // 자동 보정 — PhotoEditor._applyAuto가 (예외적으로) 노출돼 있으면 호출.
  // IIFE 내부 함수라 보통 접근 불가 → 편집기를 'auto' 탭으로 열기로 폴백.
  async function _mockApplyPhotoPreset(action) {
    await _simLatency();
    const p = (action && action.payload) || {};
    const preset = (p.preset || p.preset_id || 'natural').toString();
    if (_hasPhotoEditor()) {
      try {
        if (typeof window.PhotoEditor._applyAuto === 'function') {
          window.PhotoEditor._applyAuto(preset);
          return { message: '[테스트 모드] 자동 보정(' + preset + ') 적용했어요.' };
        }
      } catch (_e) { void _e; }
      try {
        window.PhotoEditor.open({
          src: p.photo_url || p.src,
          initial_tab: 'auto',
          serviceName: p.service_name || '',
          price: +p.price || 0,
        });
        return { message: '[테스트 모드] 편집기를 자동 보정 탭으로 열었어요. (' + preset + ')' };
      } catch (_e) { void _e; }
    }
    _toast('🪄 [테스트] 사진 보정 시뮬레이션 (편집기 미오픈)');
    return { message: '[테스트 모드] 사진 편집기가 열려 있지 않아 시뮬레이션만 했어요.' };
  }

  // 수동 보정 — apply_photo_enhance: 편집기 열려 있으면 그대로, 없으면 토스트.
  async function _mockApplyPhotoEnhance(action) {
    await _simLatency();
    const p = (action && action.payload) || {};
    if (_hasPhotoEditor()) {
      try {
        window.PhotoEditor.open({
          src: p.photo_url || p.src,
          initial_tab: p.initial_tab || 'tune',
          serviceName: p.service_name || '',
          price: +p.price || 0,
        });
        return { message: '[테스트 모드] 편집기를 보정 탭으로 열었어요.' };
      } catch (_e) { void _e; }
    }
    _toast('🪄 [테스트] 사진 보정 시뮬레이션 (편집기 미오픈)');
    return { message: '[테스트 모드] 사진 편집기가 열려 있지 않아 시뮬레이션만 했어요.' };
  }

  async function _mockMakeBeforeAfter(action) {
    await _simLatency();
    const p = (action && action.payload) || {};
    if (_hasPhotoEditor()) {
      try {
        window.PhotoEditor.open({
          src: p.photo_url || p.src,
          initial_tab: 'template',
          serviceName: p.service_name || '',
          price: +p.price || 0,
        });
        return { message: '[테스트 모드] 편집기를 전·후 카드 탭으로 열었어요.' };
      } catch (_e) { void _e; }
    }
    _toast('🖼️ [테스트] 전·후 카드 시뮬레이션 (편집기 미오픈)');
    return { message: '[테스트 모드] 사진 편집기가 열려 있지 않아 시뮬레이션만 했어요.' };
  }

  async function _mockCreateTreatmentRecord(action) {
    await _simLatency();
    void action;
    _toast('✓ [테스트] 시술 기록 시뮬레이션. 백엔드 결선 후 실제 저장');
    return {
      message: '[테스트 모드] 시술 기록 시뮬레이션. 백엔드 결선 후 실제 저장돼요.',
    };
  }

  async function _mockRemoveBgAndSwap(action) {
    await _simLatency();
    const p = (action && action.payload) || {};
    if (_hasPhotoEditor()) {
      try {
        window.PhotoEditor.open({
          src: p.photo_url || p.src,
          initial_tab: 'bg',
          serviceName: p.service_name || '',
          price: +p.price || 0,
        });
        _toast('✂️ [테스트] 배경 교체 시뮬레이션');
        return { message: '[테스트 모드] 편집기를 배경 교체 탭으로 열었어요.' };
      } catch (_e) { void _e; }
    }
    _toast('✂️ [테스트] 배경 교체 시뮬레이션 (편집기 미오픈)');
    return { message: '[테스트 모드] 사진 편집기가 열려 있지 않아 시뮬레이션만 했어요.' };
  }

  // open_photo_editor는 app-photo-editor.js가 이미 등록 — 여기서 덮어쓰지 않음.
  function _registerAll() {
    const reg = window.ItdasyAssistant.registerLocalHandler;
    reg('draft_message',           _mockDraftMessage);
    reg('send_message',            _mockSendMessage);
    reg('publish_instagram',       _mockPublishInstagram);
    reg('apply_photo_preset',      _mockApplyPhotoPreset);
    reg('apply_photo_enhance',     _mockApplyPhotoEnhance);
    reg('make_before_after',       _mockMakeBeforeAfter);
    reg('create_treatment_record', _mockCreateTreatmentRecord);
    reg('remove_bg_and_swap',      _mockRemoveBgAndSwap);
  }
})();
