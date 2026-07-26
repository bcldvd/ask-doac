// Verify the share button end-to-end in mock mode: navigator.share gets a
// payload whose url links back to the site with the question preloaded.
import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.addInitScript(() => {
	window.__sharedPayloads = [];
	navigator.share = async (data) => {
		window.__sharedPayloads.push(data);
	};
});

await page.goto('http://localhost:5199/?mock=1');
await page.waitForSelector('.card:enabled', { timeout: 15000 });
await page.click('.card >> nth=0');
await page.waitForSelector('.share', { timeout: 20000 });
await page.screenshot({ path: process.argv[2] ?? 'share-button.png' });

await page.click('.share');
const payloads = await page.evaluate(() => window.__sharedPayloads);
console.log(JSON.stringify(payloads, null, 2));

if (payloads.length !== 1) throw new Error('navigator.share not called exactly once');
const { title, text, url } = payloads[0];
if (!url.startsWith('http://localhost:5199/?q=')) throw new Error(`bad url: ${url}`);
if (url.includes('mock')) throw new Error('mock param leaked into share url');
if (!text.includes('Q: ')) throw new Error('text missing question');
if (text.includes('[1]')) throw new Error('citations leaked into share text');
if (!/Ask your own:$/.test(text.trim())) throw new Error('promo line missing');
if (!title.startsWith('Ask the Diary')) throw new Error(`bad title: ${title}`);

console.log('SHARE OK');
await browser.close();
