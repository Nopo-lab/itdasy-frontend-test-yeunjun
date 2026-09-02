/**
 * @jest-environment jsdom
 */
/* PC 사이드바로 화면을 바꿀 때 **이전 화면이 반드시 닫힌다**.
 *
 * 왜 테스트로 잠그나 (2026-09-02 PC/모바일 전수감사에서 실제로 터진 것):
 *   `#integrationsHubSheet`(연결된 서비스)가 `_closeAllHubs()` 목록에 빠져 있었다.
 *   PC 에서 시트는 z 950, 사이드바는 z 10000 → **사이드바는 눌리는데 화면은 그대로**.
 *   새 화면은 시트 뒤에서 열리므로 보이지 않고, 활성 표시만 옮겨다녀 더 헷갈렸다.
 *   모바일은 시트가 탭바를 덮어 애초에 누를 수 없어 증상이 안 났다 → **PC 전용 결함**이라
 *   모바일만 보고 넘어가면 영영 못 잡는다.
 *
 * 여기서 잠그는 것:
 *   ① style-responsive.css 가 "PC 오프셋" 을 걸어준 시트 id 는 전부 사이드바가 닫아야 한다
 *      (= 새 풀스크린 시트를 만들고 등록을 빠뜨리면 여기서 잡힌다)
 *   ② `_closeAllHubs()` 는 그 시트들의 close() 를 **부르면 안 된다**
 *      — 사이드바는 "닫고 곧바로 연다" 라서 SheetAnim.close 의 220ms 예약 타이머가
 *        새로 연 시트를 뒤늦게 display:none 으로 덮는다(실측으로 한 번 자폭했다)
 *   ③ 실제 DOM 에서 닫히는지 — 문자열 검사만으로는 "적어만 두고 안 도는" 코드를 못 잡는다
 *   ④ 사이드바 활성 표시(_SCREEN_MAP)가 그 시트들을 안다
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const UNIFIER = read('app-side-nav-unifier.js');
const RESPONSIVE_CSS = read('style-responsive.css');

/** style-responsive.css 의 PC(≥768px) 오프셋 셀렉터에 등장하는 #id 전부 */
function pcOffsetIds() {
  const ids = new Set();
  // `inset: ... var(--side-nav-width)` / `left: ... var(--side-nav-width)` 를 주는 규칙의 셀렉터만 본다
  const re = /([^{}]+)\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(RESPONSIVE_CSS))) {
    const [, selector, body] = m;
    if (!/var\(--side-nav-width\)/.test(body)) continue;
    for (const idm of selector.matchAll(/#([A-Za-z][\w-]*)/g)) ids.add(idm[1]);
  }
  return [...ids];
}

/** 그 id 가 실제로 코드에 존재하는가 (죽은 CSS 셀렉터는 제외해야 한다) */
function idExistsInApp(id) {
  const files = fs.readdirSync(ROOT).filter((f) => /\.(js|html)$/.test(f));
  const needles = [`id = '${id}'`, `id="${id}"`, `id = "${id}"`, `getElementById('${id}')`];
  return files.some((f) => {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    return needles.some((n) => src.includes(n));
  });
}

describe('사이드바 이동 시 이전 화면 종료 — 등록 누락 가드', () => {
  /* ⚠️ "파일 어딘가에 id 문자열이 있으면 통과" 로 만들면 안 된다 —
        _SCREEN_MAP(활성 표시용)에도 같은 id 가 있어서, 정작 **닫는 코드**를 지워도 가드가 통과했다
        (2026-09-02 음성대조로 확인). 닫는 영역(SIDE_NAV_MANAGED_SHEETS + _closeAllHubs 본문)만 본다. */
  const CLOSING_REGION = (() => {
    const listStart = UNIFIER.indexOf('const SIDE_NAV_MANAGED_SHEETS');
    const bodyEnd = UNIFIER.indexOf('window._closeAllHubs = _closeAllHubs');
    expect(listStart).toBeGreaterThan(-1);
    expect(bodyEnd).toBeGreaterThan(listStart);
    // 주석은 지운다 — 안 지우면 "// integrationsHubSheet 추가함" 같은 **설명문 한 줄이**
    //   가드를 통과시킨다(음성 대조에서 실제로 그랬다). 도는 코드만 증거로 인정한다.
    return UNIFIER.slice(listStart, bodyEnd)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
  })();

  test('PC 오프셋이 걸린 시트는 전부 사이드바가 닫는다', () => {
    const missing = pcOffsetIds()
      .filter(idExistsInApp)                          // 죽은 CSS 셀렉터(#aiHubSheet 등)는 제외
      .filter((id) => !CLOSING_REGION.includes(id));  // 반드시 '닫는 코드' 안에 있어야 한다
    expect(missing).toEqual([]);
  });

  test('가드가 실제로 잡는다 — 닫는 코드에서 id 를 지우면 실패해야 한다 (음성 대조)', () => {
    const sabotaged = CLOSING_REGION.split('integrationsHubSheet').join('__removed__');
    const missing = pcOffsetIds()
      .filter(idExistsInApp)
      .filter((id) => !sabotaged.includes(id));
    expect(missing).toContain('integrationsHubSheet');
  });

  test('SIDE_NAV_MANAGED_SHEETS 의 시트는 close() 로 닫지 않는다 (220ms 재오픈 경합)', () => {
    // 사이드바 클릭 = 닫고 곧바로 연다. close() 의 예약 타이머가 새 시트를 덮는다.
    const forbidden = [
      'closeIntegrationsHub?.()',
      'closeDMConfirmQueue?.()',
      'closeDMThread?.()',
      'closeDMConversations?.()',
      'closeSettingsHub?.()',
      'closePlanPopup?.()',
    ];
    expect(forbidden.filter((f) => UNIFIER.includes(f))).toEqual([]);
  });

  test('_SCREEN_MAP 이 연결된 서비스·DM 하위화면을 안다 (활성 표시가 홈으로 튀지 않게)', () => {
    expect(UNIFIER).toMatch(/action:\s*'integrations'/);
    expect(UNIFIER).toContain('integrationsHubSheet');
    expect(UNIFIER).toContain('dmConfirmQueueSheet');
  });
});

describe('실제 DOM 동작 — 적어만 둔 게 아니라 진짜 닫히는가', () => {
  const SHEET_IDS = [
    'settingsHubSheet',
    'planPopup',
    'integrationsHubSheet',
    'dmConfirmQueueSheet',
    'dmConversationsSheet',
    'dmThreadSheet',
  ];

  let markClosed;

  beforeEach(() => {
    document.body.innerHTML = `
      <aside id="sideNav">
        <button class="ms-side__item" data-static-action="tab-home"><span class="ms-side__label">홈</span></button>
        <button class="ms-side__item" data-static-action="integrations"><span class="ms-side__label">연결된 서비스</span></button>
        <button class="ms-side__item" data-static-action="revenue"><span class="ms-side__label">매출관리</span></button>
      </aside>
      ${SHEET_IDS.map((id) => `<div id="${id}" style="display:flex"><div class="card"></div></div>`).join('')}
      <div id="slotPopup" class="dt-overlay dt-shown" style="display:flex"></div>
      <div class="subscreen-overlay is-open" id="fakeSub"><button class="ss-back"></button></div>
    `;
    // ⚠️ 유니파이어는 로드 시 window._markSheetClosed 를 **감싼다**. 그래서 window 쪽을 보면
    //    내 mock 이 아니라 래퍼가 잡힌다 — 원본 mock 을 따로 들고 검사한다.
    markClosed = jest.fn();
    window._markSheetClosed = markClosed;
    // eslint-disable-next-line no-new-func
    new Function(UNIFIER).call(window);
  });

  test('사이드바 항목을 누르면 열려 있던 시트가 전부 display:none 이 된다', () => {
    SHEET_IDS.forEach((id) => expect(document.getElementById(id).style.display).toBe('flex'));

    document.querySelector('[data-static-action="revenue"]').click();

    SHEET_IDS.forEach((id) => {
      expect(`${id}=${document.getElementById(id).style.display}`).toBe(`${id}=none`);
    });
  });

  test('.subscreen-overlay 하위화면은 공용 .ss-back 으로 일괄 닫힌다 (이름 등록 불필요)', () => {
    const back = jest.fn();
    document.querySelector('#fakeSub .ss-back').addEventListener('click', back);

    document.querySelector('[data-static-action="revenue"]').click();

    expect(back).toHaveBeenCalled();
  });

  test('history 스택 정리 신호가 나간다 (먹통 뒤로가기 누적 방지)', () => {
    document.querySelector('[data-static-action="revenue"]').click();
    const keys = markClosed.mock.calls.map((c) => c[0]);
    expect(keys).toEqual(expect.arrayContaining(['integrationsHub', 'dmConfirmQueue', 'dmThread', 'dmList']));
  });

  test('작업실 슬롯 편집 팝업도 닫힌다 (display + dt-shown 둘 다)', () => {
    const sp = document.getElementById('slotPopup');
    expect(sp.classList.contains('dt-shown')).toBe(true);

    document.querySelector('[data-static-action="revenue"]').click();

    expect(sp.style.display).toBe('none');
    expect(sp.classList.contains('dt-shown')).toBe(false);
  });

  test('카드에 남은 SheetAnim transform 도 되돌린다 (다음에 열 때 20px 내려간 채 뜨던 것)', () => {
    const card = document.querySelector('#integrationsHubSheet .card');
    card.style.transform = 'translateY(20px)';

    document.querySelector('[data-static-action="revenue"]').click();

    expect(card.style.transform).toBe('');
  });
});
