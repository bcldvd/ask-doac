// Build the benchmark dataset: embed each question with the same MiniLM model
// the app uses, run the app's real retrieve() against static/rag, and emit
// bench/dataset.json with the exact grounded prompt every model will receive.
//
// Usage: node scripts/bench/build-dataset.mjs
import { readFile } from 'node:fs/promises';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from '@huggingface/transformers';
import { loadIndex, retrieve } from '../../src/lib/rag/retrieve.ts';
import { buildGroundedPrompt, SYSTEM_PROMPT } from '../../src/lib/llm/prompt.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Same questions for every model. Mix of well-covered topics, synthesis-y
// questions, and one deliberately off-corpus control (expects a decline).
const QUESTIONS = [
	{ id: 'dopamine', q: 'How can I control my dopamine levels day to day?' },
	{ id: 'startups-fail', q: 'Why do most startups fail, according to the guests?' },
	{ id: '10k-hours', q: 'Is the 10,000 hours rule actually true?' },
	{ id: 'charisma', q: 'How do I become more charismatic and instantly likeable?' },
	{ id: 'house-vs-stocks', q: 'Should I buy a house or invest in stocks?' },
	{ id: 'short-form', q: 'What are the dangers of short-form video for my brain?' },
	{ id: 'aging', q: 'Can aging actually be reversed, and how?' },
	{ id: 'keto', q: 'What do the guests say about keto and carnivore diets?' },
	{ id: 'cheating', q: 'Why do men and women cheat in relationships?' },
	{ id: 'ai-jobs', q: 'Which jobs will disappear because of AI, and how do I prepare?' },
	{ id: 'creatine', q: 'Does creatine help with anything besides muscle?' },
	// control: nothing in the corpus should cover this — a grounded model declines
	{ id: 'control-offtopic', q: 'What did the guests say about quantum computing hardware roadmaps?' }
];

// fetch shim: the app loads /rag/* and /transcripts/* over HTTP; serve from static/.
const fileFetch = async (urlPath) => {
	const p = path.join(root, 'static', urlPath.replace(/^\//, ''));
	try {
		const buf = await readFile(p);
		return {
			ok: true,
			status: 200,
			json: async () => JSON.parse(buf.toString('utf8')),
			arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
		};
	} catch {
		return { ok: false, status: 404, json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) };
	}
};

const index = await loadIndex(fileFetch);
console.log(`index: ${index.episodes.length} episodes, ${index.chunks.length} chunks`);

const embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { dtype: 'fp32' });

const items = [];
for (const { id, q } of QUESTIONS) {
	const out = await embedder(q, { pooling: 'mean', normalize: true });
	const chunks = await retrieve(index, new Float32Array(out.data), 6, fileFetch);
	const sources = chunks.map(({ episodeTitle, timestamp, text }) => ({ episodeTitle, timestamp, text }));
	items.push({
		id,
		question: q,
		control: id.startsWith('control-'),
		sources,
		prompt: buildGroundedPrompt(q, sources, true)
	});
	console.log(`${id}: ${sources.length} excerpts, prompt ${items.at(-1).prompt.length} chars`);
}

await mkdir(path.join(root, 'bench'), { recursive: true });
await writeFile(
	path.join(root, 'bench', 'dataset.json'),
	JSON.stringify({ systemPrompt: SYSTEM_PROMPT, builtAt: new Date().toISOString(), items }, null, '\t')
);
console.log(`wrote bench/dataset.json (${items.length} questions)`);
