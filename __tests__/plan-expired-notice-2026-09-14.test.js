/**
 * @jest-environment jsdom
 */
/* 만료된 결제자에게 이유를 말해주는가.
 *
 * 왜 만들었나 (2026-09-14 만료 강등 종결)
 * ──────────────────────────────────────
 * 만료 강등이 집행 계층까지 닫히면서, 카드 실패·해지로 떨어진 원장은 이제 실제로
 * 무료 한도를 맞는다. 그런데 앱은 그걸 **설명하지 않았다.**
 *
 *   BE `/subscription/status` 는 강등 직후 status 를 "active" 로 덮어 응답한다
 *   → 프론트에서 "한 번도 결제 안 한 사람" 과 "만료된 결제자" 가 완전히 같아 보인다
 *   → 원장 화면엔 한도만 조용히 줄어든다. 고장으로 읽히고, 문의로만 드러난다.
 *
 * BE 가 `expired` / `expired_at` 을 더해 보내고, 여기서 그 한 줄을 띄운다.
 *
 * 잠그는 것:
 *   ① 만료된 결제자에게 만료 안내가 뜬다 (날짜 포함)
 *   ② 한 번도 결제 안 한 계정에는 **안 뜬다** — 신규에게 "만료됐어요" 는 사고다
 *   ③ 유료가 살아 있으면 기존 "다음 결제일" 문구가 그대로다 (회귀 방지)
 *   ④ 구버전 BE(필드 없음)에서도 조용히 넘어간다
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function mountDom() {
  document.body.innerHTML = `
    <div id="planPopup">
      <div id="planSubMeta" style="display:none"></div>
      <button id="planCancelBtn" style="display:none"></button>
      <button id="planActionBtn"></button>
      <button id="planRestoreBtn"></button>
      <div id="planUsageContent"></div>
    </div>`;
}

/** app-plan.js 는 IIFE — 통째로 실행한 뒤 window.refreshPlanStatus 로 상태를 태운다. */
async function loadPlanWithStatus(statusBody) {
  mountDom();
  window.API = 'https://api.test';
  window.authHeader = () => ({ Authorization: 'Bearer t' });
  window.apiFetch = async () => ({
    ok: true, status: 200, json: async () => statusBody,
  });
  try { localStorage.setItem('last_user_id', '1'); } catch (_e) { void 0; }
  delete window.refreshPlanStatus;
  // eslint-disable-next-line no-new-func
  new Function(read('app-plan.js')).call(window);
  await window.refreshPlanStatus();
  return document.getElementById('planSubMeta');
}

test('만료된 결제자에게 만료 안내가 날짜와 함께 뜬다', async () => {
  const meta = await loadPlanWithStatus({
    plan: 'free', status: 'active', expired: true,
    expired_at: '2026-08-15T00:00:00Z',
    next_bill_at: '2026-08-15T00:00:00Z', cancel_at_period_end: false, store: 'portone',
  });
  expect(meta.style.display).toBe('block');
  expect(meta.textContent).toContain('만료');
  expect(meta.textContent).toContain('2026.8.15');
});

test('한 번도 결제 안 한 계정에는 만료 안내가 뜨지 않는다', async () => {
  const meta = await loadPlanWithStatus({
    plan: 'free', status: 'active', expired: false, expired_at: null,
    next_bill_at: null, cancel_at_period_end: false, store: null,
  });
  expect(meta.style.display).toBe('none');
  expect(meta.textContent).not.toContain('만료');
});

test('유료가 살아 있으면 기존 결제일 문구가 그대로다', async () => {
  const meta = await loadPlanWithStatus({
    plan: 'membership', status: 'active', expired: false, expired_at: null,
    next_bill_at: '2026-10-01T00:00:00Z', current_period_end: '2026-10-01T00:00:00Z',
    cancel_at_period_end: false, store: 'portone',
  });
  expect(meta.style.display).toBe('block');
  expect(meta.textContent).toContain('다음 결제일');
  expect(meta.textContent).not.toContain('만료');
});

test('구버전 BE(expired 필드 없음)에서도 안내 없이 조용히 넘어간다', async () => {
  const meta = await loadPlanWithStatus({
    plan: 'free', status: 'active',
    next_bill_at: null, cancel_at_period_end: false, store: null,
  });
  expect(meta.style.display).toBe('none');
});
