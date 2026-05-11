/* ─────────────────────────────────────────────────────────────
   E2: 음성 캡션 워크플로우 (2026-04-26)

   시나리오: 시술 끝난 사장님이 음성으로 한 줄 — AI 가 캡션·해시태그 자동 생성.
     예) "김서연 자연스러운 옴브레, 길이 25cm, 8주 유지 가능"
        → 인스타 캡션·해시태그 + (옵션) 8주 후 재방문 예약 제안

   외부 진입: window.openVoiceCaption()
   의존:
     - window.API · window.authHeader · window.showToast (app-core.js)
     - POST /persona/generate (백엔드 — 캡션 생성)
     - window.Booking.create (app-booking-api.js — 옵션 재방문 예약)
     - window.Customer.search (app-customer.js — 고객 매칭, 옵션)
     - Web Speech API (ko-KR) — Chrome/Safari/Android Chrome
     - Lucide sprite: ic-mic · ic-x · ic-rotate-ccw · ic-send · ic-calendar

   설계 메모:
     - app-assistant.js 의 _startVoiceInput 패턴 차용 (continuous=false + onend 자동 재시작).
     - 시간 키워드 자동 추출: "N주", "N개월", "N일", "N달" → datetime 후보 → 예약 제안.
     - 비용 방어: photo_context 에 음성 텍스트만 담아 1회 generate 호출. 사진 분석 X.
   ──────────────────────────────────────────────────────────── */

