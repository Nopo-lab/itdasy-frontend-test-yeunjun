/**
 * @jest-environment jsdom
 */
'use strict';
/**
 * [flow-customers-bookings-01 · 2026-10-01] 모바일(390px) 고객 상세의 [정보수정] 모달이
 * 상세 시트 **뒤에** 그려져 보이지도 눌리지도 않던 것.
 *
 * 실측(Playwright 390px): 상세 → [정보수정] → 화면 변화 없음. DOM 엔 #custEditModal(z 10010) 이 있는데
 *   #customerDashSheet(z 10600) 가 위를 덮어 #cedName 위치의 elementFromPoint 가 상세의 버튼이고,
 *   #custEditSave 는 force 없이 클릭 불가(타임아웃). 같은 화면의 삭제 확인창(12000)은 정상.
 *
 * 원인: 핫픽스D#3 이 상세 시트를 10600 으로 올렸는데(잇비 10500 위) 같은 파일의 편집 모달은 10010 그대로.
 *   레이어 숫자가 파일마다 흩어져 있어 한쪽만 올라갔다.
 *
 * 수정: style-components.css :root 에 오버레이 z 사다리 토큰을 모으고, app-customer-dashboard.js 는
 *   `z-index:NNNN;z-index:var(--z-…, NNNN)` 꼴로 토큰을 읽는다(리터럴은 기존 가드 테스트가 파싱하므로 유지).
 *
 * 이 테스트는 문자열을 찾지 않는다 — 각 파일의 실제 cssText/CSS 에서 숫자를 **파싱**해 관계를 본다.
 */
const fs = require('fs');
const path = require('path');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

/** `anchor` 뒤 첫 `style.cssText = '…'` 리터럴 안의 z-index 숫자(들). */
function cssTextAfter(file, anchor) {
  const src = read(file);
  const at = src.indexOf(anchor);
  if (at < 0) throw new Error(`${file}: anchor "${anchor}" 없음 — 구조가 바뀌었으면 이 테스트부터 고쳐라`);
  const m = src.slice(at).match(/style\.cssText\s*=\s*'([^']*)'/);
  if (!m) throw new Error(`${file}: "${anchor}" 뒤에서 cssText 를 못 찾음`);
  return m[1];
}
function zLiteral(cssText) {
  const m = cssText.match(/z-index:\s*(\d+)/);
  if (!m) throw new Error('cssText 에 숫자 z-index 가 없다: ' + cssText);
  return parseInt(m[1], 10);
}
function zToken(cssText) {
  const m = cssText.match(/z-index:\s*var\(\s*(--z-[a-z-]+)\s*,\s*(\d+)\s*\)/);
  return m ? { name: m[1], fallback: parseInt(m[2], 10) } : null;
}
/** style-components.css :root 의 --z-* 토큰 전부 */
function rootZTokens() {
  const css = read('style-components.css');
  const out = {};
  const re = /(--z-[a-z-]+)\s*:\s*(\d+)\s*;/g;
  let m;
  while ((m = re.exec(css))) out[m[1]] = parseInt(m[2], 10);
  return out;
}

const DASH_SHEET = cssTextAfter('app-customer-dashboard.js', "id = 'customerDashSheet'");
const EDIT_MODAL = cssTextAfter('app-customer-dashboard.js', "wrap.id = 'custEditModal'");
/** `anchor` 뒤 가장 가까운 숫자 z-index (cssText 가 삼항식 안에 있는 고객 목록 시트용). */
function zNear(file, anchor) {
  const src = read(file);
  const at = src.indexOf(anchor);
  if (at < 0) throw new Error(`${file}: anchor "${anchor}" 없음`);
  const m = src.slice(at, at + 1200).match(/z-index:\s*(\d+)/);
  if (!m) throw new Error(`${file}: "${anchor}" 근처에 z-index 가 없다`);
  return parseInt(m[1], 10);
}

const Z = {
  customerList: zNear('app-customer.js', "sheet.id = 'customerSheet'"),
  assistant:    zLiteral(cssTextAfter('app-assistant.js', "id = 'assistantSheet'")),
  customerDash: zLiteral(DASH_SHEET),
  membership:   zLiteral(cssTextAfter('app-membership.js', "el.id = 'membershipSheet'")),
  dmPreview:    (() => { const m = read('app-dm-preview.js').match(/z-index:\s*(\d+)/); return parseInt(m[1], 10); })(),
  custEdit:     zLiteral(EDIT_MODAL),
  confirmToast: (() => { const css = read('style-base.css'); const i = css.indexOf('.bk-confirm-toast {'); return parseInt(css.slice(i).match(/z-index:\s*(\d+)/)[1], 10); })(),
};

