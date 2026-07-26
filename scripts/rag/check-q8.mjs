// Does the q8 query embedder retrieve the same chunks as the fp32 one?
//
// The index is built with fp32 (scripts/rag/build-index.mjs), but the app
// embeds queries with q8 — 23 MB vendored instead of 90 MB, and far less ONNX
// arena to allocate next to a resident chat model. This measures what that
// costs: overlap of the top-k chunk sets and how far the top hit moves.
//
//   npx tsx scripts/rag/check-q8.mjs
import { readFile } from 'node:fs/promises';
import { pipeline } from '@huggingface/transformers';
import { normalize, topK } from '../../src/lib/rag/vector.ts';

const meta = JSON.parse(await readFile('static/rag/index.json', 'utf8'));
const emb = new Int8Array((await readFile('static/rag/embeddings.bin')).buffer);
const scales = new Float32Array((await readFile('static/rag/scales.bin')).buffer);

// Real questions, not toy strings: the bench dataset is what the app is judged
// on, so retrieval drift there is the number that matters.
const dataset = JSON.parse(await readFile('static/bench-dataset.json', 'utf8'));
const questions = dataset.items.map((i) => i.question);

const K = 8;
const embedders = {
	fp32: await pipeline('feature-extraction', meta.model, { dtype: 'fp32' }),
	q8: await pipeline('feature-extraction', meta.model, { dtype: 'q8' })
};

async function hits(embedder, q) {
	const out = await embedder(q, { pooling: 'mean', normalize: true });
	return topK(normalize(new Float32Array(out.data)), emb, scales, meta.dims, K);
}

let overlapTotal = 0;
let sameTop1 = 0;
let top1InOther = 0;
const worst = [];

for (const q of questions) {
	const a = await hits(embedders.fp32, q);
	const b = await hits(embedders.q8, q);
	const setA = new Set(a.map((h) => h.index));
	const shared = b.filter((h) => setA.has(h.index)).length;
	overlapTotal += shared / K;
	if (a[0].index === b[0].index) sameTop1++;
	if (setA.has(b[0].index)) top1InOther++;
	worst.push({ q, overlap: shared / K });
}

const n = questions.length;
worst.sort((x, y) => x.overlap - y.overlap);

console.log(`questions: ${n}   k=${K}`);
console.log(`mean top-${K} overlap : ${((overlapTotal / n) * 100).toFixed(1)}%`);
console.log(`identical top-1       : ${((sameTop1 / n) * 100).toFixed(1)}%`);
console.log(`q8 top-1 within fp32 top-${K}: ${((top1InOther / n) * 100).toFixed(1)}%`);
console.log(`\nweakest overlap:`);
for (const w of worst.slice(0, 5)) {
	console.log(`  ${(w.overlap * 100).toFixed(0)}%  ${w.q.slice(0, 70)}`);
}
