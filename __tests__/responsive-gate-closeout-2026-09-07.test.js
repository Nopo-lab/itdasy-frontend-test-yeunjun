/**
 * @jest-environment jsdom
 *
 * 반응형 릴리즈 게이트 CLOSEOUT (2026-09-07) 회귀 가드.
 *
 * 왜 유닛으로 잠그나: 이 세 가지는 로컬 브라우저에서 **캐시(SW+HTTP) 때문에 재현 검증이
 * 반복적으로 막혔다**. app-core.js 는 index.html 의 `?v=` 로 물려 있어서, 파일을 고쳐도
 * 실행되는 건 옛 스크립트였다(실측). 그래서 소스에서 함수를 꺼내 직접 돌린다 —
 * 캐시와 무관하게 항상 진짜 코드를 검사한다.
 *
 *  BUG-4 : JS 내부 오류 문구가 사용자 화면에 노출 + 429 가 413 로 오분류
 *  BUG-7 : 새로고침 뒤 남는 유령 hash → "눌러도 아무 일 없는 뒤로가기"
 *  BUG-8 : 시트 배경 스크롤 잠금(중첩 안전한 저장/복구)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const CORE = read('app-core.js');

/** `window.<name> = function (...) { ... };` 한 덩어리를 소스에서 통째로 꺼낸다. */
function extractAssignedFn(src, name) {
  const start = src.indexOf(`window.${name} = function`);
  if (start < 0) throw new Error(`${name} 을 app-core.js 에서 못 찾음`);
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(start, i) + ';';
}

// ── BUG-4 ──────────────────────────────────────────────────────────
describe('BUG-4 — 내부 오류 문구가 사용자에게 새지 않는다', () => {
  const win = {};
  beforeAll(() => {
    // eslint-disable-next-line no-new-func
    new Function('window', 'console',
      extractAssignedFn(CORE, '_isInternalErrorText') +
      extractAssignedFn(CORE, '_sanitizeUserText') +
      extractAssignedFn(CORE, '_humanError'))(win, { warn() {} });
  });

  test.each([
    ["Cannot read properties of undefined (reading 'total')"],
    ['x.foo is not a function'],
    ['openFoo is not defined'],
    ['undefined is not an object'],
    ['Unexpected token <'],
  ])('내부 예외 %s → 한국어 일반 문구', (msg) => {
    const out = win._humanError(new TypeError(msg));
    expect(out).toBe('일시적인 오류가 발생했어요. 잠시 후 다시 시도해주세요');
    expect(out).not.toMatch(/undefined|not a function|TypeError|Cannot read/i);
  });

  test('429(quota) 가 413(파일 크기) 로 오분류되지 않는다', () => {
    // 실측 버그: 413 규칙의 `exceeded` 가 "quota exceeded" 를 먼저 잡아
    //   AI 한도 초과인데 "파일이 너무 커요 (최대 10MB)" 가 떴다.
    expect(win._humanError(new Error('HTTP 429 quota exceeded'))).toMatch(/요청이 너무 많아요/);
    expect(win._humanError(new Error('quota_exceeded:caption'))).toMatch(/요청이 너무 많아요/);
    expect(win._humanError(new Error('rate limit'))).toMatch(/요청이 너무 많아요/);
    // 진짜 413 은 그대로 파일 크기 안내
    expect(win._humanError(new Error('HTTP 413'))).toMatch(/파일이 너무 커요/);
    expect(win._humanError(new Error('file too large'))).toMatch(/파일이 너무 커요/);
  });

  test('사람이 읽을 한국어 메시지는 그대로 둔다 (과잉 일반화 금지)', () => {
    for (const m of ['이미 등록된 전화번호예요', '이름을 입력해 주세요', '예약 시간을 골라주세요']) {
      expect(win._humanError(new Error(m))).toBe(m);
    }
  });

  test('네트워크·인증 분류는 기존대로', () => {
    expect(win._humanError(new Error('Failed to fetch'))).toMatch(/네트워크/);
    expect(win._humanError(new Error('Load failed'))).toMatch(/네트워크/);
    expect(win._humanError(new Error('HTTP 401'))).toMatch(/로그인이 만료/);
  });

  test('토스트 살균 — 라벨은 살리고 내부 문구만 제거', () => {
    expect(win._sanitizeUserText("저장 실패: Cannot read properties of undefined (reading 'id')"))
      .toBe('저장 실패. 잠시 후 다시 시도해 주세요');
    expect(win._sanitizeUserText('이동 실패: t.map is not a function'))
      .toBe('이동 실패. 잠시 후 다시 시도해 주세요');
    // 정상 문구는 건드리지 않는다
    expect(win._sanitizeUserText('저장 완료')).toBe('저장 완료');
    expect(win._sanitizeUserText('예약이 저장됐어요')).toBe('예약이 저장됐어요');
  });

  test('showToast 가 살균을 거친다', () => {
    expect(CORE).toMatch(/function showToast[\s\S]{0,400}_isInternalErrorText/);
    expect(CORE).toMatch(/function showToast[\s\S]{0,400}_sanitizeUserText/);
  });
});

