// 샘플 캡션 템플릿 — 인스타 연동/말투 분석 없이도 체험 가능
// 뷰티샵(붙임머리/네일/기타) 원장님이 처음 앱 열었을 때 "이런 식으로 나와요" 맛보기
// 백엔드 호출 없이 프론트 하드코딩 JSON.

(function sampleCaptions() {
  const SAMPLES = {
    붙임머리: [
      {
        tone: '담백한 톤',
        caption: '오늘 신규 손님 자연 붙임머리 완성 🤍\n처음이라 많이 긴장하셨다는데 편하게 잘 해주셔서 감사해요.\n\n예약은 DM으로 편하게 보내주세요.',
        hashtags: '붙임머리,붙임머리맛집,자연붙임머리,헤어익스텐션,잇데이'
      },
      {
        tone: '친근한 톤',
        caption: '언니~! 오늘 붙임머리 3시간 시술 끝 ✨\n원래 긴 머리였던 것처럼 자연스럽게 녹였어요 ㅎㅎ\n찰랑거리는 거 보면 저도 모르게 기분 좋아져요 💕\n\n#붙임머리 시술 후기는 프로필 링크 👇',
        hashtags: '붙임머리,롱헤어,헤어스타일,여성헤어,붙임머리전문,잇데이'
      },
      {
        tone: '전문가 톤',
        caption: '볼륨 붙임머리 완성.\n시술 전 모발 상태에 맞춰 웨이트 5g씩 48pcs, 테이프/링 혼합 방식으로 진행했습니다.\n4~6주 재방문 시 리터치 안내드려요.',
        hashtags: '붙임머리,볼륨붙임머리,헤어시술,펌,뷰티살롱,잇데이'
      }
    ],
    네일아트: [
      {
        tone: '담백한 톤',
        caption: '심플 젤네일 완성 🤍\n웨딩 앞두신 손님 그라데이션으로 깔끔하게.\n\n예약은 네이버에서 "잇데이" 검색 🎀',
        hashtags: '젤네일,웨딩네일,심플네일,자연네일,네일스타그램,잇데이'
      },
      {
        tone: '친근한 톤',
        caption: '오늘 단골언니 네일 ✨\n3주 만에 오셨는데 저번이랑 느낌 다르게 가자 하셔서\n파스텔 + 진주 포인트로 고고 💅\n보자마자 "너무 예뻐!" 하셔서 저도 뿌듯 🤭',
        hashtags: '네일아트,젤네일,파스텔네일,네일디자인,네일샵추천,잇데이'
      },
      {
        tone: '전문가 톤',
        caption: '프렌치 네일 + 큐티클 집중 케어.\n자연 네일 강화제로 베이스 셋팅, 약지에만 스톤 포인트.\n지속력 평균 3~4주.',
        hashtags: '프렌치네일,네일케어,네일전문,네일살롱,젤네일,잇데이'
      }
    ],
    beauty: [
      {
        tone: '담백한 톤',
        caption: '오늘의 시술 완성 🤍\n편안하게 받으실 수 있도록 정성스럽게 했어요.\n\n다음 방문 때 뵐게요.',
        hashtags: '뷰티샵,뷰티케어,셀프케어,리프레시,잇데이'
      },
      {
        tone: '친근한 톤',
        caption: '언니들~ 오늘 샵 왁자지껄 했어요 ✨\n단골들이 우르르 오셔서 수다 꽃 피며 시술 🤭\n다음 방문 때도 예약 잊지 마세요 💕',
        hashtags: '뷰티샵,단골샵,뷰티스타그램,리프레시,힐링,잇데이'
      },
      {
        tone: '전문가 톤',
        caption: '오늘 시술 완료.\n피부 타입·모발 컨디션에 맞춰 개별 상담 후 진행했습니다.\n예약 문의는 DM 또는 네이버로.',
        hashtags: '뷰티,전문샵,피부관리,시술후기,잇데이'
      }
    ]
  };

  function openSamplePopup() {
    const shopType = localStorage.getItem('shop_type') || '붙임머리';
    const samples = SAMPLES[shopType] || SAMPLES.beauty;

    // 기존 팝업 재사용
    let popup = document.getElementById('_samplePopup');
    if (!popup) {
      popup = document.createElement('div');
      popup.id = '_samplePopup';
      popup.style.cssText = 'display:none; position:fixed; inset:0; z-index:9400; background:rgba(0,0,0,0.7); align-items:flex-end; justify-content:center;';
      popup.innerHTML = `
        <div style="width:100%; max-width:480px; background:#fff; border-radius:24px 24px 0 0; padding:24px 20px calc(32px + env(safe-area-inset-bottom)); max-height:92vh; overflow-y:auto;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <div style="font-size:17px; font-weight:800;">🎁 미리 체험해보기</div>
            <button id="_sampleClose" style="background:none; border:none; font-size:22px; width:44px; height:44px; cursor:pointer; color:#999;">✕</button>
          </div>
          <div style="font-size:12px; color:#666; margin-bottom:14px;">인스타 연동 전에도 <b>이런 느낌</b>으로 캡션이 나와요. 연동하시면 <b>사장님 말투 그대로</b> 맞춤 생성됩니다.</div>
          <div id="_sampleList"></div>
          <button id="_sampleConnectBtn" style="width:100%; margin-top:18px; padding:14px; border-radius:12px; border:none; background:linear-gradient(135deg,#f18091,#ff9aa8); color:#fff; font-size:14px; font-weight:800; cursor:pointer; min-height:48px;">내 말투로 맞춤 생성하기 →</button>
        </div>
      `;
      document.body.appendChild(popup);
      popup.addEventListener('click', (e) => { if (e.target === popup) popup.style.display = 'none'; });
      document.getElementById('_sampleClose').addEventListener('click', () => popup.style.display = 'none');
      document.getElementById('_sampleConnectBtn').addEventListener('click', () => {
        popup.style.display = 'none';
        if (typeof connectInstagram === 'function') connectInstagram();
      });
    }

    // 리스트 렌더
    const list = document.getElementById('_sampleList');
    list.innerHTML = samples.map((s, i) => `
      <div style="background:#fafafa; border-radius:14px; padding:14px; margin-bottom:10px;">
        <div style="font-size:11px; font-weight:800; color:var(--accent, #f18091); margin-bottom:6px;">${s.tone}</div>
        <div style="font-size:13px; color:#333; line-height:1.7; white-space:pre-wrap; margin-bottom:8px;">${s.caption.replace(/</g,'&lt;')}</div>
        <div style="font-size:11px; color:#888;">${s.hashtags.split(',').map(h => '#'+h.trim()).join(' ')}</div>
        <button data-sample-idx="${i}" class="_sampleCopyBtn" style="margin-top:10px; padding:8px 14px; border-radius:8px; border:1px solid var(--accent, #f18091); background:#fff; color:var(--accent, #f18091); font-size:12px; font-weight:700; cursor:pointer; min-height:36px;">📋 이 톤으로 복사</button>
      </div>
    `).join('');
    list.querySelectorAll('._sampleCopyBtn').forEach(b => {
      b.addEventListener('click', async () => {
        const s = samples[parseInt(b.dataset.sampleIdx)];
        const full = s.caption + '\n\n' + s.hashtags.split(',').map(h => '#' + h.trim()).join(' ');
        try {
          await navigator.clipboard.writeText(full);
          showToast('✨ 캡션이 복사됐어요');
        } catch(e) {
          showToast('복사 실패. 길게 눌러서 직접 복사해주세요');
        }
      });
    });

    popup.style.display = 'flex';
  }

  window.openSamplePopup = openSamplePopup;
})();
