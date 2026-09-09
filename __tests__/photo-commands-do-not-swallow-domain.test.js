/* [P0 2026-09-10] 시술명이 들어간 **고객 메모 요청이 통째로 작업실로 끌려갔다.**
 *
 * 실측(배포본 9ada6d8 · 실 Chrome · 계측 없이 순수 재현):
 *   입력 "E2E_F_회원권만님 메모에 염색 농도 낮게 추가해줘"
 *   → 잇비 시트가 닫히고 작업실(wsv2Flow)이 열림 ("사진이 없어요" 화면)
 *   → **사용자 말풍선조차 안 생김** · 답변 없음 · 메모도 안 생김 · POST 0건
 *   원장이 "염색 진하게 선호" · "펌 약하게" 같은 메모를 쓸 때마다 요청이 사라진다.
 *
 * 원인: `photo-workflow-commands.js` 의 COMMANDS 정규식이 뒤 동사 그룹을 전부
 *   **선택(`?`)** 으로 두고 있어서, 사실상 낱말 하나만 있으면 매칭된다.
 *     hair-detail: /(머리결|모발\s*결|윤기|찰랑|염색|컬러).*(살려|보정|강조|정리)?/
 *   "염색" 이 들어간 어떤 문장이든 잡힌다.
 *
 * 기존 가드(2026-06-12)는 `(고객|…)\s*(카드|목록|…)` 처럼 **두 낱말이 붙어 있을 때만** 막아서
 * "메모에 염색 …" 을 못 걸렀다 — 또 그 패턴이다(가드가 그 경로를 안 본다).
 */
const fs = require('fs');
const path = require('path');

function loadPhotoCommands() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'assistant', 'photo-workflow-commands.js'), 'utf8');
  const win = { WorkspaceFlow: { command: () => true, isOpen: () => false } };
  const doc = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
                addEventListener() {}, createElement: () => ({ style: {} }) };
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', src)(win, doc);
  return win.ItdasyAssistantPhotoCommands;
}

const M = loadPhotoCommands();
const run = (q) => M.tryRun(null, q, { clearInput() {} }) === true;

describe('도메인 요청은 사진 명령으로 가로채지 않는다', () => {
  test.each([
    ['실측 사고 그 문장', 'E2E_F_회원권만님 메모에 염색 농도 낮게 추가해줘'],
    ['메모+컬러', 'E2E_A_박지우님 메모에 컬러 진하게 적어줘'],
    ['메모+윤기', '박지우님 메모에 윤기 없음 기록해줘'],
    ['메모+속눈썹', '속눈썹 고객 메모 보여줘'],
    ['메모+아이', '아이라인 진하게 메모 남겨줘'],
    ['메모+밝기', '밝기 좋아하는 고객 메모 추가해줘'],
    ['회원권 조회', '박지우님 회원권 잔액 얼마야?'],
    ['매출 기록', '오늘 매출 5만원 입력해줘'],
    ['예약 취소', '박지우님 예약 취소해줘'],
    ['단골 조회', '박지우님 단골이야?'],
  ])('%s: %s', (_tag, q) => {
    expect(run(q)).toBe(false);
  });
});

describe('진짜 사진 명령은 그대로 동작한다 (제외를 넓히다 죽이지 않았는지)', () => {
  test.each([
    '사진 밝게 보정해줘',
    '머리결 살려줘',
    '염색 컬러 살려줘',
    '배경 바꿔줘',
    '밝기 올려줘',
    '자동 보정 해줘',
    '사진 편집기 열어줘',
    '속눈썹 반짝이게 보정해줘',
  ])('%s', (q) => {
    expect(run(q)).toBe(true);
  });
});

describe('구조 — COMMANDS 정규식이 낱말 하나로 매칭되는 성질을 문서화', () => {
  /* 정규식 자체는 그대로 두고(사진 명령의 짧은 발화를 살려야 한다) 앞단에서 도메인을 뺀다.
     그래서 "사진 낱말이 없으면 도메인 명사+동사는 제외" 라는 계약을 고정한다. */
  /* 🔑 이 케이스가 예외 조항(`_hasPhotoWord`)을 **실제로 밟는다**.
     사진 낱말 + 도메인 명사 + 도메인 동사가 모두 있어야 예외가 의미를 갖는다.
     (처음 쓴 테스트는 도메인 동사가 없어서 예외를 지워도 통과했다 — mutation 생존을 보고 고쳤다.) */
  test.each([
    '이 사진 고객 기록에 저장해줘',
    '사진 밝게 보정해서 고객한테 보여줘',
  ])('사진 낱말이 있으면 도메인 낱말이 섞여도 통과: %s', (q) => {
    expect(run(q)).toBe(true);
  });

  test('사진 낱말이 있어도 사진편집 명령이 아니면 안 잡는다', () => {
    /* "이 사진 손님 메모에 추가해줘" 는 고객기록 동작이지 보정 명령이 아니다.
       예외 조항은 "무조건 통과" 가 아니라 "COMMANDS 판정에 맡긴다" 는 뜻이다. */
    expect(run('이 사진 손님 메모에 추가해줘')).toBe(false);
  });

  test('도메인 명사만 있고 동사가 없으면 사진 명령 판정에 맡긴다', () => {
    // '염색 살려줘' 는 도메인 명사(없음)+사진 명령 → 통과
    expect(run('염색 살려줘')).toBe(true);
  });
});
