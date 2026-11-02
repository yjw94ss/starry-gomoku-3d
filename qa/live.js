const { chromium } = require('/Users/Apple/.npm-global/lib/node_modules/playwright');
const URL = 'https://yjw94ss.github.io/starry-gomoku-3d/';
const ARGS = ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--hide-scrollbars'];

(async () => {
  const b = await chromium.launch({ channel: 'chrome', headless: true, args: ARGS });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('ERROR ' + m.text()); });
  const t0 = Date.now();
  await p.goto(URL, { waitUntil: 'commit', timeout: 45000 });
  await p.waitForFunction(() => !!window.GOMOKU, null, { timeout: 60000 });
  await p.waitForTimeout(2200);
  console.log('LIVE ' + JSON.stringify({
    loadMs: Date.now() - t0,
    title: await p.title(),
    api: await p.evaluate(() => !!window.GOMOKU),
    errs: await p.evaluate(() => GOMOKU.errs),
    cam: await p.evaluate(() => GOMOKU.cam())
  }));
  await p.click('#startBtn');
  await p.waitForTimeout(1200);
  const c = await p.evaluate(() => GOMOKU.screenOf(4, 4));
  await p.mouse.click(c.x, c.y);
  await p.waitForTimeout(1600);
  console.log('PLAY ' + JSON.stringify(await p.evaluate(() => ({
    moves: GOMOKU.state.history.length, center: GOMOKU.state.board[40], stones: GOMOKU.stats().stones
  }))));
  await p.screenshot({ path: 'qa/live-desktop.png' });
  console.log('ERRS ' + JSON.stringify(errs));
  await b.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
