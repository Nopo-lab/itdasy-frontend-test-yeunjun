/* T-602 — Compact, inline customer care sections. No user data in handlers. */
(function () {
  'use strict';
  const C = window.CustomerCare;
  const esc = C.escape;
  C.icon = name => '<svg class="ic" aria-hidden="true"><use href="#ic-' + name + '"/></svg>';
  C.button = (action, label, cls = '', extra = '') => '<button type="button" class="cc-btn ' + cls +
    '" data-cc-action="' + action + '" ' + extra + '>' + label + '</button>';
  const button = C.button;
  function heading(title, description, action) {
    return '<div class="cc-heading"><div><h3>' + title + '</h3><p>' + description + '</p></div>' + (action || '') + '</div>';
  }
  function failure(message, action) {
    return '<div class="cc-empty cc-failure"><p>' + esc(message) + '</p>' + button(action, '다시 불러오기') + '</div>';
  }
  C.planView = state => {
    const head = heading('다음 방문일', '다시 오실 날짜와 챙길 내용을 남겨요',
      !state.loading && !state.careError ? button('edit-plan', state.care?.plan?.due_date ? '변경' : '날짜 추가') : '');
    if (state.loading) return head + '<p class="cc-empty" role="status">다음 방문일을 불러오고 있어요…</p>';
    if (state.careError) return head + failure(state.careError, 'retry');
    const p = state.care.plan || {};
    const date = p.due_date;
    return head + '<div class="cc-plan-summary"><div class="cc-date-icon">' + C.icon('calendar') + '</div><div>' +
      '<strong class="cc-plan-date">' + (date ? esc(C.dateLabel(date)) : '정해둔 날짜가 없어요') + '</strong>' +
      '<span class="cc-muted">' + (date ? (p.source === 'manual' ? '직접 정한 방문일' : '시술 주기로 계산한 방문일') : '날짜를 아직 정하지 않았어요') + '</span></div>' +
      (date ? '<span class="cc-pill">' + esc(C.dateHint(date)) + '</span>' : '') + '</div>' +
      (p.note ? '<p class="cc-note">' + esc(p.note) + '</p>' : '');
  };
  function recordRow(record) {
    const key = esc(record.id);
    const memo = record.memo || '';
    const photos = [...new Set([...(record.photos || []), record.before_photo_id, record.after_photo_id])]
      .map(C.photoUrl).filter(Boolean);
    return '<details class="cc-record" data-record-id="' + key + '"><summary><span class="cc-record-date">' +
      esc(C.dateLabel(record.performed_at)) + '</span><strong>' + esc(record.service_name || '시술 노트') + '</strong>' +
      C.icon('chevron-down') + '</summary><div class="cc-record-content">' +
      '<p class="cc-note">' + esc(memo || '남긴 메모가 없어요.') + '</p>' +
      (photos.length ? '<div class="cc-photos">' + photos.slice(0, 6).map(url =>
        '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer" aria-label="시술 사진 크게 보기"><img src="' + esc(url) + '" alt="지난 시술 사진" loading="lazy"></a>').join('') + '</div>' : '') +
      '<div class="cc-row-actions">' + button('reuse-record', '이 내용으로 새 기록', 'cc-btn-primary', 'data-id="' + key + '"') +
      button('edit-record', '수정', '', 'data-id="' + key + '"') + '</div></div></details>';
  }
  C.recordsView = state => {
    const head = heading('시술 노트', '방법과 고객의 반응을 이어서 남겨요', button('new-record', C.icon('plus') + '기록 추가'));
    if (state.recordsLoading) return head + '<p class="cc-empty" role="status">지난 기록을 불러오고 있어요…</p>';
    if (state.recordsError) return head + failure(state.recordsError, 'retry-records');
    if (!state.records.length) return head + '<div class="cc-empty"><p>첫 시술 노트를 남겨보세요.</p><span>다음 방문 때 같은 내용을 다시 쓸 수 있어요.</span></div>';
    return head + state.records.map(recordRow).join('') + (state.total > state.records.length ?
      button('more-records', state.moreBusy ? '불러오는 중…' : '이전 기록 더 보기', 'cc-more', state.moreBusy ? 'disabled' : '') : '');
  };
  C.referralsView = state => {
    const head = heading('소개로 이어진 고객', '누가 소개해 주셨는지 기억해요',
      !state.loading && !state.careError ? button('edit-referrer', state.care?.referrer ? '변경' : '소개자 지정') : '');
    if (state.loading) return head + '<p class="cc-empty" role="status">소개 기록을 불러오고 있어요…</p>';
    if (state.careError) return head + failure(state.careError, 'retry');
    const data = state.care;
    const referrer = data.referrer;
    const incoming = '<div class="cc-referrer"><span class="cc-muted">이 고객을 소개한 분</span>' +
      (referrer ? button('open-customer', esc(referrer.name) + ' 님 ' + C.icon('chevron-right'), 'cc-person', 'data-id="' + esc(referrer.id) + '"') :
        '<strong>아직 지정하지 않았어요</strong>') + '</div>';
    const list = data.referred_customers || [];
    const count = Number(data.referred_total || 0);
    return head + incoming + '<div class="cc-referrals"><span class="cc-muted">소개해 주신 고객 <b>' + count + '명</b></span>' +
      (list.length ? '<div class="cc-person-list">' + list.map(c => button('open-customer', esc(c.name) + ' 님', 'cc-person',
        'data-id="' + esc(c.id) + '"')).join('') + '</div>' : '<p>소개로 이어진 인연이 생기면 여기에 모여요.</p>') +
      (count > list.length ? button('more-referrals', '소개 고객 더 보기', 'cc-more') : '') + '</div>';
  };
  C.paint = state => {
    const root = state.root;
    root.innerHTML = '<section class="cc-card cc-plan" data-cc-section="plan">' + C.planView(state) + '</section>' +
      '<section class="cc-card" data-cc-section="records">' + C.recordsView(state) + '</section>' +
      '<section class="cc-card" data-cc-section="referrals">' + C.referralsView(state) + '</section>';
  };
})();
