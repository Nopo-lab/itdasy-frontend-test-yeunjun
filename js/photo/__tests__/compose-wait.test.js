/* [출고 감사] compose 가 자동 초안을 기다리는 정책을 고정한다.
 *
 * 이번 버그의 절반이 여기였다 — compose 는 40ms 뒤에 굽는데
 * 자동 초안 체인은 사진 디코딩·IDB 조회를 거쳐 그보다 오래 걸린다.
 * 기다리게 하되 **상한**이 있어야 한다: 플랜이 늦거나 실패해도 미리보기는 나와야 한다.
 * "보정 없는 미리보기" 가 "영영 안 나오는 미리보기" 보다 낫다.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../..');
const ed = fs.readFileSync(path.join(ROOT, 'js/itd-editor/itd-editor.js'), 'utf8');

/* 실제 대기 코드를 파일에서 떼어내 돌린다 — 정책을 문자열로만 확인하지 않는다. */
function extractWait() {
  const i = ed.indexOf('var _wait = (S && S._planP && S._planP.then)');
  if (i < 0) throw new Error('compose 대기 코드를 못 찾았다');
  const j = ed.indexOf('_wait.then(function () {', i);
  return ed.slice(i, j);
}
function makeWait(planP) {
  const S = planP === undefined ? {} : { _planP: planP };
  const fn = new Function('S', 'Promise', 'setTimeout', extractWait() + '\n return _wait;');
  return fn(S, Promise, setTimeout);
}

describe('[compose] 자동 초안을 기다린다', () => {
  test('플랜이 빠르면 그 결과를 기다렸다가 진행한다', async () => {
    let resolved = false;
    const p = new Promise((r) => setTimeout(() => { resolved = true; r('done'); }, 50));
    await makeWait(p);
    expect(resolved).toBe(true);
  });

  test('플랜이 느려도 상한(1.2초) 안이면 기다린다', async () => {
    let resolved = false;
    const p = new Promise((r) => setTimeout(() => { resolved = true; r('done'); }, 900));
    const t0 = Date.now();
    await makeWait(p);
    expect(resolved).toBe(true);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(850);
  }, 4000);

  test('🔑 상한을 넘으면 안 기다리고 진행한다 — 미리보기가 영영 안 나오면 안 된다', async () => {
    const never = new Promise(() => {});          // 영원히 안 끝나는 플랜
    const t0 = Date.now();
    await makeWait(never);
    const dt = Date.now() - t0;
    expect(dt).toBeGreaterThanOrEqual(1100);
    expect(dt).toBeLessThan(1800);                 // 무한대기가 아니다
  }, 4000);

  test('🔑 플랜이 실패해도 굽기는 진행한다 (오류가 미리보기를 막지 않는다)', async () => {
    const failed = Promise.reject(new Error('boom'));
    await expect(makeWait(failed)).resolves.toBeDefined();
  });

  test('플랜 자체가 없으면(자동 초안 OFF) 곧바로 진행한다', async () => {
    const t0 = Date.now();
    await makeWait(undefined);
    expect(Date.now() - t0).toBeLessThan(60);
  });

  test('상한 값은 코드에 하나만 있다 — 새 timeout 을 만들지 않았다', () => {
    const seg = extractWait();
    const nums = seg.match(/setTimeout\(rz, (\d+)\)/g) || [];
    expect(nums.length).toBe(1);
    expect(seg).toMatch(/setTimeout\(rz, 1200\)/);
  });
});