describe('편집 모달은 자기를 여는 모든 화면보다 위다', () => {
  test('🔴 정보수정 모달 > 고객 상세 시트 (이번 버그 — 모바일에서 모달이 상세 뒤에 깔렸다)', () => {
    expect(Z.custEdit).toBeGreaterThan(Z.customerDash);
  });
  test('정보수정 모달 > 회원권 시트 · DM 미리보기 · 잇비 · 고객 목록', () => {
    expect(Z.custEdit).toBeGreaterThan(Z.membership);
    expect(Z.custEdit).toBeGreaterThan(Z.dmPreview);
    expect(Z.custEdit).toBeGreaterThan(Z.assistant);
    expect(Z.custEdit).toBeGreaterThan(Z.customerList);
  });
  test('확인창(.bk-confirm-toast) 보다는 아래다 — 모달 위에서 삭제/저장 확인이 떠야 한다', () => {
    expect(Z.custEdit).toBeLessThan(Z.confirmToast);
  });
  test('기존 사다리는 그대로다 (목록 < 잇비 < 상세 < 회원권 < DM 미리보기)', () => {
    const ladder = [Z.customerList, Z.assistant, Z.customerDash, Z.membership, Z.dmPreview];
    expect(ladder).toEqual([...ladder].sort((a, b) => a - b));
    expect(new Set(ladder).size).toBe(ladder.length);
  });
});

describe('z 토큰 SSOT — style-components.css :root 와 각 파일의 숫자가 같다', () => {
  const T = rootZTokens();

  test('🔴 토큰이 정의돼 있다', () => {
    for (const name of ['--z-customer-list', '--z-assistant', '--z-customer-detail', '--z-membership', '--z-dm-preview', '--z-customer-edit']) {
      expect(T[name]).toEqual(expect.any(Number));
    }
  });
  test('토큰 값 = 파일 리터럴 (한쪽만 바꾸면 여기서 잡힌다)', () => {
    expect(T['--z-customer-list']).toBe(Z.customerList);
    expect(T['--z-assistant']).toBe(Z.assistant);
    expect(T['--z-customer-detail']).toBe(Z.customerDash);
    expect(T['--z-membership']).toBe(Z.membership);
    expect(T['--z-dm-preview']).toBe(Z.dmPreview);
    expect(T['--z-customer-edit']).toBe(Z.custEdit);
  });
  test('🔴 app-customer-dashboard.js 는 토큰을 읽는다 (리터럴 폴백 + var())', () => {
    const edit = zToken(EDIT_MODAL);
    expect(edit).toEqual({ name: '--z-customer-edit', fallback: Z.custEdit });
    const dash = zToken(DASH_SHEET);
    expect(dash).toEqual({ name: '--z-customer-detail', fallback: Z.customerDash });
  });
});

describe('실제 DOM 에서 모달이 상세 위에 쌓인다', () => {
  /* 두 오버레이 모두 body 직계 · position:fixed · transform 없음 → 스택 순서는 z-index 숫자만으로 결정된다.
     jsdom 은 var() 를 풀지 못하므로 토큰 값을 직접 넣어 실제 브라우저가 계산할 값으로 비교한다. */
  test('토큰 값으로 계산한 모달 z 가 상세 z 보다 크다', () => {
    const T = rootZTokens();
    const resolve = (cssText) => cssText.replace(/var\(\s*(--z-[a-z-]+)\s*,\s*\d+\s*\)/g, (_m, n) => String(T[n]));
    const dash = document.createElement('div'); dash.style.cssText = resolve(DASH_SHEET); dash.style.display = 'flex';
    const modal = document.createElement('div'); modal.style.cssText = resolve(EDIT_MODAL);
    document.body.appendChild(dash); document.body.appendChild(modal);
    const zDash = parseInt(getComputedStyle(dash).zIndex, 10);
    const zModal = parseInt(getComputedStyle(modal).zIndex, 10);
    expect(Number.isFinite(zDash) && Number.isFinite(zModal)).toBe(true);
    expect(zModal).toBeGreaterThan(zDash);
    dash.remove(); modal.remove();
  });
});
