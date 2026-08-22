/* [STAGE C] 자동 초안 계약 — 실제 편집을 바꾸는 코드이므로 안전조건을 강하게 잠근다 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const ep = fs.readFileSync(path.join(ROOT, 'js/photo/edit-plan.js'), 'utf8');
const ed = fs.readFileSync(path.join(ROOT, 'js/itd-editor/itd-editor.js'), 'utf8');

describe('[STAGE C] 타이포 — 빈 축만 채우고, 바꾼 뒤 다시 잰다', () => {
  test('🔑 순서: 타이포 → 렌더 → 재측정 → Safety', () => {
    /* 타이포가 글자 박스 크기를 바꾸므로, 바꾸기 전 rect 로 Safety 를 정하면 틀린 자리로 옮긴다.
       compute → _applyPlanTypography → metaGeometry → _planSafetyPass 순서를 소스로 잠근다. */
    const i1 = ed.indexOf('_applyPlanTypography(plan)');
    const i2 = ed.indexOf('var geoms = metaGeometry()', i1);
    const i3 = ed.indexOf('_planSafetyPass(geoms', i2);
    expect(i1).toBeGreaterThan(0);
    expect(i2).toBeGreaterThan(i1);
    expect(i3).toBeGreaterThan(i2);
  });

  /* 🔴 이 테스트는 **틀린 동작을 잠그고 있었다**(2026-08-22 교체).
     "값이 비었으면 채운다" 로 잠가놨는데, 편집기는 새 텍스트에 흰색·가운데정렬·40px 를
     **미리 채워서** 만든다. 그래서 이 축들은 영영 안 채워졌다 — 통과하는데 동작은 안 하는
     상태였다. BrandKit 에서 이미 같은 실수를 했다(get() 이 저장 안 해도 기본색을 돌려줬다).
     → 이제 값이 아니라 **원장이 골랐는지**(`_own`)를 본다. 도장은 고르는 순간 찍힌다. */
  test('원장이 고른 값을 덮지 않는다 — 판단 기준은 값이 아니라 _own', () => {
    expect(ed).toMatch(/function _own\(L, k\)/);
    expect(ed).toMatch(/var own = L\._own \|\| \{\};/);
    ['font', 'color', 'align', 'size'].forEach((k) => {
      expect(ed).toMatch(new RegExp('!own\\.' + k));
    });
    // 값이 비었는지로 판단하던 옛 검사가 되살아나면 안 된다
    expect(ed).not.toMatch(/L\.color == null \|\| L\.color === ''/);
  });

  test('지원하지 않는 폰트 키는 무시한다 (외부 문자열 직접 주입 금지)', () => {
    expect(ed).toMatch(/var f = fontByKey\(t\.font\.value\);/);
    expect(ep).not.toMatch(/fontFamily|font-family/);   // EditPlan 은 키만 다룬다
  });

  test('역할 레이어·작업기억 레이어는 건드리지 않는다', () => {
    const fn = ed.slice(ed.indexOf('function _applyPlanTypography'), ed.indexOf('function _applyPlanSafety'));
    expect(fn).toMatch(/if \(L\.role\) return;/);
    expect(fn).toMatch(/if \(L\._src === 'wm'\) return;/);
  });

  test('🔑 applyFont/Color/Align 을 쓰지 않는다 — 학습 신호가 섞인다', () => {
    /* 그 함수들은 활성 레이어에만 동작하고 WMSignals 로 학습 신호를 쏜다.
       우리가 얹은 값이 "원장이 고른 값" 으로 학습되면 자기강화가 된다. */
    const fn = ed.slice(ed.indexOf('function _applyPlanTypography'), ed.indexOf('function _applyPlanSafety'));
    expect(fn).not.toMatch(/applyFont\(|applyColor\(|applyAlign\(/);
    expect(fn).not.toMatch(/_sig\(/);
  });

  test('얹은 값은 _src:plan 으로 표시된다 (자기강화 차단)', () => {
    expect(ed).toMatch(/L\._src = L\._src \|\| 'plan'/);
  });

  test('플래그가 꺼져 있으면 아무것도 하지 않는다', () => {
    expect(ed).toMatch(/EditPlan\.flagOn\(\)\)\) return;/);
    expect(ep).toMatch(/window\.ITDASY_EDIT_PLAN === true/);
  });
});
