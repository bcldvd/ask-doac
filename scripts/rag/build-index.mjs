// Build the static RAG index from data/transcripts/*.json:
//   static/rag/embeddings.bin  int8 rows (chunks × dims)
//   static/rag/scales.bin      float32 per-row quantization scale
//   static/rag/index.json      episodes + compact per-chunk metadata
//   static/transcripts/        per-episode paragraph JSON (served to the client)
import { mkdir, readdir, readFile, writeFile, cp } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from '@huggingface/transformers';
import { chunkParagraphs } from '../../src/lib/rag/chunk.ts';
import { quantize } from '../../src/lib/rag/vector.ts';

const MODEL = 'Xenova/all-MiniLM-L6-v2';
const MAX_CHARS = 1000;
const OVERLAP = 1;
const BATCH = 32;

const dataDir = path.resolve('data/transcripts');
const outDir = path.resolve('static/rag');
await mkdir(outDir, { recursive: true });

const files = (await readdir(dataDir)).filter((f) => f.endsWith('.json')).sort();
const episodes = [];
const chunkMeta = []; // [episodeIdx, paraStart, paraEnd]
const texts = [];

for (const file of files) {
	const ep = JSON.parse(await readFile(path.join(dataDir, file), 'utf8'));
	const chunks = chunkParagraphs(ep.paragraphs, { maxChars: MAX_CHARS, overlap: OVERLAP });
	if (chunks.length === 0) continue;
	const epIdx = episodes.length;
	episodes.push({ id: ep.id, title: ep.title, url: ep.url });
	for (const c of chunks) {
		chunkMeta.push([epIdx, c.paraStart, c.paraEnd]);
		texts.push(c.text);
	}
}
console.log(`episodes=${episodes.length} chunks=${texts.length}`);

const embed = await pipeline('feature-extraction', MODEL, { dtype: 'fp32' });
const dims = 384;
const flat = new Int8Array(texts.length * dims);
const scales = new Float32Array(texts.length);

const t0 = Date.now();
for (let i = 0; i < texts.length; i += BATCH) {
	const batch = texts.slice(i, i + BATCH);
	const out = await embed(batch, { pooling: 'mean', normalize: true });
	const data = out.data; // Float32Array (batch × dims)
	for (let b = 0; b < batch.length; b++) {
		const v = new Float32Array(data.buffer, data.byteOffset + b * dims * 4, dims);
		const { q, scale } = quantize(v);
		flat.set(q, (i + b) * dims);
		scales[i + b] = scale;
	}
	if ((i / BATCH) % 20 === 0) {
		const rate = (i + batch.length) / ((Date.now() - t0) / 1000);
		console.log(
			`embedded ${i + batch.length}/${texts.length} (${rate.toFixed(0)}/s, eta ${((texts.length - i) / rate / 60).toFixed(1)}min)`
		);
	}
}

await writeFile(path.join(outDir, 'embeddings.bin'), Buffer.from(flat.buffer));
await writeFile(path.join(outDir, 'scales.bin'), Buffer.from(scales.buffer));
await writeFile(
	path.join(outDir, 'index.json'),
	JSON.stringify({ model: MODEL, dims, episodes, chunks: chunkMeta })
);
await cp(dataDir, path.resolve('static/transcripts'), { recursive: true });
console.log('DONE');
