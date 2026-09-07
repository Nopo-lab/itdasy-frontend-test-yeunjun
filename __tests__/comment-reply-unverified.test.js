/* 댓글 답글 — "못 보냈다" 와 "모른다" 를 화면이 구분하는가.
 *
 * 배경 (종결게이트 2026-09-07, 실측):
 *   인스타 응답이 유실되면(ReadTimeout) 게시가 됐는지 **우리도 모른다.**
 *   그런데 화면은 "답변을 보내지 못했어요" 라고 단정했다. 원장님은 그 말을 믿고
 *   손님에게 다르게 말하게 된다. 서버는 이 경우 error_code='unverified' 를 준다
 *   (선점을 유지해 두고, 잠시 뒤 재시도하면 인스타에 직접 물어보고 정정한다).
 *
 * 이 테스트는 **문구 자체**가 아니라 "단정하지 않는가" 를 본다.
 */
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(
  path.join(__dirname, '..', 'app-comment-reply-queue.js'), 'utf8');

function loadErrorMessage() {
  const m = SRC.match(/function _errorMessage\(j\) \{[\s\S]*?\n  \}/);
  expect(m).toBeTruthy();
  // eslint-disable-next-line no-new-func
  return new Function(m[0] + '\nreturn _errorMessage;')();
}

describe('전송 결과 불명(unverified) 안내', () => {
  const _errorMessage = loadErrorMessage();

  test('unverified 는 일반 실패와 다른 문구를 준다', () => {
    const unverified = _errorMessage({ error_code: 'unverified' });
    const generic = _errorMessage({ error_code: 'temporary' });
    expect(unverified).not.toBe(generic);
  });

  test('unverified 문구는 "못 보냈다" 고 단정하지 않는다', () => {
    const msg = _errorMessage({ error_code: 'unverified' });
    expect(msg).not.toMatch(/보내지 못했|실패했|전송 실패/);
    expect(msg).toMatch(/확인/);
  });

  test('기존 분류는 그대로 (과교정 방지)', () => {
    expect(_errorMessage({ error_code: 'permission' })).toMatch(/연결/);
    expect(_errorMessage({ error_code: 'rate_limit' })).toMatch(/바빠|잠시/);
    expect(_errorMessage({ error_code: 'gone' })).toMatch(/삭제/);
    expect(_errorMessage(null)).toMatch(/보내지 못했어요/);
  });
});

describe('서버가 실제로 보내는 응답 모양에 대한 판정', () => {
  function loadJudges() {
    const d = SRC.match(/function _delivered\(j\) \{[^}]*\}/);
    const p = SRC.match(/function _isInProgress\(j\) \{[^}]*\}/);
    // eslint-disable-next-line no-new-func
    return new Function(d[0] + '\n' + p[0] + '\nreturn { _delivered, _isInProgress };')();
  }
  const { _delivered, _isInProgress } = loadJudges();

  /* 아래 4개는 백엔드 tests/pg 가 실제로 반환하는 것을 실측해 고정한 모양이다. */
  test('발송 확인 없는 선점 → 성공 아님 · 진행 중', () => {
    const j = { ok: true, in_progress: true, duplicate: true, public: null, dm: null };
    expect(_delivered(j)).toBe(false);
    expect(_isInProgress(j)).toBe(true);
  });

  test('정합성 대조로 이미 달린 걸 확인 → 성공', () => {
    const j = { ok: true, duplicate: true, public: { ok: true, status: 200, id: 'R1' }, dm: null };
    expect(_delivered(j)).toBe(true);
  });

  test('전송 결과 불명 → 성공 아님', () => {
    const j = { ok: false, public: { ok: false, status: 0 }, dm: null, error_code: 'unverified' };
    expect(_delivered(j)).toBe(false);
  });

  test('정합성 대조 실패 → 성공 아님 · 진행 중으로 되살린다', () => {
    const j = { ok: false, in_progress: true, duplicate: true, public: null, error_code: 'temporary' };
    expect(_delivered(j)).toBe(false);
    expect(_isInProgress(j)).toBe(true);
  });
});
