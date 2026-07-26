// One-off: mock conversation with an expanded source excerpt, for design review.
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

await mkdir('shots/v4', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:5199/?mock=1');
await page.waitForFunction(() => document.querySelector('.status')?.textContent?.includes('ON AIR'));
await page.fill('.composer-input', 'What do guests say about consistency?');
await page.click('.composer-send');
await page.waitForSelector('.sources');
await page.waitForTimeout(400);
await page.click('.sources .toggle'); // expand first source
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/v4/source-expanded.png', fullPage: true });
await browser.close();
console.log('done');
