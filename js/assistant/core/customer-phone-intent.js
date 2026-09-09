/* 잇비 고객 연락처 자연어 입력/수정
   - "이수진 010-1111-2222 추가해줘"      → 이름+연락처로 신규 추가(확인 후)
   - "010-3333-4444로 바꿔줘"             → 현재 고객 연락처 수정(이름 없으면 고객 선택)
   - "강연준 연락처 010-1234-5678로 수정해" → 지정 고객 연락처 수정
   연락처 요청했는데 빈값 저장 금지. window.Customer(create/update/search/pick) 재사용. */
(function () {
  'use strict';

  const TTL_MS = 5 * 60 * 1000;
  let pending = null;   // { action:'create'|'update', name, phone, id?, ts }

  const PHONE_RE = /01[016789][-\s]?\d{3,4}[-\s]?\d{4}/;
  function _trim(s) { return String(s == null ? '' : s).trim(); }
  function _fresh() { return pending && Date.now() - pending.ts < TTL_MS; }

  function _normPhone(s) {
    const d = String(s || '').replace(/[^0-9]/g, '');
    if (d.length === 11) return d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7);
    if (d.length === 10) return d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6);
    return _trim(s);
  }
  function _extractPhone(q) { const m = String(q || '').match(PHONE_RE); return m ? _normPhone(m[0]) : ''; }

  // 전화/동사/조사 제거 후 한글 이름 후보(2~5자) 첫 번째.
  function _extractName(q) {
    let s = _trim(q).replace(PHONE_RE, ' ').replace(/^잇비\s*/, ' ');
    s = s.replace(/(고객님|고객|손님|연락처|전화|번호|핸드폰|폰|추가|등록|새로|새|수정|변경|바꿔|바꾸|업데이트|만들어줘|만들어|만들|넣어줘|넣어|해줘|해|주세요|로|으로|를|을|의|님)/g, ' ');
    const words = s.match(/[가-힣]{2,5}/g) || [];
    const stops = new Set(['잇비', '고객', '손님', '추가', '등록', '연락처', '전화', '번호', '수정', '변경']);
    return words.find((w) => !stops.has(w)) || '';
  }

  // 연락처가 함께 온 추가 발화는 '고객/손님' 단어가 없어도 고객 추가로 본다("이수진 010-1111-2222 추가해줘").
  function _looksAddWithPhone(q) {
    const t = _trim(q);
    if (!PHONE_RE.test(t)) return false;
    if (!/(추가|등록|저장|넣어|만들)/.test(t)) return false;
    /* [P1 2026-09-09] 제외 목록에 **메모류가 빠져 있었다** — customer-add-guard.js 와 같은 사고다.
       "박서준 010-9911-0001 메모에 알러지 추가해줘" 처럼 전화번호 + '추가' 가 같이 오면
       고객 생성으로 분류돼 메모를 못 남긴다.
       같은 계열 3개 중 create-intent.js 의 NOT_CREATE_RE 에는 '메모' 가 이미 있었고,
       customer-add-guard.js 와 여기만 빠져 있었다 — 목록을 복붙하면서 한쪽만 갱신된 것이다.
       두 목록이 다시 어긋나지 않게 __tests__/customer-add-guard-scope.test.js 가 동기화를 검사한다. */
    return !/(예약|매출|사진|기록|문자|메시지|메세지|캡션|홍보|가격표|템플릿|바꿔|바꾸|변경|수정|메모|노트|알러지|알레르기|주의사항|특이사항|회원권|잔액|충전)/.test(t);
  }
  function _looksPhoneChange(q) {
    const t = _trim(q);
    if (!PHONE_RE.test(t)) return false;
    return /(바꿔|바꾸|변경|수정|업데이트)/.test(t) && /(연락처|전화|번호|핸드폰|폰|010|공일|로\s|으로)/.test(t);
  }

  function _findByName(name) {
    try {
      const C = window.Customer;
      let list = (C && C._cache) || [];
      if ((!list || !list.length) && C && typeof C.search === 'function') list = C.search(name) || [];
      return (list || []).filter((c) => _trim(c && c.name) === name);
    } catch (_e) { return []; }
  }

  function _confirm(action, fields, msg) {
    pending = Object.assign({ action, ts: Date.now() }, fields);
    return { matched: true, kind: 'message', text: msg, related: ['응', '아니요'] };
  }

  // 신규 고객 입력 폼(이름/연락처/메모) 열기 — 이름·연락처 자동 채움, 저장 전 확인.
  function _openNewForm(name, phone) {
    setTimeout(() => {
      try {
        if (typeof window._openCustomerEditSheet === 'function') window._openCustomerEditSheet({ name: name || '', phone: phone || '' });
        else if (typeof window.openCustomers === 'function') window.openCustomers();
      } catch (_e) { void _e; }
    }, 80);
    return { matched: true, kind: 'message', text: `${name}님(${phone}) 정보를 입력하는 창을 열었어요. 메모도 같이 넣고 저장해 주세요.` };
  }

  async function _doCreate(name, phone) {
    if (!window.Customer || typeof window.Customer.create !== 'function') return { matched: true, kind: 'message', text: '고객 기능을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.' };
    try {
      await window.Customer.create({ name, phone: phone || null });
      return { matched: true, kind: 'message', text: phone ? `${name}님(${phone})을 새 고객으로 추가했어요.` : `${name}님을 새 고객으로 추가했어요.` };
    } catch (_e) { return { matched: true, kind: 'message', text: `${name}님 추가에 실패했어요. 잠시 후 다시 시도해 주세요.` }; }
  }
  async function _doUpdate(id, name, phone) {
    if (!window.Customer || typeof window.Customer.update !== 'function') return { matched: true, kind: 'message', text: '고객 기능을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.' };
    if (!phone) return { matched: true, kind: 'message', text: '바꿀 연락처를 못 읽었어요. "010-1234-5678로 바꿔줘"처럼 말씀해 주세요.' };
    try {
      await window.Customer.update(id, { phone });
      return { matched: true, kind: 'message', text: `${name || '고객'}님 연락처를 ${phone}로 바꿨어요.` };
    } catch (_e) { return { matched: true, kind: 'message', text: '연락처 수정에 실패했어요. 잠시 후 다시 시도해 주세요.' }; }
  }

  // 이름 없는 연락처 변경 → 고객 선택 후 바로 수정.
  async function _pickThenUpdate(phone, prompt) {
    try {
      if (window.Customer && typeof window.Customer.pick === 'function') {
        const picked = await window.Customer.pick({});
        if (picked && picked.id != null) {
          const r = await _doUpdate(picked.id, picked.name, phone);
          if (window.showToast) window.showToast(r.text);
        }
      }
    } catch (_e) { void _e; }
    return { matched: true, kind: 'message', text: prompt };
  }

  function _followup(q) {
    if (!_fresh()) return null;
    const t = _trim(q); const p = pending;
    if (/^(응|네|어|그래|맞아|맞아요|좋아|해줘|등록|추가|수정|바꿔)/.test(t)) {
      pending = null;
      if (p.action === 'create') return _doCreate(p.name, p.phone);
      if (p.action === 'update') return _doUpdate(p.id, p.name, p.phone);
    }
    if (/(아니|아냐|취소|그만|싫|관둬)/.test(t)) { pending = null; return { matched: true, kind: 'message', text: '알겠어요. 그대로 둘게요.' }; }
    return null;
  }

  async function tryRun(text) {
    const follow = _followup(text);
    if (follow) return follow;
    const t = _trim(text);
    const phone = _extractPhone(t);

    // 1) 연락처 변경
    if (_looksPhoneChange(t)) {
      const name = _extractName(t);
      if (name) {
        const m = _findByName(name);
        if (m.length === 1) return _confirm('update', { id: m[0].id, name: m[0].name, phone }, `${m[0].name}님 연락처를 ${phone}로 바꿀까요?`);
        if (m.length > 1) return _pickThenUpdate(phone, `${name}님이 여러 명이에요. 연락처 바꿀 분을 목록에서 골라주세요.`);
        return _pickThenUpdate(phone, `${name}님을 명단에서 못 찾았어요. 목록에서 골라주세요.`);
      }
      return _pickThenUpdate(phone, '연락처를 바꿀 고객을 목록에서 골라주세요.');
    }

    // 2) 이름+연락처로 추가 (연락처 없으면 add-guard 가 처리하도록 null)
    if (_looksAddWithPhone(t)) {
      const name = _extractName(t);
      if (!name) return null;
      const exist = _findByName(name);
      if (exist.length) {
        return { matched: true, kind: 'message', text: `${name}님은 이미 고객 명단에 있어요. 연락처를 ${phone}로 바꿀까요, 새 고객으로 따로 추가할까요?`, related: [`${name} 연락처 ${phone}로 바꿔줘`, `${name} 새 고객으로 추가`] };
      }
      // 자동 생성 대신 폼을 연다 — 이름·연락처 자동 채움 + 메모 등 입력 후 저장.
      return _openNewForm(name, phone);
    }

    return null;
  }

  window.ItdasyCustomerPhoneIntent = { tryRun };
})();
