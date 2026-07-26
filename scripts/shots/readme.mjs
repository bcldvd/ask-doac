// README screenshots — the real app, no mock: downloads/loads Gemma 4, waits
// for ON AIR, captures the hero, then asks a question and captures the cited
// answer with a transcript excerpt open.
//
//   npm run build && npx vite preview --port 5220
//   node scripts/shots/readme.mjs ["a question"]
//
// Port 5220 matters: the model lives in per-origin storage, so reusing the
// e2e profile only skips the 2 GB download on that exact origin.
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const out = 'docs';
await mkdir(out, { recursive: true });

const QUESTION = process.argv[2] ?? 'What is the ideal workout regiment for a 60yo woman?';
const profile = `${process.env.TMPDIR ?? '/tmp'}/ask-doac-e2e-profile`;

const browser = await chromium.launchPersistentContext(profile, {
	channel: 'chrome',
	headless: true,
	viewport: { width: 1440, height: 900 },
	deviceScaleFactor: 2,
	args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,SkiaGraphite']
});
const page = await browser.newPage();
// Pin the model the README advertises — the shared e2e profile may have a
// small experiment model left pinned in localStorage.
await page.addInitScript(
	(id) => {
		localStorage.setItem('ask-doac:model', id);
		// Drop the boot breadcrumb trail. This profile is shared with the e2e
		// scripts, so any run killed or interrupted earlier leaves a trail that
		// never reached 'ready' — and the next boot then greets us with the red
		// "last attempt was cut short" banner across the hero shot. That warning
		// is about a previous session in a reused CI profile, not the state of
		// the app being photographed, so the README shot starts from a clean
		// slate. (Real first-run behaviour is what e2e-real.mjs covers.)
		localStorage.removeItem('ask-doac:boot:current');
		localStorage.removeItem('ask-doac:boot:previous');
	},
	process.env.ASK_DOAC_MODEL ?? 'gemma-4-E2B'
);
page.on('pageerror', (e) => console.log('PAGE_EXCEPTION:', String(e).slice(0, 300)));

async function waitForOnAir(timeoutMs) {
	const deadline = Date.now() + timeoutMs;
	let last = '';
	while (Date.now() < deadline) {
		const status = (await page.textContent('.status').catch(() => null))?.trim() ?? '(no .status)';
		if (status !== last) console.log(new Date().toISOString().slice(11, 19), 'STATUS:', status);
		last = status;
		if (status.startsWith('ON AIR')) return;
		await page.waitForTimeout(3000);
	}
	throw new Error(`never reached ON AIR — last status: ${last}`);
}

await page.goto('http://localhost:5220/');
await waitForOnAir(30 * 60 * 1000);
console.log('READY — hero');
await page.waitForTimeout(1500); // let the entrance animations settle
await page.screenshot({ path: `${out}/hero.png` });

await page.fill('.composer-input', QUESTION);
await page.click('.composer-send');
// Sources render as soon as retrieval lands, mid-stream — the Share button is
// the "generation finished" signal.
await page.waitForSelector('.share', { timeout: 10 * 60 * 1000 });
await page.waitForTimeout(1500);
console.log('ANSWERED:', (await page.textContent('.answer'))?.slice(0, 200));

// Open the top source so the shot shows the excerpt behind a citation.
await page.click('.source .toggle >> nth=0');
await page.mouse.move(20, 700); // park the cursor off the UI — no stray hover state
await page.waitForTimeout(400);

// Grow the viewport to the turn's height (+ room for the floating composer) so
// the answer, its sources and the open excerpt all fit in one frame. Two
// passes: the taller viewport reflows the text, changing the height we measured.
const turnBottom = () =>
	page.evaluate(() => {
		window.scrollTo(0, 0);
		const turn = document.querySelector('.turn-assistant');
		return Math.ceil(turn.getBoundingClientRect().bottom);
	});
for (let pass = 0; pass < 3; pass++) {
	const h = Math.min((await turnBottom()) + 200, 3000);
	if (Math.abs(h - page.viewportSize().height) < 8) break;
	await page.setViewportSize({ width: 1440, height: h });
	await page.waitForTimeout(500);
}
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/conversation.png` });

await browser.close();
console.log('wrote', `${out}/hero.png`, `${out}/conversation.png`);
