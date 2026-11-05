// Renders DS5 / 27-android-rest HTML to PNG. Usage (from docs/design/mockups/): node tools/ds5_render.mjs name:w:h:dpr ...
// Needs playwright-core (set PW_DIR to a folder with it in node_modules) and Chrome (CHROME, default /usr/bin/google-chrome).
import { createRequire } from 'module';
const require = createRequire((process.env.PW_DIR || process.cwd()) + '/');
const { chromium } = require('playwright-core');
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome' });
for (const a of process.argv.slice(2)) {
  const [n, w, h, d] = a.split(':');
  const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +d });
  await p.goto('file://' + process.cwd() + '/html/' + n + '.html'); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(200);
  await p.screenshot({ path: 'png/' + n + '.png' }); await p.close(); console.log('rendered', n);
}
await b.close();
