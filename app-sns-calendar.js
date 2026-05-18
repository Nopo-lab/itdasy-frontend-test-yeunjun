/* ─────────────────────────────────────────────────────────────
   잇데이 — SNS 콘텐츠 캘린더 (SN-1, Phase 1)
   2026-05-19 v207

   기능:
     • 월간/주간 뷰 캘린더
     • 게시물 드래그 배치 — 날짜 셀에 게시 아이템 drag-and-drop
     • 빈 날짜 아이디어 제안 — 서버 비용 없는 로컬 샘플 문구
     • localStorage 기반 로컬 저장

   진입: window.SNSCalendar.open()
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window.SNSCalendar) return;

  const LS_KEY = 'itdasy_sns_calendar';
  const DAYS_KR = ['일','월','화','수','목','금','토'];
  const MONTHS_KR = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

  let _year, _month, _view = 'month'; // 'month' | 'week'
  let _weekStart = null; // week view 용
  let _posts = []; // { id, date:'YYYY-MM-DD', time:'HH:MM', caption, imageUrl, status:'draft'|'scheduled'|'published', platform:'instagram' }
  let _sheetEl = null;

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
  }
  function _toast(msg) { if (window.showToast) window.showToast(msg); }

  // ── 데이터 ──
  function _load() {
    try { _posts = JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch (_) { _posts = []; }
  }
  function _save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(_posts)); }
    catch (err) { console.warn('[SNSCalendar] 저장 실패', err); }
  }
  function _postsForDate(dateStr) {
    return _posts.filter(p => p.date === dateStr);
  }
  function _dateStr(y, m, d) {
    return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  }
  function _todayStr() {
    const t = new Date();
    return _dateStr(t.getFullYear(), t.getMonth(), t.getDate());
  }

  // ── 시트 생성 ──
  function _ensureSheet() {
    if (_sheetEl) return _sheetEl;
    _sheetEl = document.createElement('div');
    _sheetEl.id = 'snsCalendarSheet';
    _sheetEl.className = 'sns-cal-sheet';
    _sheetEl.style.cssText = 'position:fixed;inset:0;z-index:9500;background:var(--surface,#fff);display:none;flex-direction:column;overflow:hidden;';
    document.body.appendChild(_sheetEl);
    return _sheetEl;
  }

  // ── 렌더 ──
  function _render() {
    const sheet = _ensureSheet();
    const today = _todayStr();

    // 월 정보
    const firstDay = new Date(_year, _month, 1).getDay();
    const daysInMonth = new Date(_year, _month + 1, 0).getDate();

    // 헤더
    let html = `
      <header class="sns-cal-header">
        <button type="button" class="sns-cal-back" data-act="close">‹ 뒤로</button>
        <div class="sns-cal-title">${_year}년 ${MONTHS_KR[_month]} 콘텐츠 캘린더</div>
        <button type="button" class="sns-cal-today-btn" data-act="today">오늘</button>
      </header>
      <div class="sns-cal-toolbar">
        <button type="button" data-act="prev">◀</button>
        <div class="sns-cal-view-toggle">
          <button type="button" class="${_view==='month'?'on':''}" data-view="month">월간</button>
          <button type="button" class="${_view==='week'?'on':''}" data-view="week">주간</button>
        </div>
        <button type="button" data-act="next">▶</button>
      </div>`;

    if (_view === 'month') {
      html += '<div class="sns-cal-grid">';
      // 요일 헤더
      html += DAYS_KR.map(d => `<div class="sns-cal-day-header">${d}</div>`).join('');
      // 빈 셀 (월 시작 전)
      for (let i = 0; i < firstDay; i++) html += '<div class="sns-cal-cell empty"></div>';
      // 날짜 셀
      for (let d = 1; d <= daysInMonth; d++) {
        const ds = _dateStr(_year, _month, d);
        const isToday = ds === today;
        const posts = _postsForDate(ds);
        const dotHtml = posts.length > 0
          ? `<div class="sns-cal-dots">${posts.slice(0,3).map(p =>
              `<span class="sns-cal-dot ${p.status}" title="${_esc(p.caption?.slice(0,30)||'')}">${p.status==='published'?'✓':p.status==='scheduled'?'⏰':'•'}</span>`
            ).join('')}${posts.length>3?`<span class="sns-cal-dot-more">+${posts.length-3}</span>`:''}</div>`
          : '';
        html += `<div class="sns-cal-cell${isToday?' today':''}" data-date="${ds}" draggable="false">
          <span class="sns-cal-date-num">${d}</span>
          ${dotHtml}
        </div>`;
      }
      html += '</div>';
    } else {
      // 주간 뷰
      const ws = _weekStart || new Date(_year, _month, 1);
      html += '<div class="sns-cal-week">';
      for (let i = 0; i < 7; i++) {
        const d = new Date(ws);
        d.setDate(d.getDate() + i);
        const ds = _dateStr(d.getFullYear(), d.getMonth(), d.getDate());
        const isToday = ds === today;
        const posts = _postsForDate(ds);
        html += `<div class="sns-cal-week-col${isToday?' today':''}" data-date="${ds}">
          <div class="sns-cal-week-head">${DAYS_KR[d.getDay()]} ${d.getDate()}</div>
          <div class="sns-cal-week-posts" data-date="${ds}">
            ${posts.map(p => `
              <div class="sns-cal-post-card" draggable="true" data-post-id="${p.id}">
                <div class="sns-cal-post-time">${p.time || '--:--'}</div>
                <div class="sns-cal-post-caption">${_esc((p.caption||'').slice(0,40))}</div>
                <span class="sns-cal-post-status ${p.status}">${p.status==='published'?'발행됨':p.status==='scheduled'?'예약':' 초안'}</span>
              </div>
            `).join('')}
          </div>
        </div>`;
      }
      html += '</div>';
    }

    // 하단 액션 바
    html += `
      <div class="sns-cal-actions">
        <button type="button" class="sns-cal-add-btn" data-act="add">＋ 새 게시물</button>
        <button type="button" class="sns-cal-ai-btn" data-act="ai-suggest">＋ 빈 날짜 아이디어</button>
      </div>`;

    sheet.innerHTML = html;
    _bindEvents(sheet);
    sheet.style.display = 'flex';
  }

  // ── 이벤트 바인딩 ──
  function _bindEvents(sheet) {
    sheet.querySelectorAll('[data-act]').forEach(btn => {
      btn.addEventListener('click', () => {
        const act = btn.dataset.act;
        if (act === 'close') return _close();
        if (act === 'today') { const t = new Date(); _year = t.getFullYear(); _month = t.getMonth(); _render(); }
        if (act === 'prev') { _month--; if (_month < 0) { _month = 11; _year--; } if (_weekStart) _weekStart.setDate(_weekStart.getDate()-7); _render(); }
        if (act === 'next') { _month++; if (_month > 11) { _month = 0; _year++; } if (_weekStart) _weekStart.setDate(_weekStart.getDate()+7); _render(); }
        if (act === 'add') _addPost();
        if (act === 'ai-suggest') _aiSuggest();
      });
    });

    // 뷰 토글
    sheet.querySelectorAll('[data-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        _view = btn.dataset.view;
        if (_view === 'week') {
          const t = new Date(_year, _month, 1);
          const dow = t.getDay();
          t.setDate(t.getDate() - dow);
          _weekStart = t;
        }
        _render();
      });
    });

    // 날짜 셀 클릭 → 해당 날짜 게시물 보기/추가
    sheet.querySelectorAll('.sns-cal-cell[data-date]').forEach(cell => {
      cell.addEventListener('click', () => _showDayDetail(cell.dataset.date));
    });

    // 드래그 앤 드롭 (주간 뷰)
    sheet.querySelectorAll('.sns-cal-post-card[draggable]').forEach(card => {
      card.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', card.dataset.postId);
        card.style.opacity = '0.5';
      });
      card.addEventListener('dragend', () => { card.style.opacity = '1'; });
    });
    sheet.querySelectorAll('.sns-cal-week-posts[data-date]').forEach(col => {
      col.addEventListener('dragover', e => { e.preventDefault(); col.style.background = 'rgba(241,128,145,0.1)'; });
      col.addEventListener('dragleave', () => { col.style.background = ''; });
      col.addEventListener('drop', e => {
        e.preventDefault();
        col.style.background = '';
        const postId = e.dataTransfer.getData('text/plain');
        const post = _posts.find(p => p.id === postId);
        if (post) {
          post.date = col.dataset.date;
          _save(); _render();
          _toast('게시물 이동 완료');
        }
      });
    });
  }

  // ── 날짜 상세 ──
  function _showDayDetail(dateStr) {
    const posts = _postsForDate(dateStr);
    const d = new Date(dateStr + 'T00:00:00');
    const dayLabel = `${d.getMonth()+1}/${d.getDate()} (${DAYS_KR[d.getDay()]})`;

    let pop = document.getElementById('snsCalDayPop');
    if (!pop) {
      pop = document.createElement('div');
      pop.id = 'snsCalDayPop';
      pop.style.cssText = 'position:fixed;inset:0;z-index:9600;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;padding:16px;';
      document.body.appendChild(pop);
    }

    pop.innerHTML = `
      <div style="background:var(--surface,#fff);width:100%;max-width:400px;border-radius:20px;padding:24px;max-height:80vh;overflow-y:auto;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <div style="font-size:17px;font-weight:800;">${dayLabel} 게시물</div>
          <button type="button" data-cal-act="close-day" style="background:none;border:none;font-size:20px;cursor:pointer;color:#888;">×</button>
        </div>
        ${posts.length === 0
          ? '<div style="text-align:center;padding:32px 0;color:#999;font-size:13px;">이 날짜에 게시물이 없어요</div>'
          : posts.map(p => `
            <div style="background:rgba(241,128,145,0.04);border:1px solid rgba(241,128,145,0.12);border-radius:14px;padding:14px;margin-bottom:10px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <span style="font-size:12px;font-weight:700;color:var(--accent);">${p.time || '시간 미정'}</span>
                <span style="font-size:10px;padding:3px 8px;border-radius:8px;background:${p.status==='published'?'#4ade80':p.status==='scheduled'?'#fbbf24':'#e5e7eb'};font-weight:600;">${p.status==='published'?'발행됨':p.status==='scheduled'?'예약':'초안'}</span>
              </div>
              <div style="font-size:13px;line-height:1.5;color:var(--text);">${_esc((p.caption||'내용 없음').slice(0,100))}</div>
              <div style="display:flex;gap:8px;margin-top:10px;">
                <button type="button" data-cal-act="edit-post" data-post-id="${_esc(p.id)}" style="flex:1;height:34px;border:1px solid #ddd;border-radius:10px;background:#fff;font-size:12px;font-weight:600;cursor:pointer;">편집</button>
                <button type="button" data-cal-act="delete-post" data-post-id="${_esc(p.id)}" style="flex:1;height:34px;border:1px solid #fca5a5;border-radius:10px;background:#fff;color:#ef4444;font-size:12px;font-weight:600;cursor:pointer;">삭제</button>
              </div>
            </div>
          `).join('')}
        <button type="button" data-cal-act="add-for-date" data-date="${_esc(dateStr)}" style="width:100%;height:44px;border:1.5px dashed #ddd;border-radius:14px;background:#fff;font-size:13px;font-weight:700;color:var(--accent);cursor:pointer;margin-top:8px;">＋ 이 날짜에 게시물 추가</button>
      </div>`;
    pop.style.display = 'flex';
    pop.onclick = e => { if (e.target === pop) pop.style.display = 'none'; };
    _bindDayPopEvents(pop);
  }

  function _bindDayPopEvents(pop) {
    pop.querySelectorAll('[data-cal-act]').forEach(btn => {
      btn.addEventListener('click', () => {
        const act = btn.dataset.calAct;
        if (act === 'close-day') pop.style.display = 'none';
        if (act === 'edit-post') _editPost(btn.dataset.postId);
        if (act === 'delete-post') _deletePost(btn.dataset.postId);
        if (act === 'add-for-date') _addPostForDate(btn.dataset.date);
      });
    });
  }

  // ── 게시물 CRUD ──
  function _addPost(dateStr) {
    dateStr = dateStr || _todayStr();
    const id = 'post-' + Date.now();
    _posts.push({ id, date: dateStr, time: '12:00', caption: '', imageUrl: '', status: 'draft', platform: 'instagram' });
    _save();
    _editPost(id);
  }

  function _addPostForDate(dateStr) {
    const pop = document.getElementById('snsCalDayPop');
    if (pop) pop.style.display = 'none';
    _addPost(dateStr);
  }

  function _editPost(postId) {
    const post = _posts.find(p => p.id === postId);
    if (!post) return _toast('게시물을 찾을 수 없어요');

    let pop = document.getElementById('snsCalEditPop');
    if (!pop) {
      pop = document.createElement('div');
      pop.id = 'snsCalEditPop';
      pop.style.cssText = 'position:fixed;inset:0;z-index:9700;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;padding:16px;';
      document.body.appendChild(pop);
    }

    pop.innerHTML = `
      <div style="background:var(--surface,#fff);width:100%;max-width:420px;border-radius:20px;padding:24px;max-height:85vh;overflow-y:auto;">
        <div style="font-size:17px;font-weight:800;margin-bottom:16px;">게시물 편집</div>
        <label style="display:block;margin-bottom:12px;">
          <span style="font-size:12px;font-weight:600;color:var(--text2);">날짜</span>
          <input type="date" id="snsEditDate" value="${post.date}" style="width:100%;padding:10px 12px;border:1px solid #e5e7eb;border-radius:10px;font-size:14px;margin-top:4px;box-sizing:border-box;">
        </label>
        <label style="display:block;margin-bottom:12px;">
          <span style="font-size:12px;font-weight:600;color:var(--text2);">시간</span>
          <input type="time" id="snsEditTime" value="${post.time||''}" style="width:100%;padding:10px 12px;border:1px solid #e5e7eb;border-radius:10px;font-size:14px;margin-top:4px;box-sizing:border-box;">
        </label>
        <label style="display:block;margin-bottom:12px;">
          <span style="font-size:12px;font-weight:600;color:var(--text2);">캡션</span>
          <textarea id="snsEditCaption" rows="5" style="width:100%;padding:10px 12px;border:1px solid #e5e7eb;border-radius:10px;font-size:13px;margin-top:4px;resize:vertical;font-family:inherit;box-sizing:border-box;">${_esc(post.caption||'')}</textarea>
        </label>
        <label style="display:block;margin-bottom:12px;">
          <span style="font-size:12px;font-weight:600;color:var(--text2);">상태</span>
          <select id="snsEditStatus" style="width:100%;padding:10px 12px;border:1px solid #e5e7eb;border-radius:10px;font-size:14px;margin-top:4px;box-sizing:border-box;">
            <option value="draft" ${post.status==='draft'?'selected':''}>초안</option>
            <option value="scheduled" ${post.status==='scheduled'?'selected':''}>예약</option>
            <option value="published" ${post.status==='published'?'selected':''}>발행됨</option>
          </select>
        </label>
        <label style="display:block;margin-bottom:16px;">
          <span style="font-size:12px;font-weight:600;color:var(--text2);">플랫폼</span>
          <select id="snsEditPlatform" style="width:100%;padding:10px 12px;border:1px solid #e5e7eb;border-radius:10px;font-size:14px;margin-top:4px;box-sizing:border-box;">
            <option value="instagram" ${post.platform==='instagram'?'selected':''}>Instagram</option>
            <option value="naver" ${post.platform==='naver'?'selected':''}>네이버 블로그</option>
            <option value="kakao" ${post.platform==='kakao'?'selected':''}>카카오톡 채널</option>
          </select>
        </label>
        <div style="display:flex;gap:8px;">
          <button id="snsEditCancel" style="flex:1;height:46px;border:1px solid #e5e7eb;border-radius:14px;background:#fff;font-size:14px;font-weight:600;cursor:pointer;">취소</button>
          <button id="snsEditSave" style="flex:1.5;height:46px;border:none;border-radius:14px;background:linear-gradient(135deg,var(--accent,#F18091),var(--accent2,#e26a85));color:#fff;font-size:14px;font-weight:800;cursor:pointer;">저장</button>
        </div>
      </div>`;
    pop.style.display = 'flex';

    pop.querySelector('#snsEditCancel').addEventListener('click', () => {
      pop.style.display = 'none';
      _render();
    });
    pop.querySelector('#snsEditSave').addEventListener('click', () => {
      post.date = pop.querySelector('#snsEditDate').value;
      post.time = pop.querySelector('#snsEditTime').value;
      post.caption = pop.querySelector('#snsEditCaption').value;
      post.status = pop.querySelector('#snsEditStatus').value;
      post.platform = pop.querySelector('#snsEditPlatform').value;
      _save();
      pop.style.display = 'none';
      _render();
      _toast('게시물 저장 완료');
    });
  }

  function _deletePost(postId) {
    const target = _posts.find(p => p.id === postId);
    _posts = _posts.filter(p => p.id !== postId);
    _save();
    // 백엔드 예약이면 서버 취소도 호출 (비차단)
    if (target && target.serverId && window.SNSSchedule && typeof window.SNSSchedule.cancel === 'function') {
      window.SNSSchedule.cancel(target.serverId).catch(err => {
        console.warn('[SNSCalendar] 예약 취소 실패', err);
      });
    }
    const pop = document.getElementById('snsCalDayPop');
    if (pop) pop.style.display = 'none';
    _render();
    _toast('게시물 삭제 완료');
  }

  // ── 빈 날짜 아이디어 제안 ──
  async function _aiSuggest() {
    const daysInMonth = new Date(_year, _month + 1, 0).getDate();
    const emptyDates = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = _dateStr(_year, _month, d);
      if (_postsForDate(ds).length === 0) emptyDates.push(ds);
    }
    if (emptyDates.length === 0) return _toast('이번 달은 빈 날짜가 없어요! 👏');

    _toast('빈 날짜에 넣을 아이디어를 준비하고 있어요...');
    const shopType = localStorage.getItem('itdasy_shop_type') || '뷰티샵';
    const suggestions = _generateLocalSuggestions(emptyDates.slice(0, 5), shopType);

    suggestions.forEach(s => {
      _posts.push({
        id: 'ai-' + Date.now() + '-' + Math.random().toString(36).slice(2,6),
        date: s.date, time: s.time, caption: s.caption,
        imageUrl: '', status: 'draft', platform: 'instagram'
      });
    });
    _save(); _render();
    _toast(`${suggestions.length}개 콘텐츠 아이디어를 넣었어요. 편집해서 사용하세요.`);
  }

  function _generateLocalSuggestions(dates, shopType) {
    const IDEAS = [
      { caption: `오늘의 시술 결과 ✨\n${shopType} 전문 시술, 자연스러운 마무리가 포인트예요\n\n#${shopType} #오늘의시술 #뷰티`, time: '11:00' },
      { caption: `✨ 이번 주 인기 시술 TOP3\n사장님이 직접 추천하는 베스트 시술!\n\n#추천시술 #인기시술`, time: '14:00' },
      { caption: `💐 손님 후기\n"정말 만족스러워요! 다음에 또 올게요"\n\n후기 감사합니다 🙏\n#고객후기 #감사`, time: '18:00' },
      { caption: `🎉 이벤트 안내\n이번 달 특별 프로모션!\n첫 방문 고객 20% 할인\n\n#이벤트 #할인 #첫방문`, time: '10:00' },
      { caption: `📸 비포 & 애프터\n시술 전후 비교 사진이에요\n달라진 모습 보이시나요? ✨\n\n#비포애프터 #시술결과`, time: '13:00' },
      { caption: `💡 뷰티 팁 공유\n집에서도 쉽게 관리하는 방법!\n사장님이 알려드릴게요 💕\n\n#뷰티팁 #홈케어`, time: '16:00' },
      { caption: `🌸 오늘의 분위기\n차분하고 편안한 공간에서\n최고의 시술을 경험하세요\n\n#${shopType} #힐링`, time: '15:00' },
    ];
    return dates.map((date, i) => ({
      date,
      ...IDEAS[i % IDEAS.length]
    }));
  }

  // 백엔드 ScheduledPost 동기화 — localStorage 와 병합 (serverId 키로 dedupe)
  async function _syncFromServer() {
    if (!window.SNSSchedule || typeof window.SNSSchedule.list !== 'function') return;
    try {
      const remote = await window.SNSSchedule.list();
      if (!Array.isArray(remote) || !remote.length) return;
      const localServerIds = new Set(_posts.map(p => p.serverId).filter(Boolean));
      let added = 0;
      remote.forEach(r => {
        if (localServerIds.has(r.id)) return;
        const d = new Date(r.scheduled_at);
        _posts.push({
          id: 'srv-' + r.id,
          serverId: r.id,
          date: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,
          time: `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`,
          caption: r.caption || '',
          imageUrl: r.image_url || '',
          status: r.status || 'scheduled',
          platform: 'instagram',
        });
        added++;
      });
      if (added > 0) { _save(); _render(); }
    } catch (err) {
      console.warn('[SNSCalendar] 예약 목록 불러오기 실패', err);
    }
  }

  // ── 열기/닫기 ──
  function _open() {
    const t = new Date();
    _year = t.getFullYear();
    _month = t.getMonth();
    _load();
    _render();
    // 예약 모듈이 켜진 경우에만 기존 예약을 불러온다.
    _syncFromServer();
    try { history.pushState({ snsCal: true }, '', location.href); }
    catch (err) { console.warn('[SNSCalendar] 화면 기록 실패', err); }
  }

  function _close() {
    if (_sheetEl) _sheetEl.style.display = 'none';
    try { history.back(); }
    catch (err) { console.warn('[SNSCalendar] 뒤로가기 실패', err); }
  }

  window.addEventListener('popstate', () => {
    if (_sheetEl && _sheetEl.style.display !== 'none') {
      _sheetEl.style.display = 'none';
    }
  });

  // 공개 API
  window.SNSCalendar = {
    open: _open,
    close: _close,
    getPosts: () => _posts,
    addPost: (p) => { _posts.push(p); _save(); },
    _editPost: _editPost,
    _deletePost: _deletePost,
    _addPostForDate: _addPostForDate,
  };
})();
