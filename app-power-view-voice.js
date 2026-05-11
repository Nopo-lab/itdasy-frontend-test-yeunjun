/* ─────────────────────────────────────────────────────────────
   파워뷰 — 음성 입력 (Phase 3 · 2026-05-09)

   헤더 🎙️ 클릭 → Web Speech API (ko-KR) → 자연어 → /assistant/execute
   → 백엔드가 create_revenue/booking/customer 등 파싱 후 자동 실행
   → 파워뷰 자동 갱신 (itdasy:data-changed 수신).

   예: "어제 김서연 5만원 카드" → 매출 탭에 새 행 자동 추가.

   ── 가드레일 ──
   1. 백엔드 신규 0 — 기존 /assistant/execute 재사용
   2. SpeechRecognition 미지원 시 안내 토스트만
   3. 권한 거부 시 안전 fallback
   4. 파일 ≤200줄

   사용:
     window._PVVoice.start()  → 녹음 시작
     window._PVVoice.stop()   → 녹음 중지 + 처리
     window._PVVoice.button() → 헤더용 SVG 버튼 HTML
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window._PVVoice) return;

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  let _recognition = null;
  let _listening = false;
  let _accumulated = '';

  function _toast(msg) { try { if (typeof window.showToast === 'function') window.showToast(msg); } catch (_e) { /* silent */ } }
  function _api() { return window.API || ''; }
  function _auth() { try { return window.authHeader ? window.authHeader() : {}; } catch (_e) { return {}; } }

  function _isSupported() {
    return !!SR;
  }

  function _setButtonState(active) {
    try {
      const btn = document.getElementById('pv-voice-btn');
      if (!btn) return;
      btn.classList.toggle('is-listening', !!active);
      btn.setAttribute('aria-pressed', String(!!active));
      btn.title = active ? '녹음 중… 다시 누르면 처리' : '음성으로 입력';
    } catch (_e) { /* silent */ }
  }

  async function _processText(text) {
    const t = (text || '').trim();
    if (!t) { _toast('내용을 알아듣지 못했어요'); return; }
    _toast('"' + t + '" 처리 중…');
    try {
      const res = await fetch(_api() + '/assistant/execute', {
        method: 'POST',
        headers: { ..._auth(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: t, source: 'power_view_voice' }),
      });
      if (!res.ok) {
        // 미배포 환경 폴백 — /assistant/ask 시도
        const res2 = await fetch(_api() + '/assistant/ask', {
          method: 'POST',
          headers: { ..._auth(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: t }),
        });
        if (!res2.ok) throw new Error('HTTP ' + res2.status);
      }
      _toast('자동 처리됐어요');
      // 캐시 무효화 + 재로드는 itdasy:data-changed 리스너에서
      try { window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'force_sync', source: 'voice' } })); }
      catch (_e) { /* silent */ }
    } catch (e) {
      console.warn('[PVVoice] process', e);
      _toast('AI 처리 실패 — 텍스트로 다시 시도해주세요');
    }
  }

  function start() {
    if (!_isSupported()) { _toast('이 기기는 음성 입력을 지원하지 않아요'); return; }
    if (_listening) { stop(); return; }
    try {
      _recognition = new SR();
      _recognition.lang = 'ko-KR';
      _recognition.continuous = false;
      _recognition.interimResults = false;
      _recognition.maxAlternatives = 1;
      _accumulated = '';
      _recognition.onresult = (ev) => {
        try {
          const result = ev.results[0];
          if (result && result[0]) _accumulated = result[0].transcript || '';
        } catch (_e) { /* silent */ }
      };
      _recognition.onerror = (ev) => {
        console.warn('[PVVoice] onerror', ev.error);
        if (ev.error === 'not-allowed') _toast('마이크 권한이 필요해요');
        else if (ev.error === 'no-speech') _toast('음성을 감지하지 못했어요');
        else _toast('음성 인식 오류');
        _listening = false;
        _setButtonState(false);
      };
      _recognition.onend = () => {
        _listening = false;
        _setButtonState(false);
        if (_accumulated) _processText(_accumulated);
      };
      _recognition.start();
      _listening = true;
      _setButtonState(true);
      _toast('말씀하세요… (예: "김서연 5만원 카드")');
    } catch (e) {
      console.warn('[PVVoice] start', e);
      _toast('음성 입력을 시작할 수 없어요');
      _listening = false;
      _setButtonState(false);
    }
  }

  function stop() {
    try {
      if (_recognition && _listening) {
        _recognition.stop();
        _listening = false;
        _setButtonState(false);
      }
    } catch (_e) { /* silent */ }
  }

  function button() {
    if (!_isSupported()) return '';
    return `<button type="button" id="pv-voice-btn" class="pv-voice-btn" aria-label="음성으로 입력" aria-pressed="false" title="음성으로 입력">
      <i class="ph-duotone ph-microphone" aria-hidden="true"></i>
    </button>`;
  }

  function bind() {
    try {
      const btn = document.getElementById('pv-voice-btn');
      if (!btn) return;
      btn.addEventListener('click', start);
    } catch (e) {
      console.warn('[PVVoice] bind', e);
    }
  }

  window._PVVoice = { start, stop, button, bind, isSupported: _isSupported };
})();