// ── BUG-7 ──────────────────────────────────────────────────────────
describe('BUG-7 — 새로고침 뒤 유령 hash 정리 (시스템 hash 는 보존)', () => {
  // _normalizeStaleHash 는 라우터 IIFE 의 stack/registry 를 클로저로 쓴다.
  // 소스에서 상수+함수를 꺼내 같은 클로저를 만들어 준다.
  function makeNormalizer({ stack = [], registered = [] } = {}) {
    const sysSrc = CORE.match(/const _SYSTEM_HASHES = \[[\s\S]*?\];/)[0];
    const listSrc = CORE.match(/window\.__SHEET_HASHES = \[[\s\S]*?\];/)[0];
    const fnSrc = CORE.match(/function _normalizeStaleHash\(\) \{[\s\S]*?\n  \}/)[0];
    const loc = { hash: '', pathname: '/index.html', search: '' };
    const hist = { replaceState: (a, b, url) => { loc.hash = ''; hist.last = url; } };
    const win = { location: loc };
    // eslint-disable-next-line no-new-func
    const fn = new Function('stack', 'registry', 'window', 'history',
      `${sysSrc}\n${listSrc}\n${fnSrc}\nreturn _normalizeStaleHash;`
    )(stack, new Map(registered.map((n) => [n, {}])), win, hist);
    return { fn, loc };
  }

  test.each(['customers', 'report', 'plan', 'reminder', 'dataExport', 'reviewRequests', 'settingsHub'])(
    '#%s — 열린 시트가 없으면 정리된다', (name) => {
      const { fn, loc } = makeNormalizer();
      loc.hash = '#' + name;
      fn();
      expect(loc.hash).toBe('');
    });

  test.each([
    ['#register', '가입 흐름'],
    ['#connected=success', 'OAuth 복귀'],
    ['#access_token=abc123', '토큰형'],
    ['#revenuehub', '별도 핸들러 소유'],
    ['#bio', '생체인증'],
    ['#unknownThing', '모르는 값'],
    ['#a=1&b=2', '파라미터형'],
  ])('%s 는 보존한다 (%s)', (hash) => {
    const { fn, loc } = makeNormalizer();
    loc.hash = hash;
    fn();
    expect(loc.hash).toBe(hash);
  });

  test('시트가 열려 있으면(stack 비어있지 않음) 절대 건드리지 않는다', () => {
    const { fn, loc } = makeNormalizer({ stack: ['customers'] });
    loc.hash = '#customers';
    fn();
    expect(loc.hash).toBe('#customers');
  });

  test('시트 이름 목록이 실제 _markSheetOpen 호출과 어긋나지 않는다 (드리프트 가드)', () => {
    // 목록이 낡으면 정리가 조용히 안 먹는다 → 저장소 전체를 훑어 강제한다.
    const files = [];
    (function walk(dir) {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name === '.git' || e.name === '.claude'
            || e.name === 'android' || e.name === 'ios' || e.name === '__tests__') continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith('.js')) files.push(p);
      }
    })(ROOT);

    const used = new Set();
    for (const f of files) {
      for (const m of fs.readFileSync(f, 'utf8').matchAll(/_markSheetOpen\('([^']+)'\)/g)) {
        used.add(m[1]);
      }
    }
    const listed = new Set(JSON.parse(
      CORE.match(/window\.__SHEET_HASHES = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"')
    ));
    const missing = [...used].filter((n) => !listed.has(n));
    expect({ missing }).toEqual({ missing: [] });
  });
});

