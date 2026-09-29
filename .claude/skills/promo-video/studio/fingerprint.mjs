// node fingerprint.mjs > fp.txt  Hashes 30 rendered stills and out/score.wav. Two runs with no code
// change must match (the render is deterministic); a refactor that changes nothing must match too.
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const md5 = (buf) => createHash('md5').update(buf).digest('hex');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
await page.goto('file://' + process.cwd().replace(/\\/g, '/') + '/index.html');
await page.evaluate(() => { document.body.classList.add('render'); return window.ready; });
for (let i = 0; i < 30; i++) {
  const t = 0.05 + i * (19.9 / 30);
  await page.evaluate((t) => window.seek(t), t);
  console.log(t.toFixed(3), md5(await page.locator('#c').screenshot()));
}
await browser.close();
console.log('score', md5(readFileSync('out/score.wav')));
