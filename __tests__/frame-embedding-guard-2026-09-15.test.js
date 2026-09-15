const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function guardScript() {
  const match = html.match(/<script id="itdasyFrameGuardScript">([\s\S]*?)<\/script>/);
  expect(match).not.toBeNull();
  return match[1];
}

test('frame guard runs before application scripts', () => {
  expect(html.indexOf('id="itdasyFrameGuard"')).toBeLessThan(html.indexOf('src="app-core.js'));
});

test('top-level app removes the hiding guard', () => {
  const guard = { remove: jest.fn() };
  const window = {};
  window.top = window;
  window.self = window;
  vm.runInNewContext(guardScript(), {
    window,
    document: { getElementById: () => guard },
    console,
  });
  expect(guard.remove).toHaveBeenCalledTimes(1);
});

test('embedded app remains hidden while escaping the frame', () => {
  const guard = { remove: jest.fn() };
  const window = { top: {}, self: { location: 'https://itdasy.example/' } };
  vm.runInNewContext(guardScript(), {
    window,
    document: { getElementById: () => guard },
    console,
  });
  expect(guard.remove).not.toHaveBeenCalled();
  expect(window.top.location).toBe('https://itdasy.example/');
});
