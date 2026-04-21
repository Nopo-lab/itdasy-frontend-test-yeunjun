/* ─────────────────────────────────────────────────────────────
   음성 입력 전역화 (T-312 · 2026-04-22)
   모든 text input · textarea 옆에 🎤 버튼 자동 주입.
   탭 시 Web Speech API 로 받아 해당 필드 값 채움.

   opt-out: data-no-voice 속성.
   password 필드 제외.
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;  // 미지원 브라우저에선 조용히 비활성

  let _active = null;  // 현재 녹음 중 rec

  function _inject(input) {
    if (input.dataset.voiceInjected) return;
    if (input.hasAttribute('data-no-voice')) return;
    // opt-in 방식: 명시적으로 data-voice 가 붙은 필드 또는 부모에 붙은 필드에만 적용
    if (!input.hasAttribute('data-voice') && !input.closest('[data-voice-root]')) return;
    if (input.type === 'password' || input.type === 'hidden' || input.type === 'date' ||
        input.type === 'time' || input.type === 'number' || input.type === 'email') return;
    if (input.tagName === 'INPUT' && input.type && input.type !== 'text' && input.type !== '') return;

    input.dataset.voiceInjected = '1';
    // wrapper 로 감싸기보다, 버튼을 absolute 로 붙여서 CSS 간섭 최소화
    // input 부모가 position:relative 있어야 함. 없으면 감싸자.
    const parent = input.parentElement;
    if (!parent) return;
    if (getComputedStyle(parent).position === 'static') {
      // wrapper 로 감싸기
      const wrap = document.createElement('span');
      wrap.style.cssText = 'position:relative;display:inline-block;width:100%;';
      parent.insertBefore(wrap, input);
      wrap.appendChild(input);
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'vi-mic';
    btn.textContent = '🎤';
    btn.style.cssText = 'position:absolute;right:6px;top:50%;transform:translateY(-50%);width:28px;height:28px;border:none;border-radius:50%;background:rgba(241,128,145,0.12);cursor:pointer;font-size:13px;z-index:2;transition:all 0.12s;display:flex;align-items:center;justify-content:center;padding:0;';
    btn.title = '음성 입력';
    btn.setAttribute('aria-label', '음성 입력');
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      _toggle(input, btn);
    });
    const host = input.parentElement; // wrapper or original parent
    host.appendChild(btn);
    // input padding-right 보정 (기존 스타일 훼손 없이 살짝)
    const cur = parseInt(getComputedStyle(input).paddingRight) || 10;
    if (cur < 40) input.style.paddingRight = '40px';
  }

  function _toggle(input, btn) {
    if (_active) {
      try { _active.rec.stop(); } catch(e){}
      _active = null;
      return;
    }
    const rec = new SR();
    rec.lang = 'ko-KR';
    rec.interimResults = true;
    rec.continuous = false;
    let _base = input.value || '';
    if (_base && !_base.endsWith(' ')) _base += ' ';
    btn.style.background = 'rgba(220,53,69,0.92)';
    btn.style.color = '#fff';
    btn.style.animation = 'vi-pulse 1s infinite';
    rec.onresult = (e) => {
      let final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t;
        else input.value = _base + t;
      }
      if (final) {
        input.value = _base + final;
        _base = input.value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    };
    rec.onerror = () => { _cleanup(btn); };
    rec.onend = () => { _cleanup(btn); };
    _active = { rec, btn };
    try { rec.start(); }
    catch (e) { _cleanup(btn); if (window.showToast) window.showToast('음성 시작 실패'); }
  }

  function _cleanup(btn) {
    btn.style.background = 'rgba(241,128,145,0.12)';
    btn.style.color = '';
    btn.style.animation = '';
    _active = null;
  }

  function _scan(root) {
    (root || document).querySelectorAll('input:not([data-voice-injected]), textarea:not([data-voice-injected])').forEach(_inject);
  }

  // 초기 스캔
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => _scan());
  } else {
    _scan();
  }

  // DOM 변화 관찰
  const mo = new MutationObserver(muts => {
    muts.forEach(m => {
      m.addedNodes.forEach(n => {
        if (n.nodeType !== 1) return;
        if (n.matches && n.matches('input,textarea')) _inject(n);
        _scan(n);
      });
    });
  });
  mo.observe(document.body, { childList: true, subtree: true });

  // 펄스 애니메이션
  const style = document.createElement('style');
  style.textContent = '@keyframes vi-pulse{0%{box-shadow:0 0 0 0 rgba(220,53,69,0.5)}70%{box-shadow:0 0 0 10px rgba(220,53,69,0)}100%{box-shadow:0 0 0 0 rgba(220,53,69,0)}}';
  document.head.appendChild(style);
})();
