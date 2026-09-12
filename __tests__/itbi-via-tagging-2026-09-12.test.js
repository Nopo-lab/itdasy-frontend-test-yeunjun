/* [ITBI 2차 최종 게이트 · §8] 추천칩 클릭을 직접 입력과 구분한다.
 *
 * 왜 필요했나: 추천칩은 입력창을 채우고 그대로 `send()` 를 부른다. 서버에서 보면
 * 직접 타이핑과 **완전히 같은 요청 한 줄**이다. 그래서 관측 스펙이 요구하는
 * RECOMMENDATION_FAILURE_RATE("우리가 추천한 질문이 답을 못 받은 비율")를
 * 계산할 원천 데이터가 아예 없었다.
 *
 * 표식은 **1회용**이다. 안 지우면 칩을 한 번 누른 뒤의 직접 입력까지 'chip' 으로 집계돼
 * 추천칩 실패율이 실제보다 좋아 보인다 — 지표가 스스로를 속인다.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ASSISTANT = fs.readFileSync(path.join(ROOT, 'app-assistant.js'), 'utf8');
const SUGGEST = fs.readFileSync(
  path.join(ROOT, 'js', 'assistant', 'suggestion-controls.js'), 'utf8');

function cut(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('함수를 못 찾음: ' + name);
  let depth = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) return src.slice(i, k + 1); }
  }
  throw new Error('중괄호가 안 닫힘: ' + name);
}

describe('_takeVia — 1회용 표식', () => {
  // eslint-disable-next-line no-new-func
  const make = new Function('window', cut(ASSISTANT, '_takeVia') + '\nreturn _takeVia;');

  test('표식이 없으면 typed', () => {
    const w = {};
    expect(make(w)()).toBe('typed');
  });

  test('표식이 있으면 chip 을 돌려주고 곧바로 지운다', () => {
    const w = { __itbiVia: 'chip' };
    const takeVia = make(w);
    expect(takeVia()).toBe('chip');
    expect(w.__itbiVia).toBeNull();
    expect(takeVia()).toBe('typed');      // 다음 직접 입력에 새지 않는다
  });
});

describe('칩 클릭이 표식을 남긴다', () => {
  test('handleClick 의 data-suggest 분기가 send 전에 표식을 세운다', () => {
    const body = cut(SUGGEST, 'handleClick');
    const i = body.indexOf("closest('[data-suggest]')");
    expect(i).toBeGreaterThan(0);
    const branch = body.slice(i, i + 800);
    expect(branch).toMatch(/window\.__itbiVia = 'chip'/);
    // 표식은 send() **앞에** 서야 한다 — 뒤면 이미 보낸 뒤라 소용없다.
    // ⚠ 주석을 먼저 걷어낸다. 설명 주석 안의 "send()" 를 코드로 세다가
    //    멀쩡한 순서를 FAIL 로 오판했다(이 테스트가 처음 그렇게 틀렸다).
    const code = branch.replace(/\/\/[^\n]*/g, '');
    expect(code.indexOf('__itbiVia')).toBeGreaterThan(-1);
    expect(code.indexOf('send()')).toBeGreaterThan(-1);
    expect(code.indexOf('__itbiVia')).toBeLessThan(code.indexOf('send()'));
  });
});

describe('배선 — 표식이 실제로 서버까지 간다', () => {
  test('ask 페이로드에 via 가 실린다', () => {
    expect(ASSISTANT).toMatch(/body: JSON\.stringify\(\{[^}]*via: _takeVia\(\)/);
  });

  test('FE 지름길이 처리한 턴도 via 를 보고한다', () => {
    const body = cut(ASSISTANT, '_trySendShortcuts');
    expect(body).toMatch(/const via = _takeVia\(\)/);
    expect(body).toMatch(/_reportClientTurn\(name, q, via\)/);
  });

  test('지름길이 안 받으면 표식을 되돌려 놓는다', () => {
    /* 지름길이 처리하지 않으면 `/assistant/ask` 가 이어서 나간다. 거기서도 _takeVia() 를
     * 부르므로, 앞에서 소비해 버린 표식을 되돌려 놓지 않으면 칩 클릭이 typed 로 집계된다. */
    const body = cut(ASSISTANT, '_trySendShortcuts');
    const iReturn = body.lastIndexOf('return false');
    const tail = body.slice(0, iReturn);
    expect(tail).toMatch(/if \(via === 'chip'\) window\.__itbiVia = 'chip'/);
  });

  test('client-event 본문에 via 가 들어간다', () => {
    const body = cut(ASSISTANT, '_reportClientTurn');
    expect(body).toMatch(/via: via \|\| 'typed'/);
  });
});
