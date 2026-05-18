/* 잇데이 — 예약 발행 (SN-2) 2026-05-19 v207
   Meta Graph API scheduled_publish_time 활용 */
(function () {
  'use strict';
  if (window.SNSSchedule) return;
  function _toast(msg) { if (window.showToast) window.showToast(msg); }

  // SN-2: 2단계 — (1) data URL 업로드 → image_url → (2) ScheduledPost 생성
  // 실제 발행은 backend services/scheduled_publisher.publish_loop 가 scheduled_at 도달 시 IG Graph API 호출.
  async function schedulePost(opts) {
    const { imageDataUrl, caption, scheduledTime, platform } = opts || {};
    if (!imageDataUrl) return _toast('사진을 먼저 선택해주세요');
    if (!scheduledTime) return _toast('예약 시간을 설정해주세요');

    const API = window.API || '';
    const baseHeaders = window.authHeader ? window.authHeader() : {};
    const headers = Object.assign({}, baseHeaders, { 'Content-Type': 'application/json' });

    _toast('예약 등록 중… (1/2) 사진 업로드');
    let imageUrl = '';
    try {
      const up = await fetch(API + '/scheduled-posts/upload', {
        method: 'POST', headers,
        body: JSON.stringify({ image_data: imageDataUrl }),
      });
      if (!up.ok) {
        const err = await up.json().catch(() => ({}));
        throw new Error(err.detail || `업로드 실패 HTTP ${up.status}`);
      }
      const upData = await up.json();
      imageUrl = upData.url || '';
      if (!imageUrl) throw new Error('이미지 URL 응답 없음');
    } catch (e) {
      _toast('업로드 실패: ' + ((e && e.message) || '').slice(0, 60));
      return null;
    }

    _toast('예약 등록 중… (2/2) 예약 저장');
    try {
      const res = await fetch(API + '/scheduled-posts', {
        method: 'POST', headers,
        body: JSON.stringify({
          image_url: imageUrl,
          caption: caption || '',
          hashtags: '',
          scheduled_at: scheduledTime,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (window.SNSCalendar && typeof window.SNSCalendar.addPost === 'function') {
        const d = new Date(scheduledTime);
        window.SNSCalendar.addPost({
          id: 'sched-' + (data.id || Date.now()),
          date: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,
          time: `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`,
          caption, imageUrl, status: 'scheduled', platform: platform || 'instagram', serverId: data.id || null,
        });
      }
      _toast('✅ 예약 발행 등록 완료!');
      return data;
    } catch (e) {
      _toast('예약 실패: ' + ((e && e.message) || '').slice(0, 60));
      return null;
    }
  }

  async function listScheduled() {
    const API = window.API || '';
    const headers = window.authHeader ? window.authHeader() : {};
    try {
      const res = await fetch(API + '/scheduled-posts', { headers });
      if (!res.ok) return [];
      return await res.json();
    } catch (_e) {
      return [];
    }
  }

  async function cancelScheduled(id) {
    const API = window.API || '';
    const headers = window.authHeader ? window.authHeader() : {};
    try {
      const res = await fetch(API + '/scheduled-posts/' + id, { method: 'DELETE', headers });
      return res.ok;
    } catch (_e) {
      return false;
    }
  }

  function openScheduleModal(opts) {
    opts = opts || {};
    let pop = document.getElementById('snsSchedulePop');
    if (!pop) { pop = document.createElement('div'); pop.id = 'snsSchedulePop'; pop.style.cssText = 'position:fixed;inset:0;z-index:9700;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;padding:16px;'; document.body.appendChild(pop); }
    const now = new Date(); now.setHours(now.getHours() + 1); now.setMinutes(0);
    const defaultDT = now.toISOString().slice(0, 16);
    pop.innerHTML = `<div style="background:var(--surface,#fff);width:100%;max-width:400px;border-radius:20px;padding:24px;">
      <div style="font-size:17px;font-weight:800;margin-bottom:16px;">⏰ 예약 발행</div>
      <label style="display:block;margin-bottom:12px;"><span style="font-size:12px;font-weight:600;">예약 시간</span><input type="datetime-local" id="snsSchedTime" value="${defaultDT}" style="width:100%;padding:10px 12px;border:1px solid #e5e7eb;border-radius:10px;font-size:14px;margin-top:4px;box-sizing:border-box;"></label>
      <label style="display:block;margin-bottom:12px;"><span style="font-size:12px;font-weight:600;">캡션</span><textarea id="snsSchedCaption" rows="4" style="width:100%;padding:10px 12px;border:1px solid #e5e7eb;border-radius:10px;font-size:13px;margin-top:4px;resize:vertical;font-family:inherit;box-sizing:border-box;">${(opts.caption||'').replace(/&/g,'&amp;').replace(/</g,'&lt;')}</textarea></label>
      <label style="display:block;margin-bottom:16px;"><span style="font-size:12px;font-weight:600;">플랫폼</span><select id="snsSchedPlatform" style="width:100%;padding:10px 12px;border:1px solid #e5e7eb;border-radius:10px;font-size:14px;margin-top:4px;box-sizing:border-box;"><option value="instagram">Instagram</option><option value="naver">네이버 블로그</option><option value="kakao">카카오톡 채널</option></select></label>
      <div style="display:flex;gap:8px;"><button id="snsSchedCancel" style="flex:1;height:46px;border:1px solid #e5e7eb;border-radius:14px;background:#fff;font-weight:600;cursor:pointer;">취소</button><button id="snsSchedSubmit" style="flex:1.5;height:46px;border:none;border-radius:14px;background:linear-gradient(135deg,var(--accent,#F18091),var(--accent2,#e26a85));color:#fff;font-weight:800;cursor:pointer;">예약 등록</button></div>
    </div>`;
    pop.style.display = 'flex';
    pop.querySelector('#snsSchedCancel').onclick = () => { pop.style.display = 'none'; };
    pop.querySelector('#snsSchedSubmit').onclick = async () => {
      const dt = pop.querySelector('#snsSchedTime').value;
      const caption = pop.querySelector('#snsSchedCaption').value;
      const platform = pop.querySelector('#snsSchedPlatform').value;
      if (!dt) return _toast('예약 시간을 선택해주세요');
      pop.style.display = 'none';
      await schedulePost({ imageDataUrl: opts.imageDataUrl || '', caption, scheduledTime: new Date(dt).toISOString(), platform });
    };
  }

  window.SNSSchedule = {
    schedule: schedulePost,
    openModal: openScheduleModal,
    list: listScheduled,
    cancel: cancelScheduled,
  };
})();