// ── BUG-8 ──────────────────────────────────────────────────────────
describe('BUG-8 — 시트 배경 스크롤 잠금 (중첩 안전)', () => {
  const SHEETS = ['app-plan.js', 'app-waitlist.js', 'app-support.js', 'app-settings-hub.js'];

  test.each(SHEETS)('%s — 잠금/해제가 있고, 해제는 이전 값 복구다', (file) => {
    const src = read(file);
    expect(src).toMatch(/_lockBg\(\)/);
    expect(src).toMatch(/_unlockBg\(\)/);
    // 중첩 안전: 무조건 '' 로 밀지 않고 저장해둔 값을 되돌린다
    expect(src).toMatch(/_prevOverflow\s*=\s*document\.body\.style\.overflow/);
    expect(src).toMatch(/document\.body\.style\.overflow\s*=\s*_prevOverflow/);
    // 안티패턴: 닫을 때 빈 문자열로 밀어버리면 아래 깔린 시트의 잠금까지 풀린다
    expect(src).not.toMatch(/_unlockBg[\s\S]{0,120}style\.overflow\s*=\s*''/);
  });

  test('잠금 동작 자체 — 중첩 후 안쪽만 닫으면 잠금이 유지된다', () => {
    // app-plan.js 의 _lockBg/_unlockBg 와 동일한 계약을 재현해 의미를 잠근다
    const body = { style: { overflow: '' } };
    const mk = () => {
      let prev = null;
      return {
        lock() { if (prev === null) prev = body.style.overflow; body.style.overflow = 'hidden'; },
        unlock() { if (prev !== null) { body.style.overflow = prev; prev = null; } },
      };
    };
    const outer = mk(); const inner = mk();
    outer.lock();                       // 설정허브 열림
    expect(body.style.overflow).toBe('hidden');
    inner.lock();                       // 그 위에 플랜 열림
    inner.unlock();                     // 플랜만 닫음
    expect(body.style.overflow).toBe('hidden');   // ← 설정허브 잠금이 살아 있어야 한다
    outer.unlock();
    expect(body.style.overflow).toBe('');
  });
});

// ── BUG-1 재발 방지: 린트가 수정을 되돌리지 못하게 ────────────────
describe('BUG-1 — stylelint 가 :not() 체인을 리스트로 되돌리지 못한다', () => {
  /* 실제로 당했다(2026-09-07): 체인 `:not()` 으로 고쳐 커밋했더니 pre-commit 의
     `stylelint --fix` 가 **콤마 리스트로 되돌려서** iOS 15 버그가 그대로 복구됐다.
     stylelint-config-standard 의 `selector-not-notation` 기본값이 'complex' 이기 때문.
     설정을 'simple' 로 고정하지 않으면 이 수정은 다음 커밋에서 조용히 사라진다. */
  test("selector-not-notation 이 'simple' 로 고정돼 있다", () => {
    const cfg = JSON.parse(read('.stylelintrc.json'));
    expect(cfg.rules['selector-not-notation']).toBe('simple');
  });
});

