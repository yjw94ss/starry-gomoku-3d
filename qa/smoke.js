const { chromium } = require('/Users/Apple/.npm-global/lib/node_modules/playwright');

const URL = 'http://127.0.0.1:8123/index.html';

async function shot(page, name) {
  await page.screenshot({ path: 'qa/' + name + '.png' });
}

async function clickCell(page, x, y) {
  const p = await page.evaluate(([a, b]) => GOMOKU.screenOf(a, b), [x, y]);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(220);
}

(async () => {
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars']
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => {
    const t = m.type();
    const txt = m.text();
    if (t === 'error') errors.push('ERROR: ' + txt);
    if (t === 'warning' && !/deprecated with r150|GL Driver Message|sigmaRadians/.test(txt)) errors.push('WARN: ' + txt);
  });

  await page.goto(URL, { waitUntil: 'commit' });
  await page.waitForFunction(() => !!window.GOMOKU, null, { timeout: 60000 });
  await page.waitForTimeout(2000);
  console.log('BOOT ' + JSON.stringify(await page.evaluate(() => ({
    api: !!window.GOMOKU, errs: GOMOKU.errs, stats: GOMOKU.stats(), cam: GOMOKU.cam()
  }))));
  await shot(page, '01-start');

  await page.click('#startBtn');
  await page.waitForTimeout(1500);
  await shot(page, '02-board');

  // 悬停预览 + 点击落子
  const c = await page.evaluate(() => GOMOKU.screenOf(4, 4));
  await page.mouse.move(c.x, c.y);
  await page.waitForTimeout(300);
  await shot(page, '03-hover');
  await page.mouse.click(c.x, c.y);
  await page.waitForTimeout(1500);
  const s1 = await page.evaluate(() => GOMOKU.state);
  console.log('CLICK ' + JSON.stringify({ center: s1.board[40], turn: s1.turn, moves: s1.history.length }));

  // 电脑应已落子
  await page.waitForTimeout(1200);
  const s2 = await page.evaluate(() => GOMOKU.state);
  console.log('AI ' + JSON.stringify({ moves: s2.history.length, last: s2.history[s2.history.length - 1], turn: s2.turn }));
  await shot(page, '04-after-ai');

  // 悔棋
  await page.click('#btnUndo');
  await page.waitForTimeout(600);
  console.log('UNDO ' + JSON.stringify(await page.evaluate(() => ({
    moves: GOMOKU.state.history.length, turn: GOMOKU.state.turn, stones: GOMOKU.stats().stones
  }))));

  // 拖拽 + 缩放
  const before = await page.evaluate(() => GOMOKU.cam());
  await page.mouse.move(700, 430);
  await page.mouse.down();
  await page.mouse.move(780, 470, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(800);
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(800);
  const after = await page.evaluate(() => GOMOKU.cam());
  console.log('CAM ' + JSON.stringify({ before, after }));

  // 五连获胜
  await page.evaluate(() => { GOMOKU.setMode('pvp'); GOMOKU.reset(); GOMOKU.start(); });
  await page.waitForTimeout(400);
  const seq = [[0, 0], [1, 0], [1, 1], [2, 1], [2, 2], [3, 2], [3, 3], [4, 3], [4, 4]];
  for (const [x, y] of seq) await clickCell(page, x, y);
  await page.waitForTimeout(1200);
  const win = await page.evaluate(() => ({ over: GOMOKU.state.over, cells: GOMOKU.state.winCells }));
  const t0 = Date.now();
  let shown = -1;
  for (let i = 0; i < 50; i++) {
    if (await page.evaluate(() => GOMOKU.overlays().win)) { shown = Date.now() - t0; break; }
    await page.waitForTimeout(100);
  }
  console.log('WIN ' + JSON.stringify({ win, overlayAfter: shown }));
  await shot(page, '05-win');

  // 再来一局
  await page.click('#ovAgain');
  await page.waitForTimeout(900);
  console.log('RESTART ' + JSON.stringify(await page.evaluate(() => ({
    over: GOMOKU.state.over, moves: GOMOKU.state.history.length, stones: GOMOKU.stats().stones, ov: GOMOKU.overlays()
  }))));

  await page.close();
  await page.context().close();

  // 移动端视口
  const m = await browser.newPage({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true
  });
  const merrors = [];
  m.on('pageerror', e => merrors.push('PAGEERROR: ' + e.message));
  m.on('console', x => { if (x.type() === 'error') merrors.push('ERROR: ' + x.text()); });
  await m.goto(URL, { waitUntil: 'commit' });
  await m.waitForTimeout(1800);
  await shot(m, '06-mobile-start');
  await m.tap('#startBtn');
  await m.waitForTimeout(1400);
  await shot(m, '07-mobile-board');

  const mp = await m.evaluate(() => GOMOKU.screenOf(4, 4));
  await m.touchscreen.tap(mp.x, mp.y);
  await m.waitForTimeout(1200);
  console.log('MOBILE ' + JSON.stringify(await m.evaluate(() => ({
    cam: GOMOKU.cam(), moves: GOMOKU.state.history.length, stats: GOMOKU.stats()
  }))));
  await shot(m, '08-mobile-play');

  // 溢出检查
  const overflow = await m.evaluate(() => ({
    sw: document.documentElement.scrollWidth, iw: window.innerWidth,
    sh: document.documentElement.scrollHeight, ih: window.innerHeight
  }));
  console.log('OVERFLOW_MOBILE ' + JSON.stringify(overflow));

  console.log('ERRORS ' + JSON.stringify(errors.slice(0, 10)));
  console.log('MERR ' + JSON.stringify(merrors.slice(0, 10)));
  console.log('M_SIZE ' + JSON.stringify(await m.evaluate(() => SCENE3D.sizeInfo())));
  console.log('M_ERRS ' + JSON.stringify(await m.evaluate(() => GOMOKU.errs)));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
