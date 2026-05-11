/* ─────────────────────────────────────────────────────────────
   E3 (2026-04-26) — 검색 가능 AI 고객 메모

   원장님이 시술 후 짧은 메모(예: "김서연 알러지 글루 X, 옴브레, 8주 단위로 옴")를
   입력하면 백엔드 Gemini 가 자동 태그 + 알러지·주의 신호를 추출해 저장.
   다음 방문 시 빨간 경고 배너가 자동으로 떠서 사고를 방지.

   API:
   - POST   /customers/{id}/memos                  생성 (Gemini 자동 태그)
   - GET    /customers/{id}/memos                  목록
   - DELETE /customers/{id}/memos/{memo_id}        삭제
   - GET    /customers/memos/search?q=...          전체 검색
   - GET    /customers/{id}/memos/warnings         경고 메모만 (예약 폼용)

   외부 노출:
   - window.CustomerMemo.openSection(customerId, customerName, containerEl)
       고객 대시보드 등 임의 컨테이너에 메모 섹션 인라인 주입.
   - window.CustomerMemo.fetchWarnings(customerId)
       해당 고객의 경고 메모 배열 반환 (예약 폼에서 빨간 배너 표시용).
   - window.CustomerMemo.renderWarningBanner(memos)
       경고 메모 배열 → HTML 문자열 (<div class="cm-warn-banner">...).
   - window.CustomerMemo.openSearch()
       전체 메모 검색 시트 오픈.
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  // ── 1회성 스타일 주입 ──────────────────────────────────
  if (typeof document !== 'undefined' && !document.getElementById('cm-memo-style')) {
    const st = document.createElement('style');
    st.id = 'cm-memo-style';
    st.textContent = [
      '.cm-memo-card{padding:10px 12px;background:#fff;border-radius:12px;border:1px solid rgba(0,0,0,0.06);margin-bottom:8px;}',
      '.cm-memo-card--warn{background:#FFF1F2;border-color:#FCA5A5;border-left:3px solid #DC2626;}',
      '.cm-memo-tag{display:inline-block;font-size:10px;padding:2px 8px;background:#F3F4F6;color:#374151;border-radius:6px;margin-right:4px;margin-top:4px;font-weight:600;}',
      '.cm-memo-tag--warn{background:#FEE2E2;color:#B91C1C;}',
      '.cm-memo-meta{font-size:10px;color:#9CA3AF;margin-top:4px;display:flex;align-items:center;gap:6px;}',
      '.cm-memo-text{font-size:13px;color:#374151;line-height:1.5;white-space:pre-wrap;}',
      '.cm-memo-textarea{width:100%;padding:10px;border:1px solid #E5E7EB;border-radius:10px;font-size:13px;line-height:1.5;resize:vertical;min-height:60px;font-family:inherit;background:#fff;color:#222;box-sizing:border-box;}',
      '.cm-memo-textarea:focus{outline:none;border-color:var(--brand);}',
      '.cm-memo-btn{padding:10px 14px;background:linear-gradient(135deg,var(--brand),var(--brand-strong));color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;}',
      '.cm-memo-btn:disabled{opacity:0.5;cursor:not-allowed;}',
      '.cm-memo-btn-ghost{padding:6px 10px;background:transparent;color:#9CA3AF;border:none;font-size:11px;cursor:pointer;}',
      '.cm-memo-btn-ghost:hover{color:#DC2626;}',
      '.cm-warn-banner{padding:12px 14px;background:linear-gradient(135deg,#FEE2E2,#FCA5A5);border-radius:12px;border:1px solid #DC2626;margin-bottom:12px;color:#991B1B;}',
      '.cm-warn-banner strong{color:#991B1B;font-weight:800;}',
      '.cm-warn-banner ul{margin:6px 0 0;padding-left:20px;font-size:12px;line-height:1.6;}',
      '.cm-search-input{width:100%;padding:12px 14px;border:1px solid #E5E7EB;border-radius:12px;font-size:14px;box-sizing:border-box;}',
      '.cm-search-input:focus{outline:none;border-color:var(--brand);}',
    ].join('');
    document.head.appendChild(st);
  }

  // ── 공통 유틸 ───────────────────────────────────────
  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
  }
  function _dateShort(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return `${d.getFullYear()}. ${String(d.getMonth() + 1).padStart(2, '0')}. ${String(d.getDate()).padStart(2, '0')}`;
  }

  async function _api(method, path, body) {
    if (!window.API || !window.authHeader) throw new Error('no-auth');
    const auth = window.authHeader();
    if (!auth || !auth.Authorization) throw new Error('no-token');
    const opts = { method, headers: Object.assign({}, auth) };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(window.API + path, opts);
    if (res.status === 404 || res.status === 501) throw new Error('endpoint-missing');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.status === 204 ? null : await res.json();
  }

  // ── 메모 카드 렌더 ──────────────────────────────────
  function _memoCard(m) {
    const tags = (m.tags || []).slice(0, 6);
    const cls = m.is_warning ? 'cm-memo-card cm-memo-card--warn' : 'cm-memo-card';
    return [
      '<div class="', cls, '" data-cm-memo="', m.id, '">',
        '<div class="cm-memo-text">', _esc(m.text), '</div>',
        tags.length ? '<div style="margin-top:6px;">' + tags.map(t => {
          const tcls = m.is_warning ? 'cm-memo-tag cm-memo-tag--warn' : 'cm-memo-tag';
          return '<span class="' + tcls + '">#' + _esc(t) + '</span>';
        }).join('') + '</div>' : '',
        '<div class="cm-memo-meta">',
          m.is_warning ? '<span style="color:#DC2626;font-weight:700;">시술 전 확인</span>' : '',
          '<span>', _dateShort(m.created_at), '</span>',
          '<span style="margin-left:auto;">',
            '<button type="button" class="cm-memo-btn-ghost" data-cm-del="', m.id, '">삭제</button>',
          '</span>',
        '</div>',
      '</div>',
    ].join('');
  }

  // 플랜별 메모 한도 — Free 20 / Pro·Premium 무제한 (사용자 확정 2026-05-08)
  const FREE_MEMO_LIMIT = 20;
  function _isPaidPlan() {
    try { return typeof window.isPaidPlan === 'function' ? !!window.isPaidPlan() : false; }
    catch (_e) { return false; }
  }
  function _memoLimit() { return _isPaidPlan() ? Infinity : FREE_MEMO_LIMIT; }

  function _renderQuota(quotaEl, count) {
    if (!quotaEl) return;
    const limit = _memoLimit();
    if (limit === Infinity) {
      quotaEl.textContent = `${count}개`;
      quotaEl.style.color = '#9CA3AF';
    } else {
      quotaEl.textContent = `${count} / ${limit}`;
      quotaEl.style.color = (count >= limit) ? '#DC2626' : (count >= limit - 3 ? '#E68A00' : '#9CA3AF');
      quotaEl.title = `Free 플랜은 손님당 메모 ${limit}개까지에요. Pro로 업그레이드하면 무제한이에요.`;
    }
  }

  // ── 메모 섹션 (고객 상세에 인라인 주입) ────────────────
  // count 를 외부로 반환해서 quota UI 갱신에 활용
  async function _loadAndRender(customerId, listEl, quotaEl) {
    listEl.innerHTML = '<div style="padding:12px;color:#9CA3AF;font-size:12px;">불러오는 중…</div>';
    try {
      const d = await _api('GET', '/customers/' + encodeURIComponent(customerId) + '/memos');
      const items = (d && d.items) || [];
      if (quotaEl) _renderQuota(quotaEl, items.length);
      if (!items.length) {
        listEl.innerHTML = '<div style="padding:18px;text-align:center;font-size:12px;color:#9CA3AF;background:#FAFAFA;border-radius:10px;">아직 메모가 없어요. 첫 메모를 적어 보세요</div>';
        return items.length;
      }
      listEl.innerHTML = items.map(_memoCard).join('');
      return items.length;
    } catch (e) {
      console.warn('[customer-memo] list 실패:', e);
      listEl.innerHTML = '<div style="padding:12px;color:#DC2626;font-size:12px;">불러오기 실패. 다시 시도해 주세요.</div>';
      return 0;
    }
  }

  function _bindList(customerId, listEl) {
    listEl.addEventListener('click', async (ev) => {
      const btn = ev.target && ev.target.closest && ev.target.closest('[data-cm-del]');
      if (!btn) return;
      const memoId = btn.getAttribute('data-cm-del');
      if (!memoId) return;
      if (typeof window.confirm === 'function' && !window.confirm('이 메모를 삭제할까요?')) return;
      try {
        await _api('DELETE', '/customers/' + encodeURIComponent(customerId) + '/memos/' + encodeURIComponent(memoId));
        if (window.hapticLight) window.hapticLight();
        if (window.showToast) window.showToast('삭제 완료');
        // 삭제 후 quota 카운트도 갱신 — host 안의 quota 슬롯 룩업
        const host = listEl.closest('[data-cm-memo-section]');
        const quotaEl = host ? host.querySelector('[data-cm-quota]') : null;
        await _loadAndRender(customerId, listEl, quotaEl);
        // 데이터 변경 알림
        try {
          window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'delete_memo', customer_id: customerId } }));
        } catch (_e) { void _e; }
      } catch (e) {
        console.warn('[customer-memo] delete 실패:', e);
        if (window.showToast) window.showToast('삭제 실패 — 다시 시도해 주세요');
      }
    });
  }

  function openSection(customerId, customerName, container) {
    if (!customerId || !container) return;
    // 컨테이너에 이미 섹션이 있으면 재사용
    let host = container.querySelector('[data-cm-memo-section]');
    if (!host) {
      host = document.createElement('div');
      host.setAttribute('data-cm-memo-section', '1');
      host.style.cssText = 'margin-bottom:14px;';
      host.innerHTML = [
        '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">',
          '<i class="ph-duotone ph-pencil-simple" aria-hidden="true"></i>',
          '<strong style="font-size:13px;">시술 메모 <span style="font-size:10px;color:#9CA3AF;font-weight:400;">(AI 자동 태그)</span></strong>',
          '<span data-cm-quota style="font-size:11px;color:#9CA3AF;font-weight:600;margin-left:6px;"></span>',
          '<button type="button" data-cm-search style="margin-left:auto;padding:4px 8px;border:1px solid #E5E7EB;border-radius:8px;background:#fff;font-size:11px;color:#555;cursor:pointer;display:inline-flex;align-items:center;gap:4px;"><i class="ph-duotone ph-magnifying-glass" aria-hidden="true"></i>전체 검색</button>',
        '</div>',
        '<div style="background:#FAFAFA;border:1px solid #E5E7EB;border-radius:12px;padding:10px;margin-bottom:10px;">',
          '<textarea data-cm-input class="cm-memo-textarea" placeholder="예: 알러지 있음 글루 X, 옴브레 좋아함, 8주 단위로 옴" maxlength="2000"></textarea>',
          '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:8px;">',
            '<span data-cm-status style="font-size:11px;color:#9CA3AF;align-self:center;flex:1;"></span>',
            '<button type="button" data-cm-save class="cm-memo-btn">저장</button>',
          '</div>',
        '</div>',
        '<div data-cm-list></div>',
      ].join('');
      container.appendChild(host);

      const inputEl = host.querySelector('[data-cm-input]');
      const saveBtn = host.querySelector('[data-cm-save]');
      const statusEl = host.querySelector('[data-cm-status]');
      const listEl = host.querySelector('[data-cm-list]');
      const searchBtn = host.querySelector('[data-cm-search]');
      const quotaEl = host.querySelector('[data-cm-quota]');

      saveBtn.addEventListener('click', async () => {
        const text = (inputEl.value || '').trim();
        if (!text) { if (window.showToast) window.showToast('메모 내용을 입력해 주세요'); return; }

        // 플랜별 한도 체크 (Free 20 / Pro·Premium 무제한)
        const limit = _memoLimit();
        if (limit !== Infinity) {
          const cards = listEl.querySelectorAll('[data-cm-memo]');
          if (cards.length >= limit) {
            if (window.showToast) {
              window.showToast(`Free 플랜은 손님당 메모 ${limit}개까지에요. Pro로 업그레이드하면 무제한이에요.`);
            }
            return;
          }
        }

        saveBtn.disabled = true;
        statusEl.textContent = 'AI 태그 분석 중…';
        try {
          await _api('POST', '/customers/' + encodeURIComponent(customerId) + '/memos', { text, auto_tag: true });
          if (window.hapticLight) window.hapticLight();
          if (window.showToast) window.showToast('메모 저장 완료');
          inputEl.value = '';
          statusEl.textContent = '';
          await _loadAndRender(customerId, listEl, quotaEl);
          try {
            window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'create_memo', customer_id: customerId } }));
          } catch (_e) { void _e; }
        } catch (e) {
          console.warn('[customer-memo] save 실패:', e);
          statusEl.textContent = '';
          if (window.showToast) window.showToast('저장 실패 — 다시 시도해 주세요');
        } finally {
          saveBtn.disabled = false;
        }
      });

      // Cmd/Ctrl+Enter 빠른 저장
      inputEl.addEventListener('keydown', (ev) => {
        if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter') {
          ev.preventDefault();
          saveBtn.click();
        }
      });

      searchBtn.addEventListener('click', () => openSearch());

      _bindList(customerId, listEl);
    }
    const listEl = host.querySelector('[data-cm-list]');
    const quotaEl = host.querySelector('[data-cm-quota]');
    _loadAndRender(customerId, listEl, quotaEl);
  }

  // ── 경고 메모 조회 (예약/매출 폼용) ────────────────────
  async function fetchWarnings(customerId) {
    if (!customerId) return [];
    try {
      const d = await _api('GET', '/customers/' + encodeURIComponent(customerId) + '/memos/warnings');
      return (d && d.items) || [];
    } catch (e) {
      // 백엔드 미배포 / 권한 없음 — 조용히 빈 배열
      return [];
    }
  }

  function renderWarningBanner(memos) {
    if (!memos || !memos.length) return '';
    const items = memos.slice(0, 4).map(m => {
      const tags = (m.tags || []).slice(0, 3).map(t => '<span class="cm-memo-tag cm-memo-tag--warn">#' + _esc(t) + '</span>').join('');
      return '<li>' + _esc(m.text).slice(0, 120) + (tags ? '<div style="margin-top:2px;">' + tags + '</div>' : '') + '</li>';
    }).join('');
    return [
      '<div class="cm-warn-banner" role="alert">',
        '<strong>시술 전 확인 필요</strong>',
        '<ul>', items, '</ul>',
      '</div>',
    ].join('');
  }

  // ── 전역 검색 시트 ──────────────────────────────────
  function _ensureSearchSheet() {
    let sheet = document.getElementById('cmMemoSearchSheet');
    if (sheet) return sheet;
    sheet = document.createElement('div');
    sheet.id = 'cmMemoSearchSheet';
    sheet.style.cssText = 'position:fixed;inset:0;z-index:10000;display:none;background:rgba(0,0,0,0.5);';
    sheet.innerHTML = [
      '<div style="position:absolute;inset:auto 0 0 0;background:#fff;border-radius:20px 20px 0 0;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;">',
        '<div style="padding:16px 18px 12px;border-bottom:1px solid #F3F4F6;display:flex;align-items:center;gap:8px;">',
          '<strong style="font-size:15px;flex:1;">메모 검색</strong>',
          '<button type="button" data-cm-close style="background:none;border:none;font-size:20px;color:#9CA3AF;cursor:pointer;">✕</button>',
        '</div>',
        '<div style="padding:12px 18px;">',
          '<input type="search" data-cm-q class="cm-search-input" placeholder="고객 이름·태그·내용 검색 (예: 알러지)" autocomplete="off" />',
        '</div>',
        '<div data-cm-results style="flex:1;overflow-y:auto;padding:0 18px 24px;padding-bottom:max(24px,env(safe-area-inset-bottom));"></div>',
      '</div>',
    ].join('');
    document.body.appendChild(sheet);
    sheet.addEventListener('click', (ev) => { if (ev.target === sheet) closeSearch(); });
    sheet.querySelector('[data-cm-close]').addEventListener('click', closeSearch);

    const input = sheet.querySelector('[data-cm-q]');
    const results = sheet.querySelector('[data-cm-results]');
    let timer = null;
    async function _runSearch() {
      const q = (input.value || '').trim();
      results.innerHTML = '<div style="padding:18px;text-align:center;color:#9CA3AF;font-size:12px;">검색 중…</div>';
      try {
        const d = await _api('GET', '/customers/memos/search?q=' + encodeURIComponent(q) + '&limit=80');
        const items = (d && d.items) || [];
        if (!items.length) {
          results.innerHTML = '<div style="padding:30px;text-align:center;color:#9CA3AF;font-size:12px;">검색 결과가 없어요</div>';
          return;
        }
        results.innerHTML = items.map(m => {
          const tags = (m.tags || []).slice(0, 6).map(t => {
            const tcls = m.is_warning ? 'cm-memo-tag cm-memo-tag--warn' : 'cm-memo-tag';
            return '<span class="' + tcls + '">#' + _esc(t) + '</span>';
          }).join('');
          const cls = m.is_warning ? 'cm-memo-card cm-memo-card--warn' : 'cm-memo-card';
          return [
            '<div class="', cls, '" data-cm-jump="', m.customer_id, '" style="cursor:pointer;">',
              '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">',
                '<strong style="font-size:12px;color:#374151;">', _esc(m.customer_name || '고객'), '</strong>',
                m.is_warning ? '<span style="font-size:10px;color:#DC2626;font-weight:700;">경고</span>' : '',
                '<span style="margin-left:auto;font-size:10px;color:#9CA3AF;">', _dateShort(m.created_at), '</span>',
              '</div>',
              '<div class="cm-memo-text">', _esc(m.text), '</div>',
              tags ? '<div style="margin-top:6px;">' + tags + '</div>' : '',
            '</div>',
          ].join('');
        }).join('');
      } catch (e) {
        console.warn('[customer-memo] search 실패:', e);
        results.innerHTML = '<div style="padding:30px;text-align:center;color:#DC2626;font-size:12px;">검색 실패. 잠시 후 다시 시도해 주세요.</div>';
      }
    }
    input.addEventListener('input', () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(_runSearch, 250);
    });
    results.addEventListener('click', (ev) => {
      const el = ev.target && ev.target.closest && ev.target.closest('[data-cm-jump]');
      if (!el) return;
      const cid = el.getAttribute('data-cm-jump');
      if (!cid) return;
      closeSearch();
      if (typeof window.openCustomerDashboard === 'function') {
        window.openCustomerDashboard(cid);
      }
    });
    // 초기 로드 — 빈 q 로 최신 50개
    _runSearch();
    return sheet;
  }

  function openSearch() {
    const sheet = _ensureSearchSheet();
    sheet.style.display = 'block';
    document.body.style.overflow = 'hidden';
    const input = sheet.querySelector('[data-cm-q]');
    if (input) setTimeout(() => input.focus(), 50);
  }
  function closeSearch() {
    const sheet = document.getElementById('cmMemoSearchSheet');
    if (sheet) sheet.style.display = 'none';
    document.body.style.overflow = '';
  }

  // ── 외부 노출 ──────────────────────────────────────
  window.CustomerMemo = {
    openSection,
    fetchWarnings,
    renderWarningBanner,
    openSearch,
    closeSearch,
  };

  // ── 고객 대시보드 자동 통합 ────────────────────────
  // openCustomerDashboard 이 호출된 직후 cdBody 에 메모 섹션 자동 주입.
  // app-customer-dashboard.js 수정 없이 monkey-patch 로 주입 → 회귀 위험 최소화.
  if (typeof window !== 'undefined') {
    let _origOpen = null;
    function _patchOpenDashboard() {
      if (typeof window.openCustomerDashboard !== 'function') return false;
      if (_origOpen) return true;
      _origOpen = window.openCustomerDashboard;
      window.openCustomerDashboard = async function (id) {
        const ret = await _origOpen.apply(this, arguments);
        try {
          const sheet = document.getElementById('customerDashSheet');
          const body = sheet && sheet.querySelector('#cdBody');
          if (body && id) {
            // 기존 섹션 정리 후 신규 주입 (재진입 시 중복 방지)
            const old = body.querySelector('[data-cm-memo-section]');
            if (old) old.remove();
            // 메모 섹션을 매출 이력 위에 끼워 넣음 — 가장 위에 보이게
            const wrap = document.createElement('div');
            body.insertBefore(wrap, body.firstChild);
            openSection(id, '', wrap);
          }
        } catch (_e) { /* ignore */ }
        return ret;
      };
      return true;
    }
    if (!_patchOpenDashboard()) {
      // app-customer-dashboard.js 가 늦게 로드되는 경우 대비
      const iv = setInterval(() => { if (_patchOpenDashboard()) clearInterval(iv); }, 200);
      setTimeout(() => clearInterval(iv), 8000);
    }
  }
})();
