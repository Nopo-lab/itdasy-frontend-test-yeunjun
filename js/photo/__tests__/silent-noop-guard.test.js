/* 🔴 "테스트는 통과하는데 안 도는 코드" 상주 감시.
 *
 * 2026-08-22~23 에 이 종류로 **5번** 물렸다. 공통점: 문법도 맞고 유닛테스트도 통과하고
 * 배포도 성공한다. 그냥 안 돌 뿐이고, 아무 데서도 안 걸린다.
 *   · rollout 을 켰는데 편집기가 다른 스위치를 보고 있었다
 *   · 값을 읽는 코드만 있고 대입하는 코드가 없었다(27샵 실측값이 안 쓰임)
 *   · manifest 등록 스크립트가 조용히 실패하고 성공을 출력했다
 *   · 구현 없는 죽은 스위치가 남아 있었다
 *   · 출력 필드 이름이 갈렸다(`imageAdjustments` 읽기 / `adjust` 쓰기)
 *
 * 사람 눈으로는 못 본다. 기계가 매번 보게 한다.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../..');
const R = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const planSrc = R('js/photo/edit-plan.js');
const edSrc = R('js/itd-editor/itd-editor.js');
const html = R('index.html');
const both = planSrc + '\n' + edSrc;

/* [2026-09-03] manifest 를 **못 읽었을 때 조용히 오판**하는 걸 막는다.
   실제 사고(2026-09-02 CI): 이 가드가 "js/photo 16개가 전부 미등록" 이라고 실패했다.
   커밋 내용은 멀쩡했고(원격 == 로컬, 16개 전부 참조 있음) 같은 커밋을 깨끗한 worktree 에서
   CI 순서 그대로 돌리면 통과했다 — 즉 **manifest 를 제대로 못 읽은 상태에서 "전부 미등록"**
   이라는 엉뚱한 결론을 냈다. 원인 진단에 시간을 다 썼다.
   → manifest 가 쓸 수 없는 상태면 "전부 미등록" 이 아니라 **그 사실로 즉시 실패**시킨다.

   그리고 참조 검사는 **주석을 지우고** 한다. 안 그러면 주석에 적힌 경로가
   "등록됨" 으로 통과한다(설명문이 가드를 뚫는 그 패턴). */
const MIN_MANIFEST_REFS = 50;   // 실측 176+. 절반 이하로 떨어지면 파일이 깨진 것이다.
function stripJsComments(src) {
  return String(src).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}
function assertManifestUsable(src, label) {
  if (typeof src !== 'string') throw new Error('manifest 읽기 실패(' + label + '): 문자열이 아님');
  if (!src.trim()) throw new Error('manifest 가 비어 있음(' + label + ') — "전부 미등록" 으로 오판하면 안 된다');
  const code = stripJsComments(src);
  const refs = code.match(/js\/[\w./-]+\.js/g) || [];
  if (refs.length < MIN_MANIFEST_REFS) {
    throw new Error('manifest 가 손상된 듯(' + label + '): js/ 참조 ' + refs.length +
      '개 < 최소 ' + MIN_MANIFEST_REFS + ' — 이 상태로는 등록 여부를 판정할 수 없다');
  }
  return code;
}
// 실제 사용본 — 주석 제거 + 사용 가능 검증을 통과한 것만 쓴다
const manifest = assertManifestUsable(R('js/load-groups.js'), 'js/load-groups.js');
const htmlCode = stripJsComments(html);

