// Itdasy Studio - 예약 발행 UI (list + 생성 + 취소)
// 백엔드: GET/POST/DELETE /scheduled-posts

(function(){
  function fmtKoreanDate(iso) {
    try {
      const d = new Date(iso);
      const y = d.getFullYear();
      const mo = String(d.getMonth()+1).padStart(2,'0');
      const da = String(d.getDate()).padStart(2,'0');
      const h = String(d.getHours()).padStart(2,'0');
      const mi = String(d.getMinutes()).padStart(2,'0');
      return `${y}.${mo}.${da} ${h}:${mi}`;
    } catch(_) { return iso; }
  }

  async function loadScheduledPosts() {
    try {
      const r = await fetch(API + '/scheduled-posts', { headers: authHeader() });
      if (!r.ok) return [];
      return await r.json();
    } catch(_) { return []; }
  }

  async function createScheduledPost(payload) {
    const r = await fetch(API + '/scheduled-posts', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.detail || '예약 생성 실패');
    return data;
  }

  async function cancelScheduledPost(id) {
    const r = await fetch(API + '/scheduled-posts/' + id, {
      method: 'DELETE',
      headers: authHeader(),
    });
    if (!r.ok) throw new Error('취소 실패');
  }

  function _statusBadge(status) {
    const map = {
      pending: { bg: '#fff5e6', color: '#f57c00', text: '예약됨' },
      sent:    { bg: '#e8f5e9', color: '#388e3c', text: '발행완료' },
      failed:  { bg: '#ffebee', color: '#c62828', text: '실패' },
    };
    const s = map[status] || map.pending;
    return `<span style="background:${s.bg};color:${s.color};padding:3px 8px;border-radius:6px;font-size:10px;font-weight:700;">${s.text}</span>`;
  }

  async function openScheduledPopup() {
    // 기존 팝업 있으면 재사용
    let popup = document.getElementById('scheduledPopup');
    if (!popup) {
      popup = document.createElement('div');
      popup.id = 'scheduledPopup';
      popup.style.cssText = 'display:none;position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,0.5);align-items:flex-end;justify-content:center;';
      popup.innerHTML = `
        <div id="scheduledCard" style="width:100%;max-width:480px;background:#fff;border-radius:24px 24px 0 0;padding:24px 20px calc(36px + env(safe-area-inset-bottom));max-height:88vh;overflow-y:auto;box-sizing:border-box;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
            <div style="font-size:18px;font-weight:800;color:var(--text);">예약 발행 관리</div>
            <button id="scheduledCloseBtn" aria-label="닫기" style="background:none;border:none;font-size:22px;cursor:pointer;color:#999;width:44px;height:44px;min-height:44px;">✕</button>
          </div>
          <div id="scheduledListBox" style="margin-bottom:16px;"></div>
          <details id="scheduledFormWrap" style="border-top:1px solid var(--border);padding-top:16px;">
            <summary style="font-size:13px;font-weight:700;color:var(--accent);cursor:pointer;list-style:none;min-height:44px;display:flex;align-items:center;">+ 새 예약 추가하기</summary>
            <div style="margin-top:12px;display:flex;flex-direction:column;gap:10px;">
              <label style="font-size:12px;color:var(--text2);">이미지 URL (Supabase Storage URL 또는 비워두기)
                <input id="schedImg" type="url" placeholder="https://..." style="width:100%;padding:12px;margin-top:6px;border:1.5px solid var(--border);border-radius:10px;font-size:14px;min-height:44px;box-sizing:border-box;">
              </label>
              <label style="font-size:12px;color:var(--text2);">캡션
                <textarea id="schedCaption" rows="4" placeholder="예약할 캡션을 입력하세요" style="width:100%;padding:12px;margin-top:6px;border:1.5px solid var(--border);border-radius:10px;font-size:14px;resize:vertical;font-family:inherit;box-sizing:border-box;"></textarea>
              </label>
              <label style="font-size:12px;color:var(--text2);">예약 시간
                <input id="schedAt" type="datetime-local" style="width:100%;padding:12px;margin-top:6px;border:1.5px solid var(--border);border-radius:10px;font-size:14px;min-height:44px;box-sizing:border-box;">
              </label>
              <button id="schedCreateBtn" style="width:100%;padding:14px;border-radius:12px;border:none;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;font-size:14px;font-weight:800;cursor:pointer;min-height:48px;">예약 등록</button>
            </div>
          </details>
        </div>
      `;
      document.body.appendChild(popup);
      // 이벤트 바인딩
      popup.addEventListener('click', (e) => { if (e.target === popup) closeScheduledPopup(); });
      popup.querySelector('#scheduledCloseBtn').addEventListener('click', closeScheduledPopup);
      popup.querySelector('#schedCreateBtn').addEventListener('click', handleCreateScheduled);
    }
    popup.style.display = 'flex';
    await renderScheduledList();

    // 기본값: 1시간 뒤
    const now = new Date();
    now.setHours(now.getHours() + 1);
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth()+1).padStart(2,'0');
    const dd = String(now.getDate()).padStart(2,'0');
    const hh = String(now.getHours()).padStart(2,'0');
    const mi = '00';
    const input = popup.querySelector('#schedAt');
    if (input && !input.value) input.value = `${yyyy}-${mm}-${dd}T${hh}:${mi}`;

    // 현재 캡션 탭에 쓰인 caption 자동 복사
    const curCap = document.getElementById('captionText');
    const curCapVal = curCap ? curCap.value.trim() : '';
    const taField = popup.querySelector('#schedCaption');
    if (taField && !taField.value && curCapVal && !curCapVal.includes('여기에 나타납니다')) {
      taField.value = curCapVal;
    }
  }

  function closeScheduledPopup() {
    const popup = document.getElementById('scheduledPopup');
    if (popup) popup.style.display = 'none';
  }

  async function renderScheduledList() {
    const box = document.getElementById('scheduledListBox');
    if (!box) return;
    box.innerHTML = '<div style="text-align:center;color:var(--text3);font-size:12px;padding:16px;">불러오는 중…</div>';
    const list = await loadScheduledPosts();
    if (!list.length) {
      box.innerHTML = `
        <div style="text-align:center;padding:28px 16px;background:#fafafa;border-radius:14px;">
          <div style="font-size:32px;margin-bottom:8px;">📭</div>
          <div style="font-size:13px;color:var(--text2);font-weight:700;">아직 예약한 글이 없어요</div>
          <div style="font-size:11px;color:var(--text3);margin-top:4px;">아래 "새 예약 추가" 버튼으로 시작하세요</div>
        </div>
      `;
      return;
    }
    box.innerHTML = list.map(item => `
      <div style="border:1px solid var(--border);border-radius:14px;padding:14px;margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <div style="font-size:13px;font-weight:700;color:var(--text);">${fmtKoreanDate(item.scheduled_at)}</div>
          ${_statusBadge(item.status)}
        </div>
        <div style="font-size:12px;color:var(--text2);line-height:1.5;max-height:60px;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;">${(item.caption || '(캡션 없음)').replace(/</g,'&lt;')}</div>
        ${item.status === 'pending' ? `
          <button data-cancel-id="${item.id}" class="sched-cancel-btn" style="margin-top:10px;padding:8px 14px;border-radius:8px;border:1px solid rgba(220,53,69,0.3);background:transparent;color:#dc3545;font-size:12px;font-weight:700;cursor:pointer;min-height:36px;">취소</button>
        ` : ''}
        ${item.status === 'failed' && item.error_msg ? `<div style="margin-top:8px;font-size:11px;color:#c62828;">에러: ${item.error_msg}</div>` : ''}
      </div>
    `).join('');
    // 취소 버튼 바인딩
    box.querySelectorAll('.sched-cancel-btn').forEach(b => {
      b.addEventListener('click', async () => {
        if (!confirm('이 예약을 취소하시겠어요?')) return;
        try {
          await cancelScheduledPost(b.dataset.cancelId);
          showToast('예약이 취소됐습니다');
          await renderScheduledList();
        } catch(e) {
          showToast('취소 실패. 잠시 후 다시 시도해주세요');
        }
      });
    });
  }

  async function handleCreateScheduled() {
    const img = document.getElementById('schedImg').value.trim();
    const cap = document.getElementById('schedCaption').value.trim();
    const at  = document.getElementById('schedAt').value;
    if (!cap) { showToast('캡션을 입력해주세요'); return; }
    if (!at)  { showToast('예약 시간을 선택해주세요'); return; }

    // datetime-local → ISO UTC
    const iso = new Date(at).toISOString();
    if (new Date(iso) <= new Date()) { showToast('예약 시간은 현재보다 미래여야 해요'); return; }

    try {
      await createScheduledPost({
        image_url: img || 'https://placehold.co/1080x1080?text=Itdasy',
        caption: cap,
        hashtags: '',
        scheduled_at: iso,
      });
      showToast('✨ 예약이 등록됐어요!');
      document.getElementById('schedCaption').value = '';
      document.getElementById('schedImg').value = '';
      const wrap = document.getElementById('scheduledFormWrap');
      if (wrap) wrap.open = false;
      await renderScheduledList();
    } catch(e) {
      showToast(e.message || '예약 실패. 잠시 후 다시 시도해주세요');
    }
  }

  // 전역 노출
  window.openScheduledPopup = openScheduledPopup;
  window.closeScheduledPopup = closeScheduledPopup;
})();
