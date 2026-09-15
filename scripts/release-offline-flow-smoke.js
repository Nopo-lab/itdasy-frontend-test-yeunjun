'use strict';

// Run the existing workspace browser checks with all nonlocal traffic blocked.
// Usage: node scripts/release-offline-flow-smoke.js
// The repository's smoke harness owns the browser and the local server lifecycle.
const { chromium } = require('playwright');
const launch = chromium.launch.bind(chromium);
let blockedRequests = 0;

chromium.launch = async function (options) {
  const browser = await launch(options);
  const newPage = browser.newPage.bind(browser);
  browser.newPage = async function (pageOptions) {
    const page = await newPage({ ...pageOptions, serviceWorkers: 'block' });
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === 'http://localhost:8199') return route.continue();
      blockedRequests += 1;
      return route.abort();
    });
    return page;
  };
  return browser;
};
process.on('exit', () => console.log('External requests blocked:', blockedRequests));
require('./ws-flow-smoke.js');