describe('[상주 감시] 선언만 되고 안 쓰이는 스위치', () => {
  test('SCOPE 키는 전부 런타임에서 읽힌다', () => {
    const scope = /var SCOPE = \{([\s\S]*?)\n {2}\};/.exec(planSrc)[1];
    const keys = [...scope.matchAll(/^\s*(\w+):/gm)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(3);
    const unused = keys.filter((k) => !new RegExp('SCOPE\\.' + k + '\\b').test(both));
    expect(unused).toEqual([]);
  });
});

describe('[상주 감시] 읽기만 하고 안 채우는 필드', () => {
  test('plan.* 참조 필드에는 반드시 대입부가 있다', () => {
    const fields = [...new Set([...both.matchAll(
      /plan\.(typography\.\w+|textAnchor|imageAdjustments|crop|stickers|personalization)/g)]
      .map((m) => m[1]))];
    const orphans = fields.filter((f) =>
      !new RegExp('plan\\.' + f.replace('.', '\\.') + '\\s*=').test(planSrc));
    expect(orphans).toEqual([]);
  });
});

describe('[상주 감시] manifest 자체가 쓸 수 있는 상태인가', () => {
  // 이게 깨지면 아래 '전부 미등록' 판정은 전부 무의미하다. 그래서 먼저 본다.
  test('정상 manifest 는 통과한다', () => {
    expect(() => assertManifestUsable(R('js/load-groups.js'), 'real')).not.toThrow();
    expect(manifest.length).toBeGreaterThan(0);
  });
  test('빈 manifest 는 HARD FAIL', () => {
    expect(() => assertManifestUsable('', 'empty')).toThrow(/비어 있음/);
    expect(() => assertManifestUsable('   \n  ', 'blank')).toThrow(/비어 있음/);
  });
  test('manifest 파일이 없으면 HARD FAIL (읽기 단계에서 터진다)', () => {
    expect(() => R('js/__no_such_manifest__.js')).toThrow();
  });
  test('잘린/손상된 manifest 는 HARD FAIL — "전부 미등록" 으로 오판하지 않는다', () => {
    const truncated = R('js/load-groups.js').slice(0, 200);
    expect(() => assertManifestUsable(truncated, 'truncated')).toThrow(/손상/);
  });
  test('문자열이 아니면 HARD FAIL', () => {
    expect(() => assertManifestUsable(null, 'null')).toThrow(/문자열이 아님/);
    expect(() => assertManifestUsable(undefined, 'undef')).toThrow(/문자열이 아님/);
  });
  test('주석에만 적힌 경로는 등록으로 안 쳐준다', () => {
    const fake = R('js/load-groups.js') + '\n// js/photo/__ghost_module__.js\n';
    const code = assertManifestUsable(fake, 'commented');
    expect(code).not.toMatch(/__ghost_module__/);
  });
});

describe('[상주 감시] 등록·호출', () => {
  test('js/photo 모듈은 전부 로더가 부른다', () => {
    const files = fs.readdirSync(path.join(ROOT, 'js/photo')).filter((f) => f.endsWith('.js'));
    const missing = files.filter((f) => {
      const ref = 'js/photo/' + f;
      return !manifest.includes(ref) && !htmlCode.includes(ref);
    });
    expect(missing).toEqual([]);
  });

  test('전역으로 노출한 모듈은 실제 소비처가 있다', () => {
    const globals = { 'PhotoContext': 2, 'ContentIntent': 2, 'TextReadability': 2,
      'DraftQuality': 2, 'DraftPersonalization': 2, 'EditPlan': 2, 'CategoryPrior': 2 };
    const walk = (d, acc) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) { if (e.name !== '__tests__' && e.name !== 'node_modules') walk(p, acc); continue; }
        if (e.name.endsWith('.js')) acc.push(fs.readFileSync(p, 'utf8'));
      }
      return acc;
    };
    const all = walk(path.join(ROOT, 'js'), []).join('\n');
    const uncalled = Object.keys(globals).filter((g) =>
      (all.match(new RegExp('window\\.' + g + '\\b', 'g')) || []).length < globals[g]);
    expect(uncalled).toEqual([]);
  });
});

describe('[상주 감시] rollout 이 실제 게이트에 연결돼 있다', () => {
  test('편집기가 autoDraftOn(rollout 경유)을 본다', () => {
    expect(edSrc).toMatch(/window\.EditPlan\.autoDraftOn && window\.EditPlan\.autoDraftOn\(\)/);
  });

  test('autoDraftOn 이 rollout 버킷을 실제로 읽는다', () => {
    expect(planSrc).toMatch(/return _inRollout\(\);/);
    expect(planSrc).toMatch(/function _inRollout/);
    expect(planSrc).toMatch(/_bucket\(String\(t\)\) < pct/);
  });
});