(function voiceCaption() {
  'use strict';

  // ── 헬퍼 ─────────────────────────────────────────────────────────
  function _api() { return (window.API || ''); }
  function _toast(msg) { if (typeof window.showToast === 'function') window.showToast(msg); }
  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function _svg(id, size) {
    const sz = size || 16;
    return '<svg width="' + sz + '" height="' + sz + '" style="vertical-align:-2px;" aria-hidden="true"><use href="#' + id + '"/></svg>';
  }

  async function _fetchJson(method, path, body) {
    const headers = window.authHeader ? window.authHeader() : {};
    if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
    const res = await fetch(_api() + path, {
      method,
      headers,
      body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || ('HTTP ' + res.status));
    return data;
  }

  // ── 카테고리 / 해시태그 (app-instant-caption 과 통일) ────────────
  const SHOP_TAGS = {
    '붙임머리': ['붙임머리', '롱헤어', '내추럴익스텐션', '헤어샵', '뷰티스타그램'],
    '네일아트': ['네일아트', '젤네일', '네일스타그램', '오늘의네일', '뷰티스타그램'],
    '네일':     ['네일아트', '젤네일', '네일스타그램', '오늘의네일', '뷰티스타그램'],
    '헤어':     ['헤어스타그램', '미용실', '컷', '펌', '염색', '뷰티스타그램'],
    '헤어샵':   ['헤어스타그램', '미용실', '컷', '펌', '염색', '뷰티스타그램'],
    '속눈썹':   ['속눈썹펌', '래쉬리프트', '속눈썹연장', '클래식래쉬', '뷰티스타그램'],
    '왁싱':     ['왁싱', '바디왁싱', '브라질리언왁싱', '제모', '피부케어'],
    '피부':     ['피부관리', '피부케어', '에스테틱', '모공관리', '수분관리'],
    '반영구':   ['반영구', '반영구메이크업', '눈썹문신', '입술문신', '아이라인반영구'],
  };
  const _CAT_MAP = {
    '붙임머리': 'extension', '네일아트': 'nail', '네일': 'nail',
    '헤어': 'hair', '헤어샵': 'hair',
    '속눈썹': 'lash',
    '왁싱': 'wax',
    '피부': 'skin',
    '반영구': 'tattoo',
  };

  function _shopMeta() {
    const shopType = localStorage.getItem('shop_type') || '붙임머리';
    return {
      shopType,
      category: _CAT_MAP[shopType] || 'extension',
      baseTags: SHOP_TAGS[shopType] || SHOP_TAGS['붙임머리'],
    };
  }

  // ── 음성 텍스트 → 시간 키워드 추출 ───────────────────────────────
  // 지원: "N주", "N달/개월", "N일", "N주 유지", "N달 유지", "N주 후"
  // 반환: { weeks: number } 또는 null
  function _extractRevisitInterval(text) {
    if (!text) return null;
    const s = String(text);
    // 한글 숫자 → 아라비아 숫자 (간이 변환)
    const KOR2NUM = { '한': 1, '두': 2, '세': 3, '네': 4, '다섯': 5, '여섯': 6, '일곱': 7, '여덟': 8, '아홉': 9, '열': 10 };
    let normalized = s;
    Object.keys(KOR2NUM).forEach(k => {
      normalized = normalized.replace(new RegExp(k + '(주|달|개월|일)', 'g'), KOR2NUM[k] + '$1');
    });

    // 우선 순위: "주" > "개월/달" > "일"
    let m = normalized.match(/(\d+)\s*주/);
    if (m) return { weeks: Math.min(52, Math.max(1, parseInt(m[1], 10))) };

    m = normalized.match(/(\d+)\s*(개월|달)/);
    if (m) return { weeks: Math.min(52, Math.max(1, parseInt(m[1], 10) * 4)) };

    m = normalized.match(/(\d+)\s*일/);
    if (m) return { weeks: Math.max(1, Math.round(parseInt(m[1], 10) / 7)) };

    return null;
  }

  // ── 음성 텍스트 → 고객명 추정 (앞 토큰이 등록 고객과 일치하면 매칭) ──
  function _guessCustomerName(text) {
    if (!text) return null;
    const tokens = String(text).trim().split(/\s+/);
    const first = tokens[0];
    if (!first || first.length < 2) return null;
    if (window.Customer && typeof window.Customer.search === 'function') {
      try {
        const matches = window.Customer.search(first) || [];
        // 정확히 첫 토큰으로 시작하는 고객만 신뢰 (오탐 방지)
        const exact = matches.find(c => c.name && c.name.startsWith(first));
        if (exact) return { id: exact.id, name: exact.name };
      } catch (_e) { void _e; }
    }
    // 매칭 실패 — 텍스트만 반환 (booking customer_name 으로 사용 가능)
    return { id: null, name: first };
  }

  // ── 캡션 생성 (백엔드 /persona/generate) ────────────────────────
  async function _generateCaptionFromVoice(voiceText) {
    const meta = _shopMeta();
    const trimmed = String(voiceText || '').trim();

    const payload = {
      category: meta.category,
      photo_context: meta.shopType + ' 시술 완료. 원장님 메모: ' + (trimmed || '(없음)'),
      extra_notes: trimmed,
      length_tier: 'medium',
      tone_override: 'normal',
    };

    const data = await _fetchJson('POST', '/persona/generate', payload);
    return data.caption || '';
  }

  function _buildHashtags(caption) {
    const meta = _shopMeta();
    const tags = new Set();
    (meta.baseTags || []).forEach(t => tags.add('#' + t.replace(/^#/, '')));
    (String(caption || '').match(/#[\wㄱ-ㅎㅏ-ㅣ가-힣]+/g) || []).forEach(t => tags.add(t));
    return Array.from(tags).slice(0, 12);
  }

  // ── 음성 인식 상태 ──────────────────────────────────────────────
  let _rec = null;
  let _manualStop = false;
  let _accumText = '';  // 모든 인스턴스의 final 누적

  function _voiceSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  function _newRec(onTextChange) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const r = new SR();
    r.lang = 'ko-KR';
    r.continuous = false;
    r.interimResults = true;
    r.maxAlternatives = 1;

    let _localFinal = '';

    r.onresult = (e) => {
      let interimTxt = '';
      let finalTxt = '';
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        const t = res[0].transcript;
        if (res.isFinal) finalTxt += t;
        else interimTxt += t;
      }
      if (finalTxt) _localFinal = finalTxt;
      // 누적 텍스트 = 이전 인스턴스 final + 이번 인스턴스 final + 현재 interim
      const display = (_accumText + (_localFinal || '') + (interimTxt || '')).trim();
      onTextChange(display);
    };

    r.onerror = (ev) => {
      const code = ev && ev.error;
      if (code === 'no-speech' && !_manualStop) return;
      if (code === 'aborted') return;
      _stopVoice();
      let msg = '음성 인식 실패 — 다시 시도해주세요';
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        msg = '마이크 권한이 필요해요. 브라우저 설정을 확인해주세요.';
      }
      _toast(msg);
    };

    r.onend = () => {
      // 이번 인스턴스의 final 을 누적에 흡수
      if (_localFinal) {
        const sep = _accumText && !_accumText.endsWith(' ') ? ' ' : '';
        _accumText = _accumText + sep + _localFinal;
        onTextChange(_accumText.trim());
      }
      if (_manualStop) {
        _rec = null;
        return;
      }
      // 자동 재시작 — Chrome 가드 (50ms)
      try {
        setTimeout(() => {
          if (_manualStop) return;
          try {
            const next = _newRec(onTextChange);
            next.start();
            _rec = next;
          } catch (_err) {
            _rec = null;
          }
        }, 50);
      } catch (_e) {
        _rec = null;
      }
    };

    return r;
  }

  function _startVoice(onTextChange) {
    if (!_voiceSupported()) {
      _toast('이 환경은 음성 입력을 지원하지 않아요. 키보드로 입력해주세요.');
      return false;
    }
    if (_rec) {
      _stopVoice();
      return false;
    }
    _manualStop = false;
    _accumText = '';
    try {
      const rec = _newRec(onTextChange);
      rec.start();
      _rec = rec;
      return true;
    } catch (_e) {
      _rec = null;
      _toast('음성 시작 실패 — 잠시 후 다시 시도');
      return false;
    }
  }

  function _stopVoice() {
    _manualStop = true;
    if (_rec) {
      try { _rec.stop(); } catch (_e) { void _e; }
      _rec = null;
    }
  }

  // ── UI: 팝업 ────────────────────────────────────────────────────
  function _ensurePopup() {
    let p = document.getElementById('_voiceCaptionPopup');
    if (p) return p;

    p = document.createElement('div');
    p.id = '_voiceCaptionPopup';
    p.style.cssText = 'display:none; position:fixed; inset:0; z-index:9420; background:rgba(0,0,0,0.6); align-items:flex-end; justify-content:center;';
    p.innerHTML = ''
      + '<div style="width:100%; max-width:480px; background:#fff; border-radius:24px 24px 0 0; padding:24px 20px calc(32px + env(safe-area-inset-bottom)); max-height:92vh; overflow-y:auto;">'
      +   '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">'
      +     '<div style="font-size:17px; font-weight:800;">음성 캡션</div>'
      +     '<button id="_vcClose" type="button" aria-label="닫기" style="background:none; border:none; width:44px; height:44px; cursor:pointer; color:var(--text-subtle);">' + _svg('ic-x', 22) + '</button>'
      +   '</div>'
      +   '<div style="font-size:12px; color:var(--text-muted); margin-bottom:14px; line-height:1.5;">'
      +     '시술 끝난 뒤 짧게 말해주세요. 예: "김서연 자연스러운 옴브레, 길이 25cm, 8주 유지 가능"'
      +   '</div>'

      // 음성 토글 버튼
      +   '<button id="_vcMicBtn" type="button" data-haptic="medium" style="width:100%; padding:18px; border:none; border-radius:14px; background:linear-gradient(135deg,var(--brand),#ff9aa8); color:#fff; font-weight:800; font-size:15px; cursor:pointer; min-height:56px; display:flex; align-items:center; justify-content:center; gap:8px; box-shadow:0 4px 12px rgba(241,128,145,0.3);">'
      +     _svg('ic-mic', 20) + ' <span id="_vcMicLabel">녹음 시작</span>'
      +   '</button>'

      // 실시간 텍스트
      +   '<div style="font-size:12px; font-weight:700; color:#1a1a1a; margin:14px 0 6px;">받아쓴 내용</div>'
      +   '<textarea id="_vcTranscript" rows="3" placeholder="버튼을 누르고 말씀해주세요…" style="width:100%; padding:12px; border:1.5px solid #e0e0e0; border-radius:10px; font-size:14px; box-sizing:border-box; resize:vertical; line-height:1.5;"></textarea>'

      // 진행 상태
      +   '<div id="_vcProgress" style="display:none; margin-top:14px;">'
      +     '<div id="_vcStep" style="font-size:13px; font-weight:700; color:#1a1a1a; margin-bottom:8px;">캡션 만드는 중…</div>'
      +     '<div style="width:100%; height:8px; background:#f0f0f0; border-radius:4px; overflow:hidden;">'
      +       '<div id="_vcBar" style="width:0%; height:100%; background:linear-gradient(90deg,var(--brand),#ff9aa8); transition:width .3s ease;"></div>'
      +     '</div>'
      +   '</div>'

      // 캡션 만들기
      +   '<button id="_vcGenBtn" type="button" data-haptic="success" style="width:100%; margin-top:12px; padding:14px; border:none; border-radius:12px; background:#1a1a1a; color:#fff; font-weight:800; font-size:14px; cursor:pointer; min-height:48px; display:flex; align-items:center; justify-content:center; gap:6px;">'
      +     _svg('ic-send', 16) + ' 캡션 만들기'
      +   '</button>'

      // 결과 영역
      +   '<div id="_vcResult" style="display:none; margin-top:18px;">'
      +     '<div style="font-size:13px; font-weight:700; margin-bottom:6px;">캡션</div>'
      +     '<textarea id="_vcCaption" rows="5" style="width:100%; padding:12px; border:1.5px solid #e0e0e0; border-radius:10px; font-size:14px; box-sizing:border-box; resize:vertical; line-height:1.5;"></textarea>'
      +     '<button id="_vcCopyCaption" type="button" style="margin-top:6px; padding:8px 12px; border:1px solid #e0e0e0; border-radius:8px; background:#fff; font-size:12px; cursor:pointer; min-height:36px;">캡션 복사</button>'

      +     '<div style="font-size:13px; font-weight:700; margin:14px 0 6px;">해시태그</div>'
      +     '<div id="_vcTags" style="display:flex; flex-wrap:wrap; gap:6px; padding:10px; background:#fafafa; border-radius:10px; font-size:12px;"></div>'
      +     '<button id="_vcCopyTags" type="button" style="margin-top:6px; padding:8px 12px; border:1px solid #e0e0e0; border-radius:8px; background:#fff; font-size:12px; cursor:pointer; min-height:36px;">해시태그 복사</button>'

      // 인스타 발행 + 다시 녹음
      +     '<div style="display:flex; gap:8px; margin-top:14px;">'
      +       '<button id="_vcPublish" type="button" data-haptic="success" style="flex:1; padding:12px; border-radius:12px; border:none; background:#4caf50; color:#fff; font-weight:700; font-size:13px; min-height:44px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;">' + _svg('ic-send', 14) + ' 인스타 발행</button>'
      +       '<button id="_vcRetake" type="button" style="flex:1; padding:12px; border-radius:12px; border:none; background:var(--brand); color:#fff; font-weight:700; font-size:13px; min-height:44px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;">' + _svg('ic-rotate-ccw', 14) + ' 다시 녹음</button>'
      +     '</div>'

      // 재방문 제안 (옵션, 시간 키워드 감지 시 표시)
      +     '<div id="_vcRevisit" style="display:none; margin-top:14px; padding:12px; border:1.5px solid var(--brand); border-radius:12px; background:#fff5f7;">'
      +       '<div style="font-size:13px; font-weight:800; color:#1a1a1a; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + _svg('ic-calendar', 16) + ' 다음 방문 추천 알림</div>'
      +       '<div id="_vcRevisitMsg" style="font-size:12px; color:var(--text-muted); line-height:1.5; margin-bottom:8px;"></div>'
      +       '<div style="display:flex; gap:8px;">'
      +         '<button id="_vcRevisitOk" type="button" data-haptic="success" style="flex:1; padding:10px; border-radius:10px; border:none; background:#1a1a1a; color:#fff; font-weight:700; font-size:12px; min-height:40px; cursor:pointer;">예약 등록</button>'
      +         '<button id="_vcRevisitSkip" type="button" style="flex:1; padding:10px; border-radius:10px; border:1px solid #e0e0e0; background:#fff; color:var(--text-muted); font-weight:700; font-size:12px; min-height:40px; cursor:pointer;">건너뛰기</button>'
      +       '</div>'
      +     '</div>'

      +   '</div>'
      + '</div>';
    document.body.appendChild(p);

    // 이벤트 바인딩
    p.addEventListener('click', (e) => { if (e.target === p) _close(); });
    p.querySelector('#_vcClose').addEventListener('click', _close);

    p.querySelector('#_vcMicBtn').addEventListener('click', _toggleMic);
    p.querySelector('#_vcGenBtn').addEventListener('click', _runGenerate);
    p.querySelector('#_vcRetake').addEventListener('click', () => {
      _stopVoice();
      _accumText = '';
      const ta = p.querySelector('#_vcTranscript');
      if (ta) ta.value = '';
      const r = p.querySelector('#_vcResult');
      if (r) r.style.display = 'none';
      _setMicLabel(false);
    });
    p.querySelector('#_vcCopyCaption').addEventListener('click', async () => {
      const v = p.querySelector('#_vcCaption').value || '';
      try { await navigator.clipboard.writeText(v); _toast('캡션 복사됨'); }
      catch (_e) { _toast('복사 실패'); }
    });
    p.querySelector('#_vcCopyTags').addEventListener('click', async () => {
      const v = (p.querySelector('#_vcTags').textContent || '').trim();
      try { await navigator.clipboard.writeText(v); _toast('해시태그 복사됨'); }
      catch (_e) { _toast('복사 실패'); }
    });
    p.querySelector('#_vcPublish').addEventListener('click', _publishToInstagram);
    p.querySelector('#_vcRevisitOk').addEventListener('click', _confirmRevisit);
    p.querySelector('#_vcRevisitSkip').addEventListener('click', () => {
      const box = p.querySelector('#_vcRevisit');
      if (box) box.style.display = 'none';
    });

    return p;
  }

  function _close() {
    _stopVoice();
    const p = document.getElementById('_voiceCaptionPopup');
    if (p) p.style.display = 'none';
  }

  function _setMicLabel(active) {
    const p = document.getElementById('_voiceCaptionPopup');
    if (!p) return;
    const btn = p.querySelector('#_vcMicBtn');
    const label = p.querySelector('#_vcMicLabel');
    if (!btn || !label) return;
    if (active) {
      label.textContent = '녹음 중지';
      btn.style.background = 'linear-gradient(135deg,#dc3545,#ff6b6b)';
      btn.style.animation = 'vc-mic-pulse 1.2s infinite';
    } else {
      label.textContent = _accumText ? '이어서 녹음' : '녹음 시작';
      btn.style.background = 'linear-gradient(135deg,var(--brand),#ff9aa8)';
      btn.style.animation = '';
    }
  }

  function _setProgress(step, pct) {
    const p = document.getElementById('_voiceCaptionPopup');
    if (!p) return;
    p.querySelector('#_vcProgress').style.display = 'block';
    p.querySelector('#_vcStep').textContent = step;
    p.querySelector('#_vcBar').style.width = pct + '%';
  }

  function _toggleMic() {
    const p = document.getElementById('_voiceCaptionPopup');
    if (!p) return;
    if (_rec) {
      _stopVoice();
      _setMicLabel(false);
      return;
    }
    const ok = _startVoice((text) => {
      const ta = p.querySelector('#_vcTranscript');
      if (ta) ta.value = text;
    });
    if (ok) {
      _setMicLabel(true);
      _toast('듣고 있어요… (다시 누르면 멈춤)');
    }
  }

  // ── 캡션 생성 + 결과 렌더 ───────────────────────────────────────
  async function _runGenerate() {
    const p = _ensurePopup();
    _stopVoice();
    _setMicLabel(false);

    const ta = p.querySelector('#_vcTranscript');
    const voiceText = (ta && ta.value || '').trim();
    if (!voiceText) {
      _toast('먼저 음성으로 말씀해주세요.');
      return;
    }

    try {
      _setProgress('① 캡션 만드는 중…', 50);
      const caption = await _generateCaptionFromVoice(voiceText);
      _setProgress('② 해시태그 정리 중…', 85);
      const tags = _buildHashtags(caption);

      _setProgress('완료!', 100);
      setTimeout(() => {
        const pr = p.querySelector('#_vcProgress');
        if (pr) pr.style.display = 'none';
      }, 400);

      // 결과 채우기
      p.querySelector('#_vcCaption').value = caption || '';
      const tagsBox = p.querySelector('#_vcTags');
      tagsBox.innerHTML = '';
      tags.forEach(t => {
        const span = document.createElement('span');
        span.style.cssText = 'background:#fff5f7; color:var(--brand); padding:4px 10px; border-radius:999px;';
        span.textContent = t;
        tagsBox.appendChild(span);
      });

      // 재방문 제안
      _maybeShowRevisit(voiceText);

      p.querySelector('#_vcResult').style.display = 'block';

      if (window.hapticTap) try { window.hapticTap('success'); } catch (_e) { void _e; }
    } catch (e) {
      const msg = (e && e.message) ? String(e.message) : '오류';
      _setProgress('실패: ' + msg.slice(0, 80), 0);
      _toast('AI 글 만들기 실패 — ' + msg.slice(0, 60));
    }
  }

  // ── 재방문 추천 ─────────────────────────────────────────────────
  let _pendingRevisit = null;  // { weeks, customer:{id,name}|null, text }

  function _maybeShowRevisit(voiceText) {
    const p = document.getElementById('_voiceCaptionPopup');
    if (!p) return;
    const box = p.querySelector('#_vcRevisit');
    const msg = p.querySelector('#_vcRevisitMsg');
    if (!box || !msg) return;

    const interval = _extractRevisitInterval(voiceText);
    if (!interval) {
      box.style.display = 'none';
      _pendingRevisit = null;
      return;
    }
    const customer = _guessCustomerName(voiceText);
    _pendingRevisit = { weeks: interval.weeks, customer, text: voiceText };

    const who = customer && customer.name ? customer.name + '님' : '손님';
    msg.textContent = who + ' · ' + interval.weeks + '주 후 재방문 추천 알림을 예약에 등록할까요?';
    box.style.display = 'block';
  }

  async function _confirmRevisit() {
    if (!_pendingRevisit) return;
    if (!window.Booking || typeof window.Booking.create !== 'function') {
      _toast('예약 모듈을 불러오지 못했어요.');
      return;
    }
    try {
      const now = new Date();
      const target = new Date(now.getTime() + _pendingRevisit.weeks * 7 * 24 * 60 * 60 * 1000);
      // 영업 시간 11:00 으로 기본 세팅 (사용자가 나중에 수정 가능)
      target.setHours(11, 0, 0, 0);
      const ends = new Date(target.getTime() + 60 * 60 * 1000);  // 1시간 슬롯 기본

      await window.Booking.create({
        starts_at: target.toISOString(),
        ends_at: ends.toISOString(),
        customer_id: _pendingRevisit.customer && _pendingRevisit.customer.id || null,
        customer_name: _pendingRevisit.customer && _pendingRevisit.customer.name || null,
        service_name: _shopMeta().shopType + ' (재방문)',
        memo: '음성 캡션에서 자동 제안 · ' + _pendingRevisit.weeks + '주 후 재방문',
      });

      _toast(_pendingRevisit.weeks + '주 후 예약이 등록됐어요.');
      const p = document.getElementById('_voiceCaptionPopup');
      const box = p && p.querySelector('#_vcRevisit');
      if (box) box.style.display = 'none';
      _pendingRevisit = null;

      // 다른 컴포넌트(달력·홈)에 알림
      try {
        window.dispatchEvent(new CustomEvent('itdasy:data-changed', { detail: { kind: 'booking' } }));
      } catch (_e) { void _e; }
    } catch (e) {
      const msg = (e && e.message) ? String(e.message) : '오류';
      _toast('예약 등록 실패 — ' + msg.slice(0, 60));
    }
  }

  // ── 인스타 발행 (기존 인스타 모듈로 위임) ────────────────────────
  async function _publishToInstagram() {
    const p = document.getElementById('_voiceCaptionPopup');
    if (!p) return;
    const caption = (p.querySelector('#_vcCaption').value || '').trim();
    const tags = (p.querySelector('#_vcTags').textContent || '').trim();
    const fullText = caption + (tags ? '\n\n' + tags : '');

    // 1) 외부 인스타 발행 함수가 있으면 위임
    if (typeof window.publishToInstagram === 'function') {
      try { await window.publishToInstagram({ caption: fullText }); _toast('인스타로 보냈어요'); return; }
      catch (e) { _toast('발행 실패 — ' + String((e && e.message) || '오류').slice(0, 60)); return; }
    }
    if (typeof window.openInstagramPublish === 'function') {
      try { await window.openInstagramPublish({ caption: fullText }); return; }
      catch (e) { void e; }
    }
    // 2) 폴백: 클립보드 복사 + 인스타 앱 열기 안내
    try {
      await navigator.clipboard.writeText(fullText);
      _toast('캡션 복사됨 — 인스타 앱에서 붙여넣기');
    } catch (_e) {
      _toast('복사 실패 — 캡션 영역에서 직접 복사해주세요');
    }
  }

  // ── 펄스 애니메이션 (1회 주입) ──────────────────────────────────
  if (typeof document !== 'undefined' && !document.getElementById('vc-mic-pulse-style')) {
    const _st = document.createElement('style');
    _st.id = 'vc-mic-pulse-style';
    _st.textContent = '@keyframes vc-mic-pulse{0%{box-shadow:0 0 0 0 rgba(220,53,69,0.55)}70%{box-shadow:0 0 0 14px rgba(220,53,69,0)}100%{box-shadow:0 0 0 0 rgba(220,53,69,0)}}';
    document.head.appendChild(_st);
  }

  // ── 외부 진입 ───────────────────────────────────────────────────
  function openVoiceCaption() {
    const p = _ensurePopup();
    // 초기화
    _stopVoice();
    _accumText = '';
    _pendingRevisit = null;
    const ta = p.querySelector('#_vcTranscript');
    if (ta) ta.value = '';
    const result = p.querySelector('#_vcResult');
    if (result) result.style.display = 'none';
    const progress = p.querySelector('#_vcProgress');
    if (progress) progress.style.display = 'none';
    const revisit = p.querySelector('#_vcRevisit');
    if (revisit) revisit.style.display = 'none';
    _setMicLabel(false);

    p.style.display = 'flex';

    // 미지원 환경 안내
    if (!_voiceSupported()) {
      _toast('이 브라우저는 음성 입력이 안 돼요. 키보드로 입력해주세요.');
    }
  }

  // 캡션 메뉴/홈에 버튼 자동 주입 (선택 — 호출자가 직접 attach 해도 됨)
  function attachVoiceCaptionButton(targetSelector) {
    const target = document.querySelector(targetSelector);
    if (!target) return false;
    if (target.querySelector('#_vcQuickBtn')) return true;
    const btn = document.createElement('button');
    btn.id = '_vcQuickBtn';
    btn.type = 'button';
    btn.setAttribute('data-haptic', 'medium');
    btn.innerHTML = _svg('ic-mic', 16) + ' 음성 캡션';
    btn.style.cssText = 'padding:12px 16px; border:none; border-radius:14px; background:linear-gradient(135deg,#7C3AED,#A78BFA); color:#fff; font-weight:800; font-size:14px; cursor:pointer; min-height:44px; display:inline-flex; align-items:center; gap:6px; box-shadow:0 4px 12px rgba(124,58,237,0.3);';
    btn.addEventListener('click', openVoiceCaption);
    target.appendChild(btn);
    return true;
  }

  window.openVoiceCaption = openVoiceCaption;
  window.attachVoiceCaptionButton = attachVoiceCaptionButton;
})();
