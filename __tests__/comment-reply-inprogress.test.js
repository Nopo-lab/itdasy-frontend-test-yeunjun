/* 댓글 답글 — `in_progress` 를 "보냈다"로 세면 안 된다.
 *
 * 실측 (2026-09-02, 실계정, 같은 comment_id 로 동시 3발):
 *   [0] {ok:true,  duplicate:true}    ← 선점에 진 요청
 *   [1] {ok:true,  duplicate:true}    ← 선점에 진 요청
 *   [2] {ok:false, public:{status:400}} ← 실제로 Graph 에 닿은 유일한 요청, 실패
 *   → **실제 발송 0회인데 화면은 2건 성공으로 셌다.**
 *
 * 동시성 제어 자체는 백엔드가 맞게 한다(UNIQUE 제약으로 하나만 통과).
 * 문제는 **계약 해석**이다 — 백엔드는 진 요청에 `{ok:true, in_progress:true, public:null}` 을
 * 주고 그 뜻은 "다른 요청이 지금 보내는 중"이다(routers/instagram.py 주석에 명시).
 * 화면이 `j.ok` 하나만 보고 "답장 보냈어요" + 큐에서 카드 제거를 했다.
 * 이긴 요청이 실패하면 손님 문의가 조용히 사라진다.
 *
 * duplicate 는 성공이 맞다 — `public_reply_id` 가 있다 = 진짜로 나갔다.
 */
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(
  path.join(__dirname, '..', 'app-comment-reply-queue.js'), 'utf8');

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** 파일에서 판정 헬퍼만 떼어내 실제로 실행한다 (문자열 검사로 끝내지 않는다) */
function loadJudges() {
  const d = SRC.match(/function _delivered\(j\) \{[^}]*\}/);
  const p = SRC.match(/function _isInProgress\(j\) \{[^}]*\}/);
  expect(d).toBeTruthy();
  expect(p).toBeTruthy();
  // eslint-disable-next-line no-new-func
  return new Function(d[0] + '\n' + p[0] + '\nreturn { _delivered, _isInProgress };')();
}

describe('발송 성공 판정', () => {
  const { _delivered, _isInProgress } = loadJudges();

  test('정상 발송 → 성공', () => {
    expect(_delivered({ ok: true, public: { ok: true, id: '17999' } })).toBe(true);
  });

  test('duplicate(이미 나감) → 성공 — public_reply_id 가 있다', () => {
    expect(_delivered({ ok: true, duplicate: true, public: { ok: true, id: '17999' } })).toBe(true);
  });

  test('in_progress → 성공 아님 ★ 이번 버그', () => {
    const j = { ok: true, in_progress: true, public: null, dm: null };
    expect(_delivered(j)).toBe(false);
    expect(_isInProgress(j)).toBe(true);
  });

  test('실패 → 성공 아님', () => {
    expect(_delivered({ ok: false, public: { ok: false, status: 400 } })).toBe(false);
  });

  test('응답 없음/깨짐 → 성공 아님', () => {
    expect(_delivered(null)).toBe(false);
    expect(_delivered(undefined)).toBe(false);
    expect(_delivered({})).toBe(false);
  });
});

describe('화면 처리', () => {
  const src = stripComments(SRC);

  test('단건 발송이 in_progress 면 카드를 되살린다 (큐에서 사라지면 안 된다)', () => {
    const single = src.slice(src.indexOf('_toast(\'보내는 중…\')'));
    const seg = single.slice(0, single.indexOf('function _postReply'));
    expect(seg).toMatch(/_isInProgress\(j\)/);
    // in_progress 분기 안에서 _restoreItem 을 부른다
    const branch = seg.slice(seg.indexOf('_isInProgress(j)'));
    expect(branch.slice(0, 320)).toMatch(/_restoreItem\(it\)/);
  });

  test('묶음 발송이 in_progress 를 ok 로 세지 않는다', () => {
    const batch = src.slice(src.indexOf('function _sendBatch'));
    expect(batch).toMatch(/_delivered\(j\)/);
    expect(batch).toMatch(/_isInProgress\(j\)/);
    expect(batch).toMatch(/pending/);
    // 예전 코드(j.ok 만 보고 세기)가 남아 있으면 안 된다
    expect(batch).not.toMatch(/if \(j && j\.ok\) ok \+= 1/);
  });

  test('묶음 토스트가 pending 을 따로 말한다', () => {
    const batch = src.slice(src.indexOf('function _sendBatch'));
    expect(batch).toMatch(/다른 기기에서 보내는 중/);
  });
});
