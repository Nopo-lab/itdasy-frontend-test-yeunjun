/* caption-loader-ui.js — 캡션 생성 중 로딩 팝업 (차분한 프리미엄형)
   [B-분할] app-caption.js 에서 분리(2026-06-30). 전역 함수 유지(IIFE 아님) — window.showCaptionLoader 등 호출부 그대로.
   [v778 리디자인] 슬롯머신 릴 → '말투/길이/이모지' 페르소나 칩이 하나씩 차오르는 방식.
     원장님 저장 스타일(itdasy_latest_analysis)을 값으로 채워 "당신 스타일 그대로 맞추는 중"을 보여준다.
   공개: showCaptionLoader() / hideCaptionLoader(success, onClose) — app-caption.js 생성 흐름이 호출. */

// ===== 캡션 로딩 팝업 상태 =====
let _clTimers = [];
let _clFilled = [false, false, false];
let _clFinalWords = ['자연스러운', '보통', '✨'];

function _clReset() {
  _clFilled = [false, false, false];
  _clTimers.forEach(t => { clearInterval(t); clearTimeout(t); });
  _clTimers = [];
  [0, 1, 2].forEach(i => {
    const chip = document.getElementById('clChip' + i);
    if (!chip) return;
    chip.classList.remove('filled');
    const v = chip.querySelector('.cl-chip__v');
    if (v) v.textContent = '…';
  });
}

function _clFill(i, word) {
  if (_clFilled[i]) return;
  _clFilled[i] = true;
  const chip = document.getElementById('clChip' + i);
  if (!chip) return;
  const v = chip.querySelector('.cl-chip__v');
  if (v) v.textContent = word;
  chip.classList.add('filled');
}

/* [ai-quality-03 2026-10-01] opts.usePersona — 이번 요청에 원장 말투(payload.use_persona)가 실제로 실리는지.
   예전엔 use_persona 를 보내지도 않으면서 저장된 인스타 분석값으로 칩을 채우고 '원장님 말투로 쓰는 중…' 을
   보여줬다 — 글은 기본 말투로 나오는데 화면만 원장 말투라고 말하는 거짓 연출. 호출자(app-caption)가
   payload 를 만든 뒤 그 값을 넘기고, 꺼져 있으면 중립 칩 + 정직한 문구를 쓴다. */
function showCaptionLoader(opts) {
  const popup = document.getElementById('captionLoadingPopup');
  if (!popup) return;
  popup.style.display = 'flex';
  _clReset();
  const usePersona = !!(opts && opts.usePersona === true);

  // 페르소나가 실리는 요청일 때만 저장 스타일로 최종 칩 값 결정 (아니면 무난한 기본값)
  let raw = {};
  if (usePersona) {
    try { raw = JSON.parse(localStorage.getItem('itdasy_latest_analysis') || '{}') || {}; } catch (_e) { raw = {}; }
  }
  const avgLen = parseInt(raw.avg_caption_length) || 0;
  const lenWord = avgLen > 0 ? (avgLen < 50 ? '짧게' : avgLen > 120 ? '길게' : '보통') : '보통';
  const emojiMatch = (raw.emojis || '').match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u);
  const emojiWord = emojiMatch ? emojiMatch[0] : '✨';
  const toneWord = (raw.tone_summary || raw.tone || '').replace(/["']/g, '').trim().split(/[\s,·]+/)[0] || '자연스러운';
  _clFinalWords = [toneWord, lenWord, emojiWord];

  // 칩을 하나씩 차오르게 (700ms 간격) — 응답이 먼저 와도 hideCaptionLoader 가 나머지를 마저 채운다
  [0, 1, 2].forEach(i => {
    const t = setTimeout(() => _clFill(i, _clFinalWords[i]), 650 + i * 650);
    _clTimers.push(t);
  });

  // 안내 문구 순환
  const msgEl = document.getElementById('clMsg');
  const msgs = [usePersona ? '원장님 말투로 쓰는 중…' : '잇데이 기본 말투로 쓰는 중…', 'AI가 글 구상 중이에요…', '해시태그 고르는 중…', '거의 다 됐어요…'];
  let mi = 0;
  if (msgEl) msgEl.textContent = msgs[0];
  const mt = setInterval(() => {
    mi = Math.min(mi + 1, msgs.length - 1);
    if (msgEl) { msgEl.style.opacity = '0'; setTimeout(() => { msgEl.textContent = msgs[mi]; msgEl.style.opacity = '1'; }, 200); }
  }, 1600);
  _clTimers.push(mt);
}

function hideCaptionLoader(success, onClose) {
  // 아직 안 채워진 칩을 빠르게 마저 채우고(120ms 간격) 닫는다
  let lastDelay = 0;
  [0, 1, 2].forEach(i => {
    if (!_clFilled[i]) {
      const t = setTimeout(() => _clFill(i, _clFinalWords[i]), i * 120);
      _clTimers.push(t);
      lastDelay = i * 120;
    }
  });
  const done = setTimeout(() => {
    _clTimers.forEach(t => { clearInterval(t); clearTimeout(t); });
    _clTimers = [];
    const popup = document.getElementById('captionLoadingPopup');
    if (popup) popup.style.display = 'none';
    _clFilled = [false, false, false];
    if (onClose) setTimeout(onClose, 80);
  }, lastDelay + 320);
  _clTimers.push(done);
}
