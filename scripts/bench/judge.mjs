// Score every answer in bench/results/*.json with an LLM judge (claude -p).
// Each answer is judged against the exact excerpts the model saw.
// Writes bench/results/scores.json.
//
// Usage: node scripts/bench/judge.mjs
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const dataset = JSON.parse(await readFile(path.join(root, 'bench', 'dataset.json'), 'utf8'));
const byId = Object.fromEntries(dataset.items.map((i) => [i.id, i]));

const RUBRIC = `You are judging an answer produced by a small on-device LLM for a RAG app over Diary of a CEO podcast transcripts. The model was told: ground every claim in the numbered excerpts, cite like [1], synthesize partial matches, never invent facts, decline only when nothing relates, keep it concise and conversational.

Score the ANSWER on these dimensions, each an integer:
- groundedness (0-5): claims are supported by the excerpts; no fabrication. For a control question where excerpts are irrelevant, a clear decline scores 5 and a made-up answer scores 0.
- citations (0-5): uses [n] citations correctly and where claims need them.
- helpfulness (0-5): actually answers the user's question with the excerpts' substance.
- quality (0-5): concise, conversational, well-organized; no repetition, no meta-rambling, no leftover reasoning traces.

Reply with ONLY a JSON object: {"groundedness":n,"citations":n,"helpfulness":n,"quality":n,"note":"<=25 words"}`;

async function judgeOne(item, answer, isControl) {
	const excerpts = item.sources
		.map((s, i) => `[${i + 1}] ${s.episodeTitle} (${s.timestamp})\n${s.text}`)
		.join('\n\n');
	const prompt = `${RUBRIC}

${isControl ? 'NOTE: this is the off-corpus control question — the excerpts do NOT answer it; declining is correct.\n' : ''}
QUESTION: ${item.question}

EXCERPTS THE MODEL SAW:
${excerpts}

ANSWER TO JUDGE:
${answer || '(empty answer)'}`;

	const { stdout } = await exec('claude', ['-p', prompt, '--output-format', 'json'], {
		maxBuffer: 10 * 1024 * 1024,
		timeout: 180_000
	});
	const wrapper = JSON.parse(stdout);
	const text = wrapper.result ?? '';
	const match = text.match(/\{[\s\S]*\}/);
	if (!match) throw new Error(`judge returned no JSON: ${text.slice(0, 200)}`);
	return JSON.parse(match[0]);
}

const files = (await readdir(path.join(root, 'bench', 'results'))).filter(
	(f) => f.endsWith('.json') && !['scores.json'].includes(f)
);
const scores = {};
for (const file of files) {
	const run = JSON.parse(await readFile(path.join(root, 'bench', 'results', file), 'utf8'));
	if (!run.results?.length) {
		console.log(`skip ${run.id}: no results`);
		continue;
	}
	scores[run.id] = [];
	for (const r of run.results) {
		const item = byId[r.id];
		// judge against the trimmed excerpt set the model actually received
		const seen = { ...item, sources: item.sources.slice(0, r.excerptsUsed) };
		try {
			const s = await judgeOne(seen, r.answer, item.control);
			scores[run.id].push({ question: r.id, ...s });
			console.log(`${run.id}/${r.id}: g${s.groundedness} c${s.citations} h${s.helpfulness} q${s.quality}`);
		} catch (e) {
			console.error(`${run.id}/${r.id} judge failed: ${e.message}`);
			scores[run.id].push({ question: r.id, error: e.message });
		}
	}
}
await writeFile(path.join(root, 'bench', 'results', 'scores.json'), JSON.stringify(scores, null, '\t'));
console.log('wrote bench/results/scores.json');
