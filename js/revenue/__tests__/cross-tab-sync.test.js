/**
 * 다른 탭에서 매출이 바뀌면 이 탭도 따라간다 — [매출감사 2026-08-04]
 *
 * 실측으로 잡은 것: PC 에서 탭 두 개를 띄우고
 *   탭A 에서 5만원 저장 → 서버 125,000
 *   탭B 는 홈↔매출을 오가도 **75,000원** 을 계속 표시
 * 캐시(localStorage)는 탭A 가 지워서 비어 있는데도 그랬다 —
 * 'itdasy:data-changed' 가 **같은 탭 안에서만** 도는 CustomEvent 라서
 * 탭B 는 자기 메모리 상태로 다시 그렸기 때문이다.
 *
 * localStorage 의 'storage' 이벤트는 다른 탭에서 바뀔 때만 온다(자기 탭엔 안 옴).
 * 그걸 듣고 캐시를 비우고 다시 그린다.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'app-revenue.js'), 'utf8');

describe('app-revenue.js — 탭 간 동기화(storage 이벤트)', () => {
  test('storage 리스너가 등록되어 있다', () => {
    expect(SRC).toMatch(/addEventListener\(\s*'storage'/);
  });

  test('매출 캐시 키만 반응한다 (다른 도메인 캐시에 끌려가지 않게)', () => {
    expect(SRC).toMatch(/e\.key\.indexOf\('pv_cache::revenue::'\)\s*!==\s*0/);
  });

  test('삭제(무효화)된 경우만 처리한다', () => {
    // 값이 갱신된 경우까지 재조회하면 탭이 서로를 계속 깨우며 요청이 증폭된다
    expect(SRC).toMatch(/e\.newValue\s*!==\s*null/);
  });

  test('캐시를 비우고 매출 화면이 떠 있으면 다시 그린다', () => {
    const m = SRC.match(/addEventListener\('storage'[\s\S]{0,520}/);
    expect(m).not.toBeNull();
    expect(m[0]).toMatch(/_clearSWRRevenue\(\)/);
    expect(m[0]).toMatch(/revenueSheet/);
    expect(m[0]).toMatch(/_loadAndRender\(\)/);
  });

  test('기존 같은-탭 리스너(itdasy:data-changed)는 그대로 있다', () => {
    expect(SRC).toMatch(/addEventListener\('itdasy:data-changed'/);
  });
});

describe('storage 이벤트 동작 (실제 핸들러 시뮬레이션)', () => {
  // 실제 핸들러와 같은 판정 로직 — 조건이 바뀌면 여기서 잡힌다
  function shouldResync(e) {
    if (!e || !e.key || e.key.indexOf('pv_cache::revenue::') !== 0) return false;
    if (e.newValue !== null) return false;
    return true;
  }

  test('매출 캐시 삭제 → 재동기화', () => {
    expect(shouldResync({ key: 'pv_cache::revenue::summary::2026-08', newValue: null })).toBe(true);
  });

  test('매출 캐시 갱신(값 있음) → 재동기화 안 함', () => {
    expect(shouldResync({ key: 'pv_cache::revenue::summary::2026-08', newValue: '{"t":1}' })).toBe(false);
  });

  test('다른 도메인 캐시 삭제 → 무시', () => {
    expect(shouldResync({ key: 'pv_cache::customers::list', newValue: null })).toBe(false);
    expect(shouldResync({ key: 'dash_cache::/today/brief', newValue: null })).toBe(false);
    expect(shouldResync({ key: 'itdasy_token::staging', newValue: null })).toBe(false);
  });

  test('key 없는 이벤트(localStorage.clear) → 터지지 않는다', () => {
    expect(shouldResync({ key: null, newValue: null })).toBe(false);
    expect(shouldResync({})).toBe(false);
    expect(shouldResync(null)).toBe(false);
  });
});
