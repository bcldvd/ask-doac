import { normalize, topK, type Scored } from './vector';
import type { RetrievedSource } from '$lib/llm/prompt';

export interface RagIndex {
	dims: number;
	episodes: { id: string; title: string; url: string }[];
	/** per chunk: [episodeIdx, paraStart, paraEnd] */
	chunks: [number, number, number][];
	embeddings: Int8Array;
	scales: Float32Array;
}

export async function loadIndex(fetchFn = fetch): Promise<RagIndex> {
	const [meta, emb, sc] = await Promise.all([
		fetchFn('/rag/index.json').then((r) => r.json()),
		fetchFn('/rag/embeddings.bin').then((r) => r.arrayBuffer()),
		fetchFn('/rag/scales.bin').then((r) => r.arrayBuffer())
	]);
	return {
		dims: meta.dims,
		episodes: meta.episodes,
		chunks: meta.chunks,
		embeddings: new Int8Array(emb),
		scales: new Float32Array(sc)
	};
}

export interface RetrievedChunk extends RetrievedSource {
	episodeUrl: string;
	score: number;
}

const transcriptCache = new Map<string, Promise<{ paragraphs: { t: string; text: string }[] }>>();

function getTranscript(id: string, fetchFn = fetch) {
	let p = transcriptCache.get(id);
	if (!p) {
		p = fetchFn(`/transcripts/${id}.json`).then((r) => r.json());
		transcriptCache.set(id, p);
	}
	return p;
}

/**
 * Keep the best-scoring hit of any set of overlapping chunks (same episode,
 * intersecting paragraph ranges), up to k results. Hits must arrive sorted
 * best-first, which is what topK returns.
 */
export function dedupeHits(
	hits: Scored[],
	chunks: [number, number, number][],
	k: number
): Scored[] {
	const kept: Scored[] = [];
	for (const hit of hits) {
		const [ep, start, end] = chunks[hit.index];
		const overlaps = kept.some((other) => {
			const [oEp, oStart, oEnd] = chunks[other.index];
			return oEp === ep && start <= oEnd && end >= oStart;
		});
		if (!overlaps) kept.push(hit);
		if (kept.length === k) break;
	}
	return kept;
}

/**
 * Cosine search over the quantized index, then hydrate the winning chunks
 * with their transcript text (fetched lazily per episode).
 */
export async function retrieve(
	index: RagIndex,
	queryEmbedding: Float32Array,
	k = 6,
	fetchFn = fetch
): Promise<RetrievedChunk[]> {
	const raw = topK(normalize(queryEmbedding), index.embeddings, index.scales, index.dims, k * 4);
	const hits = dedupeHits(raw, index.chunks, k);
	return Promise.all(
		hits.map(async ({ index: chunkIdx, score }) => {
			const [epIdx, paraStart, paraEnd] = index.chunks[chunkIdx];
			const ep = index.episodes[epIdx];
			const transcript = await getTranscript(ep.id, fetchFn);
			const paras = transcript.paragraphs.slice(paraStart, paraEnd + 1);
			return {
				episodeTitle: ep.title,
				episodeUrl: ep.url,
				timestamp: paras[0]?.t ?? '',
				text: paras.map((p) => p.text).join('\n'),
				score
			};
		})
	);
}
