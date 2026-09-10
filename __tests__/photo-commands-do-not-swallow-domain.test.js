/* [P0 2026-09-10] 미용실 어휘 하나로 사진편집 route 가 다른 도메인의 정상 문장을 강탈했다.
 *
 * 실측 1차(배포본 9ada6d8 · 실 Chrome · 계측 없이 재현):
 *   "E2E_F_회원권만님 메모에 염색 농도 낮게 추가해줘"
 *   → 잇비가 닫히고 작업실(wsv2Flow) 열림 · 말풍선조차 없음 · 메모 없음 · POST 0건
 *
 * 실측 2차(도메인 동사 제외로 1차 수정한 뒤, 미용실 어휘 22개 × 도메인 문형 11종 = 242문장):
 *   **24건이 그대로 강탈당하고 있었다.**
 *     "염색 선호한다고 메모해줘"     → 작업실   ('해줘' 가 동사 목록에 없어서)
 *     "염색 예약 잡아줘"             → 작업실   ('잡아' 없음)
 *     "염색 자주 하는 손님 누구야?"   → 작업실   ('누구' 없음)
 *   동사 목록을 늘리는 방식은 같은 실패를 반복한다(한국어 표현은 끝이 없다).
 *
 * 근본 원인: COMMANDS 정규식이 뒤 동사 그룹을 전부 **선택(`?`)** 으로 둬서
 *   사실상 명사 하나로 매칭된다.  예: /(머리결|윤기|염색|컬러).*(살려|보정|강조|정리)?/
 *   (전역 수색: 이 파일 10건, 앱 전체 14건이 같은 모양)
 *
 * 그래서 판정을 뒤집었다 — **사진 명령은 사진이라는 근거가 있을 때만 성립한다.**
 *   PHOTO_OBJECT : 사진 자체를 가리키는 말(사진·이미지·편집기…). 도메인 낱말보다 우선
 *   EDIT_VOCAB   : 편집 어휘(보정·누끼·배경·필터…). 근거는 되지만 도메인 낱말에 양보
 *   실제 사진 컨텍스트 : 방금 보낸 사진(SourceImage) 또는 편집기가 열려 있음
 */
const fs = require('fs');
const path = require('path');

function load({ photoInContext = false, editorOpen = false } = {}) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'assistant', 'photo-workflow-commands.js'), 'utf8');
  const win = {
    WorkspaceFlow: { command: () => true, isOpen: () => editorOpen },
    ItdasySourceImage: { resolve: () => (photoInContext ? { dataUrl: 'data:image/jpeg;base64,x' } : null) },
  };
  const doc = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
                addEventListener() {}, createElement: () => ({ style: {} }) };
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', src)(win, doc);
  const M = win.ItdasyAssistantPhotoCommands;
  return (q) => M.tryRun(null, q, { clearInput() {} }) === true;
}

const HAIR = ['염색', '펌', '커트', '볼륨', '컬', '색감', '밝기', '모발', '머리결', '윤기', '탈색',
              '톤', '두피', '앞머리', '뿌리', '길이', '레이어드', '블랙', '브라운', '애쉬', '속눈썹', '네일'];
const DOMAIN_FORMS = [
  '{W} 선호한다고 메모해줘',
  '{W} 약하게 해달라고 메모 남겨줘',
  '{W} 알러지 있다고 기록해줘',
  '{W} 싫어한다고 고객 메모에 적어줘',
  '{W} 예약 잡아줘',
  '내일 3시 {W} 예약 만들어줘',
  '{W} 매출 얼마야?',
  '오늘 {W} 매출 50000원 입력해줘',
  '{W} 손님 회원권 잔액 얼마야?',
  '{W} 손님 회원권 30000원 충전해줘',
  '{W} 자주 하는 손님 누구야?',
];

describe('CROSS-DOMAIN NO-STEAL — 미용실 어휘 × 도메인 전수', () => {
  const contexts = [
    ['사진 없음', {}],
    ['사진 보낸 직후', { photoInContext: true }],
    ['편집기 열림', { editorOpen: true }],
  ];
  for (const [label, ctx] of contexts) {
    const run = load(ctx);
    const cases = [];
    for (const w of HAIR) for (const f of DOMAIN_FORMS) cases.push(f.replace('{W}', w));

    test(`[${label}] 조합 수가 줄지 않았다`, () => {
      expect(cases.length).toBe(HAIR.length * DOMAIN_FORMS.length);
      expect(cases.length).toBeGreaterThanOrEqual(242);
    });

    test(`[${label}] ${HAIR.length * DOMAIN_FORMS.length}문장 중 사진 route 로 새는 것 0건`, () => {
      const stolen = cases.filter(run);
      expect(stolen).toEqual([]);
    });
  }
});

describe('PHOTO POSITIVE — 진짜 사진 명령은 살아 있다', () => {
  test.each([
    '사진 밝게 해줘', '사진 색감 살려줘', '사진 머리결 정리해줘',
    '사진 편집기 열어줘', '배경 바꿔줘', '워터마크 넣어줘',
    '자동 보정 해줘', '사진 저장해줘',
  ])('사진 낱말이 문장에 있으면: %s', (q) => {
    expect(load()(q)).toBe(true);
  });

  test.each([
    '밝게 해줘', '색감 살려줘', '머리결 살려줘', '밝기 올려줘',
    '따뜻하게 해줘', '채도 올려줘', '눈빛 살려줘', '염색 컬러 살려줘',
  ])('사진을 방금 보낸 상태의 짧은 발화: %s', (q) => {
    expect(load({ photoInContext: true })(q)).toBe(true);
  });

  test.each([
    '밝게 해줘', '색감 살려줘', '머리결 살려줘', '밝기 올려줘',
  ])('편집기가 열려 있을 때의 짧은 발화: %s', (q) => {
    expect(load({ editorOpen: true })(q)).toBe(true);
  });
});

describe('근거 등급 — 사진 객체는 도메인보다 우선, 편집 어휘는 양보', () => {
  test('사진 객체가 있으면 도메인 낱말이 섞여도 사진 판정에 맡긴다', () => {
    expect(load({ photoInContext: true })('이 사진 고객 기록에 저장해줘')).toBe(true);
  });

  test('편집 어휘만 있고 도메인 낱말이 있으면 도메인이 이긴다', () => {
    expect(load()('염색 보정 잘하는 손님 메모해줘')).toBe(false);
  });

  test('근거가 아예 없으면 사진 명령이 아니다', () => {
    // 사진도 없고 사진 낱말도 없다 — 열어봐야 "사진이 없어요" 화면만 뜬다
    expect(load()('밝게 해줘')).toBe(false);
    expect(load()('머리결 살려줘')).toBe(false);
  });

  test('사진 낱말이 있어도 사진편집 명령이 아니면 안 잡는다', () => {
    // COMMANDS 에 해당 동작이 없으면 통과시키지 않는다(게이트는 "무조건 통과" 가 아니다)
    expect(load({ photoInContext: true })('이 사진 손님 메모에 추가해줘')).toBe(false);
  });
});
