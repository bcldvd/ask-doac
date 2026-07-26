// Real end-to-end: production build, no mock — downloads Gemma 4, waits for
// ON AIR, asks a question, captures the streamed answer + screenshot.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const out = 'shots/e2e';
await mkdir(out, { recursive: true });

const QUESTION = process.argv[2] ?? 'What does Matthew Walker say about caffeine and sleep?';

// Persistent context: an incognito profile caps Cache API quota far below
// the 2 GB the model needs, which silently breaks cache.put.
const profile = `${process.env.TMPDIR ?? '/tmp'}/ask-doac-e2e-profile`;
const browser = await chromium.launchPersistentContext(profile, {
	channel: 'chrome',
	headless: true,
	viewport: { width: 1440, height: 900 },
	args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,SkiaGraphite']
});
const page = await browser.newPage();
page.on('console', (m) => {
	if (m.type() === 'error') console.log('PAGE_ERROR:', m.text().slice(0, 300));
});
page.on('pageerror', (e) => console.log('PAGE_EXCEPTION:', String(e).slice(0, 300)));

/** Poll .status (with logging) until ON AIR; dump state and bail on failure. */
async function waitForOnAir(label, timeoutMs) {
	const deadline = Date.now() + timeoutMs;
	let last = '';
	while (Date.now() < deadline) {
		const status = (await page.textContent('.status').catch(() => null))?.trim() ?? '(no .status)';
		if (status !== last) {
			console.log(new Date().toISOString().slice(11, 19), `STATUS[${label}]:`, status);
			last = status;
		}
		if (status.startsWith('ON AIR')) return;
		if (status.includes('went dark')) break;
		await page.waitForTimeout(5000);
	}
	await page.screenshot({ path: `${out}/error-${label}.png` });
	const body = await page.evaluate(() => document.body.innerText.slice(0, 500)).catch(() => '');
	console.log(`FAILED[${label}] — last status: ${last}\nBODY: ${body}`);
	await browser.close();
	process.exit(1);
}

await page.goto('http://localhost:5220/');
await waitForOnAir('first-load', 30 * 60 * 1000);
console.log('READY');
await page.screenshot({ path: `${out}/ready.png` });

// The first load of a revisit can run the previous build (old SW serves the
// old cached shell until the new worker claims). Reload once so the question
// runs against the code we just deployed.
await page.waitForTimeout(3000);
await page.reload();
await waitForOnAir('post-update', 5 * 60 * 1000);
console.log('RELOADED onto current build — asking question');

await page.fill('.composer-input', QUESTION);
await page.click('.composer-send');

// Wait for a non-trivial answer (sources appear when generation finishes).
await page.waitForSelector('.sources', { timeout: 10 * 60 * 1000 });
const answer = await page.textContent('.answer');
console.log('ANSWER:', answer?.slice(0, 600));
const links = await page.$$eval('.sources a', (as) =>
	as.map((a) => `${a.textContent?.trim()} ${a.href}`)
);
for (const l of links) console.log('SOURCE:', l);
await page.screenshot({ path: `${out}/answered.png`, fullPage: true });
await writeFile(`${out}/answer.txt`, answer ?? '');

// Reload to verify the service worker serves the model from cache (fast ready).
const t0 = Date.now();
await page.reload();
await waitForOnAir('warm-reload', 5 * 60 * 1000);
console.log('RELOAD_TO_READY_MS:', Date.now() - t0);

// Offline reload: app shell + model must come entirely from the SW caches.
await browser.setOffline(true);
const t1 = Date.now();
await page.reload();
await waitForOnAir('offline', 5 * 60 * 1000);
console.log('OFFLINE_RELOAD_TO_READY_MS:', Date.now() - t1);
await page.screenshot({ path: `${out}/offline-ready.png` });

await browser.close();
console.log('E2E_DONE');
