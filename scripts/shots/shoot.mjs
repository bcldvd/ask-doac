// Screenshot the app in mock mode for design review.
// Usage: node scripts/shots/shoot.mjs [outDir]
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const out = process.argv[2] ?? 'shots';
await mkdir(out, { recursive: true });
const base = 'http://localhost:5199/?mock=1';

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

// 1. loading state (mock download takes ~2s)
await page.goto(base);
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/1-loading.png` });

// 2. hero ready (ON AIR)
await page.waitForTimeout(3000);
await page.screenshot({ path: `${out}/2-hero-ready.png` });

// 3. conversation with streamed answer + sources
await page.click('.card >> nth=0');
await page.waitForTimeout(6000);
await page.screenshot({ path: `${out}/3-conversation.png` });

// 4. preferences modal
await page.click('.gear');
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/4-preferences.png` });

// 5. mobile hero
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
await mobile.goto(base);
await mobile.waitForTimeout(4000);
await mobile.screenshot({ path: `${out}/5-mobile-hero.png` });

await browser.close();
console.log('shots written to', out);
