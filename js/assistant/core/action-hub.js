/* 잇비 Action Hub (J-1 MVP · 2026-06-01)

   목적: 잇비 결과 메시지가 말로 끝나지 않고 "다음 행동" 버튼으로 이어지게 하는 공통층.
   이 모듈은 버튼 규격(정규화)·렌더·클릭 라우팅만 담당. 기능 자체는 기존 경로 재사용.

   액션 규격: { id, label, phase:'safe'|'confirm'|'danger', kind, payload, route?:'hub'|'photo'|'brief' }

   안전 정책(v1):
   - safe   : 화면 이동 / 캡션·문자 초안 / 복사 / 템플릿 보기 / 빈시간 조회 / 사진편집기 열기 → 즉시 연결
   - confirm: 고객기록 저장 / 예약 생성·변경 / 매출 기록 → 자동 실행 금지. 기존 confirm·pending 경로로만, 없으면 안내
   - danger : 실제 발송·게시·자동예약·자동 고객추측 → 실행 차단. "안전 확인 후 제공 예정" 안내만
   재사용: WorkspaceFlow / openInstagramPreview / openCalendarView / openCustomers /
           openRevenueHub / showTab / ItdasyDailyBriefing.runAction. */
(function () {
  'use strict';
  if (window.ItdasyActionHub) return;

  // kind → 안전 단계. (명시 phase 가 있으면 그게 우선)
  var PHASE = {
    // safe — 조회/이동/초안/복사/열기
    copy_caption: 'safe', open_photo_editor: 'safe', open_template_panel: 'safe', apply_price_template: 'safe',
    review_price_template_result: 'safe',
    open_calendar: 'safe', open_customer: 'safe', open_revenue: 'safe', open_workshop: 'safe',
    show_unlinked_photos: 'safe', show_empty_slots: 'safe', open_instagram: 'safe', export_image: 'safe',
    // [Phase 3-2] DM/댓글 큐·DM설정 화면 이동(발송 아님 — 화면만 연다)
    open_dm_queue: 'safe', open_comment_queue: 'safe', open_dm_settings: 'safe',
    chat_suggest: 'safe',  // 잇비 입력창에 문장 채워 보냄(초안/조회 등 기존 경로로 위임 — 발송/생성 아님)
    // safe — 브리핑 추천(T-115: 화면이동/초안 경로만)
    retouch_draft: 'safe', open_unlinked_photos: 'safe', open_unrecorded: 'safe',
    open_at_risk: 'safe', open_empty_slot: 'safe',
    // confirm — 자동 실행 금지, 확인/pending 경로로만
    save_photo_to_customer: 'confirm', create_booking: 'confirm', record_revenue: 'confirm',
    save_treatment: 'confirm', cancel_booking: 'confirm', update_booking: 'confirm',
    // danger — v1 실행 차단
    send_message: 'danger', send_bulk_message: 'danger', send_dm: 'danger', reply_dm: 'danger',
    publish_instagram: 'danger', auto_book: 'danger', auto_attach_customer: 'danger',
  };

  var DANGER_MSG = '이 기능은 안전 확인 후 제공 예정입니다. (실제 발송·게시·자동 처리는 잇비가 임의로 실행하지 않아요)';
  var CONFIRM_MSG = {
    save_photo_to_customer: '고객 기록에 저장할까요? 고객을 확인한 뒤 "저장해줘"라고 말씀해 주세요. (자동 저장은 하지 않아요)',
    create_booking: '예약은 확인 카드에서 잡을 수 있어요. "○○님 ○시 예약 잡아줘"처럼 말씀해 주세요. (자동 예약은 하지 않아요)',
    record_revenue: '매출 기록은 완료 처리/확인 단계가 필요해요. 예약 화면에서 정리할 수 있어요.',
  };

  function _phaseOf(a) {
    if (a && (a.phase === 'safe' || a.phase === 'confirm' || a.phase === 'danger')) return a.phase;
    var byKind = PHASE[(a && a.kind) || (a && a.id)];
    if (byKind) return byKind;
    if (a && (a.safety === 'confirm' || a.safety === 'danger' || a.safety === 'safe')) return a.safety;
    return 'safe';
  }

  function isDangerAction(a) { return _phaseOf(a) === 'danger'; }

  // 느슨한 액션들 → 표준 규격으로. id/label 없으면 제외.
  function normalizeActions(actions, defaultRoute) {
    if (!Array.isArray(actions)) return [];
    var out = [];
    for (var i = 0; i < actions.length; i++) {
      var a = actions[i]; if (!a) continue;
      var id = a.id || a.kind; var label = a.label;
      if (!id || !label) continue;
      out.push({
        id: String(id), label: String(label), kind: String(a.kind || a.id),
        phase: _phaseOf(a), payload: a.payload || {}, route: a.route || defaultRoute || 'hub',
      });
    }
    return out;
  }

  var _ATTR = { hub: 'data-asst-hub-act', photo: 'data-asst-photo-act', brief: 'data-asst-brief-act' };
  function _esc(s) { return window._esc(s); } /* [2026-06-11] 중복 제거 — app-core 정본 위임 */
  function _btnStyle(phase) {
    var base = 'padding:9px 16px;border-radius:999px;cursor:pointer;font-size:13px;font-weight:600;';
    if (phase === 'confirm') return base + 'border:0.5px solid #C9D2DB;background:#F2F4F6;color:#3182F6;';
    if (phase === 'danger') return base + 'border:0.5px dashed #D1D6DB;background:#FAFAFB;color:#8B95A1;';
    return base + 'border:0.5px solid #E5E8EB;background:#FFFFFF;color:#4E5968;';
  }

  // 정규화된 액션 배열 → 버튼 HTML. idx = _history 인덱스(클릭 시 메시지 역참조).
  function renderActionHub(actions, opts) {
    var list = normalizeActions(actions, (opts && opts.defaultRoute) || 'hub');
    if (!list.length) return '';
    var idx = (opts && opts.idx != null) ? opts.idx : '';
    var btns = list.map(function (a) {
      var attr = _ATTR[a.route] || _ATTR.hub;
      return '<button ' + attr + '="' + _esc(idx) + ':' + _esc(a.id) + '" data-hub-phase="' + a.phase +
        '" style="' + _btnStyle(a.phase) + '">' + _esc(a.label) + '</button>';
    }).join('');
    return '<div class="asst-chips asst-chips--hub" style="margin-top:10px;display:flex;flex-wrap:wrap;gap:6px;">' + btns + '</div>';
  }

  // [연준님 2026-08-17] 화면을 여는 버튼은 **반드시 잇비 채팅방을 먼저 닫는다.**
  //   실사용 신고: "빈시간 보기 / 예약 화면 열기" 를 누르면 그 화면이 채팅방 **뒤**로 열려서
  //   채팅방을 손으로 꺼야 보였다. 원장님 입장에선 버튼이 안 먹은 것처럼 느껴진다.
  //   전수조사 결과 _nav 를 쓰는 10곳 중 닫는 건 4곳뿐이었다(고객·DM큐·댓글·DM설정).
  //   나머지(예약·매출·작업실·인스타·사진편집기·템플릿·빈시간)는 전부 뒤로 열렸다.
  //   → 개별 case 에서 각자 닫게 두면 새 kind 를 추가할 때마다 또 빠뜨린다. 여기 한 곳에서 닫는다.
  //   (이미 닫는 4곳은 중복 호출이 되지만 closeAssistant 는 멱등이라 무해하다)
  function _nav(fn) {
    // [연준님 2026-08-17 · C] 여기서 연 화면을 닫으면 잇비 채팅으로 돌아온다.
    //   실제 복귀는 app-core.js 의 시트 라우터(_markSheetOpen/_markSheetClosed)가 한다 —
    //   화면이 11개라 각자 붙이면 또 빠뜨리기 때문. 여기선 "다음 시트 하나" 만 표시한다.
    try { if (typeof window.__itbiArmReturn === 'function') window.__itbiArmReturn(); } catch (_e) { void 0; }
    try { if (typeof window.closeAssistant === 'function') window.closeAssistant(); } catch (_e) { void 0; }
    try { if (typeof fn === 'function') { fn(); return true; } } catch (_e) { void 0; }
    return false;
  }
  function _copy(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(String(text || '')); return true; }
    } catch (_e) { void 0; }
    return false;
  }

  // 브리핑 kind 는 기존 T-115 라우팅(daily-briefing.runAction)에 위임 — 안전 경로 유지.
  var BRIEF_KINDS = { retouch_draft: 1, open_unlinked_photos: 1, open_unrecorded: 1, open_at_risk: 1, open_empty_slot: 1 };

  // 클릭 라우팅. 반환 { message?, chatInput?, navigated?, blocked? }.
  function handleActionClick(action, _deps) {
    if (!action || !action.kind) return { message: '' };
    var phase = _phaseOf(action);
    if (phase === 'danger') return { blocked: true, message: DANGER_MSG };
    var kind = action.kind; var p = action.payload || {};

    if (BRIEF_KINDS[kind] && window.ItdasyDailyBriefing && typeof window.ItdasyDailyBriefing.runAction === 'function') {
      return window.ItdasyDailyBriefing.runAction(action) || { message: '' };
    }
    if (phase === 'confirm') return _confirmMsg(kind, p);
    return _safeRoute(kind, p);
  }

  function _confirmMsg(kind, p) {
    // 고객기록 저장은 고객 인지형 안내(자동 저장 X) — 실제 저장은 기존 pending/confirmSave 경로(사용자 "저장해줘").
    if (kind === 'save_photo_to_customer') {
      if (p.customerName) {
        return { message: '이 사진을 ' + p.customerName + '님 기록에 저장할까요? "저장해줘"라고 말씀해 주세요. (자동 저장은 하지 않아요)' };
      }
      // [2026-06-11 #7] dead-end 픽스 — 안내문만 띄우고 끝나던 것을 고객 픽커를 실제로 열어
      //   선택 즉시 기존 "저장해줘" 확정 경로로 이어준다 (자동 저장 아님 — 확정 카드 경로 유지).
      if (window.Customer && typeof window.Customer.pick === 'function') {
        window.Customer.pick({}).then(function (picked) {
          if (picked && picked.name && typeof window._assistantSendText === 'function') {
            window._assistantSendText(picked.name + ' 고객기록에 저장해줘');
          }
        }).catch(function () { void 0; });
        return { message: '어느 고객 기록에 저장할까요? 목록에서 골라주세요.' };
      }
      return { message: '고객을 먼저 선택해 주세요. 고객을 선택하면 이 보정본을 기록에 저장할 수 있어요.' };
    }
    return { message: CONFIRM_MSG[kind] || '확인 단계가 필요한 작업이에요. 확인 후 진행할 수 있어요.' };
  }

  // safe 라우팅 (기존 화면이동/복사/초안 경로 위임)
  function _safeRoute(kind, p) {
    switch (kind) {
      case 'chat_suggest':
        return { chatInput: p.text || p.chatInput || '' };
      case 'copy_caption':
        return { message: _copy(p.caption || p.text || '') ? '캡션을 복사했어요. 붙여넣어 사용하세요.' : '복사할 캡션이 없어요.' };
      case 'open_photo_editor':
        // [2026-07-22] 옛 PhotoEditor 제거 → 현재 작업실 편집기로.
        _nav(function () {
          if (window.WorkspaceFlow && window.WorkspaceFlow.command) {
            window.WorkspaceFlow.command({ type: 'storyedit', photoUrls: p.dataUrl ? [p.dataUrl] : null });
          } else if (window.showToast) {
            window.showToast('작업실을 여는 중이에요. 잠시 후 다시 눌러주세요');
          }
        });
        return { navigated: true };
      case 'open_template_panel':
        _nav(function () {
          // [TPL-3] 추천 id 있으면 템플릿 갤러리를 추천 3개 상단 고정으로 연다.
          var recos = (p.recommendedIds && p.recommendedIds.length) ? p.recommendedIds : null;
          if (recos && window.PhotoEditorTemplatesV2 && typeof window.PhotoEditorTemplatesV2.open === 'function') {
            window.PhotoEditorTemplatesV2.open({ recommendedIds: recos });
            return;
          }
          // [2026-07-22] 옛 PhotoEditor 폴백 제거 → 현재 작업실 레이아웃/템플릿 단계로.
          var _src = p.dataUrl || _resolverUrl();
          if (window.WorkspaceFlow && typeof window.WorkspaceFlow.command === 'function') {
            window.WorkspaceFlow.command({ type: 'open', photoUrls: _src ? [_src] : null, screen: 'layout' });
          } else if (window.showToast) {
            window.showToast('작업실을 여는 중이에요. 잠시 후 다시 눌러주세요');
          }
        });
        return { navigated: true, message: (p.recommendedIds && p.recommendedIds.length) ? '추천 템플릿을 열었어요.' : '템플릿 탭을 열었어요.' };
      case 'review_price_template_result':
        return _reviewPriceTemplateResult();
      case 'open_instagram': {
        // [CF-4] 클릭 시점 라이브 캔버스 재캡처(템플릿 적용본 반영). 없으면 payload fallback.
        var igUrl = _liveCanvasUrl() || p.dataUrl || _resolverUrl();   // [P0a] SourceImage 폴백
        if (!igUrl) return { message: '사진을 먼저 선택하거나 업로드해 주세요.' };
        _nav(function () { window.openInstagramPreview && window.openInstagramPreview({ src: igUrl, ratio: p.ratio || '4:5', caption: p.caption || '', enableUpload: true }); });
        return { navigated: true, message: '인스타 미리보기를 열었어요. (게시는 확인 후 직접 진행돼요)' };
      }
      case 'export_image': {
        // [CF-4] 내보내기도 클릭 시점 재캡처 — 템플릿 적용 후 최신본 저장.
        var exUrl = _liveCanvasUrl() || p.dataUrl || _resolverUrl();   // [P0a] SourceImage 폴백
        if (!exUrl) return { message: '사진을 먼저 선택하거나 업로드해 주세요.' };
        return { message: _exportImage(exUrl) ? '이미지를 저장했어요.' : '저장에 실패했어요.' };
      }
      case 'open_calendar': case 'show_empty_slots':
        _nav(function () { window.openCalendarView && window.openCalendarView(); });
        return { navigated: true, message: '예약 화면을 열었어요.' };
      case 'open_customer':
        // [Phase3-B #4] 잇비 채팅 아래 append 금지 — 잇비 닫고 해당 고객 시트를 위로 연다.
        //   [2026-08-17 · C] 복귀는 _nav 가 건 표시를 시트 라우터가 처리한다(개별 플래그 제거).
        _nav(function () {
          if (p.customer_id != null && typeof window.openCustomerDashboard === 'function') window.openCustomerDashboard(p.customer_id);
          else if (window.openCustomers) window.openCustomers();
        });
        return { navigated: true, message: '고객 기록을 열었어요.' };
      case 'open_revenue':
        _nav(function () { window.openRevenueHub && window.openRevenueHub(); });
        return { navigated: true, message: '매출 화면을 열었어요.' };
      case 'open_workshop': case 'show_unlinked_photos':
        _nav(function () { window.showTab && window.showTab('workshop'); });
        return { navigated: true, message: '작업실을 열었어요.' };
      case 'open_dm_queue':
        // [Phase 3-2] 대기 DM 확인 큐 — 잇비 닫고 큐 시트를 위로. 실발송은 이 화면에서 원장님이.
        _nav(function () {
          if (typeof window.closeAssistant === 'function') { try { window.closeAssistant(); } catch (_e) { void 0; } }
          if (typeof window.openDMConfirmQueue === 'function') window.openDMConfirmQueue();
        });
        return { navigated: true, message: 'DM 확인 큐를 열었어요. (발송은 검토 후 직접 진행돼요)' };
      case 'open_comment_queue':
        _nav(function () {
          if (typeof window.closeAssistant === 'function') { try { window.closeAssistant(); } catch (_e) { void 0; } }
          if (typeof window.openCommentReplyQueue === 'function') window.openCommentReplyQueue();
        });
        return { navigated: true, message: '댓글 문의 화면을 열었어요. (답글은 검토 후 직접 진행돼요)' };
      case 'open_dm_settings':
        _nav(function () {
          if (typeof window.closeAssistant === 'function') { try { window.closeAssistant(); } catch (_e) { void 0; } }
          if (typeof window.openDMAutoreplySettings === 'function') window.openDMAutoreplySettings();
        });
        return { navigated: true, message: 'DM 자동응답 설정을 열었어요.' };
      default:
        return { message: '' };
    }
  }

  // [2026-07-22] 옛 PhotoEditor state/시트 재노출 → headless 활성 state + 문구 편집 시트.
  function _reviewPriceTemplateResult() {
    var TA = window.ItdasyTemplateAutoApply;
    var state = (TA && typeof TA.getActiveState === 'function') ? TA.getActiveState() : null;
    if (!state || !state.tplV2) return { message: '가격표 편집 화면이 닫혔어요. 다시 가격표 템플릿에 적용해 주세요.' };
    var helpers = {
      scheduleRedraw: function () {},
      renderPanel: function () {},
      pushHistory: function () {},
      applyStatePatch: function () {},
      save: function () { return TA.composeAndHandOff(state, state.onSave); },
    };
    _openTemplateEditSheet(state, helpers);
    return { navigated: true, message: '가격표 문구 편집을 다시 열었어요.' };
  }

  function _openTemplateEditSheet(state, helpers) {
    var ES = window.PhotoEditorTemplateEditSheet;
    if (!ES || typeof ES.open !== 'function') return;
    var tplId = state.tplV2 && state.tplV2.id;
    ES.open({ templateId: tplId, templateData: _templateById(tplId), state: state, helpers: helpers, onChange: function () { return undefined; } });
  }

  function _templateById(id) {
    var MD = window.PhotoEditorTemplateMarketData;
    var found = (MD && typeof MD.lookupById === 'function' && MD.lookupById(id))
      || (MD && typeof MD.visibleTemplates === 'function' && MD.visibleTemplates().find(function (t) { return t && t.id === id; }));
    if (found) return found;
    var list = window.PhotoEditorTemplatesV2 && window.PhotoEditorTemplatesV2.TEMPLATES;
    return Array.isArray(list) ? list.find(function (t) { return t && t.id === id; }) : null;
  }

  // [CF-4] 현재 편집기 캔버스(#peCanvas)를 클릭 시점에 재캡처 — 템플릿 적용본 등 최신 화면 반영.
  //   캔버스 없으면 ''(호출측이 payload fallback / "사진 열어주세요" 안내).
  function _liveCanvasUrl() {
    try {
      var cv = document.getElementById('peCanvas');
      if (cv && cv.width && cv.height) return cv.toDataURL('image/jpeg', 0.92);
    } catch (_e) { void 0; }
    return '';
  }

  // [P0a] 라이브 캔버스/payload 둘 다 없을 때 잇비 SourceImage(작업실 active/채팅 업로드)로 폴백.
  function _resolverUrl() {
    try {
      var src = window.ItdasySourceImage && window.ItdasySourceImage.resolve();
      return (src && src.dataUrl) ? src.dataUrl : '';
    } catch (_e) { return ''; }
  }

  function _exportImage(dataUrl) {
    if (!dataUrl) return false;
    try {
      var a = document.createElement('a');
      a.href = dataUrl; a.download = 'itdasy-' + Date.now() + '.jpg';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      return true;
    } catch (_e) { return false; }
  }

  // context → 기본 액션 셋(향후 J-2~J-5 재사용). type 별 안전 기본 버튼만.
  function buildCommonActions(context) {
    var c = context || {}; var acts = [];
    if (c.type === 'photo_result') {
      if (c.caption) acts.push({ id: 'copy_caption', kind: 'copy_caption', label: '캡션 복사', payload: { caption: c.caption } });
      acts.push({ id: 'open_template_panel', kind: 'open_template_panel', label: '템플릿 보기', payload: { dataUrl: c.dataUrl } });
      acts.push({ id: 'save_photo_to_customer', kind: 'save_photo_to_customer', label: '고객기록에 저장', payload: {} });
    }
    return normalizeActions(acts, 'hub');
  }

  var PRICE_INTENT = /가격표|메뉴판|가격\s*안내|가격\s*정리|시술가|가격.*(만들|올려|정리|안내|보여)/;
  var PRICE_TOKEN = /(\d+(?:\.\d+)?\s*만\s*원?|\d[\d,]*\s*원?)/;
  var PHONE_TOKEN = /01[016789][-\s]?\d{3,4}[-\s]?\d{4}/;
  var INDUSTRIES = [
    { key: 'nail', label: '네일', re: /네일|손젤|젤네일|패디|손톱|젤\s*제거/ },
    { key: 'lash', label: '속눈썹', re: /속눈썹|래쉬|lash|연장|언더|펌/ },
    { key: 'skin', label: '피부', re: /피부|에스테틱|물광|진정|리프팅|여드름|스킨/ },
    { key: 'waxing', label: '왁싱', re: /왁싱|제모/ },
    { key: 'makeup', label: '메이크업', re: /메이크업|메이크|화장/ },
    { key: 'hair', label: '헤어', re: /헤어|머리|커트|클리닉|염색|펌|붙임머리|모발/ },
  ];

  function _priceTools() { return window.PhotoEditorTemplateFitText || {}; }
  function _fallbackFormatPrice(v) {
    var s = String(v == null ? '' : v).trim();
    var m = s.match(/(\d+(?:\.\d+)?)\s*만/);
    var n = m ? Math.round(parseFloat(m[1]) * 10000) : parseInt(s.replace(/[^\d]/g, ''), 10);
    return n > 0 ? n.toLocaleString('en-US') + '원' : s;
  }
  function _formatPrice(v) {
    var fn = _priceTools().formatPrice;
    return typeof fn === 'function' ? fn(v) : _fallbackFormatPrice(v);
  }
  function _hasPriceValue(v) {
    var s = String(v == null ? '' : v);
    if (PHONE_TOKEN.test(s)) return false;
    return /(\d+(?:\.\d+)?\s*만\s*원?|\d[\d,]{3,}\s*원?|\d{1,3}\s*천\s*원?)/.test(s);
  }
  function _parseServicePrices(text) {
    var fn = _priceTools().parseServicePrices;
    if (typeof fn === 'function') return fn(text);
    return String(text || '').split('\n').map(function (line) {
      var m = line.trim().match(/^(.*?)[\s]+(.+)$/);
      return m ? { name: m[1].trim(), price: _formatPrice(m[2]) } : { name: line.trim(), price: '' };
    });
  }
  function _inferIndustry(text) {
    for (var i = 0; i < INDUSTRIES.length; i++) {
      if (INDUSTRIES[i].re.test(text)) return { key: INDUSTRIES[i].key, label: INDUSTRIES[i].label };
    }
    return null;
  }
  function _splitPriceText(text) {
    return String(text || '')
      .replace(/(\d+(?:\.\d+)?\s*만원|\d[\d,]*\s*원)(?=[가-힣A-Za-z])/g, '$1\n')
      .replace(/(\d+(?:\.\d+)?\s*만)(?!\s*원)(?=[가-힣A-Za-z])/g, '$1\n')
      .replace(/(\d{4,})(?=[가-힣A-Za-z])/g, '$1\n')
      .replace(/,(?!\d)/g, '\n')
      .replace(/[，、]/g, '\n')
      .replace(/\.(?=\s|$)/g, '\n')
      .split('\n');
  }
  function _cleanPriceSegment(raw) {
    var s = String(raw || '').trim();
    s = s.replace(/\s*(으로|로)?\s*(가격표|메뉴판|가격\s*안내|가격\s*정리|시술가)\s*(만들어줘|올려줘|정리해줘|보여줘|작성해줘|해줘|만들|올려|정리|작성).*$/g, '');
    if (_hasPriceValue(s)) {
      s = s.replace(/^(가격표|메뉴판)\s+/g, '');
      s = s.replace(/\s*(가격표|메뉴판|가격\s*안내|가격\s*정리|시술가|가격)\s*$/g, '');
    }
    s = s.replace(/^(네일|헤어|피부|속눈썹|왁싱|메이크업)\s+(손님|고객|샵)\s*(이야|이에요|이예요|입니다|야)?\s*/g, '');
    s = s.replace(/\s*(으로|로)\s*$/g, '').trim();
    if (!_hasPriceValue(s) && /^(가격표|메뉴판|가격\s*안내|가격\s*정리|시술가|가격)\s*(만들어줘|올려줘|정리해줘|보여줘|작성해줘|해줘|만들|올려|정리|작성)?$/.test(s)) return '';
    if (!_hasPriceValue(s) && /^(네일|헤어|피부|속눈썹|왁싱|메이크업)\s*(손님|고객|샵)?\s*(이야|이에요|이예요|입니다|야)?$/.test(s)) return '';
    return s;
  }
  function _normalizeRows(rows) {
    return (rows || []).map(function (row) {
      var name = String((row && (row.name || row.service_name)) || '').trim();
      var rawPrice = row && row.price ? String(row.price) : '';
      var price = _hasPriceValue(rawPrice) ? _formatPrice(rawPrice) : '';
      if (!price && _hasPriceValue(name) && !name.replace(PRICE_TOKEN, '').trim()) name = '';
      return { name: name, price: price };
    }).filter(function (row) { return row.name; });
  }
  function parsePriceListRequest(text) {
    var raw = String(text || '').trim();
    if (/예약/.test(raw) && !PRICE_INTENT.test(raw)) {
      return { matched: false, priceMissing: false, priced: 0, industry: null, rows: [], raw: raw };
    }
    if (PHONE_TOKEN.test(raw) && !_hasPriceValue(raw.replace(PHONE_TOKEN, ' '))) {
      return { matched: false, priceMissing: false, priced: 0, industry: null, rows: [], raw: raw };
    }
    var cleaned = _splitPriceText(raw).map(_cleanPriceSegment).filter(Boolean).join('\n');
    var rows = _normalizeRows(_parseServicePrices(cleaned));
    var priced = rows.filter(function (row) { return !!row.price; }).length;
    var industry = _inferIndustry(raw);
    // [B10] 가격(priced) 0건이면 가격표 성공 금지 — 시술명/문구만으론 초안 만들지 않음(거짓 성공 차단).
    var matched = priced > 0 && (PRICE_INTENT.test(raw) || rows.length >= 2 || !!industry);
    // 가격표 의도는 있으나 가격을 못 찾음 → 호출측이 '가격 없음' 안내(거짓 성공 대신).
    var priceMissing = priced === 0 && (PRICE_INTENT.test(raw) || !!industry);
    return { matched: matched, priceMissing: priceMissing, priced: priced, industry: industry, rows: rows, raw: raw };
  }
  function formatPriceListDraft(result) {
    var r = result || {};
    var head = (r.industry && r.industry.label ? r.industry.label + ' ' : '') + '가격표 초안을 만들었어요.';
    var lines = (r.rows || []).slice(0, 12).map(function (row) {
      return '- ' + row.name + (row.price ? ' ' + row.price : '');
    });
    return head + '\n\n' + lines.join('\n') + '\n\n다음 단계에서 템플릿에 바로 적용할 수 있게 연결할게요.';
  }

  window.ItdasyActionHub = { PHASE, normalizeActions, isDangerAction, renderActionHub, handleActionClick, buildCommonActions };
  window.ItdasyAssistantPriceList = { parseRequest: parsePriceListRequest, formatDraftMessage: formatPriceListDraft };
})();
