// Retrieval smoke test: query the built index from Node.
import { readFile } from 'node:fs/promises';
import { pipeline } from '@huggingface/transformers';
import { normalize, topK } from '../../src/lib/rag/vector.ts';

const query = process.argv[2] ?? 'What does Andrew Huberman say about morning sunlight?';
const meta = JSON.parse(await readFile('static/rag/index.json', 'utf8'));
const emb = new Int8Array((await readFile('static/rag/embeddings.bin')).buffer);
const scales = new Float32Array((await readFile('static/rag/scales.bin')).buffer);

const embed = await pipeline('feature-extraction', meta.model, { dtype: 'fp32' });
const out = await embed(query, { pooling: 'mean', normalize: true });
const hits = topK(normalize(new Float32Array(out.data)), emb, scales, meta.dims, 5);

for (const { index, score } of hits) {
	const [epIdx, paraStart, paraEnd] = meta.chunks[index];
	const ep = meta.episodes[epIdx];
	const t = JSON.parse(await readFile(`static/transcripts/${ep.id}.json`, 'utf8'));
	const text = t.paragraphs
		.slice(paraStart, paraEnd + 1)
		.map((p) => p.text)
		.join(' ');
	console.log(`\n--- score=${score.toFixed(3)} ${ep.title}`);
	console.log(text.slice(0, 220) + '…');
}
