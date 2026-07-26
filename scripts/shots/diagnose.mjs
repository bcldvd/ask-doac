// Diagnose the post-update download loop: watch navigations, crashes, SW
// state and Cache Storage contents on the persistent E2E profile.
import { chromium } from 'playwright';

const profile = `${process.env.TMPDIR ?? '/tmp'}/ask-doac-e2e-profile`;
const browser = await chromium.launchPersistentContext(profile, {
	channel: 'chrome',
	headless: true,
	viewport: { width: 1440, height: 900 },
	args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,SkiaGraphite']
});
const page = await browser.newPage();

const t = () => new Date().toISOString().slice(11, 23);
page.on('framenavigated', (f) => {
	if (f === page.mainFrame()) console.log(t(), 'NAVIGATED:', f.url());
});
page.on('crash', () => console.log(t(), 'PAGE CRASHED'));
page.on('response', (r) => {
	if (r.status() >= 400) console.log(t(), 'HTTP', r.status(), r.url().slice(0, 120));
});
page.on('console', (m) => {
	const type = m.type();
	if (type === 'error' || type === 'warning')
		console.log(t(), `CONSOLE[${type}]:`, m.text().slice(0, 200));
});

await page.goto('http://localhost:5220/');
await page.waitForTimeout(4000);

const state = await page.evaluate(async () => {
	const keys = await caches.keys();
	const models = await caches.open('ask-doac-models-v1');
	const modelKeys = (await models.keys()).map((k) => k.url);
	const est = await navigator.storage.estimate();
	const persisted = await navigator.storage.persisted();
	return {
		cacheNames: keys,
		modelKeys,
		usageGB: (est.usage / 1e9).toFixed(2),
		quotaGB: (est.quota / 1e9).toFixed(2),
		persisted,
		controller: navigator.serviceWorker.controller?.scriptURL ?? null,
		status: document.querySelector('.status')?.textContent?.trim()
	};
});
console.log('STATE:', JSON.stringify(state, null, 1));

// Watch for 3 minutes: log status every 10s to correlate with navigations.
for (let i = 0; i < 18; i++) {
	await page.waitForTimeout(10000);
	const s = await page
		.evaluate(() => document.querySelector('.status')?.textContent?.trim())
		.catch((e) => `(evaluate failed: ${String(e).slice(0, 80)})`);
	console.log(t(), 'status:', s);
}

await browser.close();
console.log('DIAG_DONE');
