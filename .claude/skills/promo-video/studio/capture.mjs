// node capture.mjs [packs]  Captures real TzDeck screens and pulled cards into ./assets
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { shotAlone } from './shot-alone.mjs';

const SITE = 'https://tzdeck.xyz';
const PACKS = Number(process.argv[2] ?? 8);
mkdirSync('assets/cards', { recursive: true });

const logo = await fetch(`${SITE}/tzdeck-shield-gradient-on-dark.svg`);
if (!logo.ok) throw new Error(`logo: HTTP ${logo.status}`);
writeFileSync('assets/tzdeck-shield-gradient-on-dark.svg', await logo.text());

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });

async function imagesSettled() {
  await page.waitForFunction(() => [...document.images].every((img) => img.complete), null, { timeout: 30_000 })
    .catch(() => console.log('  some images still loading, continuing'));
  await page.waitForTimeout(800);
}

await page.goto(SITE, { waitUntil: 'networkidle' });
await imagesSettled();
await page.screenshot({ path: 'assets/home.png' });
await shotAlone(page.locator('button[aria-label="Open booster pack"]'), 'assets/pack.png');

const cards = [];
for (let pack = 0; pack < PACKS; pack += 1) {
  if (pack > 0) await page.getByRole('button', { name: 'Open Another Pack' }).click();
  await page.locator('button[aria-label="Open booster pack"]').click();
  await page.getByText('Reveal All').waitFor();
  if (pack === 0) {
    await page.waitForTimeout(600);
    await page.screenshot({ path: 'assets/facedown.png' });
  }
  await page.getByText('Reveal All').click();
  await page.locator('button[aria-label^="View details for"]').first().waitFor();
  await imagesSettled();
  if (pack === 0) await page.screenshot({ path: 'assets/revealed.png', fullPage: true });

  const roots = page.locator('button[aria-label^="View details for"]')
    .locator('xpath=ancestor::div[contains(@class,"group") and contains(@class,"rounded-2xl")][1]');
  const n = await roots.count();
  for (let i = 0; i < n; i += 1) {
    const root = roots.nth(i);
    const text = await root.innerText();
    const file = `assets/cards/p${pack}-c${i}.png`;
    await shotAlone(root, file);
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    cards.push({ file, rarity: lines[0]?.toLowerCase(), lines: lines.slice(0, 8) });
  }
  console.log(`pack ${pack + 1}: ${cards.slice(-n).map((c) => c.rarity).join(', ')}`);
  await page.evaluate(() => window.scrollTo(0, 0));
}
writeFileSync('assets/cards.json', JSON.stringify(cards, null, 1));

await page.getByRole('tab', { name: /About/ }).click().catch(() => page.getByText('About').first().click());
await page.locator('section[aria-labelledby="rarity-grading"]').scrollIntoViewIfNeeded();
await page.locator('section[aria-labelledby="rarity-grading"]').screenshot({ path: 'assets/rarity.png' });

await browser.close();
console.log(`captured ${cards.length} cards`);
