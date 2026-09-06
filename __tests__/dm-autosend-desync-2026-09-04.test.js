/* [2026-09-04 P1] 초안(dm_autoreply)을 끄면 자동발송(dm_autosend)도 **서버까지** 내려가야 한다.
 *
 * 왜 이 테스트가 있나 — 실측(로컬 격리 백엔드 + 실제 화면 왕복)에서 이런 일이 났다:
 *   ① 원장이 초안·자동발송 둘 다 켬        (화면 ON / 서버 ON)
 *   ② 원장이 초안만 끔                      (화면 OFF / **서버 dm_autosend 는 true 로 남음**)
 *   ③ 며칠 뒤 화면을 열어도 계속 '꺼짐'으로 보임 (_render 가 `aiOn && autosend` 로 그린다)
 *   ④ 초안만 다시 켜면 → 자동발송이 **동의를 다시 묻지 않고 되살아남**
 * 자동발송은 AI 가 쓴 글이 원장 확인 없이 손님에게 나가는 유일한 스위치다.
 * 화면이 '꺼짐'인데 서버가 켜져 있는 상태는 그 자체가 사고다.
 *
 * 원인: _syncAiDraftEnabled 가 GET 결과를 그대로 실어 보내면서 `enabled` 만 바꿨다.
 *   화면(_ai)에서만 dm_autosend_enabled=false 로 내려서 POST 본문엔 반영이 안 됐다.
 * 이 테스트는 **POST 본문**을 본다 — 화면 상태가 아니라 서버로 나가는 값이 진실이다.
 */
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'app-dm-menu.js'), 'utf8');

describe('초안 OFF → 자동발송도 서버까지 OFF', () => {
  test('_syncAiDraftEnabled 가 끄는 경우 POST 본문에 dm_autosend_enabled=false 를 싣는다', () => {
    const fn = SRC.slice(SRC.indexOf('async function _syncAiDraftEnabled'));
    const body = fn.slice(0, fn.indexOf('async function _hydrateAi'));
    // GET → 수정 → POST 사이에 자동발송을 내리는 줄이 있어야 한다
    expect(body).toMatch(/if \(!on\)\s*cur\.dm_autosend_enabled = false;/);
    // 그 줄이 POST 보다 **앞**이어야 실제 본문에 실린다
    const idxLower = body.indexOf('cur.dm_autosend_enabled = false');
    const idxPost = body.indexOf("method: 'POST'");
    expect(idxLower).toBeGreaterThan(-1);
    expect(idxPost).toBeGreaterThan(idxLower);
  });

  test('켜는 경우엔 자동발송을 건드리지 않는다 (초안만 켠다)', () => {
    const fn = SRC.slice(SRC.indexOf('async function _syncAiDraftEnabled'));
    const body = fn.slice(0, fn.indexOf('async function _hydrateAi'));
    // 무조건 대입(`cur.dm_autosend_enabled = ...`)이 아니라 !on 가드가 붙어 있어야 한다
    const hits = body.match(/cur\.dm_autosend_enabled\s*=/g) || [];
    expect(hits).toHaveLength(1);
    expect(body).toMatch(/if \(!on\) cur\.dm_autosend_enabled = false;/);
  });

  test('화면에서도 같이 내린다 (서버와 화면이 어긋나지 않게 양쪽 다)', () => {
    // _onClick 의 draft OFF 분기 — 화면 상태도 같이 내려야 한다
    expect(SRC).toMatch(/if \(_ai\.dm_autosend_enabled\) _ai\.dm_autosend_enabled = false;/);
  });
});
