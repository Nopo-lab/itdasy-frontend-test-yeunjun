/* ───────────────────────────────────────────────────────────
   app-help-guide.js — 실사용 가이드 허브 (워크플로우 + step-by-step)
   2026-05-12 신규 (QA #13).
   기존 "문의하기"(app-support.js) 는 그대로 두고, 별도 진입점으로 가이드 시트 제공.
   ─────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const ID = 'helpGuideSheet';

  function _toast(m) { if (window.showToast) window.showToast(m); }
  function _haptic() { try { window.hapticLight && window.hapticLight(); } catch (_e) { void _e; } }

  // 13개 워크플로우 — 초보 원장 기준. 캡쳐 이미지는 디자인팀 작업 후 src 채움.
  const TOPICS = [
    {
      key: 'booking', icon: 'ph-calendar-blank', title: '예약 등록',
      sub: '캘린더 빈 칸 → 예약 추가',
      steps: [
        '하단 탭바 가운데 ⊕ 버튼 또는 캘린더 빈 시간대 탭',
        '고객명 · 시술 · 시간 입력 (이미 등록된 고객이면 자동완성)',
        '"저장" 누르면 끝. 충돌 시간이면 빨간 경고가 떠요',
      ],
      shortcut: 'AI 비서에 "내일 2시 김지영 펌 추가" 한 줄로도 끝나요.',
    },
    {
      key: 'customer', icon: 'ph-user-plus', title: '고객 등록',
      sub: '이름·전화번호만 있으면 OK',
      steps: [
        '고객 탭 → 우상단 ⊕ 또는 검색창에서 새 이름 입력',
        '이름·전화번호(선택)·생일(선택)·메모(시술 취향, 알러지 등)',
        '저장하면 다음 예약·매출에서 자동완성됨',
      ],
      shortcut: '매출 입력 시 새 이름 적으면 자동으로 고객으로 추가돼요.',
    },
    {
      key: 'revenue', icon: 'ph-currency-krw', title: '매출 기록',
      sub: '한 줄 입력 + 결제 방식',
      steps: [
        '매출 탭 → ⊕ 버튼',
        '고객명 + 시술 + 금액 + 결제(카드/현금/계좌/회원권) 입력',
        '"오늘 김지영 5만원 카드" 같이 AI 비서에 말해도 자동 기록',
      ],
      shortcut: '영수증 사진 던지면 AI가 자동으로 매출/지출 분류해줘요.',
    },
    {
      key: 'inventory', icon: 'ph-package', title: '재고 관리',
      sub: '품목별 단위·소수점 설정',
      steps: [
        '재고 메뉴 → 품목 이름·수량·단위·임계치 입력',
        '단위는 자유 (개·g·ml). 자리수(0~3)로 소수점 자릿수 지정',
        '임계치 아래로 떨어지면 "지금 부족해요" 카드에 자동 표시',
      ],
      shortcut: '"+/-" 버튼으로 한 번에 1씩 증감. 영수증 OCR에서 자동 입고도 가능.',
    },
    {
      key: 'caption', icon: 'ph-sparkle', title: '캡션 생성',
      sub: '시술 사진 → AI 캡션',
      steps: [
        '하단 탭 [캡션] → 카메라 / 갤러리에서 사진 선택',
        '시술명·간단 설명 적기 (없어도 됨)',
        'AI가 사장님 말투로 인스타용 캡션 + 해시태그 + 이모지 자동 생성',
      ],
      shortcut: '인스타 연동 후 "말투 분석"부터 한 번 돌리면 정확도 ↑',
    },
    {
      key: 'ocr', icon: 'ph-receipt', title: 'OCR 영수증',
      sub: '사진만 던지면 자동 분류',
      steps: [
        '홈에서 📷 / AI 비서에 사진 첨부',
        'AI가 영수증 자동 인식 → 매출/지출/재고 분류',
        '결과 미리보기에서 한 번 확인 → "추가" 버튼으로 commit',
      ],
      shortcut: '같은 영수증 두 번 올려도 중복 등록 안 됨 (sha 해시 자동 차단).',
    },
    {
      key: 'persona', icon: 'ph-user-circle', title: 'AI 말투 분석',
      sub: '내 인스타 글로 말투 학습',
      steps: [
        '인스타 연동 → 자동 분석 시작 (1~2분)',
        '"AI 자동화 > AI 페르소나"에서 결과 확인',
        '캡션·DM 자동응답이 사장님 말투로 생성되기 시작',
      ],
      shortcut: '5분 안에 다시 누르면 캐시 사용 (무료 플랜 월 1회 절약).',
    },
    {
      key: 'dm', icon: 'ph-chat-circle-text', title: 'DM 자동응답',
      sub: '받은 DM → AI 답장 초안',
      steps: [
        'AI 자동화 > DM 자동응답 → ON',
        '톤(친근/정중/귀여움) + 운영시간 설정',
        '받은 DM이 분류돼 답장 초안이 만들어짐 → 확인 후 전송',
      ],
      shortcut: '👍/👎 피드백으로 다음 답장이 더 정확해져요.',
    },
    {
      key: 'automation', icon: 'ph-robot', title: 'AI 자동화',
      sub: '예약 미입력·재고 부족 자동 알림',
      steps: [
        '대시보드 > 자동화 룰 → "추가"',
        '트리거(시간/이벤트) + 액션(알림/메시지 초안) 선택',
        '활성화하면 백그라운드로 자동 실행',
      ],
      shortcut: '"매일 22시 빈 슬롯 알림" 같은 룰 만들어두면 편해요.',
    },
    {
      key: 'export', icon: 'ph-archive', title: '백업·내보내기',
      sub: '전체 데이터 ZIP 다운로드',
      steps: [
        '"설정 > 백업·로그아웃" 또는 "톱니바퀴 > 내 데이터 내보내기"',
        '"전체 데이터 ZIP (CSV)" 누르면 고객·예약·매출·재고·지출 한 번에',
        '엑셀에서 바로 열림 (UTF-8 BOM)',
      ],
      shortcut: 'JSON 형식은 다른 시스템 이관용. PIPA/GDPR 호환.',
    },
  ];

  function _renderHTML() {
    return `
      <div class="hg-overlay" id="${ID}" aria-hidden="true">
        <header class="hg-header">
          <button type="button" class="hg-back" data-hg-close aria-label="뒤로">
            <i class="ph-duotone ph-arrow-left" aria-hidden="true"></i>
          </button>
          <div class="hg-title">사용 가이드</div>
          <button type="button" class="hg-contact" data-hg-contact>문의하기</button>
        </header>
        <div class="hg-body">
          <div class="hg-intro">
            <div class="hg-intro-title">초보 원장님을 위한 워크플로우 ${TOPICS.length}개</div>
            <div class="hg-intro-sub">3단계 안에 끝나도록 정리했어요. 막히면 우측 상단 "문의하기"로 알려주세요.</div>
          </div>
          <div class="hg-grid">
            ${TOPICS.map(t => `
              <button type="button" class="hg-card" data-hg-topic="${t.key}">
                <div class="hg-card-icon"><i class="ph-duotone ${t.icon}" aria-hidden="true"></i></div>
                <div class="hg-card-meta">
                  <div class="hg-card-title">${t.title}</div>
                  <div class="hg-card-sub">${t.sub}</div>
                </div>
                <i class="ph-duotone ph-caret-right hg-card-arrow" aria-hidden="true"></i>
              </button>
            `).join('')}
          </div>
        </div>
      </div>
      <style>
        .hg-overlay { position: fixed; inset: 0; z-index: 9000; background: #fff; overflow-y: auto;
          -webkit-overflow-scrolling: touch; overscroll-behavior: contain; transform: translateX(100%);
          transition: transform .25s cubic-bezier(.4,0,.2,1); padding-bottom: env(safe-area-inset-bottom,0); }
        .hg-overlay.is-open { transform: translateX(0); }
        .hg-header { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 8px;
          height: 52px; padding: 0 14px env(safe-area-inset-top,0); padding-top: env(safe-area-inset-top,0);
          background: #fff; border-bottom: 0.5px solid rgba(0,0,0,0.08); }
        .hg-back { width: 32px; height: 32px; border: none; background: transparent; cursor: pointer;
          display: grid; place-items: center; border-radius: 10px; color: #222; font-size: 18px; }
        .hg-back:active { background: rgba(0,0,0,0.05); }
        .hg-title { flex: 1; font-size: 17px; font-weight: 700; letter-spacing: -0.3px; color: #222; }
        .hg-contact { padding: 6px 12px; background: rgba(241,128,145,0.08); color: #D95F70;
          border: none; border-radius: 999px; font-size: 12px; font-weight: 700; cursor: pointer; }
        .hg-body { padding: 18px 14px 32px; }
        .hg-intro { margin-bottom: 18px; padding: 14px 16px; background: linear-gradient(135deg,rgba(241,128,145,0.06),rgba(217,95,112,0.04));
          border-radius: 14px; }
        .hg-intro-title { font-size: 14px; font-weight: 800; color: #222; margin-bottom: 4px; }
        .hg-intro-sub { font-size: 12px; color: #666; line-height: 1.5; }
        .hg-grid { display: flex; flex-direction: column; gap: 8px; }
        .hg-card { display: flex; align-items: center; gap: 12px; padding: 14px;
          background: #fff; border: 1px solid rgba(0,0,0,0.06); border-radius: 14px;
          cursor: pointer; text-align: left; font-family: inherit; transition: background .12s; }
        .hg-card:active { background: rgba(0,0,0,0.04); }
        .hg-card-icon { width: 40px; height: 40px; border-radius: 12px;
          background: rgba(241,128,145,0.08); display: grid; place-items: center;
          color: #D95F70; font-size: 20px; flex-shrink: 0; }
        .hg-card-meta { flex: 1; min-width: 0; }
        .hg-card-title { font-size: 14px; font-weight: 700; color: #222; margin-bottom: 2px; }
        .hg-card-sub { font-size: 11px; color: #888; }
        .hg-card-arrow { color: #c5c5c5; flex-shrink: 0; }
        .hg-detail { position: absolute; inset: 0; background: #fff; padding: 20px 18px;
          display: flex; flex-direction: column; overflow-y: auto; }
        .hg-detail-hd { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; }
        .hg-detail-icon { width: 44px; height: 44px; border-radius: 12px;
          background: rgba(241,128,145,0.1); display: grid; place-items: center;
          color: #D95F70; font-size: 22px; }
        .hg-detail-title { font-size: 17px; font-weight: 800; color: #222; }
        .hg-detail-sub { font-size: 12px; color: #888; }
        .hg-step { display: flex; gap: 10px; padding: 10px 0; border-bottom: 0.5px solid rgba(0,0,0,0.06); }
        .hg-step-num { width: 24px; height: 24px; border-radius: 50%; background: #D95F70;
          color: #fff; font-size: 11px; font-weight: 800; display: grid; place-items: center; flex-shrink: 0; }
        .hg-step-text { font-size: 13px; color: #333; line-height: 1.5; flex: 1; }
        .hg-shortcut { margin-top: 18px; padding: 12px 14px;
          background: rgba(34,197,94,0.06); border-left: 3px solid #16b55e;
          border-radius: 6px; font-size: 12px; color: #15803d; line-height: 1.5; }
      </style>
    `;
  }

  function _ensure() {
    if (document.getElementById(ID)) return document.getElementById(ID);
    const wrap = document.createElement('div');
    wrap.innerHTML = _renderHTML();
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
    return document.getElementById(ID);
  }

  function _bind(el) {
    if (el.dataset.bound === '1') return;
    el.dataset.bound = '1';
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-hg-close]')) { closeHelpGuide(); return; }
      if (e.target.closest('[data-hg-contact]')) {
        if (typeof window.openSupportChat === 'function') {
          closeHelpGuide();
          window.openSupportChat();
        } else { _toast('문의하기 화면을 열 수 없어요'); }
        return;
      }
      const card = e.target.closest('[data-hg-topic]');
      if (card) {
        const topic = TOPICS.find(t => t.key === card.dataset.hgTopic);
        if (topic) _openDetail(topic);
      }
      if (e.target.closest('[data-hg-detail-back]')) {
        const det = el.querySelector('.hg-detail');
        if (det) det.remove();
      }
    });
  }

  function _openDetail(topic) {
    _haptic();
    const el = document.getElementById(ID);
    if (!el) return;
    const old = el.querySelector('.hg-detail');
    if (old) old.remove();
    const det = document.createElement('div');
    det.className = 'hg-detail';
    det.innerHTML = `
      <div class="hg-detail-hd">
        <button type="button" data-hg-detail-back style="background:transparent;border:none;cursor:pointer;color:#222;font-size:18px;">
          <i class="ph-duotone ph-arrow-left" aria-hidden="true"></i>
        </button>
        <div class="hg-detail-icon"><i class="ph-duotone ${topic.icon}" aria-hidden="true"></i></div>
        <div style="flex:1;">
          <div class="hg-detail-title">${topic.title}</div>
          <div class="hg-detail-sub">${topic.sub}</div>
        </div>
      </div>
      <div>
        ${topic.steps.map((s, i) => `
          <div class="hg-step">
            <div class="hg-step-num">${i + 1}</div>
            <div class="hg-step-text">${s}</div>
          </div>
        `).join('')}
      </div>
      <div class="hg-shortcut">💡 ${topic.shortcut}</div>
    `;
    el.appendChild(det);
  }

  function openHelpGuide() {
    const el = _ensure();
    _bind(el);
    requestAnimationFrame(() => el.classList.add('is-open'));
    el.setAttribute('aria-hidden', 'false');
    _haptic();
  }
  function closeHelpGuide() {
    const el = document.getElementById(ID);
    if (!el) return;
    el.classList.remove('is-open');
    el.setAttribute('aria-hidden', 'true');
    const det = el.querySelector('.hg-detail');
    if (det) det.remove();
  }

  window.openHelpGuide = openHelpGuide;
  window.closeHelpGuide = closeHelpGuide;
})();
