/* AI 자동화 허브 — DM/카카오/페르소나/캡션/게시물/스토리 통합 진입 (2026-04-30)
   사용:
     window.openAiHub()  — 카드 list 시트 열기
*/
(function () {
  'use strict';

  function _ensureSheet() {
    let sheet = document.getElementById('aiHubSheet');
    if (sheet) return sheet;
    sheet = document.createElement('div');
    sheet.id = 'aiHubSheet';
    sheet.style.cssText = 'position:fixed;inset:0;z-index:9985;background:rgba(0,0,0,0.5);display:none;align-items:flex-end;justify-content:center;';
    // 카드별 Lucide 아이콘 + 톤별 색상 정의
    const _ic = (id, size = 26) => `<svg width="${size}" height="${size}" aria-hidden="true"><use href="#${id}"/></svg>`;
    sheet.innerHTML = `
      <div id="aihCard" style="width:100%;max-width:560px;background:#fff;border-radius:20px 20px 0 0;max-height:92vh;overflow-y:auto;padding:18px 18px max(18px,env(safe-area-inset-bottom));">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
          <span style="display:inline-flex;align-items:center;color:#7C3AED;">${_ic('ic-bot', 22)}</span>
          <strong style="font-size:18px;">AI 자동화</strong>
          <span style="font-size:11px;background:#FAF5FF;color:#5B21B6;padding:2px 8px;border-radius:99px;font-weight:700;">사장님 손 없이</span>
          <button id="aihClose" aria-label="닫기" style="margin-left:auto;background:none;border:none;cursor:pointer;line-height:1;color:#888;display:inline-flex;align-items:center;">${_ic('ic-x', 18)}</button>
        </div>
        <div style="font-size:12px;color:#777;line-height:1.5;margin-bottom:14px;">
          AI 가 사장님 대신 처리하는 자동화들. 이 안에서 ON/OFF + 톤/규칙 설정.
        </div>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;">
          <button class="aih-card" data-act="dm" style="padding:16px 10px;border:2px solid #FDE68A;border-radius:14px;background:linear-gradient(135deg,#FFFBEB,#FEF3C7);cursor:pointer;text-align:left;">
            <div style="color:#B45309;margin-bottom:6px;display:inline-flex;">${_ic('ic-message-circle', 22)}</div>
            <div style="font-size:13px;font-weight:800;color:#78350F;">DM 자동응답</div>
            <div style="font-size:10px;color:#78350F80;margin-top:2px;line-height:1.4;">인스타 DM 도착 → AI 자동 답장 (톤 카드 3종)</div>
          </button>
          <button class="aih-card" data-act="kakao" style="padding:16px 10px;border:2px solid #FBBF24;border-radius:14px;background:linear-gradient(135deg,#FFFAEB,#FEF3C7);cursor:pointer;text-align:left;">
            <div style="color:#92400E;margin-bottom:6px;display:inline-flex;">${_ic('ic-message-square', 22)}</div>
            <div style="font-size:13px;font-weight:800;color:#92400E;">카카오 알림톡</div>
            <div style="font-size:10px;color:#92400E80;margin-top:2px;line-height:1.4;">예약·후기·생일 자동 발송 <span style="background:#fff;padding:1px 5px;border-radius:99px;font-weight:700;">soon</span></div>
          </button>
          <button class="aih-card" data-act="persona" style="padding:16px 10px;border:2px solid #DDD6FE;border-radius:14px;background:linear-gradient(135deg,#FAF5FF,#F3E8FF);cursor:pointer;text-align:left;">
            <div style="color:#5B21B6;margin-bottom:6px;display:inline-flex;">${_ic('ic-wand-sparkles', 22)}</div>
            <div style="font-size:13px;font-weight:800;color:#5B21B6;">AI 페르소나</div>
            <div style="font-size:10px;color:#5B21B680;margin-top:2px;line-height:1.4;">사장님 말투·이모지 학습 → 캡션 일관성</div>
          </button>
          <button class="aih-card" data-act="caption" style="padding:16px 10px;border:2px solid #FBCFE8;border-radius:14px;background:linear-gradient(135deg,#FDF2F8,#FCE7F3);cursor:pointer;text-align:left;">
            <div style="color:#9D174D;margin-bottom:6px;display:inline-flex;">${_ic('ic-pen-line', 22)}</div>
            <div style="font-size:13px;font-weight:800;color:#9D174D;">SNS 자동 캡션</div>
            <div style="font-size:10px;color:#9D174D80;margin-top:2px;line-height:1.4;">시술 사진 → 인스타 캡션 자동 생성</div>
          </button>
          <button class="aih-card" data-act="posts" style="padding:16px 10px;border:2px solid #BFDBFE;border-radius:14px;background:linear-gradient(135deg,#EFF6FF,#DBEAFE);cursor:pointer;text-align:left;">
            <div style="color:#1E3A8A;margin-bottom:6px;display:inline-flex;">${_ic('ic-image', 22)}</div>
            <div style="font-size:13px;font-weight:800;color:#1E3A8A;">게시물 관리</div>
            <div style="font-size:10px;color:#1E3A8A80;margin-top:2px;line-height:1.4;">완성된 포스트 인스타 발행</div>
          </button>
          <button class="aih-card" data-act="memo" style="padding:16px 10px;border:2px solid #C7D2FE;border-radius:14px;background:linear-gradient(135deg,#EEF2FF,#E0E7FF);cursor:pointer;text-align:left;">
            <div style="color:#3730A3;margin-bottom:6px;display:inline-flex;">${_ic('ic-bot', 22)}</div>
            <div style="font-size:13px;font-weight:800;color:#3730A3;">챗봇 메모</div>
            <div style="font-size:10px;color:#3730A380;margin-top:2px;line-height:1.4;">사장님 영구 메모 + 자동 학습 패턴</div>
          </button>
          <button class="aih-card" data-act="capture" style="padding:16px 10px;border:2px solid #BBF7D0;border-radius:14px;background:linear-gradient(135deg,#F0FDF4,#DCFCE7);cursor:pointer;text-align:left;grid-column:span 2;">
            <div style="display:flex;align-items:center;gap:12px;">
              <div style="color:#166534;display:inline-flex;flex-shrink:0;">${_ic('ic-image-plus', 26)}</div>
              <div style="flex:1;">
                <div style="font-size:13px;font-weight:800;color:#166534;">스마트 캡처 임포트</div>
                <div style="font-size:10px;color:#16653480;margin-top:2px;line-height:1.4;">카톡 캡처 → 예약·매출 자동 / 명함 → 고객 자동</div>
              </div>
            </div>
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(sheet);
    sheet.addEventListener('click', (e) => { if (e.target === sheet) close(); });
    sheet.querySelector('#aihClose').addEventListener('click', close);
    sheet.querySelectorAll('.aih-card').forEach(b => {
      b.addEventListener('click', () => {
        const act = b.dataset.act;
        close();
        setTimeout(() => _route(act), 200);
      });
    });
    return sheet;
  }

  function _route(act) {
    const map = {
      dm:      'openDMAutoreplySettings',
      kakao:   'openKakaoHub',
      persona: 'openPersonaSurveyModal',
      caption: 'openCaptionScenarioPopup',
      posts:   null,  // showTab finish 별도 처리
      memo:    'openAssistantFactsSheet',
      capture: 'openSmartCapture',
    };
    if (act === 'posts') {
      try {
        if (typeof window.showTab === 'function') {
          const finishBtn = document.querySelector('.tab-bar__btn[data-tab="finish"]');
          window.showTab('finish', finishBtn || null);
        }
        if (typeof window.initFinishTab === 'function') window.initFinishTab();
      } catch (_e) { void _e; }
      return;
    }
    const fnName = map[act];
    if (fnName && typeof window[fnName] === 'function') {
      try { window[fnName](); }
      catch (_e) { if (window.showToast) window.showToast('화면을 여는 중 문제가 생겼어요'); }
    } else if (window.showToast) {
      window.showToast('아직 준비 중이에요');
    }
  }

  function open() {
    const sheet = _ensureSheet();
    const card = sheet.querySelector('#aihCard');
    if (window.SheetAnim) window.SheetAnim.open(sheet, card);
    else sheet.style.display = 'flex';
  }
  function close() {
    const sheet = document.getElementById('aiHubSheet');
    if (!sheet) return;
    const card = sheet.querySelector('#aihCard');
    if (window.SheetAnim) window.SheetAnim.close(sheet, card);
    else sheet.style.display = 'none';
  }

  window.openAiHub = open;
  window.closeAiHub = close;
})();
