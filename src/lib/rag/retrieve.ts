import { normalize, topK, type Scored } from './vector';
import { youtubeUrl } from './youtube';
import type { RetrievedSource } from '$lib/llm/prompt';
import type { UserProfile } from '$lib/state/profile';

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
	// label failures with the file — the boot error card shows this message
	const load = (path: string) =>
		fetchFn(path).then((r) => {
			if (!r.ok) throw new Error(`episode index failed to load: HTTP ${r.status} on ${path}`);
			return r;
		});
	const [meta, emb, sc, youtube] = await Promise.all([
		load('/rag/index.json').then((r) => r.json()),
		load('/rag/embeddings.bin').then((r) => r.arrayBuffer()),
		load('/rag/scales.bin').then((r) => r.arrayBuffer()),
		fetchFn('/rag/youtube.json')
			.then((r) => (r.ok ? r.json() : {}))
			.catch(() => ({}))
	]).catch((e) => {
		const msg = e instanceof Error ? e.message : String(e);
		throw msg.startsWith('episode index') ? e : new Error(`episode index failed to load: ${msg}`);
	});
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

export interface RetrieveOptions {
	gap?: number;
	maxSpan?: number;
	margin?: number;
	profile?: UserProfile | null;
}

const FOCUS_TERMS: Record<UserProfile['focusArea'], string[]> = {
	sleep: ['sleep', 'insomnia', 'circadian', 'caffeine', 'melatonin', 'rest'],
	fitness: ['fitness', 'training', 'exercise', 'cardio', 'strength', 'muscle', 'workout'],
	business: ['business', 'startup', 'sales', 'market', 'entrepreneur', 'revenue'],
	mindset: ['mindset', 'confidence', 'anxiety', 'fear', 'resilience', 'belief'],
	relationships: ['relationship', 'love', 'marriage', 'dating', 'family', 'friendship'],
	productivity: ['productivity', 'focus', 'discipline', 'deep work', 'habits', 'routine'],
	nutrition: ['nutrition', 'diet', 'protein', 'calorie', 'sugar', 'food'],
	longevity: ['longevity', 'aging', 'healthspan', 'biomarker', 'anti-aging', 'lifespan']
};

const LEVEL_TERMS: Record<UserProfile['experienceLevel'], string[]> = {
	beginner: ['beginner', 'start', 'simple', 'basics', 'first step'],
	intermediate: ['practice', 'progress', 'consistency', 'routine'],
	advanced: ['advanced', 'optimization', 'protocol', 'high performance']
};

function countMatches(text: string, terms: string[]): number {
	const hay = text.toLowerCase();
	let hits = 0;
	for (const term of terms) {
		if (hay.includes(term)) hits++;
	}
	return hits;
}

function profileStyleBoost(profile: UserProfile | null | undefined): number {
	if (!profile) return 0;
	if (profile.answerStyle === 'tactical') return 0.03;
	if (profile.answerStyle === 'deep') return 0.02;
	return 0;
}

function profileTitleBoost(profile: UserProfile | null | undefined, title: string): number {
	if (!profile) return 0;
	const titleMatches = countMatches(title, FOCUS_TERMS[profile.focusArea]);
	return Math.min(0.22, titleMatches * 0.09);
}

function profileTextBoost(profile: UserProfile | null | undefined, text: string): number {
	if (!profile) return 0;
	const textMatches = countMatches(text, FOCUS_TERMS[profile.focusArea]);
	const levelHits = countMatches(text, LEVEL_TERMS[profile.experienceLevel]);
	const focusBoost = Math.min(0.13, textMatches * 0.015);
	const levelBoost = Math.min(0.08, levelHits * 0.02);
	return focusBoost + levelBoost;
}

export function profileScoreBoost(profile: UserProfile | null | undefined, title: string, text: string) {
	if (!profile) return 0;
	return profileTitleBoost(profile, title) + profileTextBoost(profile, text) + profileStyleBoost(profile);
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
	{ gap = 4, maxSpan = 24, margin = 2, profile = null }: RetrieveOptions = {}
): Promise<RetrievedChunk[]> {
	const raw = topK(normalize(queryEmbedding), index.embeddings, index.scales, index.dims, k * 5);
	const reranked = raw
		.map((hit) => {
			const [epIdx] = index.chunks[hit.index];
			const title = index.episodes[epIdx]?.title ?? '';
			return {
				...hit,
				score: hit.score + profileScoreBoost(profile, title, '') * 0.5
			};
		})
		.sort((a, b) => b.score - a.score);
	const clusters = clusterHits(reranked, index.chunks, { k, gap, maxSpan });
	const chunks = await Promise.all(
		clusters.map(async ({ epIdx, paraStart, paraEnd, score }) => {
			const ep = index.episodes[epIdx];
			const transcript = await getTranscript(ep.id, fetchFn);
			const from = Math.max(0, paraStart - margin);
			const to = Math.min(transcript.paragraphs.length - 1, paraEnd + margin);
			const paras = transcript.paragraphs.slice(from, to + 1);
			const timestamp = paras[0]?.t ?? '';
			const videoId = index.youtube[ep.id];
			const text = paras.map((p) => p.text).join('\n');
			return {
				episodeTitle: ep.title,
				episodeUrl: ep.url,
				videoUrl: videoId ? youtubeUrl(videoId, timestamp) : undefined,
				timestamp,
				text,
				score: score + profileScoreBoost(profile, '', text) * 0.5
			};
		})
	);
	return chunks.sort((a, b) => b.score - a.score);
}
