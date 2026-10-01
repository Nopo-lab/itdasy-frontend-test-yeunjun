/* 🔴 [2026-10-01 flow-workspace-photo-03] 캡션을 아직 못 만든 상태(AI 실패·미생성)에선 저장 버튼이 숨겨져 있고,
 *   뒤로가기로 나가면 올린 사진·전후 합성이 확인창 없이 전부 사라졌다.
 *
 * 실측(scn-b-misc, 로컬 스택): 캡션(생성 전) 하단 CTA {hiddenClass:true, display:none} → 뒤로 ×3 (caption→layout→upload→닫힘)
 *   → 새 슬롯 0 · saveSlotToDB 호출 0회. AI 실패 토스트 뒤에도 CTA display:none.
 *
 * 원인: setScreen 이 캡션이 비면 액션바를 통째로 숨겼고, close()/_systemBack()/_navBack() 어디에도 임시 저장이 없었다.
 *
 * 수정: ① 사진이 있으면 캡션 전에도 '나중에 이어서하기'(ghost) 노출
 *       ② close() 가 저장본 지문(_slotSig)과 다르면 조용히 임시 저장(_persistEditQuiet) + 홈 갱신
 *       ③ AI 실패 시 임시 저장 + "임시 저장해 뒀어요" 안내
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = process.env.ITDASY_SRC_ROOT || path.join(__dirname, '..');
const flowSrc = fs.readFileSync(path.join(ROOT, 'js/workspace/workspace-v2-flow.js'), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const src = strip(flowSrc);

function pick(s, head) {
  const i = s.indexOf(head); if (i < 0) throw new Error('missing: ' + head);
  let depth = 0, started = false;
  for (let k = i; k < s.length; k++) {
    const c = s[k];
    if (c === '{') { depth++; started = true; } else if (c === '}') { depth--; if (started && depth === 0) return s.slice(i, k + 1); }
  }
  throw new Error('unbalanced');
}

describe('① 캡션 전에도 저장 수단이 보인다', () => {
  test('🔴 setScreen 은 "캡션 없음 && 사진 없음" 일 때만 액션바를 숨긴다(사진이 있으면 나중에 이어서하기 노출)', () => {
    const i = src.indexOf('function setScreen(name, opts)');
    const seg = src.slice(i, i + 3500);
    expect(seg).toMatch(/if \(name === 'caption' && !String\(d\.caption \|\| ''\)\.trim\(\) && !\(editablePhotos\(\) \|\| \[\]\)\.length\) bar\.classList\.add\('hidden'\)/);
    expect(seg).not.toMatch(/if \(name === 'caption' && !String\(d\.caption \|\| ''\)\.trim\(\)\) bar\.classList\.add\('hidden'\)/);
  });
  test('캡션 스텝의 하단 CTA 는 저장(__save)·ghost 그대로 — 저장 버튼이 생성 버튼과 경쟁하지 않는다', () => {
    const steps = fs.readFileSync(path.join(ROOT, 'js/workspace/flow/steps.js'), 'utf8');
    expect(steps).toMatch(/caption:\s*\{ title: '캡션 생성',\s*cta: \{ l: '나중에 이어서하기', to: '__save', ghost: true \} \}/);
  });
});

describe('② 닫을 때 저장 안 된 변경이 있으면 조용히 임시 저장한다', () => {
  test('🔴 close() 가 _slotSig() !== d._savedSig 일 때 _persistEditQuiet 를 부른다(save 경유·textOnly·사진 0장은 제외)', () => {
    const b = pick(src, 'function close()');
    expect(b).toMatch(/_slotSig\(\) !== d\._savedSig/);
    expect(b).toMatch(/!d\._saving && !d\.textOnly && \(d\.photos \|\| \[\]\)\.length/);
    expect(b).toMatch(/_persistEditQuiet\(\)/);
    // 저장이 끝난 뒤 홈을 갱신해 카드가 바로 보이게
    expect(b).toMatch(/WorkspaceV2\.refresh\(\)/);
    // 세션 종료 표식(_dead)보다 **앞**에서 — 죽은 세션엔 아무것도 안 쓴다
    expect(b.indexOf('_persistEditQuiet()')).toBeLessThan(b.indexOf('d._dead = true'));
  });
  test('open() 과 buildSlot() 이 지문(_savedSig)을 찍는다 — 둘 중 하나가 빠지면 매번 저장하거나 영영 안 한다', () => {
    const open = pick(src, 'function open(opts)');
    expect(open).toMatch(/d\._savedSig = _slotSig\(\)/);
    const bs = pick(src, 'function buildSlot()');
    expect(bs).toMatch(/d\._savedSig = _slotSig\(\)/);
  });
  test('_slotSig 는 사진·결과물·글·구성이 바뀌면 달라지고, 같으면 같다 (실행)', () => {
    const body = pick(src, 'function _slotSig()');
    const mk = (d) => new Function('d', body + '; return _slotSig;')(d)();   // eslint-disable-line no-new-func
    const base = () => ({ photos: [{ id: 'a', role: 'before', dataUrl: 'xx' }], templateOutputs: [{ pairId: 'p', templateId: 'wsl-ba-lr', outputUrl: 'oo' }], caption: '', service: '', wsComp: 'ba', hashtags: [] });
    expect(mk(base())).toBe(mk(base()));
    const a = base(); a.photos.push({ id: 'b', dataUrl: 'y' }); expect(mk(a)).not.toBe(mk(base()));
    const b = base(); b.templateOutputs[0].storyEdited = true; expect(mk(b)).not.toBe(mk(base()));
    const c = base(); c.caption = '글'; expect(mk(c)).not.toBe(mk(base()));
    // 구성 키만 바뀐 것(옛 저장본 역산 등)은 변경이 아니다 — 진짜 구성 변경은 결과물을 비우므로 outs 로 잡힌다
    const e = base(); e.wsComp = 'cover'; e._wsFit = 'cover'; expect(mk(e)).toBe(mk(base()));
    expect(mk(null)).toBe('');
  });
  test('_persistEditQuiet 는 저장 프로미스를 세션(d._persistP)에 남긴다 — 닫기 경로가 저장 완료 뒤 홈을 갱신하려면 필요(fire-and-forget 계약은 그대로)', () => {
    const b = pick(src, 'function _persistEditQuiet()');
    expect(b).toMatch(/d\._persistP = Promise\.resolve\(window\.saveSlotToDB\(buildSlot\(\)\)\)/);
    expect(b).toMatch(/if \(!d\.photos \|\| !d\.photos\.length\) return;/);
    const c = pick(src, 'function close()');
    expect(c).toMatch(/Promise\.resolve\(d\._persistP\)\.then/);
  });
});

describe('③ AI 실패 — 작업은 남고 그렇게 말해 준다', () => {
  /* 보존 자체는 ①(보이는 저장 버튼) + ②(닫을 때 임시 저장)가 맡는다. 실패 분기에서 슬롯을 바로 쓰진 않는다 —
     caption-generated-persists-2026-09-13 의 "빈 글로 슬롯을 만들지 않음" 계약을 그대로 지킨다. 여기선 안내만 확인. */
  test('🔴 생성 실패(r.ok=false) 와 예외(catch) 둘 다 "그대로 있어요 · 나중에 이어서하기" 안내를 붙인다', () => {
    const i = src.indexOf('toast(r.toast || \'게시글 생성에 실패했어요\')');
    expect(i).toBeGreaterThan(0);
    const seg = src.slice(i, i + 500);
    expect(seg).toMatch(/사진과 구성은 그대로 있어요/);
    expect(seg).toMatch(/나중에 이어서하기/);
    const j = src.indexOf('게시글 생성에 실패했어요 — 네트워크를 확인하고 다시 시도해 주세요');
    const seg2 = src.slice(j, j + 400);
    expect(seg2).toMatch(/사진과 구성은 그대로 있어요/);
  });
});
