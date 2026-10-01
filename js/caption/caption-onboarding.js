/* caption-onboarding.js — 온보딩 '말투 학습' 캡션 테스트 팝업
   [B-분할] app-caption.js 에서 분리(2026-06-30). 전역 함수 유지 — window.showOnboardingCaptionPopup 등 호출부 그대로.
   의존(전역, 다른 파일): apiFetch / authHeader / showToast. 자체 상태 없음.
   공개: showOnboardingCaptionPopup() / closeOnboardingCaptionPopup() / saveOnboardingCaption() */

// ===== 온보딩 캡션 테스트 팝업 =====
async function showOnboardingCaptionPopup() {
  const popup = document.getElementById('onboardingCaptionPopup');
  const ta = document.getElementById('ocpTextarea');

  // 팝업을 먼저 열고, 생성 중 상태로 표시
  const loadingMsgs = ['AI가 말투를 분석하고 있어요...✨', '게시물 스타일 학습 중...🎀', '피드 글 초안 작성 중...📝', '거의 다 됐어요!💫'];
  let msgIdx = 0;
  ta.value = loadingMsgs[0];
  ta.readOnly = true;
  ta.style.opacity = '0.5';
  popup.style.display = 'flex';
  const loadingTimer = setInterval(() => { msgIdx = (msgIdx + 1) % loadingMsgs.length; ta.value = loadingMsgs[msgIdx]; }, 2000);

  // 저장 버튼도 비활성화
  const saveBtn = popup.querySelector('.ocp-save');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.style.opacity = '0.5'; }

  try {
    const shopType = (localStorage.getItem('shop_type') || '').trim();
    // [ai-quality-07 2026-10-01] '오늘 새로운 손님. 결과 대만족.' 은 아무도 말한 적 없는 사실이었다 — 말투 테스트용
    //   샘플만 청한다(가격·할인·손님 반응 같은 사실 주장 없이). 미매핑 업종은 '뷰티 시술' 로 중립.
    const description = (shopType ? shopType + ' 시술' : '뷰티 시술')
      + ' 소개 글 샘플. 말투 테스트용이라 가격·할인·예약 시간·손님 반응 같은 사실은 넣지 말고 평소 말투만 보여주세요.';
    const res = await apiFetch('/caption/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ description, platform: 'instagram' }),
    });
    if (res.ok) {
      const d = await res.json().catch(() => ({}));
      // [ai-quality-05 2026-10-01] status:'clarification' 은 AI 가 쓴 글이 아니라 안내문(시술 신호 없음) — textarea 에
      //   꽂으면 원장이 안내문을 '내 말투' 로 저장하게 된다. 토스트로만 알리고 직접 입력을 청한다.
      //   (백엔드가 status 를 붙이기 전 응답엔 status 가 없으므로 기존 동작 그대로 — 하위 호환)
      if (d && d.status === 'clarification') {
        if (typeof showToast === 'function') showToast(String(d.caption || '시술 내용을 조금만 더 알려주시면 글을 써드릴게요.').split('\n')[0]);
        ta.value = '직접 평소 쓰시는 말투로 한 문단 입력해주시면 학습할게요!';
      } else {
        ta.value = String((d && d.caption) || '').trim() || '직접 평소 쓰시는 말투로 한 문단 입력해주시면 학습할게요!';
      }
    } else {
      // [2026-04-26] 무음 실패 금지 — 사용자한테 명시적으로 알림 (Meta 심사 블로커)
      const errMsg = (await res.text().catch(() => '')) || `HTTP ${res.status}`;
      console.warn('[caption] 생성 실패:', errMsg);
      if (typeof showToast === 'function') {
        showToast('AI 글 만들기에 실패했어요 — 잠시 후 다시 시도해주세요', 'error');
      }
      ta.value = '직접 평소 쓰시는 말투로 한 문단 입력해주시면 학습할게요!';
    }
  } catch(e) {
    ta.value = '직접 평소 쓰시는 말투로 한 문단 입력해주시면 학습할게요!';
  } finally {
    clearInterval(loadingTimer);
    ta.readOnly = false;
    ta.style.opacity = '1';
    if (saveBtn) { saveBtn.disabled = false; saveBtn.style.opacity = '1'; }
  }
}

function closeOnboardingCaptionPopup() {
  document.getElementById('onboardingCaptionPopup').style.display = 'none';
}

async function saveOnboardingCaption() {
  const ta = document.getElementById('ocpTextarea');
  const text = ta.value.trim();
  if (!text || text.length < 10) { showToast('글을 조금 더 입력해주세요!'); return; }

  try {
    const res = await apiFetch('/shop/persona/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ corrected_caption: text }),
    });
    if (!res.ok) throw new Error();
    closeOnboardingCaptionPopup();
    showToast('학습 완료! 앞으로 모든 글에 반영됩니다!');
  } catch(e) {
    showToast('저장에 실패했어요. 다시 시도해주세요.');
  }
}
