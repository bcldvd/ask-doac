/** Scale a vector to unit length (zero vectors are returned as-is). */
export function normalize(v: Float32Array): Float32Array {
	let sum = 0;
	for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
	if (sum === 0) return v;
	const inv = 1 / Math.sqrt(sum);
	const out = new Float32Array(v.length);
	for (let i = 0; i < v.length; i++) out[i] = v[i] * inv;
	return out;
}

/** Symmetric int8 quantization: q[i]/127 * scale ≈ v[i], scale = max |v[i]|. */
export function quantize(v: Float32Array): { q: Int8Array; scale: number } {
	let scale = 0;
	for (let i = 0; i < v.length; i++) scale = Math.max(scale, Math.abs(v[i]));
	const q = new Int8Array(v.length);
	if (scale > 0) {
		for (let i = 0; i < v.length; i++) q[i] = Math.round((v[i] / scale) * 127);
	}
	return { q, scale };
}

export interface Scored {
	index: number;
	score: number;
}

/**
 * Cosine top-k of a unit-length float query against a flat int8 corpus
 * (one scale per row). Returns the k best rows, highest score first.
 */
export function topK(
	query: Float32Array,
	corpus: Int8Array,
	scales: Float32Array,
	dims: number,
	k: number
): Scored[] {
	const rows = corpus.length / dims;
	const scored: Scored[] = new Array(rows);
	for (let r = 0; r < rows; r++) {
		let dot = 0;
		const off = r * dims;
		for (let d = 0; d < dims; d++) dot += query[d] * corpus[off + d];
		scored[r] = { index: r, score: (dot * scales[r]) / 127 };
	}
	scored.sort((a, b) => b.score - a.score);
	return scored.slice(0, Math.min(k, rows));
}
