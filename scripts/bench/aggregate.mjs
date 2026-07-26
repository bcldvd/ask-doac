// Merge bench/results/*.json + scores.json into bench/REPORT.md.
// Usage: node scripts/bench/aggregate.mjs
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dir = path.join(root, 'bench', 'results');

const scores = JSON.parse(await readFile(path.join(dir, 'scores.json'), 'utf8').catch(() => '{}'));
const files = (await readdir(dir)).filter((f) => f.endsWith('.json') && f !== 'scores.json');

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const fmt = (n, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : '—');
const sec = (ms) => (ms == null ? '—' : (ms / 1000).toFixed(1) + 's');

const rows = [];
for (const file of files) {
	const run = JSON.parse(await readFile(path.join(dir, file), 'utf8'));
	const sc = (scores[run.id] ?? []).filter((s) => !s.error);
	const nonControl = run.results.filter((r) => r.id !== 'control-offtopic');
	const decode = run.results
		.map((r) => r.usage?.extra?.decode_tokens_per_s)
		.filter((x) => typeof x === 'number');
	rows.push({
		id: run.id,
		label: run.label,
		error: run.error,
		n: run.results.length,
		cold: run.cold?.loadMs,
		warm: run.warm?.loadMs,
		ctx: run.contextWindow,
		excerpts: avg(run.results.map((r) => r.excerptsUsed)),
		ttft: avg(nonControl.map((r) => r.ttftMs)),
		total: avg(nonControl.map((r) => r.totalMs)),
		toks: decode.length ? avg(decode) : NaN,
		g: avg(sc.map((s) => s.groundedness)),
		c: avg(sc.map((s) => s.citations)),
		h: avg(sc.map((s) => s.helpfulness)),
		q: avg(sc.map((s) => s.quality)),
		overall: avg(sc.map((s) => s.groundedness + s.citations + s.helpfulness + s.quality))
	});
}
rows.sort((a, b) => (b.overall || 0) - (a.overall || 0));

let md = `# On-device model benchmark — ask-doac\n\nGenerated ${new Date().toISOString()} on this MacBook Pro (Chromium + WebGPU via Playwright). 12 questions (11 corpus + 1 off-topic control), identical RAG excerpts from the app's real retrieval, app's real system prompt. Judge: claude -p, rubric over groundedness / citations / helpfulness / quality (0-5 each, 20 max).\n\n`;
md += `| Model | Score /20 | Grnd | Cite | Help | Qual | Cold load | Warm load | TTFT | Answer time | tok/s | Ctx | Excerpts used |\n`;
md += `|---|---|---|---|---|---|---|---|---|---|---|---|---|\n`;
for (const r of rows) {
	if (r.error && !r.n) {
		md += `| ${r.label} | FAILED | | | | | | | | | | | ${r.error.split('\n')[0].slice(0, 60)} |\n`;
		continue;
	}
	md += `| ${r.label} | **${fmt(r.overall)}** | ${fmt(r.g)} | ${fmt(r.c)} | ${fmt(r.h)} | ${fmt(r.q)} | ${sec(r.cold)} | ${sec(r.warm)} | ${sec(r.ttft)} | ${sec(r.total)} | ${fmt(r.toks, 0)} | ${r.ctx ?? '—'} | ${fmt(r.excerpts)}/6 |\n`;
}
md += `\nTTFT/answer time exclude the control question. "Excerpts used" < 6 means the model's context window forced trimming.\n`;

// preserve hand-written analysis below the generated table across regenerations
const reportPath = path.join(root, 'bench', 'REPORT.md');
const existing = await readFile(reportPath, 'utf8').catch(() => '');
const keepFrom = existing.indexOf('\n## Findings');
if (keepFrom !== -1) md += existing.slice(keepFrom);

await writeFile(reportPath, md);
console.log(md);
