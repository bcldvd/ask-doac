// Drive the /bench page through real Chromium+WebGPU, one model at a time.
// Writes bench/results/<id>.json  { model, cold, warm, results }.
//
// Usage: node scripts/bench/run.mjs [modelId ...]   (default: all)
import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = 5199;
const BASE = `http://localhost:${PORT}`;

export const MODELS = [
	{ id: 'gemma-4-E2B', engine: 'litert', model: 'gemma-4-E2B', label: 'Gemma 4 E2B (current default)' },
	{ id: 'gemma-4-E4B', engine: 'litert', model: 'gemma-4-E4B', label: 'Gemma 4 E4B' },
	{ id: 'qwen3-1.7b', engine: 'webllm', model: 'Qwen3-1.7B-q4f16_1-MLC', nothink: true, label: 'Qwen3 1.7B' },
	{ id: 'qwen3-0.6b', engine: 'webllm', model: 'Qwen3-0.6B-q4f16_1-MLC', nothink: true, label: 'Qwen3 0.6B' },
	{ id: 'llama-3.2-1b', engine: 'webllm', model: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', label: 'Llama 3.2 1B' },
	{ id: 'smollm2-1.7b', engine: 'webllm', model: 'SmolLM2-1.7B-Instruct-q4f16_1-MLC', label: 'SmolLM2 1.7B (SmolLM3 stand-in)' },
	{ id: 'qwen3.5-2b', engine: 'webllm', model: 'Qwen3.5-2B-q4f16_1-MLC', label: 'Qwen3.5 2B' },
	{ id: 'deepseek-r1-1.5b', engine: 'webllm', model: 'DeepSeek-R1-Distill-Qwen-1.5B-q4f16_1-MLC', label: 'DeepSeek R1 Distill 1.5B (custom lib)' }
];

const wanted = process.argv.slice(2);
const models = wanted.length ? MODELS.filter((m) => wanted.includes(m.id)) : MODELS;

async function waitForServer() {
	for (let i = 0; i < 60; i++) {
		try {
			const r = await fetch(`${BASE}/bench-dataset.json`, { method: 'HEAD' });
			if (r.ok) return;
		} catch {}
		await new Promise((r) => setTimeout(r, 1000));
	}
	throw new Error('dev server did not come up');
}

function benchUrl(m, mode) {
	const q = new URLSearchParams({ engine: m.engine, model: m.model, mode });
	if (m.nothink) q.set('nothink', '1');
	return `${BASE}/bench?${q}`;
}

async function runPass(context, m, mode, timeoutMin, log) {
	const page = await context.newPage();
	page.on('console', (msg) => {
		if (['error', 'warning'].includes(msg.type())) log(`console.${msg.type()}: ${msg.text().slice(0, 400)}`);
	});
	page.on('pageerror', (e) => log(`pageerror: ${String(e).slice(0, 400)}`));
	await page.goto(benchUrl(m, mode), { waitUntil: 'domcontentloaded' });

	const deadline = Date.now() + timeoutMin * 60_000;
	let last = '';
	while (Date.now() < deadline) {
		const state = await page.evaluate(() => {
			const b = window.__bench;
			return b ? { status: b.status, n: b.results.length, done: b.done, error: b.error ?? null } : null;
		});
		if (state) {
			const line = `${state.status} (${state.n} answers)`;
			if (line !== last) {
				last = line;
				log(line);
			}
			if (state.done) {
				const full = await page.evaluate(() => JSON.parse(JSON.stringify(window.__bench)));
				await page.close();
				return full;
			}
		}
		await new Promise((r) => setTimeout(r, 5000));
	}
	await page.close();
	throw new Error(`timeout after ${timeoutMin}min in mode=${mode}`);
}

// --- main ---
await mkdir(path.join(root, 'bench', 'results'), { recursive: true });
const logPath = path.join(root, 'bench', 'results', 'run.log');
const log = (msg) => {
	const line = `[${new Date().toISOString()}] ${msg}`;
	console.log(line);
	return appendFile(logPath, line + '\n');
};

const server = spawn('npx', ['vite', 'dev', '--port', String(PORT), '--strictPort'], {
	cwd: root,
	stdio: 'ignore',
	detached: false
});
process.on('exit', () => server.kill());
await waitForServer();
await log(`dev server up on :${PORT}`);

for (const m of models) {
	await log(`=== ${m.id} (${m.engine}:${m.model}) ===`);
	const context = await chromium.launchPersistentContext(path.join(root, 'bench', 'profile'), {
		headless: false,
		viewport: { width: 1100, height: 700 },
		args: ['--enable-unsafe-webgpu', '--enable-features=WebGPU', '--use-angle=metal']
	});
	try {
		const full = await runPass(context, m, 'full', 100, log);
		if (full.error) await log(`ERROR (cold pass): ${full.error.split('\n')[0]}`);
		// warm pass: same profile, weights now cached on disk
		let warm = null;
		if (!full.error) {
			warm = await runPass(context, m, 'load', 20, log);
			if (warm.error) await log(`ERROR (warm pass): ${warm.error.split('\n')[0]}`);
		}
		await writeFile(
			path.join(root, 'bench', 'results', `${m.id}.json`),
			JSON.stringify(
				{
					...m,
					cold: { loadMs: full.loadMs ?? null, downloadBytes: full.downloadBytes ?? null },
					warm: { loadMs: warm?.loadMs ?? null },
					contextWindow: full.contextWindow ?? null,
					error: full.error ?? warm?.error ?? null,
					results: full.results
				},
				null,
				'\t'
			)
		);
		await log(`${m.id}: ${full.results.length} answers, coldLoad ${Math.round(full.loadMs ?? -1)}ms, warmLoad ${Math.round(warm?.loadMs ?? -1)}ms`);
	} catch (e) {
		await log(`${m.id} FAILED: ${e.message}`);
		await writeFile(
			path.join(root, 'bench', 'results', `${m.id}.json`),
			JSON.stringify({ ...m, error: e.message, results: [] }, null, '\t')
		);
	} finally {
		await context.close();
	}
}
await log('all models done');
server.kill();
process.exit(0);
