/* AI 잇비 — 음성 입력 */
(function () {
  'use strict';

  function _toast(msg, type) {
    if (typeof window.showToast === 'function') window.showToast(msg, type);
  }

  function _injectStyle() {
    if (document.getElementById('asst-mic-pulse-style')) return;
    const style = document.createElement('style');
    style.id = 'asst-mic-pulse-style';
    style.textContent = '@keyframes asst-mic-pulse{0%{box-shadow:0 0 0 0 rgba(220,53,69,0.55)}70%{box-shadow:0 0 0 12px rgba(220,53,69,0)}100%{box-shadow:0 0 0 0 rgba(220,53,69,0)}}';
    document.head.appendChild(style);
  }

  function _uiActive(btn) {
    if (!btn) return;
    btn.style.background = 'rgba(220,53,69,0.92)';
    btn.style.color = '#fff';
    btn.style.borderColor = 'rgba(220,53,69,1)';
    btn.style.animation = 'asst-mic-pulse 1s infinite';
  }

  function _uiReset(btn) {
    if (!btn) return;
    btn.style.background = 'hsl(340,100%,98%)';
    btn.style.color = 'hsl(350,60%,40%)';
    btn.style.borderColor = 'hsl(340,78%,85%)';
    btn.style.animation = '';
  }

  function _readFinalText(event) {
    let interimText = '';
    let finalText = '';
    for (let i = 0; i < event.results.length; i += 1) {
      const result = event.results[i];
      const text = result[0].transcript;
      if (result.isFinal) finalText += text;
      else interimText += text;
    }
    return { interimText, finalText };
  }

  function _baseForInput(input, baseSep) {
    const cur = (input && input.value) || '';
    return cur.length >= baseSep.length ? cur.substring(0, baseSep.length) : baseSep;
  }

  function _finishPhrase(input, baseSep, finalText) {
    if (!input || !finalText) return;
    input.value = _baseForInput(input, baseSep) + finalText + ' ';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function _makeRecognition(ctx, baseSep) {
    const rec = new ctx.SpeechRecognition();
    rec.lang = 'ko-KR';
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    let localFinal = '';
    rec.onresult = event => _onResult(ctx, baseSep, event, text => { localFinal = text; });
    rec.onerror = event => _onError(ctx, event);
    rec.onend = () => _onEnd(ctx, baseSep, localFinal);
    return rec;
  }

  function _onResult(ctx, baseSep, event, setFinal) {
    if (!ctx.input) return;
    const text = _readFinalText(event);
    if (text.finalText) setFinal(text.finalText);
    const shownFinal = text.finalText || '';
    ctx.input.value = _baseForInput(ctx.input, baseSep) + shownFinal + (text.interimText || '');
    ctx.input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function _onError(ctx, event) {
    const code = event && event.error;
    if (code === 'no-speech' && !ctx.manualStop) return;
    if (code === 'aborted') return;
    _uiReset(ctx.button);
    ctx.recognition = null;
    const permissionError = code === 'not-allowed' || code === 'service-not-allowed';
    _toast(permissionError ? '마이크 권한이 필요해요. 브라우저 설정을 확인해주세요.' : '음성 인식 실패 - 다시 시도해주세요');
  }

  function _onEnd(ctx, baseSep, localFinal) {
    _finishPhrase(ctx.input, baseSep, localFinal);
    if (ctx.manualStop) {
      _stopUi(ctx);
      return;
    }
    setTimeout(() => _restart(ctx, baseSep), 50);
  }

  function _restart(ctx, baseSep) {
    if (ctx.manualStop) return;
    try {
      const next = _makeRecognition(ctx, baseSep);
      next.start();
      ctx.recognition = next;
    } catch (_err) {
      _uiReset(ctx.button);
      ctx.recognition = null;
    }
  }

  function _stopUi(ctx) {
    _uiReset(ctx.button);
    ctx.recognition = null;
    if (ctx.input && ctx.input.value) _toast('음성 인식 완료');
    try { ctx.input && ctx.input.focus(); } catch (_e) { void _e; }
    // [2026-08-16] 인식 결과가 input.value 직접 세팅이라 input 이벤트가 없음 →
    //   수동 dispatch 해서 마이크↔전송 스왑(_updateComposerSwap)·typeahead 갱신.
    try { ctx.input && ctx.input.dispatchEvent(new Event('input', { bubbles: true })); } catch (_e) { void _e; }
  }

  function create() {
    _injectStyle();
    const ctx = {
      recognition: null,
      manualStop: false,
      SpeechRecognition: null,
      input: null,
      button: null,
    };
    return {
      start() {
        ctx.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        ctx.input = document.getElementById('asstInput');
        ctx.button = document.getElementById('asstMicBtn');
        if (!ctx.SpeechRecognition) {
          _toast('이 환경은 음성 입력을 지원하지 않아요. 키보드로 입력해주세요.', 'warning');
          return;
        }
        if (ctx.recognition) {
          ctx.manualStop = true;
          try { ctx.recognition.stop(); } catch (_e) { void _e; }
          ctx.recognition = null;
          _uiReset(ctx.button);
          return;
        }
        ctx.manualStop = false;
        const inputValue = (ctx.input && ctx.input.value) || '';
        const baseSep = inputValue && !inputValue.endsWith(' ') ? inputValue + ' ' : inputValue;
        try {
          const rec = _makeRecognition(ctx, baseSep);
          rec.start();
          ctx.recognition = rec;
          _uiActive(ctx.button);
          _toast('듣고 있어요… (다시 누르면 멈춤)');
        } catch (_e) {
          _uiReset(ctx.button);
          ctx.recognition = null;
          _toast('음성 시작 실패 - 잠시 후 다시 시도');
        }
      },
    };
  }

  window.ItdasyAssistantVoiceInput = { create };
})();
