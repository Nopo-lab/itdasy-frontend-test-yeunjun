/**
 * @jest-environment jsdom
 */
/* 댓글 문의 응대 큐 — 2026-09-01 감사 후속 회귀 테스트.
 *
 * 여기서 잠그는 것 (전부 실제로 있었던 결함이다):
 *   ① 예시(SEED) 댓글이 다시 들어오지 않는다 — 실댓글 0건일 때 가짜 손님이 뜨던 것
 *   ② '빈 목록' 과 '권한 없음' 과 '통신 실패' 를 섞지 않는다
 *   ③ [보내기] 는 서버 dismiss 를 쏘지 않는다 — 응대가 '무시' 로 기록되던 것
 *   ④ 안 나가는 DM 편집칸이 없다
 *   ⑤ 홈 배지가 count_only=1 을 쓴다
 *   ⑥ AI 초안과 기본 문구가 구분된다
 *   ⑦ Graph 원본 오류를 화면에 노출하지 않는다
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const SRC = read('app-comment-reply-queue.js');

let fetchCalls;

function boot(queueResponse, opts) {
  opts = opts || {};
  document.body.innerHTML = '';
  fetchCalls = [];
  localStorage.clear();
  localStorage.setItem('itdasy:crq_settings', JSON.stringify({ enabled: true }));
  // boot 이 localStorage 를 비우므로, 사전 상태가 필요한 테스트는 여기서 심는다
  if (opts.hidden) localStorage.setItem('itdasy:crq_hidden', JSON.stringify(opts.hidden));

  window.apiUrl = (p) => 'https://api.test' + p;
  window.authHeader = () => ({ Authorization: 'Bearer t' });
  window.showToast = jest.fn();
  window.hapticLight = () => {};
  window._registerSheet = () => {};
  window._markSheetOpen = () => {};
  window._markSheetClosed = () => {};
  window._esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  window.requestAnimationFrame = (fn) => fn();
  // 인스타 연동 상태 — 큐가 열릴 때 바로 판정되게(대기 재시도 경로 회피)
  window.WorkspaceAdapter = { instagram: () => ({ connected: opts.connected !== false }) };

  window.apiFetch = jest.fn((url, o) => {
    fetchCalls.push({ url, method: (o && o.method) || 'GET', body: o && o.body ? JSON.parse(o.body) : null });
    if (url.indexOf('/comment-reply-settings') >= 0) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ settings: {} }) });
    }
    if (url.indexOf('/comment-queue/dismiss') >= 0) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) });
    }
    if (url.indexOf('/comment-author/promote') >= 0) {
      const pr = opts.promoteResponse || { ok: true, customer_id: 1, created: true };
      return Promise.resolve({ ok: pr.ok !== false, status: pr.ok === false ? 500 : 200,
        json: () => Promise.resolve(pr) });
    }
    if (url.indexOf('/comment-reply') >= 0) {
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve(opts.replyResponse || { ok: true, public: { ok: true } }),
      });
    }
    if (url.indexOf('/comment-queue') >= 0) {
      if (opts.networkFail) return Promise.reject(new Error('offline'));
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(queueResponse) });
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
  });

  // eslint-disable-next-line no-new-func
  new Function(SRC).call(window);
  window.openCommentReplyQueue();
  return new Promise((r) => setTimeout(r, 0)).then(() => new Promise((r) => setTimeout(r, 0)));
}

const body = () => document.getElementById('commentReplyQueueScreen').querySelector('.ss-body');
const text = () => body().textContent;
const cards = () => body().querySelectorAll('.crq-item');
const item = (over) => Object.assign({
  comment_id: 'c1', media_id: 'm1', username: 'minji', text: '얼마예요?',
  intent: 'price', timestamp: new Date().toISOString(), like_count: 0,
}, over || {});

// ── ① 예시 데이터 완전 제거 ─────────────────────────────────────────────────
describe('예시(SEED) 댓글', () => {
  test('소스에 가짜 손님 데이터가 남아 있지 않다', () => {
    expect(SRC).not.toMatch(/minji_nail|yuna_daily|soo_beauty/);
    expect(SRC).not.toMatch(/var SEED\s*=/);
  });

  test('실댓글 0건이면 예시 대신 빈 상태를 보여준다', async () => {
    await boot({ connected: true, items: [] });
    expect(cards()).toHaveLength(0);
    expect(text()).toContain('답할 문의 댓글이 없어요');
    expect(text()).not.toContain('예시');
  });

  test('인스타 미연동에서도 가짜 카드가 없다', async () => {
    await boot({ connected: false, items: [] }, { connected: false });
    expect(cards()).toHaveLength(0);
  });
});

// ── ② 상태 분리 ────────────────────────────────────────────────────────────
describe('상태 분리 — 오류를 빈 목록으로 위장하지 않는다', () => {
  test('permission_error 면 재연결 CTA 를 준다', async () => {
    await boot({ connected: true, items: [], permission_error: true });
    expect(text()).toContain('문의 댓글을 못 읽었어요');
    expect(text()).toContain('댓글 권한');
    expect(body().querySelector('.crq-reconnect')).not.toBeNull();
    expect(text()).not.toContain('답할 문의 댓글이 없어요');
  });

  test('통신 실패는 "다시 시도" 를 준다', async () => {
    await boot(null, { networkFail: true });
    expect(text()).toContain('불러오지 못했어요');
    expect(body().querySelector('.crq-retry')).not.toBeNull();
  });

  test('기능 꺼짐은 설정으로 안내한다', async () => {
    await boot({ connected: true, items: [], disabled: true });
    expect(text()).toContain('꺼두셨어요');
    expect(body().querySelector('.crq-reconnect')).toBeNull();
  });

  test('빈 상태와 오류 상태의 문구가 서로 다르다', async () => {
    await boot({ connected: true, items: [] });
    const empty = text();
    await boot({ connected: true, items: [], permission_error: true });
    expect(text()).not.toBe(empty);
  });
});

// ── ③ 발송이 무시로 기록되지 않는다 (CMT-P1-001) ───────────────────────────
describe('발송과 무시의 분리', () => {
  test('[보내기] 는 dismiss 를 호출하지 않는다', async () => {
    await boot({ connected: true, items: [item()] });
    expect(cards()).toHaveLength(1);
    body().querySelector('.crq-send').click();
    await new Promise((r) => setTimeout(r, 0));

    const dismiss = fetchCalls.filter((c) => c.url.indexOf('/comment-queue/dismiss') >= 0);
    const reply = fetchCalls.filter((c) => c.url.indexOf('/comment-reply') >= 0 && c.method === 'POST');
    expect(dismiss).toHaveLength(0);   // ← 감사 전엔 1건이 먼저 나갔다
    expect(reply).toHaveLength(1);
    expect(reply[0].body.comment_id).toBe('c1');
  });

  test('[무시] 는 dismiss 를 호출하고 답글은 안 보낸다', async () => {
    await boot({ connected: true, items: [item()] });
    body().querySelector('.crq-discard').click();
    await new Promise((r) => setTimeout(r, 0));

    expect(fetchCalls.filter((c) => c.url.indexOf('/comment-queue/dismiss') >= 0)).toHaveLength(1);
    expect(fetchCalls.filter((c) => c.url.indexOf('/comment-reply') >= 0 && c.method === 'POST')).toHaveLength(0);
  });
});

// ── ④ 안 나가는 DM 편집칸 (CMT-P2-009) ─────────────────────────────────────
describe('DM 편집칸', () => {
  test('[수정] 을 눌러도 DM 입력칸이 없다', async () => {
    await boot({ connected: true, items: [item()] });
    body().querySelector('.crq-edit').click();
    expect(body().querySelector('.crq-edit-pub')).not.toBeNull();
    expect(body().querySelector('.crq-edit-dm')).toBeNull();   // ← 있었으면 입력이 버려진다
  });

  test('소스에 DM 편집 핸들러가 남아 있지 않다', () => {
    expect(SRC).not.toContain('crq-edit-dm');
  });

  test('발송 본문의 dm_text 는 항상 비어 있다', async () => {
    await boot({ connected: true, items: [item()] });
    body().querySelector('.crq-send').click();
    await new Promise((r) => setTimeout(r, 0));
    const reply = fetchCalls.find((c) => c.url.indexOf('/comment-reply') >= 0 && c.method === 'POST');
    expect(reply.body.dm_text).toBe('');
    expect(reply.body.send_dm).toBe(false);
  });
});

// ── ⑤ AI 초안 vs 기본 문구 (CMT-P2-010) ────────────────────────────────────
describe('초안 출처 표시', () => {
  test('AI 초안엔 "기본 문구" 배지가 없다', async () => {
    await boot({ connected: true, items: [item({ public_draft: '가격 안내드릴게요', draft_source: 'ai' })] });
    expect(text()).not.toContain('기본 문구');
  });

  test('초안이 없어 템플릿을 쓰면 "기본 문구" 로 표시한다', async () => {
    await boot({ connected: true, items: [item({ draft_source: 'none' })] });
    expect(text()).toContain('기본 문구');
  });
});

// ── ⑥ 오류 문구 (개발자 정보 노출 금지) ─────────────────────────────────────
describe('발송 실패 안내', () => {
  test('Graph 원본 JSON 을 화면에 노출하지 않는다', async () => {
    await boot({ connected: true, items: [item()] }, {
      replyResponse: { ok: false, error_code: 'temporary', public: { ok: false, status: 500, body: '{"error":{"code":190}}' } },
    });
    body().querySelector('.crq-send').click();
    await new Promise((r) => setTimeout(r, 0));
    const said = window.showToast.mock.calls.map((c) => c[0]).join(' | ');
    expect(said).toContain('다시 시도');
    expect(said).not.toContain('{');
    expect(said).not.toContain('error');
  });

  test('권한 오류는 인스타 연결 확인을 안내한다', async () => {
    await boot({ connected: true, items: [item()] }, {
      replyResponse: { ok: false, error_code: 'permission', public: { ok: false, status: 403, body: 'x' } },
    });
    body().querySelector('.crq-send').click();
    await new Promise((r) => setTimeout(r, 0));
    expect(window.showToast.mock.calls.map((c) => c[0]).join(' | ')).toContain('인스타 연결');
  });

  test('발송 실패하면 카드를 되살린다 (조용히 사라지면 원장이 놓친다)', async () => {
    await boot({ connected: true, items: [item()] }, {
      replyResponse: { ok: false, error_code: 'temporary', public: { ok: false, status: 500, body: 'x' } },
    });
    body().querySelector('.crq-send').click();
    await new Promise((r) => setTimeout(r, 0));
    expect(cards()).toHaveLength(1);
  });
});

// ── ⑦ 우선순위 ─────────────────────────────────────────────────────────────
describe('응대 우선순위', () => {
  test('불만 → 건강여부 → 돈 문의 순으로 올라온다 (좋아요 수는 무관)', async () => {
    await boot({ connected: true, items: [
      item({ comment_id: 'c_general', intent: 'service', text: '어떤 시술 있어요?', like_count: 99 }),
      item({ comment_id: 'c_price', intent: 'price', text: '얼마예요?', like_count: 0 }),
      item({ comment_id: 'c_health', intent: 'eligibility', text: '임신중인데 되나요?', like_count: 0 }),
      item({ comment_id: 'c_complaint', intent: 'complaint', text: '환불해주세요', like_count: 0 }),
    ] });
    const ids = Array.from(cards()).map((el) => el.getAttribute('data-id'));
    expect(ids).toEqual(['c_complaint', 'c_health', 'c_price', 'c_general']);
  });

  test('급한 건이 있으면 상단에 개수를 알린다', async () => {
    await boot({ connected: true, items: [
      item({ comment_id: 'c_complaint', intent: 'complaint', text: '환불해주세요' }),
      item({ comment_id: 'c_price', intent: 'price' }),
    ] });
    expect(text()).toContain('먼저 볼 것 1건');
  });
});

// ── ⑧ 홈 배지 저비용 경로 (CMT-P1-004) ─────────────────────────────────────
describe('홈 배지', () => {
  const HOME = read('app-home-v41.js');

  test('count_only=1 을 사용한다', () => {
    expect(HOME).toContain("/instagram/comment-queue?count_only=1");
  });

  test('배지가 items 를 받아 프론트에서 다시 필터하지 않는다', () => {
    // 필터가 두 벌이면 홈 숫자와 큐 목록이 어긋난다(CMT-P2-008)
    const fn = HOME.slice(HOME.indexOf('_fetchCommentQueueCount'), HOME.indexOf('_fetchProjectedTotal'));
    expect(fn).not.toMatch(/items\.filter/);
  });
});

// ── ⑨ 로컬 숨김 TTL ────────────────────────────────────────────────────────
describe('로컬 숨김 목록', () => {
  test('30일 지난 항목은 읽을 때 버린다', async () => {
    const old = Date.now() - 40 * 24 * 60 * 60 * 1000;
    await boot({ connected: true, items: [item({ comment_id: 'stale' }), item({ comment_id: 'recent' })] },
      { hidden: { stale: old, recent: Date.now() } });
    const ids = Array.from(cards()).map((el) => el.getAttribute('data-id'));
    expect(ids).toContain('stale');       // 오래된 숨김은 풀린다
    expect(ids).not.toContain('recent');  // 최근 숨김은 유지
  });
});

// ── ⑩ 사과 문구에 웃는 이모지 금지 (실기기 QA 에서 발견) ────────────────────
describe('공개 답글 톤', () => {
  test('불만 답글엔 설정 이모지를 붙이지 않는다', async () => {
    localStorage.setItem('itdasy:crq_settings', JSON.stringify({ enabled: true, emoji: '\u{1F60A}' }));
    await boot({ connected: true, items: [
      item({ comment_id: 'x1', intent: 'complaint', text: '너무 아팠어요 환불 안되나요' }),
    ] });
    const bubble = body().querySelector('.crq-item').textContent;
    expect(bubble).toContain('죄송');
    expect(bubble).not.toContain('\u{1F60A}');   // 사과에 웃는 얼굴 = 비꼬는 걸로 읽힌다
  });

  test('건강여부 답글에도 붙이지 않는다', async () => {
    localStorage.setItem('itdasy:crq_settings', JSON.stringify({ enabled: true, emoji: '\u{1F60A}' }));
    await boot({ connected: true, items: [
      item({ comment_id: 'h1', intent: 'eligibility', text: '임신중인데 되나요?' }),
    ] });
    expect(body().querySelector('.crq-item').textContent).not.toContain('\u{1F60A}');
  });

  test('일반 문의엔 그대로 붙는다', async () => {
    localStorage.setItem('itdasy:crq_settings', JSON.stringify({ enabled: true, emoji: '\u{1F60A}' }));
    await boot({ connected: true, items: [item({ intent: 'price' })] });
    expect(body().querySelector('.crq-item').textContent).toContain('\u{1F60A}');
  });
});

// ── ⑪ 댓글 → 고객 / DM 연결 (2026-09-02) ───────────────────────────────────
describe('고객 연결 CTA', () => {
  test('매칭된 고객이면 [고객 보기]/[DM 보기] 가 뜬다', async () => {
    // is_regular 는 **서버가 판정해서 내려준다**(threshold 를 FE 에 복제하지 않는다 —
    // 판정이 두 벌이면 화면과 서버가 어긋난다. 배지/목록 필터에서 이미 겪은 실수다).
    await boot({ connected: true, items: [item({
      customer_id: 42, is_customer: true, visit_count: 3, is_regular: true, author_igsid: 'IG123' })] });
    expect(body().querySelector('.crq-cust')).not.toBeNull();
    expect(body().querySelector('.crq-dm')).not.toBeNull();
    expect(body().textContent).toContain('단골 · 3회 방문');
  });

  test('미매칭이면 secondary CTA 를 안 그린다 (엉뚱한 고객 열림 방지)', async () => {
    await boot({ connected: true, items: [item({ author_igsid: 'IG999' })] });
    expect(body().querySelector('.crq-cust')).toBeNull();
    expect(body().querySelector('.crq-dm')).toBeNull();
    expect(body().textContent).not.toContain('기존 고객');
  });

  test('고객이지만 방문 0회면 숫자를 만들지 않는다', async () => {
    await boot({ connected: true, items: [item({ customer_id: 7, is_customer: true, author_igsid: 'IG1' })] });
    expect(body().textContent).toContain('기존 고객');
    expect(body().textContent).not.toMatch(/\d+회 방문/);
  });

  test('[고객 보기] 는 실제 customer_id 로 openCustomerDashboard 를 부른다', async () => {
    await boot({ connected: true, items: [item({ customer_id: 42, is_customer: true, author_igsid: 'IG1' })] });
    const calls = [];
    window.openCustomerDashboard = (id) => calls.push(id);
    body().querySelector('.crq-cust').click();
    expect(calls).toEqual([42]);
  });

  test('[DM 보기] 는 댓글 작성자 IGSID 로 openDMThread 를 부른다', async () => {
    await boot({ connected: true, items: [item({ customer_id: 42, is_customer: true, author_igsid: 'IG777' })] });
    const calls = [];
    window.openDMThread = (s) => calls.push(s);
    body().querySelector('.crq-dm').click();
    expect(calls).toEqual(['IG777']);
  });

  test('route 가 없으면 조용히 실패하지 않고 알린다', async () => {
    await boot({ connected: true, items: [item({ customer_id: 42, is_customer: true, author_igsid: 'IG1' })] });
    delete window.openCustomerDashboard;
    body().querySelector('.crq-cust').click();
    expect(window.showToast.mock.calls.map((c) => c[0]).join('|')).toContain('불러오지 못했어요');
  });

  test('주행동은 여전히 [공개 답글 보내기] 하나다 (UI 과부하 금지)', async () => {
    await boot({ connected: true, items: [item({ customer_id: 42, is_customer: true, author_igsid: 'IG1' })] });
    const card = body().querySelector('.crq-item');
    expect(card.querySelectorAll('.crq-send')).toHaveLength(1);
    // 예약 CTA 는 route 가 customer 를 안 받으므로 만들지 않았다
    expect(card.textContent).not.toContain('예약 잡기');
    expect(card.textContent).not.toContain('예약 보기');
  });
});

// ── ⑫ 미매칭 작성자 → 고객으로 등록 (2026-09-02) ───────────────────────────
describe('고객으로 등록', () => {
  const withIg = (o) => item(Object.assign({ author_igsid: 'IG_NEW' }, o || {}));

  test('미매칭이면 [고객으로 등록] 이 뜬다', async () => {
    await boot({ connected: true, items: [withIg()] });
    expect(body().querySelectorAll('.crq-reg')).toHaveLength(1);
    expect(body().querySelector('.crq-cust')).toBeNull();
    expect(body().querySelector('.crq-dm')).toBeNull();
  });

  test('이미 매칭된 고객에겐 등록 버튼을 안 보여준다', async () => {
    await boot({ connected: true, items: [withIg({ customer_id: 123, is_customer: true })] });
    expect(body().querySelector('.crq-reg')).toBeNull();
    expect(body().querySelector('.crq-cust')).not.toBeNull();
    expect(body().querySelector('.crq-dm')).not.toBeNull();
  });

  test('작성자 신원이 없으면 등록 버튼도 안 만든다', async () => {
    await boot({ connected: true, items: [item({ author_igsid: '' })] });
    expect(body().querySelector('.crq-reg')).toBeNull();
  });

  test('등록 성공 → customer_id 반영 + 고객/DM 버튼으로 전환', async () => {
    await boot({ connected: true, items: [withIg()] }, {
      promoteResponse: { ok: true, customer_id: 123, created: true },
    });
    body().querySelector('.crq-reg').click();
    await new Promise((r) => setTimeout(r, 0));

    const posts = fetchCalls.filter((c) => c.url.indexOf('/comment-author/promote') >= 0);
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toEqual({ author_igsid: 'IG_NEW', media_id: 'm1' }); // 이름·전화 추측 금지
    expect(body().querySelector('.crq-reg')).toBeNull();
    expect(body().querySelector('.crq-cust')).not.toBeNull();
    expect(body().querySelector('.crq-dm')).not.toBeNull();
  });

  test('already_linked 도 성공으로 취급한다 (중복 고객 금지)', async () => {
    await boot({ connected: true, items: [withIg()] }, {
      promoteResponse: { ok: true, customer_id: 77, already_linked: true },
    });
    body().querySelector('.crq-reg').click();
    await new Promise((r) => setTimeout(r, 0));
    expect(body().querySelector('.crq-cust')).not.toBeNull();
    expect(fetchCalls.filter((c) => c.url.indexOf('/promote') >= 0)).toHaveLength(1);
  });

  test('등록 후 [고객 보기] 가 서버가 준 id 로 열린다', async () => {
    await boot({ connected: true, items: [withIg()] }, {
      promoteResponse: { ok: true, customer_id: 456, created: true },
    });
    body().querySelector('.crq-reg').click();
    await new Promise((r) => setTimeout(r, 0));
    const opened = [];
    window.openCustomerDashboard = (id) => opened.push(id);
    body().querySelector('.crq-cust').click();
    expect(opened).toEqual([456]);
  });

  test('등록 후 [DM 보기] 는 여전히 author_igsid 로 연다 (대화 생성 아님)', async () => {
    await boot({ connected: true, items: [withIg()] }, {
      promoteResponse: { ok: true, customer_id: 456, created: true },
    });
    body().querySelector('.crq-reg').click();
    await new Promise((r) => setTimeout(r, 0));
    const opened = [];
    window.openDMThread = (s) => opened.push(s);
    body().querySelector('.crq-dm').click();
    expect(opened).toEqual(['IG_NEW']);
  });

  test('실패하면 사람 말 문구 + 다시 시도 가능, 미매칭 상태로 되돌아간다', async () => {
    await boot({ connected: true, items: [withIg()] }, {
      promoteResponse: { ok: false, detail: '{"error":"boom"}' },
    });
    body().querySelector('.crq-reg').click();
    await new Promise((r) => setTimeout(r, 0));

    const said = window.showToast.mock.calls.map((c) => c[0]).join('|');
    expect(said).toContain('등록하지 못했어요');
    expect(said).not.toContain('{');
    expect(body().querySelector('.crq-reg')).not.toBeNull();   // 재시도 가능
    expect(body().querySelector('.crq-cust')).toBeNull();      // 매칭으로 넘어가지 않음
    expect(body().textContent).toContain('다시 시도');
  });

  test('연타해도 요청은 1회 (등록 중 잠금)', async () => {
    await boot({ connected: true, items: [withIg()] }, {
      promoteResponse: { ok: true, customer_id: 1, created: true },
    });
    const btn = body().querySelector('.crq-reg');
    btn.click(); btn.click(); btn.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchCalls.filter((c) => c.url.indexOf('/promote') >= 0)).toHaveLength(1);
  });

  test('주행동은 여전히 [공개 답글 보내기] 하나 (버튼 과부하 금지)', async () => {
    await boot({ connected: true, items: [withIg()] });
    const card = body().querySelector('.crq-item');
    expect(card.querySelectorAll('.crq-send')).toHaveLength(1);
    expect(card.querySelectorAll('button').length).toBeLessThanOrEqual(6);
  });
});
