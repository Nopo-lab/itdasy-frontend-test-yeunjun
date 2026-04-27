/* ─────────────────────────────────────────────────────────────
   음성 기록 (Phase 5 · 2026-04-20)

   원장님이 "김지연 속눈썹 풀세트 오만원 카드" 말하면
   → 고객 자동 연결 + 매출 자동 기록.

   전략:
   1) Web Speech API (webkitSpeechRecognition) 우선 — 무료·빠름
   2) 인식 실패/정확도 낮으면 MediaRecorder → 서버 Gemini Audio 폴백
   3) 파싱 결과 확인 팝업 → [이대로 저장] 한 탭

   엔드포인트:
   - POST /voice/parse-text    Web Speech 결과 재파싱
   - POST /voice/parse-audio   multipart 오디오 업로드
   - POST /voice/apply         실 저장
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  let _recognition = null;
  let _mediaRecorder = null;
  let _audioChunks = [];
  let _stream = null;
  let _listening = false;
  let _webSpeechText = '';
  let _lastResult = null;

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
  }

  function _formatKRW(n) {
    return (+n || 0).toLocaleString('ko-KR') + '원';
  }

  function _hasWebSpeech() {
    return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
  }

  async function _apiPost(path, body) {
    const auth = window.authHeader();
    const opts = { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
    const res = await fetch(window.API + path, opts);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  }

  async function _apiPostAudio(path, blob) {
    const fd = new FormData();
    fd.append('audio', blob, 'voice.webm');
    const res = await fetch(window.API + path, { method: 'POST', headers: window.authHeader(), body: fd });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  }

  // ── 오버레이 시트 ──────────────────────────────────────
  function _ensureSheet() {
    let sheet = document.getElementById('voiceSheet');
    if (sheet) return sheet;
    sheet = document.createElement('div');
    sheet.id = 'voiceSheet';
    sheet.style.cssText = 'position:fixed;inset:0;z-index:9999;display:none;background:rgba(0,0,0,0.55);';
    sheet.innerHTML = `
      <div style="position:absolute;inset:auto 0 0 0;background:var(--bg,#fff);border-radius:24px 24px 0 0;max-height:85vh;display:flex;flex-direction:column;padding:20px;padding-bottom:max(20px,env(safe-area-inset-bottom));">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;">
          <span style="font-size:22px;">🎤</span>
          <strong style="font-size:18px;">음성 빠른 기록</strong>
          <button onclick="closeVoice()" style="margin-left:auto;background:rgba(0,0,0,0.05);border:none;width:32px;height:32px;border-radius:50%;font-size:16px;cursor:pointer;" aria-label="닫기">✕</button>
        </div>
        <div id="voiceBody" style="flex:1;overflow-y:auto;"></div>
      </div>
    `;
    document.body.appendChild(sheet);
    sheet.addEventListener('click', (e) => { if (e.target === sheet) closeVoice(); });
    return sheet;
  }

  function _renderIntro() {
    document.getElementById('voiceBody').innerHTML = `
      <div style="text-align:center;padding:10px 0 20px;">
        <div style="font-size:14px;color:#555;line-height:1.6;margin-bottom:20px;">
          아래 버튼을 누르고 짧게 말해 보세요.<br>
          <span style="font-size:12px;color:#888;">예: "김지연 속눈썹 풀세트 오만원 카드"</span>
        </div>
        <button id="voiceStart" data-haptic="medium" style="width:140px;height:140px;border-radius:50%;border:none;background:linear-gradient(135deg,#F18091,#D95F70);color:#fff;font-size:54px;cursor:pointer;box-shadow:0 10px 30px rgba(241,128,145,0.35);transition:transform 0.15s;">
          🎙
        </button>
        <div style="font-size:12px;color:#888;margin-top:16px;">탭해서 녹음 시작</div>
      </div>
      <div style="padding:12px;background:rgba(241,128,145,0.06);border-radius:12px;font-size:11px;color:#666;line-height:1.6;">
        💡 <b>꿀팁</b> — 조용한 곳에서 1~2초 간격으로 또박또박. 이름 · 시술 · 금액 · 결제수단 순서면 가장 정확해요.
      </div>
    `;
    document.getElementById('voiceStart').addEventListener('click', _startListening);
  }

  function _renderListening() {
    document.getElementById('voiceBody').innerHTML = `
      <div style="text-align:center;padding:10px 0 20px;">
        <div style="font-size:14px;color:#555;margin-bottom:20px;">듣고 있어요… 🎙</div>
        <button id="voiceStop" style="width:140px;height:140px;border-radius:50%;border:none;background:linear-gradient(135deg,#dc3545,#ff6b6b);color:#fff;font-size:42px;cursor:pointer;box-shadow:0 10px 30px rgba(220,53,69,0.35);position:relative;overflow:hidden;animation:voicePulse 1.2s infinite;">
          ⏹
        </button>
        <div id="voiceLiveText" style="margin-top:20px;min-height:60px;padding:12px;background:rgba(0,0,0,0.04);border-radius:12px;font-size:13px;color:#333;line-height:1.5;text-align:left;">
          <span style="color:#aaa;">실시간 인식 결과가 여기에 나와요…</span>
        </div>
      </div>
      <style>@keyframes voicePulse { 0%,100% { transform:scale(1); } 50% { transform:scale(1.06); } }</style>
    `;
    document.getElementById('voiceStop').addEventListener('click', _stopListening);
  }

  function _renderParsing() {
    document.getElementById('voiceBody').innerHTML = `
      <div style="text-align:center;padding:40px 20px;">
        <div style="font-size:36px;margin-bottom:14px;">🤖</div>
        <div style="font-size:14px;color:#666;">AI가 정리하는 중…</div>
        <div style="margin-top:20px;height:3px;background:rgba(0,0,0,0.05);border-radius:2px;overflow:hidden;">
          <div style="height:100%;width:40%;background:linear-gradient(90deg,#F18091,#D95F70);animation:voiceSlide 1.2s infinite;"></div>
        </div>
        <style>@keyframes voiceSlide { 0% { transform:translateX(-100%);} 100% { transform:translateX(250%);} }</style>
      </div>
    `;
  }

  function _renderConfirm(result) {
    _lastResult = result;
    const kind = result.kind || 'revenue';
    const kindLabel = { revenue: '💰 매출 기록', customer: '👤 고객 추가', booking: '📅 예약' }[kind] || '기록';

    const rows = [
      { label: '고객', value: result.customer_name || '—', key: 'customer_name' },
      { label: '시술', value: result.service_name || '—', key: 'service_name' },
      { label: '금액', value: result.amount ? _formatKRW(result.amount) : '—', key: 'amount', type: 'number' },
      { label: '결제', value: result.method ? ({card:'💳 카드',cash:'💵 현금',transfer:'🏦 계좌이체',etc:'기타'}[result.method] || result.method) : '—', key: 'method' },
      { label: '메모', value: result.memo || '—', key: 'memo' },
    ];

    document.getElementById('voiceBody').innerHTML = `
      <div style="padding:10px 0;">
        <div style="display:flex;align-items:center;gap:6px;padding:8px 12px;background:linear-gradient(135deg,rgba(241,128,145,0.12),rgba(241,128,145,0.04));border-radius:10px;margin-bottom:14px;">
          <span style="font-size:13px;font-weight:700;">${kindLabel}</span>
          <span style="font-size:11px;color:#888;margin-left:auto;">AI 분석 결과</span>
        </div>
        <div style="background:#fff;border-radius:14px;border:1px solid rgba(0,0,0,0.06);overflow:hidden;margin-bottom:14px;">
          ${rows.map((r, i) => `
            <div style="display:flex;gap:10px;align-items:center;padding:11px 14px;${i > 0 ? 'border-top:1px solid rgba(0,0,0,0.05);' : ''}">
              <div style="width:52px;font-size:11px;color:#888;">${r.label}</div>
              <div style="flex:1;font-size:14px;color:#222;font-weight:600;">${_esc(r.value)}</div>
            </div>
          `).join('')}
        </div>
        <div style="display:flex;gap:8px;">
          <button id="voiceEdit" style="flex:1;padding:12px;border:1px solid #ddd;border-radius:10px;background:#fff;color:#555;cursor:pointer;font-weight:700;font-size:13px;">✏️ 고치기</button>
          <button id="voiceSave" style="flex:2;padding:12px;border:none;border-radius:10px;background:linear-gradient(135deg,#F18091,#D95F70);color:#fff;cursor:pointer;font-weight:800;font-size:14px;">이대로 저장 ✓</button>
        </div>
        <div style="display:flex;gap:6px;margin-top:10px;">
          <button id="voiceRetry" style="flex:1;padding:10px;border:1px solid #eee;border-radius:8px;background:transparent;color:#888;cursor:pointer;font-size:12px;">🎙 다시 말하기</button>
        </div>
      </div>
    `;
    document.getElementById('voiceSave').addEventListener('click', _apply);
    document.getElementById('voiceEdit').addEventListener('click', _renderEdit);
    document.getElementById('voiceRetry').addEventListener('click', _renderIntro);
  }

  function _renderEdit() {
    const r = _lastResult || {};
    document.getElementById('voiceBody').innerHTML = `
      <div style="padding:10px 4px;">
        <button onclick="window._voiceBackConfirm()" style="background:none;border:none;font-size:13px;color:#888;margin-bottom:10px;cursor:pointer;">← 결과</button>
        <label style="display:block;font-size:12px;color:#666;margin-bottom:4px;">고객</label>
        <input id="veName" value="${_esc(r.customer_name||'')}" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;margin-bottom:10px;" maxlength="50" />
        <label style="display:block;font-size:12px;color:#666;margin-bottom:4px;">시술</label>
        <input id="veService" value="${_esc(r.service_name||'')}" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;margin-bottom:10px;" maxlength="50" />
        <div style="display:flex;gap:8px;margin-bottom:10px;">
          <div style="flex:1;">
            <label style="display:block;font-size:12px;color:#666;margin-bottom:4px;">금액(원)</label>
            <input id="veAmount" type="number" inputmode="numeric" value="${r.amount||''}" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;" />
          </div>
          <div style="flex:1;">
            <label style="display:block;font-size:12px;color:#666;margin-bottom:4px;">결제</label>
            <select id="veMethod" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;">
              ${['card','cash','transfer','etc'].map(m => `<option value="${m}" ${r.method===m?'selected':''}>${({card:'카드',cash:'현금',transfer:'계좌이체',etc:'기타'})[m]}</option>`).join('')}
            </select>
          </div>
        </div>
        <label style="display:block;font-size:12px;color:#666;margin-bottom:4px;">메모</label>
        <textarea id="veMemo" rows="2" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;margin-bottom:12px;resize:vertical;" maxlength="200">${_esc(r.memo||'')}</textarea>
        <button id="veDone" style="width:100%;padding:12px;border:none;border-radius:10px;background:linear-gradient(135deg,#F18091,#D95F70);color:#fff;cursor:pointer;font-weight:800;">✓ 반영하기</button>
      </div>
    `;
    document.getElementById('veDone').addEventListener('click', () => {
      _lastResult = {
        kind: _lastResult?.kind || 'revenue',
        customer_name: document.getElementById('veName').value.trim() || null,
        service_name: document.getElementById('veService').value.trim() || null,
        amount: parseInt(document.getElementById('veAmount').value, 10) || null,
        method: document.getElementById('veMethod').value,
        memo: document.getElementById('veMemo').value.trim() || null,
      };
      _renderConfirm(_lastResult);
    });
  }
  window._voiceBackConfirm = () => _renderConfirm(_lastResult);

  function _renderError(msg) {
    document.getElementById('voiceBody').innerHTML = `
      <div style="text-align:center;padding:40px 20px;">
        <div style="font-size:36px;margin-bottom:14px;">😢</div>
        <div style="font-size:14px;color:#666;line-height:1.5;">${_esc(msg)}</div>
        <button onclick="window._voiceBack()" style="margin-top:20px;padding:10px 24px;border:1px solid #ddd;border-radius:8px;background:#fff;cursor:pointer;font-weight:700;">처음으로</button>
      </div>
    `;
  }
  window._voiceBack = _renderIntro;

  // ── 녹음·인식 로직 ──────────────────────────────────────
  async function _startListening() {
    if (window.hapticMedium) window.hapticMedium();
    _webSpeechText = '';
    _audioChunks = [];

    // 마이크 권한 획득 (MediaRecorder 용 백업)
    try {
      _stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      const isCapacitor = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
      const msg = e && e.name === 'NotAllowedError'
        ? (isCapacitor
            ? '마이크 권한이 거부됐어요. 설정 → 잇데이 스튜디오 → 마이크를 켜 주세요.'
            : '브라우저에서 마이크 권한이 거부됐어요. 주소창 왼쪽 🔒 → 마이크 허용으로 바꿔 주세요.')
        : e && e.name === 'NotFoundError'
          ? '마이크를 찾지 못했어요. 이어폰 마이크가 연결돼 있는지 확인해 주세요.'
          : '마이크 접근 실패: ' + (e?.message || '알 수 없음');
      _renderError(msg);
      return;
    }

    _renderListening();

    // Web Speech 시도
    if (_hasWebSpeech()) {
      try {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        _recognition = new SpeechRecognition();
        _recognition.lang = 'ko-KR';
        _recognition.continuous = true;
        _recognition.interimResults = true;
        _recognition.onresult = (e) => {
          let text = '';
          for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
          _webSpeechText = text;
          const el = document.getElementById('voiceLiveText');
          if (el) el.innerHTML = text.trim() ? _esc(text) : '<span style="color:#aaa;">듣는 중…</span>';
        };
        _recognition.onerror = (e) => { console.warn('[voice] webSpeech error:', e.error); };
        _recognition.onend = () => { _recognition = null; };
        _recognition.start();
      } catch (e) {
        console.warn('[voice] webSpeech 초기화 실패 — MediaRecorder 로만 폴백:', e);
      }
    }

    // MediaRecorder 로 오디오 블록 저장 (Gemini 폴백용)
    try {
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
                 : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
                 : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4'
                 : '';
      _mediaRecorder = new MediaRecorder(_stream, mime ? { mimeType: mime } : {});
      _mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size) _audioChunks.push(e.data); };
      _mediaRecorder.start();
    } catch (e) {
      console.warn('[voice] MediaRecorder 실패:', e);
    }

    _listening = true;

    // 안전 자동 종료 (30초)
    setTimeout(() => { if (_listening) _stopListening(); }, 30000);
  }

  async function _stopListening() {
    if (!_listening) return;
    _listening = false;
    if (window.hapticLight) window.hapticLight();
    try { _recognition?.stop(); } catch (_) { void 0; }
    try { _mediaRecorder?.stop(); } catch (_) { void 0; }
    try { _stream?.getTracks().forEach(t => t.stop()); } catch (_) { void 0; }

    _renderParsing();
    await new Promise(r => setTimeout(r, 300));  // MediaRecorder ondataavailable 완료 대기

    try {
      let result = null;
      const text = (_webSpeechText || '').trim();

      if (text.length >= 2) {
        // Web Speech 결과로 파싱
        result = await _apiPost('/voice/parse-text', { text });
      } else if (_audioChunks.length) {
        // 오디오 파일로 Gemini 파싱
        const blob = new Blob(_audioChunks, { type: _mediaRecorder?.mimeType || 'audio/webm' });
        result = await _apiPostAudio('/voice/parse-audio', blob);
      } else {
        _renderError('들린 내용이 없어요. 더 가까이에서 말해 주세요.');
        return;
      }

      _renderConfirm(result);
    } catch (e) {
      console.warn('[voice] 파싱 실패:', e);
      _renderError('AI 분석 실패: ' + (e.message || ''));
    }
  }

  async function _apply() {
    if (!_lastResult) return;
    const btn = document.getElementById('voiceSave');
    btn.disabled = true;
    btn.textContent = '저장 중…';
    try {
      const res = await _apiPost('/voice/apply', _lastResult);
      if (window.hapticSuccess) window.hapticSuccess();
      if (window.showToast) window.showToast('✨ 기록 완료!');
      closeVoice();
      // 대시보드 열려있으면 리프레시
      if (window.Dashboard && typeof window.Dashboard.refresh === 'function') {
        window.Dashboard.refresh();
      }
    } catch (e) {
      btn.disabled = false;
      btn.textContent = '이대로 저장 ✓';
      if (window.showToast) window.showToast('저장 실패: ' + (window._humanError ? window._humanError(e) : e.message));
    }
  }

  // ── 외부 API ──────────────────────────────────────────
  window.openVoice = function () {
    _ensureSheet();
    document.getElementById('voiceSheet').style.display = 'block';
    document.body.style.overflow = 'hidden';
    _webSpeechText = '';
    _audioChunks = [];
    _lastResult = null;
    _renderIntro();
  };

  window.closeVoice = function () {
    if (_listening) {
      _listening = false;
      try { _recognition?.stop(); } catch (_) { void 0; }
      try { _mediaRecorder?.stop(); } catch (_) { void 0; }
      try { _stream?.getTracks().forEach(t => t.stop()); } catch (_) { void 0; }
    }
    const sheet = document.getElementById('voiceSheet');
    if (sheet) sheet.style.display = 'none';
    document.body.style.overflow = '';
  };

  window.Voice = {
    hasWebSpeech: _hasWebSpeech,
  };
})();
