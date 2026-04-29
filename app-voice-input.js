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

  // [2026-04-30] 음성 인식 후처리 — 정확도 개선
  // 한국어 숫자 → 아라비아 숫자 + 시간 표현 정규화 + 고객/시술 fuzzy 매칭
  const _KOR_NUM = {
    '영': 0, '공': 0, '제로': 0,
    '한': 1, '하나': 1, '일': 1,
    '두': 2, '둘': 2, '이': 2,
    '세': 3, '셋': 3, '삼': 3,
    '네': 4, '넷': 4, '사': 4,
    '다섯': 5, '오': 5,
    '여섯': 6, '육': 6,
    '일곱': 7, '칠': 7,
    '여덟': 8, '팔': 8,
    '아홉': 9, '구': 9,
    '열': 10, '십': 10,
  };
  function _normalizeKoreanNumbers(s) {
    if (!s) return s;
    let out = s;
    // "오만원" / "오만" / "다섯만원" → 50000원
    out = out.replace(/(?:^|\s)([영공한두세네다섯여섯일곱여덟아홉열일이삼사오육칠팔구십백천]+)\s*만\s*원?/g, (m, num) => {
      const n = _KOR_NUM[num];
      if (n != null) return ` ${n * 10000}원`;
      // "이십" / "삼십" 같은 합성어
      const compound = num.match(/^([이삼사오육칠팔구])십$/);
      if (compound) return ` ${_KOR_NUM[compound[1]] * 100000}원`;
      return m;
    });
    // "오천원" / "다섯천원" → 5000원
    out = out.replace(/(?:^|\s)([영공한두세네다섯여섯일곱여덟아홉열]+)\s*천\s*원?/g, (m, num) => {
      const n = _KOR_NUM[num];
      return n != null ? ` ${n * 1000}원` : m;
    });
    // "두시" / "오후 두시" / "내일 두시" → "14시"
    out = out.replace(/(?:^|\s)(?:오후\s*)?([한두세네다섯여섯일곱여덟아홉열]+)\s*시(?!간)/g, (m, num) => {
      const n = _KOR_NUM[num];
      if (n == null) return m;
      // 오후가 앞에 있으면 +12
      const isPM = /오후\s*[한두세네다섯여섯일곱여덟아홉열]+\s*시/.test(m);
      const hour = isPM ? n + 12 : n;
      return ` ${hour}시`;
    });
    // "두시간" → "2시간"
    out = out.replace(/([한두세네다섯여섯일곱여덟아홉열])\s*시간/g, (m, num) => {
      const n = _KOR_NUM[num];
      return n != null ? `${n}시간` : m;
    });
    return out.replace(/\s+/g, ' ').trim();
  }

  function _fuzzyMatchName(transcript) {
    // 고객 캐시 매칭 — "ㄴㅏㄹㄴ서연" / "김서엽" → "김서연"
    const cust = (window.Customer?._cache) || (window._customerCache) || [];
    if (!cust.length || !transcript) return transcript;
    let out = transcript;
    // 2~5자 한글 토큰 추출
    const tokens = transcript.match(/[가-힣]{2,5}/g) || [];
    for (const tok of tokens) {
      // 정확 매칭 우선
      const exact = cust.find(c => c.name === tok);
      if (exact) continue;
      // 1글자 차이 (편집 거리 1) 매칭
      const fuzzy = cust.find(c => {
        if (!c.name || Math.abs(c.name.length - tok.length) > 1) return false;
        if (c.name.length !== tok.length) return false;
        let diff = 0;
        for (let i = 0; i < c.name.length; i++) {
          if (c.name[i] !== tok[i]) diff++;
          if (diff > 1) return false;
        }
        return diff === 1;
      });
      if (fuzzy) {
        out = out.split(tok).join(fuzzy.name);
      }
    }
    return out;
  }

  function _postProcess(transcript) {
    if (!transcript) return transcript;
    let out = transcript;
    out = _normalizeKoreanNumbers(out);
    out = _fuzzyMatchName(out);
    return out;
  }

  function _toggle(input, btn) {
    if (_active) {
      try { _active.rec.stop(); } catch(_e) { /* ignore */ }
      _active = null;
      return;
    }
    const rec = new SR();
    rec.lang = 'ko-KR';
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 3;  // [2026-04-30] 다중 후보 — 첫 후보 외에 fuzzy 매칭 검토
    let _base = input.value || '';
    if (_base && !_base.endsWith(' ')) _base += ' ';
    btn.style.background = 'rgba(220,53,69,0.92)';
    btn.style.color = '#fff';
    btn.style.animation = 'vi-pulse 1s infinite';
    rec.onresult = (e) => {
      let final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const t = result[0].transcript;
        if (result.isFinal) {
          // [2026-04-30] 다중 후보 중 고객명 매칭이 있는 후보 우선
          let best = t;
          if (result.length > 1) {
            const cust = (window.Customer?._cache) || (window._customerCache) || [];
            for (let alt = 0; alt < Math.min(result.length, 3); alt++) {
              const altT = result[alt].transcript;
              if (cust.some(c => c.name && altT.includes(c.name))) {
                best = altT;
                break;
              }
            }
          }
          final += best;
        } else {
          input.value = _base + t;
        }
      }
      if (final) {
        const processed = _postProcess(final);
        input.value = _base + processed;
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
    // opt-in 만 매칭 — DOM 에 data-voice/data-voice-root 없으면 match 0개 (저렴)
    (root || document).querySelectorAll(
      '[data-voice]:not([data-voice-injected]), [data-voice-root] input:not([data-voice-injected]), [data-voice-root] textarea:not([data-voice-injected])'
    ).forEach(_inject);
  }

  // 초기 스캔
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => _scan());
  } else {
    _scan();
  }

  // DOM 변화 관찰 — rAF debounce 로 과도 스캔 방지
  let _scanScheduled = false;
  const _pending = [];
  function _flush() {
    _scanScheduled = false;
    const batch = _pending.splice(0);
    batch.forEach(n => {
      if (n.nodeType !== 1) return;
      if (n.matches && n.matches('input[data-voice],textarea[data-voice]')) _inject(n);
      else if (n.querySelector && n.querySelector('[data-voice],[data-voice-root]')) _scan(n);
    });
  }
  const mo = new MutationObserver(muts => {
    muts.forEach(m => m.addedNodes.forEach(n => _pending.push(n)));
    if (!_scanScheduled) {
      _scanScheduled = true;
      requestAnimationFrame(_flush);
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });

  // 펄스 애니메이션
  const style = document.createElement('style');
  style.textContent = '@keyframes vi-pulse{0%{box-shadow:0 0 0 0 rgba(220,53,69,0.5)}70%{box-shadow:0 0 0 10px rgba(220,53,69,0)}100%{box-shadow:0 0 0 0 rgba(220,53,69,0)}}';
  document.head.appendChild(style);
})();
