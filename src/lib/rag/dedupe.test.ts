import { describe, expect, test } from 'vitest';
import { dedupeHits } from './retrieve';
import type { Scored } from './vector';

// chunks: [episodeIdx, paraStart, paraEnd]
const chunks: [number, number, number][] = [
	[0, 0, 4], // 0
	[0, 4, 8], // 1 — overlaps chunk 0 (shares para 4)
	[0, 10, 14], // 2 — same episode, no overlap
	[1, 0, 4], // 3 — different episode, same paragraph numbers
	[1, 3, 6] // 4 — overlaps chunk 3
];

const hit = (index: number, score: number): Scored => ({ index, score });

describe('dedupeHits', () => {
	test('drops a hit whose paragraph range overlaps a better hit in the same episode', () => {
		const kept = dedupeHits([hit(0, 0.9), hit(1, 0.8), hit(2, 0.7)], chunks, 3);
		expect(kept.map((h) => h.index)).toEqual([0, 2]);
	});

	test('keeps same paragraph ranges from different episodes', () => {
		const kept = dedupeHits([hit(0, 0.9), hit(3, 0.8)], chunks, 2);
		expect(kept.map((h) => h.index)).toEqual([0, 3]);
	});

	test('stops after k unique hits', () => {
		const kept = dedupeHits([hit(0, 0.9), hit(2, 0.8), hit(3, 0.7)], chunks, 2);
		expect(kept).toHaveLength(2);
		expect(kept.map((h) => h.index)).toEqual([0, 2]);
	});
});
