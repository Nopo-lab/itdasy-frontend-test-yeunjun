/**
 * 무료 체험 기간 표기 단일화 가드 (2026-09-21)
 *
 * 정본은 **App Store Connect 에 실제로 설정된 값**이다. 2026-09-21 실측:
 *   itdasy_pro_monthly_9900 → introductoryOffers: FREE_TRIAL duration=TWO_WEEKS (= 14일)
 *   itdasy_pro_yearly_99000 → 오퍼 없음
 * 따라서 사용자에게 보이는 모든 문구는 **14일**이어야 한다.
 *
 * 왜 이 테스트가 생겼나:
 *   커밋 f7b9c5e 가 "10일 → 14일" 을 한다면서 `10일 무료 체험` 이라는 **한 가지 표기만**
 *   바꿨다. 그래서 아래 변형들이 그대로 살아남아 운영에 배포됐다:
 *     · index.html   `>10일 무료로 시작하기<`      ← 앱 안 결제 버튼
 *     · app-plan.js  `'10일 무료로 시작하기'`      ← 네이티브에서 그 버튼을 덮어쓰는 문자열
 *     · landing      `10일 무료, 그다음 월 9,900원`
 *     · landing      `모든 기능을 10일 동안 무료로 써보세요`
 *     · support.html `가입 후 10일 무료체험 동안`
 *   "고쳤다" 고 보고된 뒤에도 **아이폰 앱 결제 버튼에 10일이 떠 있었다.**
 *   애플에 보낸 답변은 14일이라 그대로 뒀으면 Guideline 2.3.1 직격이었다.
 *
 * 그래서 문자열 하나를 찍지 않고 **"14가 아닌 숫자 + 일 + 무료/체험" 을 전부** 잡는다.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/** 사용자에게 보이거나, 사람이 정본이라고 믿는 파일들. */
const FILES = [
  'index.html',
  'app-plan.js',
  'app-iap.js',
  'support.html',
  'terms.html',
  'landing/index.html',
];

/**
 * 체험 기간을 말하는 문구를 폭넓게 잡는다.
 *   `10일 무료` · `10일 동안 무료` · `무료 체험 10일` · `무료체험(10일)` · `7일 무료체험` …
 * 14 만 통과시킨다.
 */
const PATTERNS = [
  /(\d+)\s*일\s*(?:동안\s*)?무료/g, // "10일 무료", "10일 동안 무료"
  /무료\s*체험\s*\(?\s*(\d+)\s*일/g, // "무료 체험 10일", "무료체험(10일)"
  /(\d+)\s*일\s*체험/g, // "10일 체험"
];

const OK = '14';

function offenders(text) {
  const out = [];
  for (const re of PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m[1] !== OK) {
        const at = Math.max(0, m.index - 40);
        out.push(`"${text.slice(at, m.index + 40).replace(/\s+/g, ' ')}"`);
      }
    }
  }
  return out;
}

describe('무료 체험 기간은 14일 하나로만 표기된다', () => {
  test.each(FILES)('%s', (rel) => {
    const p = path.join(ROOT, rel);
    expect(fs.existsSync(p)).toBe(true);
    const bad = offenders(fs.readFileSync(p, 'utf8'));
    expect(bad).toEqual([]);
  });

  test('실제로 14일 문구가 존재한다 (지워지고 통과하는 걸 막는다)', () => {
    /* 위 테스트는 "아무 표기도 없음" 이어도 통과한다. 그래서 있다는 것도 같이 고정한다.
       결제 버튼이 있는 두 곳만 본다 — 약관·랜딩은 문구가 바뀔 수 있다. */
    for (const rel of ['index.html', 'app-plan.js']) {
      const s = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      expect(s).toMatch(/14\s*일\s*(?:동안\s*)?무료|무료\s*체험\s*\(?\s*14\s*일|14\s*일\s*체험/);
    }
  });
});
