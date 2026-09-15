const fs = require('fs');
const path = require('path');

describe('iPhone orientation release configuration', () => {
  const plist = fs.readFileSync(
    path.join(__dirname, '..', 'ios', 'App', 'App', 'Info.plist'),
    'utf8'
  );
  const phoneSection = plist.match(
    /<key>UISupportedInterfaceOrientations<\/key>\s*<array>([\s\S]*?)<\/array>/
  );

  test('supports portrait and both landscape directions', () => {
    expect(phoneSection).not.toBeNull();
    expect(phoneSection[1]).toContain('UIInterfaceOrientationPortrait');
    expect(phoneSection[1]).toContain('UIInterfaceOrientationLandscapeLeft');
    expect(phoneSection[1]).toContain('UIInterfaceOrientationLandscapeRight');
  });
});
