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
- groundedness (0-5): claims are supported by the excerpts; no fabrication. When excerpts only touch the topic tangentially, the best answers stick to what was actually said and explicitly note what the excerpts don't cover; invented specifics score low.
- citations (0-5): uses [n] citations correctly and where claims need them.
- helpfulness (0-5): actually answers the user's question with the excerpts' substance.
- quality (0-5): concise, conversational, well-organized; no repetition, no meta-rambling, no leftover reasoning traces.

Reply with ONLY a JSON object: {"groundedness":n,"citations":n,"helpfulness":n,"quality":n,"note":"<=25 words"}`;

async function judgeOne(item, answer, isControl) {
	const excerpts = item.sources
		.map((s, i) => `[${i + 1}] ${s.episodeTitle} (${s.timestamp})\n${s.text}`)
		.join('\n\n');
	const prompt = `${RUBRIC}

${isControl ? 'NOTE: this is a stress-test question — the excerpts mention the topic only tangentially and do NOT cover the specific ask (hardware roadmaps). The ideal answer synthesizes only what guests actually said and plainly notes the excerpts do not cover roadmaps; any invented roadmap/specifics is fabrication.\n' : ''}
QUESTION: ${item.question}

EXCERPTS THE MODEL SAW:
${excerpts}

ANSWER TO JUDGE:
${answer || '(empty answer)'}`;

	const { stdout } = await exec('claude', ['-p', prompt, '--output-format', 'json'], {
		maxBuffer: 10 * 1024 * 1024,
		timeout: 180_000,
		stdio: ['ignore', 'pipe', 'pipe']
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
// incremental: keep existing scores, only judge new models
const scores = JSON.parse(
	await readFile(path.join(root, 'bench', 'results', 'scores.json'), 'utf8').catch(() => '{}')
);
for (const file of files) {
	const run = JSON.parse(await readFile(path.join(root, 'bench', 'results', file), 'utf8'));
	if (!run.results?.length) {
		console.log(`skip ${run.id}: no results`);
		continue;
	}
	if (scores[run.id]?.length === run.results.length && !scores[run.id].some((s) => s.error)) {
		console.log(`skip ${run.id}: already scored`);
		continue;
	}
	// judge 4 answers concurrently; checkpoint scores.json after each model
	const judged = [];
	const queue = [...run.results];
	await Promise.all(
		Array.from({ length: 4 }, async () => {
			for (let r = queue.shift(); r; r = queue.shift()) {
				const item = byId[r.id];
				// judge against the trimmed excerpt set the model actually received
				const seen = { ...item, sources: item.sources.slice(0, r.excerptsUsed) };
				try {
					const s = await judgeOne(seen, r.answer, item.control);
					judged.push({ question: r.id, ...s });
					console.log(`${run.id}/${r.id}: g${s.groundedness} c${s.citations} h${s.helpfulness} q${s.quality}`);
				} catch (e) {
					console.error(`${run.id}/${r.id} judge failed: ${e.message}`);
					judged.push({ question: r.id, error: e.message });
				}
			}
		})
	);
	scores[run.id] = judged;
	await writeFile(path.join(root, 'bench', 'results', 'scores.json'), JSON.stringify(scores, null, '\t'));
	console.log(`checkpointed ${run.id}`);
}
await writeFile(path.join(root, 'bench', 'results', 'scores.json'), JSON.stringify(scores, null, '\t'));
console.log('wrote bench/results/scores.json');