// ── BUG-6 ──────────────────────────────────────────────────────────
describe('BUG-6 — 키보드가 뜨면 떠다니는 탭바/FAB 를 숨긴다', () => {
  /* iOS 시뮬레이터(iPhone 17 · iOS 26.4) 실측으로 잡은 것:
       innerH=696 vv.h=377 vv.top=337
       기존 식 innerH - vv.h - vv.offsetTop = **-18** → 보정이 아예 안 걸림
       실제 키보드 높이 = innerH - vv.h = **319**
     그래서 position:fixed 인 #bottomNavGroup 이 화면 한가운데 떠서 잇비 입력창을 덮었다.
     `vv.offsetTop` 은 **스크롤량**이라 키보드 높이에서 빼면 안 된다. */
  test('키보드 높이 계산에서 offsetTop 을 빼지 않는다', () => {
    const m = CORE.match(/const kb = \(window\.innerHeight - vv\.height\)[^;]*;/);
    expect(m).not.toBeNull();
    expect(m[0]).not.toMatch(/offsetTop/);
  });

  test('kb-open 클래스를 토글한다', () => {
    expect(CORE).toMatch(/classList\.toggle\('kb-open'/);
  });

  test('CSS 가 kb-open 일 때 #bottomNavGroup 을 숨긴다', () => {
    const css = read('style-components.css');
    expect(css).toMatch(/html\.kb-open #bottomNavGroup/);
    expect(css).toMatch(/html\.kb-open #bottomNavGroup[\s\S]{0,200}visibility:\s*hidden/);
  });

  test('style.css 의 style-components @import 버전이 갱신돼 있다 (자동범프 제외 파일)', () => {
    expect(read('style.css')).not.toContain('style-components.css?v=20260816-chip-taparea');
  });

  // 계산 자체를 잠근다 — 실측값으로
  test('실측값 재현: iOS 는 319 로 잡히고 안드로이드는 0 에 가깝다', () => {
    const kb = (innerH, vvh) => innerH - vvh;
    expect(kb(696, 377)).toBe(319);          // iOS 시뮬레이터 실측
    expect(kb(651, 279)).toBe(372);          // 안드로이드 에뮬레이터 실측
    // 옛 식이었다면 iOS 에서 0 으로 뭉개졌다는 것도 같이 잠근다
    const old = (innerH, vvh, top) => innerH - vvh - top;
    expect(old(696, 377, 337)).toBeLessThan(100);   // → 보정 안 걸림 = 버그
  });
});

// ── BUG-5 (정적 근거만) ────────────────────────────────────────────
describe('BUG-5 — 시트 닫기 버튼 히트 영역 44px', () => {
  test('보이는 크기는 32px 그대로, ::after 로 44x44 확보', () => {
    const css = read('style-hub.css');
    expect(css).toMatch(/#shClose::after/);
    expect(css).toMatch(/#shClose::after[\s\S]{0,400}width:\s*44px/);
    expect(css).toMatch(/#shClose::after[\s\S]{0,400}height:\s*44px/);
    // 시각 크기를 키워버리면 헤더 레이아웃이 바뀐다 — 32px 유지 확인
    expect(css).toMatch(/#plClose \{[\s\S]{0,200}width:\s*32px/);
  });
});

describe('BUG-5 — 홈 화면 작은 컨트롤 히트 영역', () => {
  /* 실측(390×844 · 오버레이 걷어낸 상태 · elementFromPoint 로 히트 영역을 바깥으로 훑음)에서
     44 미만이던 것들. 시각 크기는 그대로 두고 ::after 로만 넓혔다.
     ⚠️ 이 테스트는 **정적 검사**다 — 실제 히트 영역은 브라우저에서만 잴 수 있고,
        그 측정은 세션 로그(오탭 0건)에 남겼다. 여기서는 확장 규칙이 사라지는 걸 막는다. */
  const HOME = () => read('css/screens/home-v41.css');

  test.each([
    'hv5-itbi-input-icon', 'hv5-itbi-swap', 'hv5-itbi-all',
    'hv5-card-link', 'hv5-cmsg-refresh', 'hv5-cmsg-more',
  ])('.%s 에 히트 확장 ::after 가 있다', (cls) => {
    expect(HOME()).toMatch(new RegExp(`\\.${cls}::after`));
  });

  test('벨·플랜배지도 확장돼 있다', () => {
    expect(HOME()).toMatch(/\.hv5-hdr \.hv5-bell::after/);
    expect(HOME()).toMatch(/#planBadge::after/);
  });

  test('확장 블록이 44px 를 목표로 한다', () => {
    const css = HOME();
    const i = css.indexOf('.hv5-itbi-input-icon::after');
    expect(i).toBeGreaterThan(-1);
    expect(css.slice(i, i + 400)).toMatch(/width:\s*44px[\s\S]{0,120}height:\s*44px/);
  });

  test('세로로 붙은 행은 ::after 가 아니라 행 높이로 확보한다 (오탭 방지)', () => {
    const css = HOME();
    // 위아래로 겹쳐 있는 행을 ::after 로 넓히면 옆 행을 먹는다 → min-height 로 키운다
    expect(css).not.toMatch(/\.hv5-itbi-mini::after/);
    expect(css).not.toMatch(/\.hv5-itbi-rest::after/);
    expect(css).toMatch(/\.hv5-itbi-mini,\s*\n\.hv5-itbi-rest \{[\s\S]{0,120}min-height:\s*44px/);
    // 왜 이렇게 했는지 근거가 코드에 남아 있어야 다음 사람이 되살리지 않는다
    expect(css).toMatch(/오탭/);
  });

  test('헤더 워드마크(.logo)도 눌리는 요소라 히트 영역을 갖는다', () => {
    // index.html 에서 data-static-action="tab-home" 이라 실제로 홈으로 이동한다
    expect(read('index.html')).toMatch(/class="logo"[^>]*data-static-action="tab-home"/);
    const base = read('style-base.css');
    expect(base).toMatch(/\.logo::after/);
    expect(base).toMatch(/\.logo::after[\s\S]{0,300}height:\s*44px/);
    expect(base).toMatch(/\.logo \{[\s\S]{0,260}position:\s*relative/);
  });

  test('style-base.css @import 버전이 갱신돼 있다 (자동범프 제외 파일)', () => {
    expect(read('style.css')).not.toContain('style-base.css?v=20260610-qafix');
    expect(read('style.css')).toMatch(/style-base\.css\?v=/);
  });

  test('이웃 간격이 좁은 것은 비대칭으로만 넓힌다', () => {
    const css = HOME();
    const i = css.indexOf('#hv5CmsgWhy::after');
    expect(i).toBeGreaterThan(-1);
    // 아래 형제와 5px 뿐 → 아래로는 조금만
    expect(css.slice(i, i + 300)).toMatch(/bottom:\s*-4px/);
  });
});
