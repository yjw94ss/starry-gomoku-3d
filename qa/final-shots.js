const { chromium } = require('/Users/Apple/.npm-global/lib/node_modules/playwright');
const ARGS = ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--hide-scrollbars'];

async function run(opts, fn) {
  const b = await chromium.launch({ channel: 'chrome', headless: true, args: ARGS });
  const p = await b.newPage(opts);
  await p.goto('http://127.0.0.1:8123/index.html', { waitUntil: 'commit' });
  await p.waitForFunction(() => !!window.GOMOKU, null, { timeout: 60000 });
  await p.waitForTimeout(1300);
  await fn(p);
  await b.close();
}

(async () => {
  // 桌面：开始页 → 棋盘
  await run({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5 }, async p => {
    await p.screenshot({ path: 'qa/f1-start.png' });
    await p.evaluate(() => GOMOKU.start());
    await p.waitForTimeout(1200);
    await p.evaluate(() => {
      GOMOKU.setMode('pvp'); GOMOKU.reset();
      [[4,4],[5,5],[4,5],[5,4],[3,4],[6,5],[4,6],[5,3]].forEach(([x,y]) => GOMOKU.place(x,y));
    });
    await p.waitForTimeout(1300);
    await p.screenshot({ path: 'qa/f2-board.png' });
  });

  // 手机：开始页 → 棋盘
  await run({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, async p => {
    await p.screenshot({ path: 'qa/f3-mobile-start.png' });
    await p.tap('#startBtn');
    await p.waitForTimeout(1300);
    await p.evaluate(() => {
      GOMOKU.setMode('pvp'); GOMOKU.reset();
      [[4,4],[5,5],[4,5],[5,4]].forEach(([x,y]) => GOMOKU.place(x,y));
    });
    await p.waitForTimeout(1200);
    await p.screenshot({ path: 'qa/f4-mobile-board.png' });
  });
  console.log('done');
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
