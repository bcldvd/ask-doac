import { normalize, topK, type Scored } from './vector';
import { youtubeUrl } from './youtube';
import type { RetrievedSource } from '$lib/llm/prompt';

export interface RagIndex {
	dims: number;
	episodes: { id: string; title: string; url: string }[];
	/** per chunk: [episodeIdx, paraStart, paraEnd] */
	chunks: [number, number, number][];
	embeddings: Int8Array;
	scales: Float32Array;
	/** episodeId → YouTube video id (built by scripts/rag/youtube-map.mjs) */
	youtube: Record<string, string>;
}

export async function loadIndex(fetchFn = fetch): Promise<RagIndex> {
	const [meta, emb, sc, youtube] = await Promise.all([
		fetchFn('/rag/index.json').then((r) => r.json()),
		fetchFn('/rag/embeddings.bin').then((r) => r.arrayBuffer()),
		fetchFn('/rag/scales.bin').then((r) => r.arrayBuffer()),
		fetchFn('/rag/youtube.json')
			.then((r) => (r.ok ? r.json() : {}))
			.catch(() => ({}))
	]);
	return {
		dims: meta.dims,
		episodes: meta.episodes,
		chunks: meta.chunks,
		embeddings: new Int8Array(emb),
		scales: new Float32Array(sc),
		youtube
	};
}

export interface RetrievedChunk extends RetrievedSource {
	episodeUrl: string;
	/** deep link to the episode's YouTube video at this excerpt's timestamp */
	videoUrl?: string;
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

export interface Cluster {
	epIdx: number;
	paraStart: number;
	paraEnd: number;
	/** best hit's score in the cluster */
	score: number;
}

export interface ClusterOptions {
	/** max number of distinct excerpts */
	k: number;
	/** merge hits whose ranges come within this many paragraphs of each other */
	gap: number;
	/** never grow a merged excerpt beyond this many paragraphs */
	maxSpan: number;
}

/**
 * Group hits into excerpts. When several hits land near each other in the
 * same episode, the conversation is going deep on the topic — merge them into
 * one longer excerpt instead of deduping the neighbors away. Hits must arrive
 * sorted best-first (what topK returns); clusters keep that order. After k
 * clusters exist, further hits can still widen existing clusters.
 */
export function clusterHits(
	hits: Scored[],
	chunks: [number, number, number][],
	{ k, gap, maxSpan }: ClusterOptions
): Cluster[] {
	const kept: Cluster[] = [];
	for (const hit of hits) {
		const [epIdx, start, end] = chunks[hit.index];
		const near = kept.find(
			(c) => c.epIdx === epIdx && start <= c.paraEnd + gap && end >= c.paraStart - gap
		);
		if (near) {
			const paraStart = Math.min(start, near.paraStart);
			const paraEnd = Math.max(end, near.paraEnd);
			if (paraEnd - paraStart + 1 <= maxSpan) {
				near.paraStart = paraStart;
				near.paraEnd = paraEnd;
			}
			// else: drop the hit — that region is already richly represented
		} else if (kept.length < k) {
			kept.push({ epIdx, paraStart: start, paraEnd: end, score: hit.score });
		}
	}
	return kept;
}

/**
 * Cosine search over the quantized index, cluster nearby hits into longer
 * excerpts, then hydrate with transcript text (fetched lazily per episode),
 * padded with `margin` paragraphs of surrounding context on each side.
 */
export async function retrieve(
	index: RagIndex,
	queryEmbedding: Float32Array,
	k = 6,
	fetchFn = fetch,
	{ gap = 4, maxSpan = 24, margin = 2 } = {}
): Promise<RetrievedChunk[]> {
	const raw = topK(normalize(queryEmbedding), index.embeddings, index.scales, index.dims, k * 5);
	const clusters = clusterHits(raw, index.chunks, { k, gap, maxSpan });
	return Promise.all(
		clusters.map(async ({ epIdx, paraStart, paraEnd, score }) => {
			const ep = index.episodes[epIdx];
			const transcript = await getTranscript(ep.id, fetchFn);
			const from = Math.max(0, paraStart - margin);
			const to = Math.min(transcript.paragraphs.length - 1, paraEnd + margin);
			const paras = transcript.paragraphs.slice(from, to + 1);
			const timestamp = paras[0]?.t ?? '';
			const videoId = index.youtube[ep.id];
			return {
				episodeTitle: ep.title,
				episodeUrl: ep.url,
				videoUrl: videoId ? youtubeUrl(videoId, timestamp) : undefined,
				timestamp,
				text: paras.map((p) => p.text).join('\n'),
				score
			};
		})
	);
}
