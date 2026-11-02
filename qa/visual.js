const { chromium } = require('/Users/Apple/.npm-global/lib/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({
    channel: 'chrome', headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars']
  });

  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5 });
  await page.goto('http://127.0.0.1:8123/index.html', { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'qa/v0-start.png' });
  await page.evaluate(() => GOMOKU.start());
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    GOMOKU.setMode('pvp');
    GOMOKU.reset();
    [[4, 4], [5, 5], [4, 5], [5, 4], [3, 4], [6, 5], [4, 6], [5, 3]].forEach(([x, y]) => GOMOKU.place(x, y));
  });
  await page.waitForTimeout(1400);
  await page.screenshot({ path: 'qa/v1-desktop.png' });
  console.log(JSON.stringify(await page.evaluate(() => ({ cam: GOMOKU.cam(), stats: GOMOKU.stats() }))));

  const m = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await m.goto('http://127.0.0.1:8123/index.html', { waitUntil: 'load' });
  await m.waitForTimeout(1200);
  await m.evaluate(() => GOMOKU.start());
  await m.waitForTimeout(900);
  await m.evaluate(() => {
    GOMOKU.setMode('pvp');
    GOMOKU.reset();
    [[4, 4], [5, 5], [4, 5], [5, 4], [3, 4], [6, 5]].forEach(([x, y]) => GOMOKU.place(x, y));
  });
  await m.waitForTimeout(1200);
  await m.screenshot({ path: 'qa/v2-mobile.png' });
  console.log('M ' + JSON.stringify(await m.evaluate(() => ({ cam: GOMOKU.cam() }))));

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
