/* T-602 — Accessible inline forms: explicit save/cancel and retained failed input. */
(function () {
  'use strict';
  const C = window.CustomerCare;
  const esc = C.escape;
  function field(label, name, value, attrs = '', type = 'text') {
    return '<label class="cc-field"><span>' + label + '</span><input name="' + name + '" type="' + type +
      '" value="' + esc(value || '') + '" ' + attrs + '></label>';
  }
  function memo(label, name, value, max, placeholder) {
    return '<label class="cc-field"><span>' + label + '</span><textarea name="' + name + '" rows="3" maxlength="' + max +
      '" placeholder="' + placeholder + '">' + esc(value || '') + '</textarea></label>';
  }
  function actions(label) {
    return '<p class="cc-form-error" role="alert" hidden></p><div class="cc-form-actions">' +
      C.button('cancel-form', '취소') + '<button type="submit" class="cc-btn cc-btn-primary">' + label + '</button></div>';
  }
  C.recordForm = (record, reuse) => {
    const editing = record && !reuse;
    const locked = editing && record.paired_booking_id ? ' readonly' : '';
    return '<form class="cc-form" data-cc-form="record"><h4>' + (editing ? '시술 노트 수정' : reuse ? '지난 내용으로 새 기록' : '새 시술 노트') + '</h4>' +
      (reuse ? '<p class="cc-form-hint">시술명과 메모를 가져왔어요. 이번 시술에 맞게 바꿔 주세요.</p>' : '') +
      '<div class="cc-field-row">' + field('시술 날짜', 'date', editing ? C.date(record.performed_at) : C.today(), 'required max="' + C.today() + '"' + locked, 'date') +
      field('시술명', 'service_name', record?.service_name, 'required maxlength="120" placeholder="예: 속눈썹 연장"' + locked) + '</div>' +
      (locked ? '<p class="cc-form-hint">예약에 연결된 시술은 메모를 수정할 수 있어요.</p>' : '') +
      memo('시술 방법 · 고객 반응', 'memo', record?.memo, 2000, '사용한 제품, 디자인, 다음에 기억할 내용을 남겨 주세요') +
      actions(editing ? '수정 저장' : '기록 저장') + '</form>';
  };
  C.planForm = plan => '<form class="cc-form" data-cc-form="plan" novalidate><h4>다음 방문일</h4>' +
    field('방문 날짜', 'due_date', plan.due_date, 'min="1900-01-01" max="2100-12-31"', 'date') +
    '<div class="cc-date-presets">' + [14, 21, 28].map(days => C.button('date-preset', (days / 7) + '주 뒤', '', 'data-days="' + days + '"')).join('') + C.button('clear-date', '날짜 지우기', 'cc-clear') + '</div>' +
    memo('그날 챙길 내용', 'note', plan.note, 400, '예: 유지 상태 확인, 디자인 상담') +
    '<p class="cc-form-hint">날짜를 지우고 저장하면 다음 방문일이 비워져요. 메모는 남겨둘 수 있어요.</p>' + actions('저장') + '</form>';
  C.referrerForm = state => {
    const referrer = state.care.referrer;
    return '<form class="cc-form" data-cc-form="referrer"><h4>소개해 주신 분 찾기</h4>' +
      '<label class="cc-field"><span>우리 샵 고객 검색</span><input name="query" type="search" autocomplete="off" maxlength="50" placeholder="이름 또는 전화번호로 찾기"></label>' +
      '<div class="cc-search-results" aria-live="polite"><p class="cc-muted">이름을 입력하면 고객을 찾아드려요.</p></div>' +
      '<div class="cc-selected-referrer">' + (referrer ? esc(referrer.name) + ' 님 선택됨' : '소개자를 선택해 주세요') + '</div>' +
      C.button('clear-referrer', '소개자 지정 해제', 'cc-clear') + actions('소개자 저장') + '</form>';
  };
  C.searchResults = (items, selected) => {
    if (!items.length) return '<p class="cc-muted">검색 결과가 없어요. 등록된 고객 이름을 확인해 주세요.</p>';
    return items.map(c => C.button('pick-referrer', '<span><strong>' + esc(c.name) + '</strong>' +
      '<small>' + esc(c.phone ? '연락처 끝 ' + String(c.phone).replace(/\D/g, '').slice(-4) : '연락처 미등록') + '</small></span>' +
      (String(c.id) === String(selected?.id) ? '<span>선택됨</span>' : C.icon('plus')), 'cc-search-person', 'data-id="' + esc(c.id) + '"')).join('');
  };
})();
