import { describe, expect, test } from 'vitest';
import { normalize, quantize, topK } from './vector';

const vec = (...v: number[]) => new Float32Array(v);

describe('normalize', () => {
	test('scales a vector to unit length', () => {
		const n = normalize(vec(3, 4));
		expect(n[0]).toBeCloseTo(0.6);
		expect(n[1]).toBeCloseTo(0.8);
	});

	test('leaves the zero vector untouched', () => {
		const n = normalize(vec(0, 0));
		expect([...n]).toEqual([0, 0]);
	});
});

describe('quantize', () => {
	test('round-trips values within int8 tolerance', () => {
		const v = normalize(vec(0.5, -0.25, 0.1, -1));
		const { q, scale } = quantize(v);
		for (let i = 0; i < v.length; i++) {
			expect((q[i] * scale) / 127).toBeCloseTo(v[i], 1);
		}
	});

	test('uses the max absolute value as the scale', () => {
		const { q, scale } = quantize(vec(0.2, -0.8));
		expect(scale).toBeCloseTo(0.8);
		expect(q[1]).toBe(-127);
	});
});

describe('topK', () => {
	// 4 corpus vectors in 3 dims, quantized into one flat Int8Array
	const corpus = [vec(1, 0, 0), vec(0, 1, 0), vec(0.9, 0.1, 0), vec(-1, 0, 0)].map((v) =>
		normalize(v)
	);
	const dims = 3;
	const flat = new Int8Array(corpus.length * dims);
	const scales = new Float32Array(corpus.length);
	corpus.forEach((v, i) => {
		const { q, scale } = quantize(v);
		flat.set(q, i * dims);
		scales[i] = scale;
	});

	test('returns the k most similar vectors, best first', () => {
		const res = topK(normalize(vec(1, 0.05, 0)), flat, scales, dims, 2);
		expect(res.map((r) => r.index)).toEqual([0, 2]);
		expect(res[0].score).toBeGreaterThan(res[1].score);
	});

	test('an opposite vector ranks last', () => {
		const res = topK(normalize(vec(1, 0, 0)), flat, scales, dims, 4);
		expect(res[res.length - 1].index).toBe(3);
		expect(res[res.length - 1].score).toBeLessThan(0);
	});

	test('clamps k to the corpus size', () => {
		const res = topK(normalize(vec(0, 1, 0)), flat, scales, dims, 99);
		expect(res).toHaveLength(4);
	});
});
