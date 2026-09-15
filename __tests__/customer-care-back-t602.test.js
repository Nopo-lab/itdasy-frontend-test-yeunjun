/** @jest-environment node */
const fs = require('fs');
const source = fs.readFileSync(require('path').join(__dirname, '../app-core.js'), 'utf8');
const start = source.indexOf("window.addEventListener('popstate'", source.indexOf('(function _initSheetBackRegistry()'));
const listener = source.slice(start, source.indexOf('\n  });', start) + 6);
test('a refused close restores browser history and preserves sheet stack until the draft is resolved', () => {
  let onPop, allowed = false;
  const stack = ['customers', 'customerDash'], pushed = [true, false];
  const close = jest.fn(() => allowed ? undefined : false);
  const registry = new Map([['customerDash', { close }]]);
  const history = { pushState: jest.fn() };
  const window = { location: { hash: '#customers' }, addEventListener: (_, fn) => { onPop = fn; } };
  new Function('window', 'history', 'stack', 'pushed', 'registry', 'let _progBack = 0;\n' + listener)(window, history, stack, pushed, registry);
  onPop(); expect(history.pushState).toHaveBeenCalledWith({ sheet: 'customerDash' }, '', '#customerDash');
  expect(stack).toEqual(['customers', 'customerDash']); expect(pushed).toEqual([true, true]);
  allowed = true; onPop(); expect(stack).toEqual(['customers']); expect(pushed).toEqual([true]);
});
