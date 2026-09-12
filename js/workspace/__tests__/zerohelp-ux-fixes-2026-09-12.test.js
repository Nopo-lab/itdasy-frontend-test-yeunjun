/* 🔴 [2026-09-12 · ZERO-HELP 첫사용자 게이트 라이브 실측] 첫 원장이 막히거나 헷갈리던 4곳.
 * 모두 LIVE(20260911-2148-739a14e / 07f0057, 실계정 user 4, 606×717)에서 재현·측정했다.
 */
const fs = require('fs');
const path = require('path');
const FLOW = fs.readFileSync(path.join(__dirname, '../workspace-v2-flow.js'), 'utf8');
const LOADER = fs.readFileSync(path.join(__dirname, '../../loader.js'), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

describe('§7 시술 미선택도 질문과 **같은 방식**으로 막는다', () => {
  /* 실측: 질문 3개는 버튼을 잠가서 막는데(라벨 "질문에 먼저 답해주세요") 시술만 달랐다.
     genDisabled=false · 라벨 "게시글 만들기" → 클릭 → 토스트로 거절. 왜 못 가는지 누르기 전엔 모른다. */
  function ctaFn() {
    const src = strip(FLOW);
    const i = src.indexOf('function _capWizCtaHtml()');
    expect(i).toBeGreaterThan(0);
    const j = src.indexOf('\n  function ', i + 10);
    const block = src.slice(i, j < 0 ? i + 1200 : j);
    expect(block.length).toBeLessThan(1200);
    return block;
  }

  test('시술이 비면 잠긴 CTA 를 내보낸다(이유를 버튼에 적는다)', () => {
    const b = ctaFn();
    expect(b).toMatch(/if \(!String\(d\.service \|\| ''\)\.trim\(\)\)/);
    expect(b).toMatch(/capwiz__cta--dis/);
    expect(b).toMatch(/data-fl-cgenlock="service"/);
  });

  test('잠금 검사는 "게시글 만들기" 버튼을 만들기 **전에** 있다', () => {
    const b = ctaFn();
    const lockAt = b.indexOf("data-fl-cgenlock=\"service\"");
    const genAt = b.indexOf('data-fl-cgen>');
    expect(lockAt).toBeGreaterThan(-1);
    expect(genAt).toBeGreaterThan(lockAt);
  });

  test('잠금 핸들러가 사유를 구분한다 — 시술이면 질문 안내를 띄우지 않는다', () => {
    const src = strip(FLOW);
    const i = src.indexOf("t.closest('[data-fl-cgenlock]')");
    expect(i).toBeGreaterThan(0);
    const seg = src.slice(i, i + 900);
    expect(seg).toMatch(/getAttribute\('data-fl-cgenlock'\) === 'service'/);
    const svcAt = seg.indexOf("=== 'service'");
    const qAt = seg.indexOf('질문에 먼저 답해주세요');
    expect(svcAt).toBeGreaterThan(-1);
    expect(qAt).toBeGreaterThan(svcAt);   // 시술 분기가 먼저 return 한다
  });
});

describe('§6 토스트가 화면에 없는 것을 가리키지 않는다', () => {
  /* 실측: 토스트는 "없으면 + 추가로 만들 수 있어요" 라는데 시술 줄엔 시술명 칩 8개뿐.
     `+ 추가` 는 **관리 모드 안**에만 있고, 관리는 **업종을 고른 뒤에야** 나타난다(3단계). */
  test('옛 문구("+ 추가로 만들 수 있어요")가 남아 있지 않다', () => {
    // 주석엔 옛 문구가 근거로 남아 있다 — **코드**에서 사라졌는지만 본다.
    expect(strip(FLOW)).not.toMatch(/없으면 \+ 추가로 만들 수 있어요/);
  });

  test('새 문구는 실제 경로(업종 → 관리)를 말한다', () => {
    const src = strip(FLOW);
    const m = src.match(/toast\('([^']*시술[^']*)'\)/g) || [];
    const joined = m.join('|');
    expect(joined).toMatch(/업종/);
    expect(joined).toMatch(/관리/);
  });

  test('`+ 추가` 칩이 정말로 관리 모드 안에만 있다(문구의 전제 확인)', () => {
    const src = strip(FLOW);
    const i = src.indexOf('data-fl-svctagadd');
    expect(i).toBeGreaterThan(0);
    // 그 칩을 내보내는 삼항의 조건이 manage 다
    expect(src.slice(Math.max(0, i - 400), i)).toMatch(/manage \?/);
  });
});

describe('§5 사진 편집 입구가 편집기의 주력 도구를 말한다', () => {
  /* 실측(persona A): "사진에 글자 넣고 싶다" 는 원장이 이 줄을 알아볼 단서가 없었다 —
     부제가 "필터 · 자르기 · 밝기 · 대비" 라 글자·스티커가 한 글자도 없었다. */
  test('부제에 글자·스티커가 들어간다', () => {
    const src = strip(FLOW);
    const i = src.indexOf("_setRow('storyedit'");
    expect(i).toBeGreaterThan(0);
    const row = src.slice(i, i + 200);
    expect(row).toMatch(/글자/);
    expect(row).toMatch(/스티커/);
  });

  test('옛 부제가 남아 있지 않다', () => {
    expect(strip(FLOW)).not.toMatch(/'필터 · 자르기 · 밝기 · 대비'/);
  });
});

describe('§8 미리보기 칸의 비율을 **추측하지 않는다**', () => {
  /* 실측: 이 <img> 는 로드 전 높이 0 이라 디코드 시 아래가 347px 밀린다(P3, 미수정).
     한 번 `aspect-ratio: 4/5` 로 칸을 예약했다가 되돌렸다 —
     `d.templateOutput` 이 원본 사진(1920×1280 = 1.5:1)일 때도 있어
     칸만 4:5 로 잡히고 그 아래 **300px 빈 흰칸**이 남았다(라이브에서 눈으로 확인).
     비율을 모르면서 고정하면 더 나빠진다는 걸 가드로 박아 둔다. */
  test('wsl-cap-preview 에 하드코딩된 aspect-ratio 를 넣지 않는다', () => {
    const src = strip(FLOW);
    const i = src.indexOf('wsl-cap-preview');
    expect(i).toBeGreaterThan(0);
    const seg = src.slice(Math.max(0, i - 300), i + 260);
    expect(seg).not.toMatch(/aspect-ratio:/);
    expect(seg).not.toMatch(/_capAr/);
  });
});

describe('§12 누르지도 않았는데 뜨는 "준비 중" 안내', () => {
  /* 실측: 새로고침 직후 클릭 0회인데 "사진 도구 준비 중…" 이 매번 떴다.
     부팅이 마지막 탭을 복원하며 앱이 스스로 initWorkshopTab() 을 부르기 때문. */
  test('스텁 토스트가 사용자 조작 여부를 본다', () => {
    const src = strip(LOADER);
    const i = src.indexOf('const stub = function ()');
    expect(i).toBeGreaterThan(0);
    const seg = src.slice(i, i + 900);
    expect(seg).toMatch(/const byUser = _userGesture\(\);/);
    expect(seg).toMatch(/if \(byUser && window\.showToast\) window\.showToast\(toastMsg/);
    // 무조건 띄우던 옛 형태가 남아 있으면 안 된다
    expect(seg).not.toMatch(/^\s*if \(window\.showToast\) window\.showToast\(toastMsg/m);
  });

  test('실패 안내도 같은 기준을 쓴다(앱이 부른 호출엔 안 띄운다)', () => {
    const src = strip(LOADER);
    const i = src.indexOf('화면을 불러오지 못했어요');
    expect(i).toBeGreaterThan(0);
    expect(src.slice(Math.max(0, i - 120), i)).toMatch(/byUser && window\.showToast/);
  });

  test('_userGesture 를 실제로 돌린다 — 조작 직후 true, 오래 지나면 false', () => {
    const src = strip(LOADER);
    const i = src.indexOf('function _userGesture()');
    expect(i).toBeGreaterThan(0);
    const body = src.slice(i, src.indexOf('\n  }', i) + 4);
    // eslint-disable-next-line no-new-func
    const make = (nav, last) => new Function('navigator', '_lastGesture', body + '; return _userGesture;')(nav, last);
    const noAct = {};
    expect(make(noAct, Date.now())()).toBe(true);              // 방금 만졌다
    expect(make(noAct, Date.now() - 10000)()).toBe(false);     // 부팅 중 앱이 스스로 부른 호출
    expect(make({ userActivation: { isActive: true } }, 0)()).toBe(true);
    expect(make({ userActivation: { isActive: false } }, 0)()).toBe(false);
  });
});

describe('§10b 전체 보이기를 고르면 미리보기에서 사진이 반복되던 것', () => {
  /* 🔴 내가 지난 라운드에 넣은 '사진 채우기' 가 드러낸 결함.
     `.wsc-one` 은 `background-size` 를 _fitOf() 로 쓰는데 `background-repeat` 선언이 없었다.
     CSS 기본값이 repeat 라, 예전처럼 늘 cover 일 때는 안 보이다가 **contain 이 도달 가능해지자**
     가로 사진이 세로로 3번 깔렸다(실측 2026-09-12: manicure 1.5:1 → 칸 298×373, repeat).
     원장이 '전체 보이기' 를 고른 바로 그 화면에서 자기 사진이 타일로 보인다. */
  const CSS = fs.readFileSync(path.join(__dirname, '../../../css/workspace-hyper.css'), 'utf8');
  const LAYOUT = fs.readFileSync(path.join(__dirname, '../flow/layout.js'), 'utf8');

  function rule(sel) {
    const i = CSS.indexOf(sel + ' {');
    expect(i).toBeGreaterThan(-1);
    const j = CSS.indexOf('}', i);
    return CSS.slice(i, j);
  }

  test('.wsc-one 에 background-repeat: no-repeat 가 있다', () => {
    expect(rule('.wsc-one')).toMatch(/background-repeat:\s*no-repeat/);
  });

  test('그 칸의 background-size 는 여전히 선택값(_fitOf)로 바뀐다 — 기능은 그대로', () => {
    const src = strip(LAYOUT);
    const i = src.indexOf('class="wsc-one"');
    expect(i).toBeGreaterThan(0);
    expect(src.slice(i, i + 220)).toMatch(/background-size:'\s*\+\s*_fitOf\(\)/);
  });

  test('contain 을 쓰는 다른 배경들엔 원래 no-repeat 가 있다(이 선언이 표준이라는 근거)', () => {
    const FLOWCSS = fs.readFileSync(path.join(__dirname, '../../../css/workspace-v2-flow.css'), 'utf8');
    const HOMECSS = fs.readFileSync(path.join(__dirname, '../../../css/workspace-home-c.css'), 'utf8');
    expect(FLOWCSS).toMatch(/\.ed-photo[^}]*background-size:\s*contain[^}]*background-repeat:\s*no-repeat/);
    expect(HOMECSS).toMatch(/\.wshc-lb__slide[^}]*background-size:\s*contain[^}]*background-repeat:\s*no-repeat/);
  });
});
