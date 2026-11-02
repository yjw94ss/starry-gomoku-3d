const { chromium } = require('/Users/Apple/.npm-global/lib/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({
    channel: 'chrome', headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars']
  });
  const page = await browser.newPage({ viewport: { width: 900, height: 620 }, deviceScaleFactor: 1 });
  await page.goto('http://127.0.0.1:8123/index.html', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { GOMOKU.start(); });
  await page.waitForTimeout(1200);

  const info = await page.evaluate(() => {
    const s = SCENE3D.scene();
    const lights = [];
    s.traverse(o => { if (o.isLight) lights.push({ type: o.type, intensity: o.intensity, color: o.color.getHexString() }); });
    return { lights, env: !!s.environment, tone: SCENE3D.renderer().toneMapping, exp: SCENE3D.renderer().toneMappingExposure };
  });
  console.log('SCENE ' + JSON.stringify(info));

  await page.screenshot({ path: 'qa/d0-base.png' });

  await page.evaluate(() => { SCENE3D.scene().environment = null; });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'qa/d1-noenv.png' });

  await page.evaluate(() => {
    SCENE3D.scene().traverse(o => { if (o.isHemisphereLight) o.intensity *= 0.3; });
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'qa/d2-noenv-lowhemi.png' });

  await page.evaluate(() => {
    SCENE3D.scene().traverse(o => { if (o.isDirectionalLight && o.intensity < 1) o.intensity *= 0.4; });
    SCENE3D.renderer().toneMappingExposure = 0.92;
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'qa/d3-final.png' });

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
