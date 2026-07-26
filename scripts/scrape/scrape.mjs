// Scrape all DOAC episode transcripts from podcasts.happyscribe.com.
// Resumable: skips episodes already saved in data/transcripts/.
import { chromium } from 'playwright';
import { mkdir, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = 'https://podcasts.happyscribe.com';
const SHOW = '/the-diary-of-a-ceo-with-steven-bartlett';
const OUT_DIR = path.resolve('data/transcripts');
await mkdir(OUT_DIR, { recursive: true });

const browser = await chromium.launch({
	channel: 'chrome',
	headless: true,
	args: ['--disable-blink-features=AutomationControlled']
});
const ctx = await browser.newContext({
	userAgent:
		'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
	viewport: { width: 1440, height: 900 }
});
const page = await ctx.newPage();
// Skip images/fonts/media to speed things up.
await ctx.route('**/*', (route) => {
	const t = route.request().resourceType();
	if (t === 'image' || t === 'font' || t === 'media') return route.abort();
	return route.continue();
});

async function goto(url) {
	for (let attempt = 1; attempt <= 3; attempt++) {
		try {
			await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
			for (let i = 0; i < 25; i++) {
				if (!/just a moment/i.test(await page.title())) return;
				await page.waitForTimeout(1500);
			}
		} catch (e) {
			console.log(`RETRY ${attempt} ${url}: ${e.message.split('\n')[0]}`);
			await page.waitForTimeout(3000 * attempt);
		}
	}
	throw new Error(`failed to load ${url}`);
}

// 1. Collect all episode URLs across index pages.
const slugs = [];
for (let p = 1; p <= 30; p++) {
	await goto(`${BASE}${SHOW}?page=${p}`);
	const links = await page.$$eval('a', (as) =>
		as
			.map((a) => a.getAttribute('href'))
			.filter((h) => h && h.startsWith('/the-diary-of-a-ceo-with-steven-bartlett/'))
	);
	const unique = [...new Set(links)];
	if (unique.length === 0) break;
	const before = slugs.length;
	for (const l of unique) if (!slugs.includes(l)) slugs.push(l);
	console.log(`INDEX page=${p} episodes=${unique.length} total=${slugs.length}`);
	if (slugs.length === before) break; // page repeated → past the end
	await page.waitForTimeout(500);
}
await writeFile(path.join(OUT_DIR, '..', 'episode-list.json'), JSON.stringify(slugs, null, 1));

// 2. Fetch each transcript.
const existing = new Set(await readdir(OUT_DIR));
let done = 0;
for (const slug of slugs) {
	const id = slug.split('/').pop();
	const file = `${id}.json`;
	if (existing.has(file)) {
		done++;
		continue;
	}
	try {
		await goto(`${BASE}${slug}`);
		const data = await page.evaluate(() => {
			const title = document
				.querySelector('h1')
				?.innerText?.trim() ?? document.title.replace(/ — .*$/, '');
			const paragraphs = [...document.querySelectorAll('div.hsp-paragraph')].map((d) => ({
				t: d.querySelector('.hsp-paragraph-timestamp')?.innerText?.trim() ?? '',
				text: d.querySelector('.hsp-paragraph-words')?.innerText?.trim() ?? ''
			}));
			return { title, paragraphs };
		});
		if (!data.paragraphs.length) {
			console.log(`EMPTY ${id}`);
		} else {
			await writeFile(
				path.join(OUT_DIR, file),
				JSON.stringify({ id, slug, url: `${BASE}${slug}`, ...data })
			);
		}
		done++;
		console.log(`SAVED ${done}/${slugs.length} ${id} (${data.paragraphs.length} paragraphs)`);
	} catch (e) {
		console.log(`FAIL ${id}: ${e.message.split('\n')[0]}`);
	}
	await page.waitForTimeout(400);
}
console.log('DONE total_saved=' + done);
await browser.close();
