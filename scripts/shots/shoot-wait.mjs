// Capture the live-wait choreography in mock mode.
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const out = process.argv[2] ?? 'shots-wait';
await mkdir(out, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto('http://localhost:5199/?mock=1');
// wait for mock warm-up to finish (composer send enabled once ready + draft)
await page.waitForSelector('.card:enabled', { timeout: 15000 });

// ask a question and catch each stage
await page.click('.card >> nth=0');
await page.waitForTimeout(350); // searching stage (0–700ms)
await page.screenshot({ path: `${out}/1-searching.png` });

await page.waitForTimeout(750); // reading stage (700–1900ms), sources revealed
await page.screenshot({ path: `${out}/2-sources-while-reading.png` });

await page.waitForSelector('.answer', { timeout: 15000 });
await page.waitForTimeout(2500); // let the mock answer finish streaming
await page.screenshot({ path: `${out}/3-answer.png` });

const statusSeen = await page.evaluate(() => document.body.innerText.includes('FOUND'));
console.log('shots written to', out, '| status uppercase seen late:', statusSeen);
await browser.close();
