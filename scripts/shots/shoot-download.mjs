// Capture the first-load download explainer in mock mode.
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const out = process.argv[2] ?? 'shots-download';
await mkdir(out, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });

// The mock download runs 40 ticks × 50ms (~2s) — grab it mid-flight.
await page.goto('http://localhost:5199/?mock=1');
await page.waitForSelector('.download-card', { timeout: 5000 });
await page.waitForTimeout(1100);
await page.screenshot({ path: `${out}/1-downloading.png` });
const meta = await page.textContent('.dl-meta');

await page.waitForSelector('.dl-bar.indeterminate', { timeout: 5000 });
await page.screenshot({ path: `${out}/2-initializing.png` });
const metaInit = await page.textContent('.dl-meta');

await page.waitForSelector('.card:enabled', { timeout: 15000 });
const cardGone = (await page.$('.download-card')) === null;
await page.screenshot({ path: `${out}/3-ready.png` });

await mobile.goto('http://localhost:5199/?mock=1');
await mobile.waitForSelector('.download-card', { timeout: 5000 });
await mobile.waitForTimeout(1100);
await mobile.screenshot({ path: `${out}/4-downloading-mobile.png` });

console.log('meta mid-download:', meta?.trim());
console.log('meta initializing:', metaInit?.trim());
console.log('card removed once ready:', cardGone);
await browser.close();
