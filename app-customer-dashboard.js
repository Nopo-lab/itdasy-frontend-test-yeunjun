/* ─────────────────────────────────────────────────────────────
   고객 통합 대시보드 (Phase 4+ · 2026-04-20)

   GET /customers/{id}/dashboard 에서
     customer / segment / stats / retention / recent_revenues / recent_bookings
   받아 하나의 예쁜 대시보드로 렌더.

   openCustomerDashboard(id) 로 진입 — 기존 app-customer.js 의 행 클릭이 이걸 호출.
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  // 단골 ⭐ 미세 펄스 애니메이션 (1회 주입)
  if (typeof document !== 'undefined' && !document.getElementById('cm-membership-style')) {
    const st = document.createElement('style');
    st.id = 'cm-membership-style';
    st.textContent = `
      @keyframes cmStarPulse { 0%{transform:scale(1);} 50%{transform:scale(1.18);} 100%{transform:scale(1);} }
      .cm-toggle--pulse { animation: cmStarPulse 0.45s ease-out 1; }
      .cm-star-on svg { animation: cmStarPulse 0.5s ease-out 1; }
    `;
    document.head.appendChild(st);
  }

  function _esc(s) { return window._esc(s); } /* [2026-06-11] 중복 제거 — app-core 정본 위임 */

  // [2026-05-19] _formatKRW 삭제 → formatMoney (format-money.js 공통 유틸)

  async function _apiGet(path) {
    if (!window.API || !window.authHeader) throw new Error('no-auth');
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 22000); // Railway cold start 대응 22s
    try {
      const res = await apiFetch(path, {
        headers: window.authHeader(),
        signal: ctrl.signal
      });
      clearTimeout(tid);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        const err = new Error(d.detail || ('HTTP ' + res.status));
        err.status = res.status;
        throw err;
      }
      return await res.json();
    } catch (e) {
      clearTimeout(tid);
      throw e;
    }
  }

  // ── UI ──────────────────────────────────────────────────
  function _ensureSheet() {
    let sheet = document.getElementById('customerDashSheet');
    if (sheet) return sheet;
    sheet = document.createElement('div');
    sheet.id = 'customerDashSheet';
    // [v208] 풀화면 시트 — PC 디테일과 동일한 v4 본문을 그대로 표시.
    // [핫픽스D #3] z-index 10600 — 잇비 채팅(assistantSheet 10500) 위로 떠야 함(채팅에서 "고객 기록 열기" 시 뒤에 깔리던 버그).
    sheet.style.cssText = 'position:fixed;inset:0;z-index:10600;display:none;background:var(--surface,#fff);overflow-y:auto;';
    sheet.innerHTML = `
      <div class="cust-detail" style="position:relative;width:100%;max-width:720px;margin:0 auto;min-height:100vh;background:var(--surface,#fff);">
        <div class="cv4-detail-mobile-head">
          <button class="back" data-customer-dashboard-close aria-label="뒤로가기">‹</button>
          <div style="flex:1;text-align:center;font-size:15px;font-weight:600;color:var(--text);">고객 정보</div>
          <div style="width:36px;"></div>
        </div>
        <div id="cdBody" class="cv4-detail-mobile-body"></div>
      </div>
    `;
    document.body.appendChild(sheet);
    sheet.querySelector('[data-customer-dashboard-close]')?.addEventListener('click', () => closeCustomerDashboard());
    sheet.addEventListener('click', (e) => { if (e.target === sheet) closeCustomerDashboard(); });
    return sheet;
  }

  // 현재 열려 있는 고객 id 기억 (data-changed 이벤트 시 재로드용)
  let _currentCustomerId = null;

  // ── [v208] v4 디테일 (목업 mockup-customer-v4.html 이식) ─────
  function _visitBadgeClass(vc) {
    if (vc >= 10) return 'b3';
    if (vc >= 3)  return 'b2';
    return 'b1';
  }
  function _topService(rows) {
    if (!Array.isArray(rows) || !rows.length) return null;
    const count = {};
    rows.forEach(r => {
      const n = (r && r.service_name) ? String(r.service_name).trim() : '';
      if (n) count[n] = (count[n] || 0) + 1;
    });
    let best = null, bestCount = 0;
    for (const k in count) { if (count[k] > bestCount) { best = k; bestCount = count[k]; } }
    return best;
  }
  function _nextExpectedDate(stats, customer) {
    const lastIso = stats && stats.last_visit_at;
    const avgDays = (customer && +customer.avg_cycle_weeks > 0)
      ? Math.round(+customer.avg_cycle_weeks * 7)
      : null;
    if (!lastIso || !avgDays) return null;
    try {
      const d = new Date(lastIso);
      d.setDate(d.getDate() + avgDays);
      return (d.getMonth() + 1) + '/' + d.getDate();
    } catch (_e) { return null; }
  }

  function _detailModel(d) {
    const c = (d && d.customer) || {};
    const stats = (d && d.stats) || {};
    const revenues = (d && d.recent_revenues) || [];
    const vc = Number(stats.visit_count || c.visit_count || 0);
    const totalRev = Number(stats.total_revenue || 0);
    const avgDays = (c.avg_cycle_weeks ? Math.round(+c.avg_cycle_weeks * 7) : 0)
      || (d.retention && d.retention.avg_interval_days)
      || 0;
    return {
      c,
      stats,
      revenues,
      vc,
      totalMan: totalRev > 0 ? Math.round(totalRev / 10000) : 0,
      avgDays,
      badge: _visitBadgeClass(vc),
      phone: c.phone ? _esc(c.phone) : '',
      nextDate: _nextExpectedDate(stats, c),
    };
  }

  function _renderAiNudge(nextDate) {
    if (!nextDate) return '';
    return `<div class="nudge"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#BC6675" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-right:6px"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"/><path d="M19 13l.75 2.25L22 16l-2.25.75L19 19l-.75-2.25L16 16l2.25-.75L19 13z"/><path d="M5 17l.5 1.5L7 19l-1.5.5L5 21l-.5-1.5L3 19l1.5-.5L5 17z"/></svg> AI 잇비 다음 방문일 예상: ${_esc(nextDate)}</div>`;
  }

  function _renderDetailHeader(m) {
    return `
      <div class="d-header">
        <div class="d-name-row">
          <div style="display:flex;align-items:center;">
            <div class="d-name">${_esc(m.c.name || '손님')} 님</div>
            <span class="d-badge-lg c-badge ${m.badge}">${m.vc}회 방문</span>
          </div>
        </div>
        ${m.phone ? `<div class="d-phone">${m.phone}</div>` : ''}
        <div class="d-actions">
          <button class="d-act primary" data-cv4-act="booking">예약 잡기</button>
          ${m.phone ? `<button class="d-act ghost" data-cv4-act="call">전화</button>` : ''}
          <button class="d-act ghost" data-cv4-act="edit">정보수정</button>
          <button class="d-act danger" data-cv4-act="delete">삭제</button>
        </div>
      </div>
    `;
  }

  function _renderDetailCards(m) {
    return `
      <div class="d-cards">
        <div class="dc"><div class="dc-v">${m.vc}<small>회</small></div><div class="dc-l">총 방문일</div></div>
        <div class="dc"><div class="dc-v">${m.totalMan}<small>만</small></div><div class="dc-l">총 매출</div></div>
        <div class="dc"><div class="dc-v">${m.avgDays || '—'}<small>${m.avgDays ? '일' : ''}</small></div><div class="dc-l">평균 재방문 일</div></div>
      </div>
    `;
  }

  function _renderRevenueRow(r, hidden) {
    const dt = String(r.recorded_at || '').slice(5, 10).replace('-', '/');
    const amt = Number(r.amount) || 0;
    const man = amt > 0 ? Math.round(amt / 10000) + '만' : '-';
    const extra = hidden ? ' hidden" data-vr-extra="1' : '';
    return `<div class="vr${extra}"><div class="vr-d">${_esc(dt)}</div><div class="vr-s">${_esc(r.service_name || '시술')}</div><div class="vr-p">${man}</div></div>`;
  }

  function _renderRevenueSection(revenues) {
    if (!revenues.length) return '';
    const rows = revenues.slice(0, 5).map(r => _renderRevenueRow(r, false)).join('');
    const hidden = revenues.slice(5, 20).map(r => _renderRevenueRow(r, true)).join('');
    const more = revenues.length > 5 ? '<span class="d-sec-link" data-cv4-act="toggle-more">더보기</span>' : '';
    return `
      <div class="d-sec"><span>시술 기록</span>${more}</div>
      <div style="font-size:11px;color:var(--text-muted,#999);padding:0 4px 4px;">최근 15~20건의 시술 기록을 저장합니다</div>
      <div class="vr-wrap">${rows}${hidden}</div>
    `;
  }

  // [T-005 2026-05-29] 시술 사진 타임라인 — 비동기 채움(로컬 갤러리 + 백엔드 recent_photos).
  //   _buildDetailHTMLv4 는 동기라 placeholder 만 두고, mount 후 _fillPhotoTimeline 이 채운다.
  function _photoThumb(src, label) {
    if (!src) return '';
    return `<div style="position:relative;aspect-ratio:1/1;border-radius:10px;overflow:hidden;background:var(--surface-2,#f2f2f2);"><img src="${src}" alt="${_esc(label || '시술 사진')}" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block;" /></div>`;
  }
  function _renderPhotoSection(customerId) {
    const cid = _esc(String(customerId == null ? '' : customerId));
    return `<div class="d-sec" data-cv4-photos-head hidden style="margin-top:6px;"><span>시술 사진</span></div>
      <div id="cv4-photos-${cid}" data-cv4-photos style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:0 4px 4px;"></div>`;
  }
  // [T-107] dedupeKey 가 같은 항목은 최신 ts 1개만 남김. 키 없는 항목(구 데이터/백엔드)은 모두 유지.
  function _dedupePhotoItems(items) {
    const byKey = new Map();
    const out = [];
    (items || []).forEach(it => {
      if (!it || !it.src) return;
      if (!it.dedupeKey) { out.push(it); return; }
      const prev = byKey.get(it.dedupeKey);
      if (!prev) { byKey.set(it.dedupeKey, it); out.push(it); }
      else if ((it.ts || 0) > (prev.ts || 0)) {
        prev.src = it.src; prev.label = it.label; prev.ts = it.ts; // 최신으로 교체(자리 유지)
      }
    });
    return out;
  }

  async function _fillPhotoTimeline(scopeEl, d) {
    if (!scopeEl) return;
    const wrap = scopeEl.querySelector('[data-cv4-photos]');
    if (!wrap) return;
    const cid = (d && d.customer && d.customer.id != null) ? d.customer.id : null;
    let items = [];
    // 1) 로컬 갤러리 (오프라인 동작, 1차 소스). dedupeKey/시각을 함께 보존(T-107).
    try {
      if (cid != null && typeof window.loadGalleryItemsByCustomer === 'function') {
        const local = await window.loadGalleryItemsByCustomer(cid);
        (local || []).forEach(it => {
          const ts = it.updatedAt || it.savedAt || 0;
          (it.photos || []).forEach(p => {
            if (p && p.dataUrl) items.push({ src: p.dataUrl, label: it.label, dedupeKey: it.dedupeKey || null, ts });
          });
        });
      }
    } catch (_e) { void 0; }
    // 2) 백엔드 recent_photos (있으면 병합). 현재 대시보드 응답엔 없어 보통 빈 값.
    try {
      const rp = (d && (d.recent_photos || (d.stats && d.stats.recent_photos))) || [];
      (rp || []).forEach(p => {
        const src = typeof p === 'string' ? p : (p && (p.url || p.photo_url || p.src) || '');
        const label = (p && typeof p === 'object') ? (p.service_name || '') : '';
        if (src) items.push({ src, label, dedupeKey: null, ts: 0 });
      });
    } catch (_e) { void 0; }
    // [T-107] dedupeKey 기준 중복 제거 — 같은 키는 최신(updatedAt/savedAt) 1개만. 키 없으면 그대로 유지.
    items = _dedupePhotoItems(items);
    if (!items.length) return; // 빈 상태 — 섹션 숨김 유지
    const head = scopeEl.querySelector('[data-cv4-photos-head]');
    if (head) head.hidden = false;
    wrap.innerHTML = items.slice(0, 12).map(it => _photoThumb(it.src, it.label)).join('');
  }

  function _buildDetailHTMLv4(d) {
    const m = _detailModel(d);
    const top = _topService(m.revenues);
    const pref = top ? `<div class="d-sec"><span>선호 시술</span></div><div class="d-pref">${_esc(top)}</div>` : '';
    const memo = m.c.memo ? `<div class="d-sec"><span>메모</span></div><div class="memo">${_esc(m.c.memo)}</div>` : '';
    return `
      <div class="cv4-detail">
        ${_renderDetailHeader(m)}
        ${_renderAiNudge(m.nextDate)}
        ${_renderDetailCards(m)}
        ${pref}
        ${_renderPhotoSection(m.c.id)}
        ${_renderRevenueSection(m.revenues)}
        ${memo}
      </div>
    `;
  }
  function _bindDetailV4(scopeEl, d) {
    if (!scopeEl) return;
    const c = (d && d.customer) || {};
    scopeEl.querySelectorAll('[data-cv4-act]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const act = btn.dataset.cv4Act;
        if (act === 'booking') {
          // 모바일 시트면 닫고 캘린더 진입. PC 한 화면 분할이면 그대로.
          if (document.getElementById('customerDashSheet')?.style.display === 'flex') {
            closeCustomerDashboard();
          }
          window._pendingBookingCustomer = { id: c.id, name: c.name };
          if (typeof window.openCalendarView === 'function') window.openCalendarView();
          else if (typeof window.openBooking === 'function') window.openBooking();
        } else if (act === 'call') {
          if (c.phone) window.location.href = 'tel:' + String(c.phone).replace(/[^0-9+]/g, '');
        } else if (act === 'delete') {
          // [A7] 삭제 확인 메시지 통일 + [A8] 1번만 확인 후 API 직접 호출 (4중 확인 방지)
          window._inlineConfirm('이 고객을 삭제하면 시술 기록도 함께 삭제돼요. 계속할까요?', () => {
            // [A8] Customer.remove 직접 호출 — _customerDelete 는 자체 confirm 이 있어서 중복됨
            const removeFn = (window.Customer && window.Customer.remove) ? window.Customer.remove : null;
            if (!removeFn) {
              if (window.showToast) window.showToast('삭제 함수 미준비');
              return;
            }
            Promise.resolve(removeFn(c.id))
              .then(() => {
                if (window.showToast) window.showToast('삭제됐어요');
                // 모바일 시트 닫기 (열려있는 경우)
                if (typeof window.closeCustomerDashboard === 'function') window.closeCustomerDashboard();
                // PC 디테일 mount 정리 (열려있는 경우)
                const pcMount = document.querySelector('#customerSheet #cdDetailMount');
                if (pcMount) pcMount.innerHTML = '<div class="pc-r-empty">왼쪽에서 손님을 선택하세요</div>';
              })
              .catch((err) => {
                console.warn('[customer delete]', err);
                if (window.showToast) window.showToast('삭제 실패 — 다시 시도해주세요');
              });
          });
        } else if (act === 'edit') {
          // [v212] 편집 — 이름/전화/메모/생일/태그 수정 (인라인 시트)
          if (typeof window._openCustomerEditSheet === 'function') {
            window._openCustomerEditSheet(c);
          } else if (window.showToast) {
            window.showToast('편집 기능 준비 중');
          }
        } else if (act === 'toggle-more') {
          // [v211] data-vr-extra 로 모든 추가 row 토글 — 한 번 펼친 후 다시 접기도 동작
          scopeEl.querySelectorAll('.vr[data-vr-extra]').forEach(el => el.classList.toggle('hidden'));
          btn.textContent = btn.textContent === '더보기' ? '접기' : '더보기';
        }
      });
    });
  }
  window._renderCustomerDetail = async function (mountEl, customerId) {
    if (!mountEl || !customerId) return;
    mountEl.innerHTML = '<div style="padding:40px 20px;text-align:center;color:#888;font-size:13px;">불러오는 중…</div>';
    try {
      const d = await _apiGet('/customers/' + customerId + '/dashboard');
      mountEl.innerHTML = _buildDetailHTMLv4(d);
      _bindDetailV4(mountEl, d);
      _fillPhotoTimeline(mountEl, d);
      // [T-101] 잇비 "이 손님" 컨텍스트에 이름 채움 (UI 에 표시된 이름만).
      try {
        const _nm = (d && d.customer && d.customer.name) || '';
        window.__ITDASY_CURRENT_CUSTOMER__ = { id: customerId, name: _nm };
      } catch (_e) { void 0; }
    } catch (e) {
      // 폴백 — /customers/{id} 만 받아서 최소 정보 표시
      try {
        const cust = await _apiGet('/customers/' + customerId);
        const fb = { customer: cust, stats: {}, recent_revenues: [] };
        mountEl.innerHTML = _buildDetailHTMLv4(fb);
        _bindDetailV4(mountEl, fb);
        _fillPhotoTimeline(mountEl, fb);
        if (typeof window.showToast === 'function') window.showToast('기본 정보로 표시 중이에요');
      } catch (_) {
        mountEl.innerHTML = `<div style="padding:40px 20px;text-align:center;color:var(--danger);font-size:13px;">불러오기 실패<br><span style="color:#888;font-size:11px;">${_esc(e?.message || '네트워크 오류')}</span></div>`;
      }
    }
  };

  window.openCustomerDashboard = async function (id) {
    if (!id) return;
    _currentCustomerId = id;
    // [T-101] 잇비 "이 손님" 컨텍스트 — 이름은 detail 로드 후 채움.
    try { window.__ITDASY_CURRENT_CUSTOMER__ = { id: id, name: '' }; } catch (_e) { void 0; }
    _ensureSheet();
    const sheet = document.getElementById('customerDashSheet');
    sheet.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    // [핫픽스D #3] 공통 시트-백 레지스트리 등록 — Android/브라우저 back 으로 상세만 닫히고
    //   소스(고객목록/잇비)로 복귀(내샵관리·홈으로 튀지 않게). 중복 등록·중복 push 는 멱등.
    try {
      if (typeof window._registerSheet === 'function') window._registerSheet('customerDash', window.closeCustomerDashboard);
      if (typeof window._markSheetOpen === 'function' && (window._sheetBackStack || []).lastIndexOf('customerDash') < 0) window._markSheetOpen('customerDash');
    } catch (_e) { void _e; }
    const body = sheet.querySelector('#cdBody');

    // id 형식 검증 — 비어있거나 숫자/문자열 아니면 안내. 백엔드는 정수 PK 사용.
    if (id == null || (typeof id !== 'number' && typeof id !== 'string') || String(id).trim() === '') {
      console.warn('[customer-dashboard] invalid id:', id);
      body.innerHTML = `
        <div style="padding:40px 20px;text-align:center;">
          <div style="font-size:13px;color:var(--danger);">손님 정보를 찾을 수 없어요</div>
          <div style="font-size:11px;color:#888;margin-top:4px;">잘못된 손님 식별자입니다.</div>
        </div>
      `;
      return;
    }
    // [v208] 디테일 내용은 v4 마크업으로 공통 (PC 한 화면 분할도 같은 _renderCustomerDetail 사용)
    await window._renderCustomerDetail(body, id);
  };

  window.closeCustomerDashboard = function () {
    const sheet = document.getElementById('customerDashSheet');
    if (sheet) sheet.style.display = 'none';
    document.body.style.overflow = '';
    _currentCustomerId = null;
    // [핫픽스D #3] 시트-백 스택에서 제거(멱등). back 으로 닫힐 때 popstate 와 중복 처리 안 되게.
    try { if (typeof window._markSheetClosed === 'function') window._markSheetClosed('customerDash'); } catch (_e) { void _e; }
    // [T-101] "이 손님" 컨텍스트 해제.
    try { window.__ITDASY_CURRENT_CUSTOMER__ = null; } catch (_e) { void 0; }
    // [Phase3-B #4] 잇비 대화에서 열었으면 닫을 때 잇비로 복귀(다른 경로는 밑의 화면 그대로 노출).
    let _ret = null;
    try { _ret = window.__ITDASY_CUSTOMER_RETURN__; window.__ITDASY_CUSTOMER_RETURN__ = null; } catch (_e) { void 0; }
    if (_ret === 'itbi_chat' && typeof window.openAssistant === 'function') {
      try { window.openAssistant(); } catch (_e) { void 0; }
    }
  };

  function _customerEditHtml(c, isNew) {
    const tags = Array.isArray(c.tags) ? c.tags.join(', ') : '';
    const title = isNew ? '고객 추가' : '고객 정보수정';
    const saveLabel = isNew ? '추가' : '저장';
    return `
      <div style="background:var(--surface,#fff);border-radius:18px;width:100%;max-width:480px;max-height:88vh;overflow-y:auto;padding:24px;box-shadow:0 24px 64px rgba(0,0,0,0.18);">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
          <strong style="font-size:18px;color:var(--text);">${title}</strong>
          <button type="button" id="custEditClose" aria-label="닫기" style="background:var(--surface-2,#F7F8FA);border:none;width:32px;height:32px;border-radius:50%;font-size:14px;cursor:pointer;color:var(--text);">✕</button>
        </div>
        <label style="display:block;font-size:12px;color:#888;margin-bottom:4px;">이름 *</label>
        <input id="cedName" type="text" maxlength="50" value="${_esc(c.name || '')}" style="width:100%;height:42px;padding:0 14px;border-radius:10px;border:1px solid var(--border,#E5E7EB);background:var(--surface,#fff);font-size:14px;color:var(--text);outline:none;font-family:inherit;margin-bottom:14px;" />
        <label style="display:block;font-size:12px;color:#888;margin-bottom:4px;">전화번호</label>
        <input id="cedPhone" type="tel" maxlength="20" value="${_esc(c.phone || '')}" placeholder="010-1234-5678" style="width:100%;height:42px;padding:0 14px;border-radius:10px;border:1px solid var(--border,#E5E7EB);background:var(--surface,#fff);font-size:14px;color:var(--text);outline:none;font-family:inherit;margin-bottom:14px;" />
        <label style="display:block;font-size:12px;color:#888;margin-bottom:4px;">생일 (MM-DD)</label>
        <input id="cedBirthday" type="text" maxlength="5" value="${_esc(c.birthday || '')}" placeholder="03-14" style="width:100%;height:42px;padding:0 14px;border-radius:10px;border:1px solid var(--border,#E5E7EB);background:var(--surface,#fff);font-size:14px;color:var(--text);outline:none;font-family:inherit;margin-bottom:14px;" />
        <label style="display:block;font-size:12px;color:#888;margin-bottom:4px;">태그 (쉼표 구분)</label>
        <input id="cedTags" type="text" value="${_esc(tags)}" placeholder="VIP, 속눈썹, 단골" style="width:100%;height:42px;padding:0 14px;border-radius:10px;border:1px solid var(--border,#E5E7EB);background:var(--surface,#fff);font-size:14px;color:var(--text);outline:none;font-family:inherit;margin-bottom:14px;" />
        <label style="display:block;font-size:12px;color:#888;margin-bottom:4px;">메모</label>
        <textarea id="cedMemo" maxlength="500" rows="4" placeholder="두피 예민함, 토요일 오전 선호 등" style="width:100%;padding:12px 14px;border-radius:10px;border:1px solid var(--border,#E5E7EB);background:var(--surface,#fff);font-size:14px;color:var(--text);outline:none;font-family:inherit;resize:vertical;line-height:1.5;margin-bottom:20px;">${_esc(c.memo || '')}</textarea>
        <div style="display:flex;gap:8px;">
          <button type="button" id="custEditCancel" style="flex:1;padding:12px;border:1px solid var(--border,#E5E7EB);border-radius:12px;background:var(--surface,#fff);font-size:14px;font-weight:600;cursor:pointer;color:#666;">취소</button>
          <button type="button" id="custEditSave" style="flex:2;padding:12px;border:none;border-radius:12px;background:var(--text,#111);color:var(--surface,#fff);font-size:14px;font-weight:600;cursor:pointer;">${saveLabel}</button>
        </div>
      </div>
    `;
  }

  function _readCustomerEditPayload(wrap) {
    const name = wrap.querySelector('#cedName').value.trim();
    if (!name) {
      if (window.showToast) window.showToast('이름은 필수예요');
      return null;
    }
    return {
      name: name.slice(0, 50),
      phone: wrap.querySelector('#cedPhone').value.trim() || null,
      birthday: wrap.querySelector('#cedBirthday').value.trim() || null,
      tags: wrap.querySelector('#cedTags').value.split(',').map(t => t.trim()).filter(Boolean).slice(0, 10),
      memo: wrap.querySelector('#cedMemo').value.trim() || null,
    };
  }

  function _refreshCustomerDetailViews(id) {
    const pcMount = document.querySelector('#customerSheet #cdDetailMount');
    if (pcMount && pcMount.querySelector('.cv4-detail')) {
      window._renderCustomerDetail(pcMount, id);
    }
    if (_currentCustomerId === id) {
      const mobileBody = document.querySelector('#customerDashSheet #cdBody');
      if (mobileBody) window._renderCustomerDetail(mobileBody, id);
    }
  }

  async function _saveCustomerEdit(c, isNew, payload, close) {
    const Customer = window.Customer;
    if (!Customer) {
      if (window.showToast) window.showToast('저장 함수 미준비');
      return;
    }
    try {
      if (isNew) {
        await Customer.create(payload);
        if (window.showToast) window.showToast(`${payload.name} 추가됨`);
      } else {
        await Customer.update(c.id, payload);
        if (window.showToast) window.showToast('저장 완료');
        _refreshCustomerDetailViews(c.id);
      }
      close();
    } catch (e) {
      console.warn('[customer edit]', e);
      // [출시감사 2026-08-05 P1-5] 서버가 준 이유를 그대로 전한다.
      //   예전엔 상태코드와 무관하게 "다시 시도해주세요" 하나였다. 특히 409(중복)는
      //   재시도해도 영원히 실패하는데 재시도하라고 안내했고, 전화번호 없는 동명이인 2번째
      //   손님은 그래서 **끝내 등록할 수 없었다**(실측).
      const txt = typeof window.CustomerErrorText === 'function'
        ? window.CustomerErrorText(e, isNew ? '추가' : '저장')
        : (isNew ? '추가 실패 — 다시 시도해주세요' : '저장 실패 — 다시 시도해주세요');
      if (window.showToast) window.showToast(txt);
      // 중복이면 기존 손님을 열어준다 — 원장님이 원한 건 "이 손님 기록" 이지 새 행이 아니다.
      if (e && e.code === 'duplicate_customer' && e.detail && e.detail.existing_id) {
        close();
        setTimeout(() => window.openCustomerDashboard && window.openCustomerDashboard(e.detail.existing_id), 350);
      }
    }
  }

  function _bindCustomerEditModal(wrap, c, isNew, close) {
    wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
    wrap.querySelector('#custEditClose').addEventListener('click', close);
    wrap.querySelector('#custEditCancel').addEventListener('click', close);
    wrap.querySelector('#cedName').focus();
    wrap.querySelector('#custEditSave').addEventListener('click', async (ev) => {
      // [보안감사 M-6 2026-07-26] 저장 버튼 연타 이중제출 가드 — 예전엔 pick 경로만 방어돼 이 모달은
      //   연타 시 Customer.create/update 가 2회 나가 옵티미스틱 2건·"추가 실패" 오인 토스트가 났다.
      const _btn = ev.currentTarget;
      if (_btn.dataset.busy === '1') return;
      const payload = _readCustomerEditPayload(wrap);
      if (!payload) return;
      _btn.dataset.busy = '1'; _btn.disabled = true;
      try { await _saveCustomerEdit(c, isNew, payload, close); }
      finally { _btn.dataset.busy = '0'; _btn.disabled = false; }
    });
  }

  // [v212] 편집 모달 — 이름/전화/생일/메모/태그 수정
  // [v220] 정보수정 + 신규 추가 공용 모달.
  //   - c 가 null/undefined 또는 c.id 없으면 신규 추가 (Customer.create)
  //   - c.id 있으면 정보수정 (Customer.update)
  window._openCustomerEditSheet = function (c) {
    c = c || {};
    const isNew = !c.id;
    const old = document.getElementById('custEditModal');
    if (old) old.remove();
    const wrap = document.createElement('div');
    wrap.id = 'custEditModal';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:10010;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;padding:20px;';
    wrap.innerHTML = _customerEditHtml(c, isNew);
    document.body.appendChild(wrap);
    const close = () => wrap.remove();
    _bindCustomerEditModal(wrap, c, isNew, close);
  };

  // Wave D3 (2026-04-24) — 챗봇·외부 데이터 변경 감지 → 고객 상세 대시보드 재로드
  // customer_id 지정 없어도 전체 영향 가능 (매출/예약 은 고객 dashboard 의 stats 에 영향)
  if (typeof window !== 'undefined' && !window._customerDashboardDataListenerInit) {
    window._customerDashboardDataListenerInit = true;
    window.addEventListener('itdasy:data-changed', async (e) => {
      if (!_currentCustomerId) return;
      const k = (e && e.detail && e.detail.kind) || '';
      if (!k) return;
      // [보안감사 M-8 2026-07-26] 현재 보고 있는 고객이 삭제되면(모바일 풀시트) 시트를 닫는다.
      //   예전엔 affects 에 delete_customer 가 없어 삭제된 고객 상세가 그대로 남아 유령 id 로 후속 액션 위험.
      if (k === 'delete_customer') {
        const _delId = e && e.detail && e.detail.customer_id;
        if (_delId == null || String(_delId) === String(_currentCustomerId)) {
          const _sh = document.getElementById('customerDashSheet');
          if (_sh && _sh.style.display !== 'none') {
            if (typeof window.closeCustomerDashboard === 'function') window.closeCustomerDashboard();
            else _sh.style.display = 'none';
          }
        }
        return;
      }
      const affects = ['update_customer', 'create_revenue', 'update_revenue', 'create_booking',
                       'update_booking', 'delete_booking', 'cancel_booking', 'reschedule_booking'];
      if (!affects.includes(k)) return;
      const sheet = document.getElementById('customerDashSheet');
      if (!sheet || sheet.style.display === 'none') return;
      try {
        // 현재 열린 dashboard 다시 로드
        await window.openCustomerDashboard(_currentCustomerId);
      } catch (_err) { void _err; }
    });
  }
})();
