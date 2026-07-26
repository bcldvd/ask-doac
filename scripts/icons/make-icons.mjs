// Generate the PWA icon set from the DOAC-style lockup ("ASK" white-on-black
// above the DOAC white box). Renders with Chromium so the real Anton font is
// used, then downsizes with macOS sips.
// Usage: node scripts/icons/make-icons.mjs
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const outDir = resolve(root, 'static/icons');
const tmpDir = resolve(root, '.icon-tmp');
// Chromium won't load file:// fonts from a setContent page, so inline it.
const anton = await readFile(
	resolve(root, 'node_modules/@fontsource/anton/files/anton-latin-400-normal.woff2')
);
const antonUrl = `data:font/woff2;base64,${anton.toString('base64')}`;

// scale shrinks the lockup inside the canvas: maskable icons must keep all
// content within the central 80% safe zone.
const iconHtml = (scale) => `<!doctype html>
<html><head><style>
@font-face {
	font-family: 'Anton';
	src: url('${antonUrl}') format('woff2');
}
* { margin: 0; box-sizing: border-box; }
body {
	width: 1024px;
	height: 1024px;
	background: #000;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: ${Math.round(56 * scale)}px;
	font-family: 'Anton', sans-serif;
	text-transform: uppercase;
}
.ask {
	color: #fff;
	font-size: ${Math.round(330 * scale)}px;
	line-height: 0.9;
	letter-spacing: 0.02em;
}
.doac {
	background: #fff;
	color: #000;
	font-size: ${Math.round(150 * scale)}px;
	line-height: 1;
	letter-spacing: 0.02em;
	padding: ${Math.round(26 * scale)}px ${Math.round(44 * scale)}px ${Math.round(18 * scale)}px;
}
</style></head>
<body><div class="ask">Ask</div><div class="doac">DOAC</div></body></html>`;

await mkdir(outDir, { recursive: true });
await mkdir(tmpDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });

const shoot = async (scale, file) => {
	await page.setContent(iconHtml(scale));
	await page.evaluate(() => document.fonts.ready);
	await page.screenshot({ path: resolve(tmpDir, file) });
};

await shoot(1, 'icon-1024.png');
await shoot(0.78, 'icon-maskable-1024.png');
await browser.close();

const sips = (src, size, dest) =>
	execFileSync('sips', ['-z', String(size), String(size), resolve(tmpDir, src), '--out', resolve(outDir, dest)]);

sips('icon-1024.png', 512, 'icon-512.png');
sips('icon-1024.png', 192, 'icon-192.png');
sips('icon-1024.png', 180, 'apple-touch-icon.png');
sips('icon-maskable-1024.png', 512, 'icon-maskable-512.png');
await copyFile(resolve(tmpDir, 'icon-1024.png'), resolve(outDir, 'icon-1024.png'));
await rm(tmpDir, { recursive: true });
console.log(`icons written to ${outDir}`);
