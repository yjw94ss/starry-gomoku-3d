const { chromium } = require('/Users/Apple/.npm-global/lib/node_modules/playwright');
const URL = 'http://127.0.0.1:8123/index.html';

(async () => {
  const browser = await chromium.launch({
    channel: 'chrome', headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars']
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('ERROR ' + m.text()); });

  await page.goto(URL, { waitUntil: 'commit' });
  await page.waitForFunction(() => !!window.GOMOKU, null, { timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => GOMOKU.start());
  await page.waitForTimeout(500);

  // 1. 点已占用的格子
  await page.evaluate(() => { GOMOKU.setMode('pvp'); GOMOKU.reset(); });
  await page.evaluate(() => GOMOKU.place(4, 4));
  await page.waitForTimeout(400);
  const before = await page.evaluate(() => GOMOKU.state.history.length);
  await page.evaluate(() => GOMOKU.place(4, 4));
  const after = await page.evaluate(() => ({ n: GOMOKU.state.history.length, toast: document.getElementById('toast').classList.contains('on') }));
  console.log('OCCUPIED ' + JSON.stringify({ before, after }));

  // 2. 人机模式：AI 思考时快速连点，只应落一子
  await page.evaluate(() => { GOMOKU.setMode('ai', 'easy'); GOMOKU.reset(); });
  await page.waitForTimeout(300);
  await page.evaluate(() => { GOMOKU.place(2, 2); GOMOKU.place(3, 3); GOMOKU.place(5, 5); });
  await page.waitForTimeout(1600);
  const st = await page.evaluate(() => GOMOKU.state);
  console.log('RAPID ' + JSON.stringify({ human: st.history.filter(h => h.p === 1).length, total: st.history.length, turn: st.turn }));

  // 3. AI 思考中悔棋
  await page.evaluate(() => GOMOKU.place(6, 2));
  await page.evaluate(() => GOMOKU.undo());
  await page.waitForTimeout(1500);
  const st2 = await page.evaluate(() => GOMOKU.state);
  console.log('UNDO_WHILE_THINKING ' + JSON.stringify({ total: st2.history.length, turn: st2.turn, busy: st2.busy }));

  // 4. 平局（填满棋盘，双人模式强制）
  await page.evaluate(() => { GOMOKU.setMode('pvp'); GOMOKU.reset(); });
  const draw = await page.evaluate(() => {
    // 构造一个不会五连的填充顺序：按列蛇形但每列颜色交替，确保没有五连
    let n = 0;
    for (let x = 0; x < 9; x++) {
      for (let i = 0; i < 9; i++) {
        const y = x % 2 === 0 ? i : 8 - i;
        if (!GOMOKU.place(x, y)) n++;
        if (GOMOKU.state.over) break;
      }
      if (GOMOKU.state.over) break;
    }
    return { over: GOMOKU.state.over, fill: GOMOKU.state.history.length, win: GOMOKU.state.winCells };
  });
  console.log('FILL ' + JSON.stringify(draw));

  // 5. 重开 + 模式切换
  await page.evaluate(() => { GOMOKU.reset(); GOMOKU.setMode('ai', 'normal'); });
  await page.waitForTimeout(300);
  console.log('SWITCH ' + JSON.stringify(await page.evaluate(() => ({
    mode: GOMOKU.state.mode, level: GOMOKU.state.level, stones: GOMOKU.stats().stones,
    activeBtn: document.querySelector('#modes .on').textContent
  }))));

  // 6. 视口改变后棋盘是否仍在安全区域
  await page.setViewportSize({ width: 900, height: 620 });
  await page.waitForTimeout(900);
  const box = await page.evaluate(() => {
    const pts = [];
    for (let x = 0; x < 9; x++) pts.push(GOMOKU.screenOf(x, 0), GOMOKU.screenOf(x, 8));
    for (let y = 0; y < 9; y++) pts.push(GOMOKU.screenOf(0, y), GOMOKU.screenOf(8, y));
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    return {
      minX: Math.round(Math.min(...xs)), maxX: Math.round(Math.max(...xs)),
      minY: Math.round(Math.min(...ys)), maxY: Math.round(Math.max(...ys)),
      w: innerWidth, h: innerHeight
    };
  });
  console.log('RESIZE_BOUNDS ' + JSON.stringify(box));

  // 7. AI 是否真的会堵四 / 会赢
  const ai = await page.evaluate(() => {
    const b = LOGIC.create();
    // 玩家横向 4 连，轮到 AI
    [[0, 4], [1, 4], [2, 4], [3, 4]].forEach(([x, y]) => { b[LOGIC.idx(x, y)] = 1; });
    b[LOGIC.idx(5, 0)] = 2;
    const mv = LOGIC.aiMove(b, 2, 'normal');
    const b2 = LOGIC.create();
    [[0, 4], [1, 4], [2, 4], [3, 4]].forEach(([x, y]) => { b2[LOGIC.idx(x, y)] = 2; });
    const mv2 = LOGIC.aiMove(b2, 2, 'normal');
    return { block: mv, win: mv2 };
  });
  console.log('AI_LOGIC ' + JSON.stringify(ai));

  // 8. 每步 AI 耗时
  const timing = await page.evaluate(() => {
    const b = LOGIC.create();
    for (let i = 0; i < 30; i++) {
      const x = (i * 3) % 9, y = (i * 5) % 9;
      if (b[LOGIC.idx(x, y)] === 0) b[LOGIC.idx(x, y)] = (i % 2) + 1;
    }
    const t0 = performance.now();
    for (let k = 0; k < 20; k++) LOGIC.aiMove(b, 2, 'normal');
    return { ms: +((performance.now() - t0) / 20).toFixed(2) };
  });
  console.log('AI_TIMING ' + JSON.stringify(timing));

  console.log('ERRS ' + JSON.stringify(errs));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
