/* ─────────────────────────────────────────────────────────────
   리퍼럴 (친구 초대) UX (T-345 · Phase 7 · 2026-04-22)
   BE 엔드포인트: GET /auth/referral → { referral_code, invited_count }
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const OVERLAY = 'referral-overlay';
  const API = () => window.API || '';
  const AUTH = () => (window.authHeader ? window.authHeader() : {});

  async function _load() {
    try {
      const res = await fetch(API() + '/auth/referral', { headers: AUTH() });
      if (!res.ok) return null;
      return await res.json();
    } catch (_) { return null; }
  }

  async function open() {
    let o = document.getElementById(OVERLAY);
    if (o) o.remove();
    const data = await _load();
    const code = (data && data.referral_code) || '------';
    const count = (data && data.invited_count) || 0;
    const signupUrl = 'https://itdasy.com/#register?ref=' + encodeURIComponent(code);

    o = document.createElement('div');
    o.id = OVERLAY;
    o.style.cssText = `position:fixed;inset:0;z-index:10002;background:rgba(20,8,16,0.6);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:16px;animation:pvFadeIn 0.2s ease;`;
    o.innerHTML = `
      <div style="width:100%;max-width:440px;background:linear-gradient(180deg,#FEF4F5 0%,#fff 40%);border-radius:24px;overflow:hidden;box-shadow:0 20px 60px rgba(241,128,145,0.25);">
        <div style="padding:28px 24px 16px;text-align:center;">
          <div style="font-size:44px;margin-bottom:6px;">🎁</div>
          <div style="font-size:20px;font-weight:900;color:#222;margin-bottom:6px;letter-spacing:-0.3px;">친구 원장님을 초대하세요</div>
          <div style="font-size:13px;color:#666;line-height:1.6;">
            1명 가입할 때마다<br>
            <strong style="color:#D95F70;font-weight:900;">3개월 Pro 무료</strong> 드려요
          </div>
        </div>

        <div style="padding:0 24px 18px;">
          <div style="background:#fff;border:1.5px dashed #F18091;border-radius:14px;padding:14px;text-align:center;margin-bottom:14px;">
            <div style="font-size:11px;color:#888;margin-bottom:6px;font-weight:700;letter-spacing:1.5px;">내 추천 코드</div>
            <div id="ref-code" style="font-family:ui-monospace,monospace;font-size:24px;font-weight:900;color:#D95F70;letter-spacing:4px;">${code}</div>
            <button id="ref-copy-code" style="margin-top:10px;padding:7px 16px;background:#FEF4F5;border:none;border-radius:8px;color:#D95F70;font-weight:800;font-size:12px;cursor:pointer;">📋 코드 복사</button>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
            <button id="ref-share-link" style="padding:12px;background:linear-gradient(135deg,#F18091,#D95F70);color:#fff;border:none;border-radius:12px;font-weight:800;font-size:13px;cursor:pointer;box-shadow:0 4px 12px rgba(241,128,145,0.35);">🔗 링크 공유</button>
            <button id="ref-share-kakao" style="padding:12px;background:#FEE500;color:#3C1E1E;border:none;border-radius:12px;font-weight:800;font-size:13px;cursor:pointer;">💬 카톡 전송</button>
          </div>

          <div style="padding:12px 14px;background:#F7F8FA;border-radius:12px;font-size:12px;color:#555;line-height:1.65;">
            💡 <strong>친구에게 보낼 메시지 예시</strong><br>
            "원장님 저도 요즘 잇데이 쓰고 있는데 진짜 편해요. 고객·예약·매출 한번에 되고 AI가 캡션까지 써줘요. 제 코드로 가입하면 무료 기간이 더 길어요 ${code}"
          </div>
        </div>

        <div style="padding:14px 24px;border-top:1px solid #eee;background:#fafafa;display:flex;align-items:center;">
          <div style="flex:1;">
            <div style="font-size:11px;color:#888;">이미 초대한 원장님</div>
            <div style="font-weight:900;font-size:16px;color:#222;">${count}명</div>
          </div>
          <button id="ref-close" style="padding:10px 18px;background:#fff;border:1px solid #ddd;border-radius:10px;font-weight:700;font-size:13px;cursor:pointer;">닫기</button>
        </div>
      </div>
    `;
    document.body.appendChild(o);
    o.addEventListener('click', (e) => { if (e.target === o) o.remove(); });
    o.querySelector('#ref-close').addEventListener('click', () => o.remove());

    o.querySelector('#ref-copy-code').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(code); if (window.showToast) window.showToast('✅ 코드 복사됨'); } catch(_){}
    });

    o.querySelector('#ref-share-link').addEventListener('click', async () => {
      const text = `잇데이 ★ 1인샵 AI 비서. 제 코드 ${code} 쓰시면 무료 기간 더 드려요.`;
      if (navigator.share) {
        try { await navigator.share({ title: '잇데이 초대', text, url: signupUrl }); return; } catch(_){}
      }
      try { await navigator.clipboard.writeText(text + ' ' + signupUrl); if (window.showToast) window.showToast('✅ 초대 링크 복사됨'); } catch(_){}
    });

    o.querySelector('#ref-share-kakao').addEventListener('click', async () => {
      // 카카오톡 공유 SDK 없이: 텍스트 클립보드 + 카카오톡 자동 실행
      const text = `잇데이 가입 시 제 코드 ${code} 넣으세요 (무료 기간 연장)\n${signupUrl}`;
      try { await navigator.clipboard.writeText(text); } catch(_){}
      if (window.showToast) window.showToast('📋 복사됨 — 카톡 친구 대화방에 붙여넣기');
      // 기본 SMS/카톡 체인
      setTimeout(() => { window.location.href = 'sms:?body=' + encodeURIComponent(text); }, 300);
    });
  }

  window.openReferral = open;
})();
