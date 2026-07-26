export interface Paragraph {
	/** timestamp, e.g. "00:12:34" */
	t: string;
	text: string;
}

export interface Chunk {
	text: string;
	/** timestamp of the first paragraph in the chunk */
	t: string;
	paraStart: number;
	paraEnd: number;
}

export interface ChunkOptions {
	maxChars: number;
	/** number of trailing paragraphs repeated at the start of the next chunk */
	overlap?: number;
}

/**
 * Merge transcript paragraphs into retrieval chunks of at most `maxChars`
 * characters (a single oversized paragraph still becomes its own chunk).
 */
export function chunkParagraphs(paragraphs: Paragraph[], opts: ChunkOptions): Chunk[] {
	const { maxChars, overlap = 0 } = opts;
	const kept = paragraphs
		.map((p, index) => ({ ...p, index }))
		.filter((p) => p.text.trim().length > 0);

	const chunks: Chunk[] = [];
	let current: typeof kept = [];
	let currentLen = 0;

	const flush = () => {
		if (current.length === 0) return;
		chunks.push({
			text: current.map((p) => p.text).join('\n'),
			t: current[0].t,
			paraStart: current[0].index,
			paraEnd: current[current.length - 1].index
		});
	};

	for (const p of kept) {
		const addedLen = p.text.length + (current.length > 0 ? 1 : 0);
		if (current.length > 0 && currentLen + addedLen > maxChars) {
			flush();
			const carried = overlap > 0 ? current.slice(-overlap) : [];
			current = [...carried];
			currentLen = carried.reduce((n, c) => n + c.text.length, 0) + Math.max(0, carried.length - 1);
		}
		current.push(p);
		currentLen += p.text.length + (current.length > 1 ? 1 : 0);
	}
	flush();
	return chunks;
}
