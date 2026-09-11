/* 잇비 고객 추가 안전 확인
   "{이름} 고객 추가" 요청 시 같은 이름이 이미 있으면 먼저 확인한다. */
(function () {
  'use strict';

  const TTL_MS = 5 * 60 * 1000;
  let pending = null;

  function _trim(s) { return String(s == null ? '' : s).trim(); }
  function _fresh() { return pending && Date.now() - pending.ts < TTL_MS; }

  /* [P1 2026-09-09] '고객 메모에 …추가해줘' 가 **고객 추가**로 분류되던 것.

     실측(실 Chrome, 배포본 28acf12):
       "박서준님 고객 메모에 파마약 알러지 있음 추가해줘"
         → "박서준님은 고객 명단에 이미 있어요. 이 고객님 맞나요?"
         → 선택지: [맞아요 … 기록 열기] [… 새 고객으로 추가] [아니에요]
       원장이 요청한 **메모 추가는 선택지에 없다.** 원하던 작업을 아예 못 한다.
       (테스트 이름이 특수해서가 아니다 — 평범한 한국 이름으로도 그대로 재현된다)

     원인: 아래 제외 목록에 예약·매출·사진·기록·문자·캡션·홍보·가격표·템플릿은 있는데
     **메모만 빠져 있었다.** '고객'과 '추가'가 동시에 있으면 전부 고객 추가로 본다.

     표현을 바꿔 "…님은 파마약 알러지 있어. 고객 메모에 남겨줘" 라고 하면 정상적으로
     메모 확인 카드가 뜬다 — 즉 같은 의도인데 '추가' 라는 단어 하나로 갈렸다. */
  function _looksAddCustomer(q) {
    const t = _trim(q);
    if (!/(고객|손님)/.test(t) || !/(추가|등록|만들|넣어)/.test(t)) return false;
    return !/(예약|매출|사진|기록|문자|메시지|메세지|캡션|홍보|가격표|템플릿|메모|노트|알러지|알레르기|주의사항|특이사항|회원권|잔액|충전)/.test(t);
  }

  function _extractName(q) {
    let s = _trim(q).replace(/^잇비\s*/, ' ');
    s = s.replace(/(고객님|고객|손님|추가|등록|새로|새|만들어줘|만들어|만들|넣어줘|넣어|해줘|해|주세요|님)/g, ' ');
    const words = s.match(/[가-힣]{2,5}/g) || [];
    const stops = new Set(['잇비', '고객', '손님', '추가', '등록', '메모', '노트', '알러지', '주의사항', '특이사항', '회원권', '잔액']);
    return words.find((w) => !stops.has(w)) || '';
  }

  async function _customers() {
    if (typeof window.apiFetch !== 'function') return [];
    const res = await window.apiFetch('/customers?limit=500', { headers: window.authHeader ? window.authHeader() : {} });
    if (!res || !res.ok) return [];
    const data = await res.json().catch(() => ({}));
    return (data && data.items) || [];
  }

  function _sameName(name, c) {
    return _trim(c && c.name) === name;
  }

  // 유사 이름(글자 수 같고 한 글자만 다른) 후보 — "윤하영" 입력 시 "문하영" 역제안용.
  function _similar(name, list) {
    const n = _trim(name);
    if (n.length < 2) return [];
    return (list || []).filter((c) => {
      const cn = _trim(c && c.name);
      if (!cn || cn === n || cn.length !== n.length) return false;
      let diff = 0;
      for (let i = 0; i < n.length; i++) { if (n[i] !== cn[i]) diff++; if (diff > 1) return false; }
      return diff === 1;
    }).slice(0, 3);
  }

  // 신규 고객 입력 폼(이름/연락처/메모 등) 열기 — 자동 저장 금지, 저장 전 확인.
  function _openNewForm(name, phone) {
    setTimeout(() => {
      try {
        if (typeof window._openCustomerEditSheet === 'function') window._openCustomerEditSheet({ name: name || '', phone: phone || '' });
        else if (typeof window.openCustomers === 'function') window.openCustomers();
      } catch (_e) { void _e; }
    }, 80);
    return { matched: true, kind: 'message', text: `${name || '새'}님 정보를 입력하는 창을 열었어요. 연락처·메모도 같이 넣고 저장해 주세요.` };
  }

  // 유사 고객 역제안 — 확정 금지, "아니요 새 고객" 버튼 필수.
  function _suggestResult(name, sims) {
    pending = { ts: Date.now(), name, mode: 'suggest', similar: sims };
    const top = sims[0];
    return {
      matched: true,
      kind: 'message',
      text: `${name} 고객은 아직 없어요. 혹시 ${top.name}님을 말씀하신 걸까요?`,
      related: [`네 ${top.name} 맞아요`, `아니요 ${name} 새 고객이에요`],
    };
  }

  function _infoLines(c) {
    const lines = [`이름: ${_trim(c.name) || '이름 없음'}`];
    if (c.phone) lines.push(`연락처: ${c.phone}`);
    const memo = c.memo || c.notes || c.note || c.memo_md;
    if (memo) lines.push(`메모: ${String(memo).slice(0, 60)}`);
    if (c.last_visit_at || c.last_visit) lines.push(`최근 방문: ${String(c.last_visit_at || c.last_visit).slice(0, 10)}`);
    return lines;
  }

  function _existingResult(name, customer) {
    pending = { ts: Date.now(), name, customer };
    return {
      matched: true,
      kind: 'message',
      text: `${name}님은 고객 명단에 이미 있어요.\n\n이 고객님 맞나요?\n${_infoLines(customer).join('\n')}`,
      related: [`맞아요 ${name} 고객 기록 열기`, `${name} 새 고객으로 추가`, '아니에요'],
    };
  }


  function _openExisting(customer) {
    setTimeout(() => {
      try {
        // [핫픽스E #6] 고객 상세는 잇비 채팅 위로 — 잇비 닫고 시트 오픈, 닫을 때 잇비 복귀(action-hub open_customer 와 동일).
        try { window.__ITDASY_CUSTOMER_RETURN__ = 'itbi_chat'; } catch (_e0) { void 0; }
        if (typeof window.closeAssistant === 'function') { try { window.closeAssistant(); } catch (_e1) { void 0; } }
        if (customer && customer.id != null && typeof window.openCustomerDashboard === 'function') window.openCustomerDashboard(customer.id);
        else if (typeof window.openCustomers === 'function') window.openCustomers();
      } catch (_e) { void _e; }
    }, 80);
  }

  // [핫픽스E #6] "{이름} 고객기록 열어" — 백엔드 LLM 액션(없는 endpoint → endpoint-missing)으로 새지 않게
  //   로컬에서 기존 고객 상세(openCustomerDashboard)로 직결. 추가/저장 의도는 제외.
  function _looksOpenRecord(q) {
    const t = _trim(q);
    if (/(추가|등록|새로|만들|저장)/.test(t)) return false;
    const hasRecord = (/(고객|손님)/.test(t) && /기록/.test(t))
      || /(고객\s*정보|고객\s*상세|고객\s*카드|고객\s*기록부|기록부)/.test(t);
    if (!hasRecord) return false;
    return /(열어|열기|보여|봐줘|봐|확인|띄워|펼쳐|오픈|불러)/.test(t);
  }

  function _looksFindCustomer(q) {
    const t = _trim(q);
    // [§11 2026-09-09 3차] 같은 파일 안에 제외 목록이 **하나 더** 있었다.
    //   실측(배포본 402267d): `_looksFindCustomer('김호영 고객 메모 있어?')` → true
    //   → 잇비가 메모를 답하는 대신 "김호영님 고객 기록을 열게요" 하고 화면만 연다.
    //   `_looksAddCustomer` 는 지난 커밋에서 고쳤는데 이 함수는 문법 모양이 달라서
    //   내가 만든 동기화 테스트의 정규식에도 안 잡혔다 — 가드 자체가 반쪽이었다.
    if (/(예약|매출|사진|가격표|템플릿|캡션|이벤트|문자|메시지|메세지|디엠|\bdm\b|연락처|전화|번호|추가|등록|새로|만들|저장|메모|노트|알러지|알레르기|주의사항|특이사항|회원권|잔액|충전)/i.test(t)) return false;
    /* [잇비 전수QA 2026-09-11 · P1] **집계 질문을 사람 이름으로 읽었다.**

       실측(실 Chrome, 배포본 6926ff0):
         "이번 달 생일인 손님 있어?"  → "'이번'님을 고객 명단에서 못 찾았어요"
         "단골 손님 있어?"            → "'단골'님을 고객 명단에서 못 찾았어요"
       앞엣것은 **우리가 첫 화면에 띄우는 추천칩**이다(`/assistant/starters`).
       원장님이 처음 누르는 버튼이 헛소리를 돌려준다.

       원인은 `(고객|손님).*(있어)` 만 보고 이름 질문으로 단정한 것. 그 다음
       `_extractOpenName` 이 남은 토큰에서 첫 한글 단어('이번'·'단골')를 이름으로 집었다.
       제외 단어를 늘려 막는 방식은 한국어에선 끝이 없다 — 백엔드가 2026-08-17 에
       같은 버그('어디서' 고객이 없다)로 물리고 나서 판정을 뒤집었다:
       **근거가 있을 때만 사람으로 단정한다. 근거 = 호칭('○○님'·'○○씨').**
       여기도 같은 규칙을 쓴다. 호칭이 없으면 이 가드는 손을 떼고 백엔드가 답한다
       (생일·단골은 백엔드에 `birthday`·`regulars` 즉답이 이미 있다).

       ⚠️ 집계어를 블랙리스트로 더 넣지 마라. 그건 이미 두 번 실패한 방법이다. */
    //   '있어/있나' 는 집계 질문의 어미이기도 하다("…손님 있어?") — 그래서 **호칭이 있을 때만**
    //   사람 조회로 본다. '찾아/검색/조회/어딨' 는 사람을 찾는 동사라 이름만 있어도 안전하다
    //   ("김호영 찾아줘" 는 그대로 동작한다).
    var hasHonorific = /[가-힣]{2,5}\s*(님|씨)(?![가-힣])/.test(t);
    if (/(고객|손님).*(찾아|검색|조회|어딨)/.test(t)) return true;
    if (hasHonorific && /(고객|손님).*(있어|있나)/.test(t)) return true;
    if (/^[가-힣]{2,5}\s*(고객\s*)?(찾아|찾아줘|찾아봐|검색|조회|어딨)/.test(t)) return true;
    return hasHonorific && /^[가-힣]{2,5}\s*(님|씨)?\s*(고객\s*)?(있어|있나)/.test(t);
  }

  function _extractOpenName(q) {
    let s = _trim(q).replace(/^잇비\s*/, ' ');
    s = s.replace(/(고객님|고객|손님|기록부|기록|정보|상세|카드|열어줘|열어|열기|보여줘|보여|봐줘|봐|확인|띄워|펼쳐|오픈|불러|찾아줘|찾아봐|찾아|검색|조회|있어|있나|어딨어|어딨|해줘|해|주세요|님)/g, ' ');
    const words = s.match(/[가-힣]{2,5}/g) || [];
    const stops = new Set(['잇비', '고객', '손님']);
    return words.find((w) => !stops.has(w)) || '';
  }

  async function _openRecordResult(q) {
    const name = _extractOpenName(q);
    if (!name) {
      setTimeout(() => { try { if (typeof window.openCustomers === 'function') window.openCustomers(); } catch (_e) { void _e; } }, 80);
      return { matched: true, kind: 'message', text: '고객 목록을 열었어요. 보실 고객님 이름을 말씀해 주시면 바로 기록을 띄울게요.' };
    }
    let list = [];
    try { list = await _customers(); } catch (_e) { list = []; }
    const exact = list.find((c) => _sameName(name, c))
      || list.find((c) => _trim(c && c.name).includes(name) && name.length >= 2);
    if (exact) {
      _openExisting(exact);
      return { matched: true, kind: 'message', text: `${exact.name || name}님 고객 기록을 열게요.` };
    }
    const sims = _similar(name, list);
    if (sims.length) return _suggestResult(name, sims);
    return { matched: true, kind: 'message', text: `${name}님을 고객 명단에서 못 찾았어요. 새 고객이면 "${name} 고객 추가"라고 말씀해 주세요.` };
  }

  function _followup(q) {
    if (!_fresh()) return null;
    const text = _trim(q);
    const p = pending;
    // 역제안(유사 고객) 응답 처리
    if (p.mode === 'suggest') {
      const top = (p.similar && p.similar[0]) || null;
      // "네 {유사이름} 맞아요" / "응" → 그 고객 기록 열기
      if (top && (/^(응|네|어|그래|맞아|맞아요|열어|보여)/.test(text) || text.includes(top.name))
          && !/(아니|아냐|새\s*고객|새로|따로)/.test(text)) {
        pending = null;
        _openExisting(top);
        return { matched: true, kind: 'message', text: `${top.name}님 고객 기록을 열게요.` };
      }
      // "아니요, 새 고객" → 신규 입력 폼
      if (/(아니|아냐|새\s*고객|새로|따로|맞아\s*추가|새)/.test(text)) {
        const nm = p.name;
        pending = null;
        return _openNewForm(nm, '');
      }
      return null;
    }
    // 동일 이름 존재 확인 응답 처리
    if (/(새|따로|추가|등록|새로)/.test(text)) {
      const nm = p.name;
      pending = null;
      return _openNewForm(nm, '');
    }
    if (/^(응|네|맞아|맞아요|그거|그\s*사람|열어|보여)/.test(text)) {
      pending = null;
      _openExisting(p.customer);
      return { matched: true, kind: 'message', text: `${p.customer.name || p.name}님 고객 기록을 열게요.` };
    }
    if (/(아니|아냐|취소|그만)/.test(text)) {
      pending = null;
      return { matched: true, kind: 'message', text: '알겠어요. 새로 추가하지 않을게요.' };
    }
    return null;
  }

  async function tryRun(text) {
    const follow = _followup(text);
    if (follow) return follow;
    if (_looksOpenRecord(text) || _looksFindCustomer(text)) {
      const r = await _openRecordResult(text);
      if (r) return r;
    }
    if (!_looksAddCustomer(text)) return null;
    const name = _extractName(text);
    if (!name) return null;
    const list = await _customers();
    const exact = list.find((c) => _sameName(name, c));
    if (exact) return _existingResult(name, exact);
    // 정확히 일치 없음 → 유사 고객 있으면 역제안, 없으면 바로 신규 입력 폼(자동 생성 금지).
    const sims = _similar(name, list);
    if (sims.length) return _suggestResult(name, sims);
    return _openNewForm(name, '');
  }

  window.ItdasyCustomerAddGuard = { tryRun };
})();
