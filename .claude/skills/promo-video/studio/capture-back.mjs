// node capture-back.mjs  Captures one face-down card back into ./assets/back.png
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
await page.goto('https://tzdeck.xyz', { waitUntil: 'networkidle' });
await page.locator('button[aria-label="Open booster pack"]').click();
const back = page.locator('button[aria-label^="Reveal card"]').first();
await back.waitFor();
await page.waitForTimeout(1200);
await back.screenshot({ path: 'assets/back.png', omitBackground: true });
await browser.close();
