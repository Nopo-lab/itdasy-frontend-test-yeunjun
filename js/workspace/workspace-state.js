/* Workspace V2 — 콘텐츠 상태 모델 + 다음 추천 작업 (순수 함수)
   의존: 없음 (slot 데이터 구조만 읽음, 변경하지 않음).
   slot(보강): { id, label, photos:[{dataUrl,editedDataUrl,cropMeta,role,...}], caption, hashtags,
     customer_id, customer_name, status, workspaceContext:{type,...}, publish:{status}, ... } */
(function () {
  'use strict';

  var STATUS = {
    UPLOAD_PENDING: 'upload_pending',
    NEEDS_CROP:     'needs_crop',     // 사진 있음, 아직 편집(크롭/보정) 전
    NEEDS_EDIT:     'needs_edit',     // (호환용 — 현재 needs_crop 로 통합)
    NEEDS_CAPTION:  'needs_caption',
    NEEDS_CUSTOMER: 'needs_customer',
    READY:          'ready',          // 게시 준비
    PUBLISHED:      'published',
  };

  var META = {
    upload_pending: { label: '업로드 대기', tone: 'gray',  group: 'pending' },
    needs_crop:     { label: '편집 필요',   tone: 'pink',  group: 'pending' },
    needs_edit:     { label: '편집 필요',   tone: 'pink',  group: 'pending' },
    needs_caption:  { label: '캡션 필요',   tone: 'pink',  group: 'edited'  },
    needs_customer: { label: '고객 연결',   tone: 'blue',  group: 'edited'  },
    ready:          { label: '게시 준비',   tone: 'amber', group: 'ready'   },
    published:      { label: '게시 완료',   tone: 'green', group: 'done'    },
  };

  function _hasText(v) { return !!(v && String(v).trim()); }
  function _isPublished(slot) { return slot.status === 'published' || slot.instagramPublished || (slot.publish && slot.publish.status === 'published'); }
  function _type(slot) { return slot.workspaceContext && slot.workspaceContext.type; }
  function _hasEdit(photos) { return photos.some(function (p) { return p && (_hasText(p.editedDataUrl) || p.cropMeta); }); }
  // [2026-10-01 02] 레이아웃 카드(합성본)를 편집기로 꾸민 표식은 사진이 아니라 카드(templateOutputs[].storyEdited)에 남는다.
  function _hasCardEdit(slot) { return ((slot && slot.templateOutputs) || []).some(function (o) { return !!(o && o.storyEdited); }); }

  function deriveStatus(slot) {
    if (!slot) return STATUS.UPLOAD_PENDING;
    if (_isPublished(slot)) return STATUS.PUBLISHED;
    if (slot.wsStatus && META[slot.wsStatus]) return slot.wsStatus;
    var photos = slot.photos || [];
    if (!photos.length) return STATUS.UPLOAD_PENDING;
    if (!_hasEdit(photos) && !_hasCardEdit(slot) && !_hasText(slot.caption)) return STATUS.NEEDS_CROP;   // [2026-09-14 P3] 편집은 선택 — 캡션 쓴 글에 '편집 필요' 금지
    if (!_hasText(slot.caption)) return STATUS.NEEDS_CAPTION;
    if (!slot.customer_id && _type(slot) !== 'price') return STATUS.NEEDS_CUSTOMER;
    return STATUS.READY;
  }

  function statusMeta(status) { return META[status] || META.upload_pending; }

  // 다음 추천 작업 — 실제 상태 + 콘텐츠 타입 반영 (Phase 4B). key 는 flow 화면 라우팅.
  function nextAction(slot) {
    var photos = (slot && slot.photos) || [];
    if (!photos.length) return { key: 'upload', label: '사진 추가' };
    if (_isPublished(slot)) return { key: 'done', label: '완료' };

    if (_type(slot) === 'before_after') {
      if (photos.length < 2) return { key: 'upload', label: '사진 2장 필요' };
      var hasB = photos.some(function (p) { return p.role === 'before'; });
      var hasA = photos.some(function (p) { return p.role === 'after'; });
      if (!hasB || !hasA) return { key: 'edit', label: '전/후 역할 확인' };
    }
    // [2026-09-14 P3] 사진 편집은 선택이다. 캡션까지 쓴 글을 '이어서' 로 열면 편집기로 되돌아가던 것 —
    //   타일은 '작성 완료' 인데 이어서 카드는 '편집이 남았어요' 였다. 캡션이 있으면 편집 단계는 건너뛴다.
    // [2026-10-01 01] 목적지가 편집기 강제가 아니라 레이아웃/캡션 화면이라 라벨도 그에 맞춘다(키 'crop' 은 계약이라 유지).
    if (!_hasEdit(photos) && !_hasCardEdit(slot) && !_hasText(slot.caption)) return { key: 'crop', label: '이어서 만들기' };
    if (!_hasText(slot.caption)) return { key: 'caption', label: '캡션 생성' };
    // [순서 수정] deriveStatus·CTA 흐름(캡션→고객연결→미리보기)과 맞춤 — 고객 연결을 미리보기보다 먼저.
    //   이전엔 preview 를 먼저 반환해 "이어서"가 고객연결 건너뛰고 미리보기로 직행했음.
    if (!slot.customer_id && _type(slot) !== 'price') return { key: 'customer', label: '고객 연결' };
    var pub = slot.publish && slot.publish.status;
    if (pub !== 'preview_ready' && pub !== 'upload_ready') return { key: 'preview', label: '인스타 미리보기' };
    return { key: 'done', label: '완료' };
  }

  function filterGroup(slot) { return statusMeta(deriveStatus(slot)).group; }

  window.WorkspaceState = {
    STATUS: STATUS,
    deriveStatus: deriveStatus,
    statusMeta: statusMeta,
    nextAction: nextAction,
    filterGroup: filterGroup,
  };
})();