describe('[상주 감시] 계측이 실제로 영속된다', () => {
  const qSrc = R('js/photo/draft-quality.js');

  test('카운터를 저장한다 — 세션 메모리만이면 20건에 영원히 도달 못 한다', () => {
    expect(qSrc).toMatch(/localStorage\.setItem\(LS_PREFIX/);
    expect(qSrc).toMatch(/function _load\(\)/);
  });

  test('저장 실패를 조용히 넘기지 않는다', () => {
    expect(qSrc).toMatch(/_writeFail\+\+/);
    expect(qSrc).toMatch(/out\.writeFailures = _writeFail;/);
  });

  test('QA 세션이 실사용 지표에 안 섞인다', () => {
    expect(qSrc).toMatch(/function _isProduction/);
    expect(qSrc).toMatch(/if \(!_isProduction\(\)\) \{ _cur = null; return null; \}/);
  });
});

describe('🔴 학습한 자리에서 다시 꺼내 쓸 수 있는가 (2026-08-23 브라우저 실측)', () => {
  /* 증상: WMPrefs 엔 원장이 고른 center/#111111 이 분명히 있는데 EditPlan 은 인스타 값을 냈다.
     원인 둘 —
       ① `S.planCategory` 를 **읽기만 하고 아무도 대입하지 않았다** → category 가 늘 null
       ② 학습은 canonicalContext(service|photoCount|kind|ba)로 하는데 조회는 그 일부만 넘겨서
          contextKey 가 어긋났다. exact 를 못 찾고, global fallback 은 context 2개·memory 2개를
          요구하니 원장이 아무리 편집해도 계획엔 안 보인다.
     둘 다 "테스트는 통과하는데 실사용에선 안 도는" 그 부류다. */
  const fs = require('fs');
  const path = require('path');
  const ROOT = path.resolve(__dirname, '../../..');
  const rd = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

  test('편집기가 planCategory 를 실제로 대입한다 (읽기만 하지 않는다)', () => {
    const src = rd('js/itd-editor/itd-editor.js');
    expect(src).toMatch(/planCategory:\s*\(opts\.category/);      // 대입부
    expect(src).toMatch(/S\.planCategory/);                        // 읽는 곳
  });

  test('편집기가 학습에 쓴 context 를 EditPlan 에도 넘긴다', () => {
    const src = rd('js/itd-editor/itd-editor.js');
    expect(src).toMatch(/wmContext:\s*opts\.wmContext/);           // 열 때 보관
    expect(src).toMatch(/var _wc = \(S && S\.wmContext\)/);        // 계획 만들 때 사용
    ['service', 'kind', 'hasBeforeAfter'].forEach((k) => {
      expect(src).toMatch(new RegExp(`${k}:\\s*_wc\\.${k}`));
    });
  });

  test('EditPlan 이 contextKey 4요소를 빠짐없이 아래로 넘긴다', () => {
    const src = rd('js/photo/edit-plan.js');
    // contextKey = service|photoCount|kind|ba — 하나라도 빠지면 학습한 자리와 다른 키가 된다
    const m = src.match(/var _pctxKeys = \{[\s\S]*?\};/);
    expect(m).toBeTruthy();
    ['service', 'photoCount', 'kind', 'hasBeforeAfter'].forEach((k) => {
      expect(m[0]).toContain(k + ':');
    });
    // 개인화도 **같은** 객체를 써야 한다 — 따로 조립하면 또 어긋난다
    expect(src).toMatch(/DraftPersonalization\.resolve\(_pctxKeys\)/);
    expect(src).toMatch(/ShopBaseline\.resolve\(_pctxKeys\)/);
  });
});
