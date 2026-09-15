'use strict';
const fs = require('fs');
const path = require('path');
const acorn = require('acorn');
const source = fs.readFileSync(path.join(__dirname, '../app-assistant.js'), 'utf8');
const ast = acorn.parse(source, { ecmaVersion: 'latest' });
function find(node, name) {
  if (!node || typeof node !== 'object') return null;
  if (node.type === 'FunctionDeclaration' && node.id.name === name) return node;
  for (const child of Object.values(node)) {
    if (child && typeof child === 'object') {
      const result = find(child, name);
      if (result) return result;
    }
  }
  return null;
}
function extract(name, optional = false) {
  const node = find(ast, name);
  if (!node && optional) return '';
  if (!node) throw new Error('실제 함수가 없음: ' + name);
  return source.slice(node.start, node.end);
}
function build(result, local = false) {
  const remember = jest.fn(), invalidate = jest.fn();
  const pending = new Map();
  const win = { authHeader: () => ({}), hapticSuccess: jest.fn() };
  const deps = {
    window: win, navigator: {}, AbortController, setTimeout, clearTimeout,
    _confirmRiskyActionIfNeeded: async () => {},
    _localKindHandlers: local ? { qa: async () => result } : {},
    _invalidateCachesFor: invalidate, _rememberExecutedAction: remember,
    _pendingTxn: pending, _executeErrorMessage: () => '실패',
    apiFetch: jest.fn(async () => ({ ok: true, json: async () => result }))
  };
  const run = new Function(...Object.keys(deps), extract('_assertExecuteResult', true) + '\n' +
    extract('_executeAction') + '\nreturn _executeAction;')(...Object.values(deps));
  return { run, deps, pending, remember, invalidate, win };
}

test.each([false, true])('명시적인 실행 실패를 거절하고 완료 기록을 남기지 않는다 (local=%s)', async local => {
  const h = build({ ok: false, message: '실행할 수 없는 요청이에요' }, local);
  await expect(h.run({ kind: 'qa', payload: {} })).rejects.toThrow('실행할 수 없는 요청이에요');
  expect(h.remember).not.toHaveBeenCalled();
  expect(h.invalidate).not.toHaveBeenCalled();
});

test('실패 뒤 재시도는 같은 시도 번호를 유지하고 성공 때만 해제한다', async () => {
  const result = { ok: false, message: '잠시 후 확인해 주세요' };
  const h = build(result);
  const action = { kind: 'qa', payload: {} };
  await expect(h.run(action)).rejects.toThrow();
  const originalId = action._txn_id;
  expect(h.pending.size).toBe(1);
  result.ok = true;
  await expect(h.run(action)).resolves.toEqual(result);
  const calls = h.deps.apiFetch.mock.calls;
  expect(JSON.parse(calls[1][1].body).payload.client_txn_id).toBe(originalId);
  expect(h.pending.size).toBe(0);
  expect(h.remember).toHaveBeenCalledTimes(1);
});

test.each([{ ok: true, kind: 'qa' }, { kind: 'qa', message: '완료' }])('기존 성공 응답 형식도 정상 처리한다: %j', async result => {
  const h = build(result);
  await expect(h.run({ kind: 'qa' })).resolves.toEqual(result);
  expect(h.remember).toHaveBeenCalledTimes(1);
});

test('그룹 카드도 실제 실행 함수의 실패를 받아 실패 표시하고 성공 진동하지 않는다', async () => {
  const h = build({ ok: false, message: '아직 사용할 수 없어요' }, true);
  const it = { status: 'pending', action: { kind: 'qa' } };
  const history = [{ action_groups: [{ items: [it] }] }];
  const runRow = new Function('_history', '_executeAction', '_rerenderGroupRow', 'window',
    extract('_runGroupRow') + '\nreturn _runGroupRow;')(history, h.run, () => {}, h.win);
  await runRow(0, 0, 0);
  expect(it.status).toBe('failed');
  expect(it.errorMsg).toBe('아직 사용할 수 없어요');
  expect(h.win.hapticSuccess).not.toHaveBeenCalled();
});
