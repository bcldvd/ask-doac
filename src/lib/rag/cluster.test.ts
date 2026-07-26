import { describe, expect, test } from 'vitest';
import { clusterHits } from './retrieve';
import type { Scored } from './vector';

// chunks: [episodeIdx, paraStart, paraEnd]
const chunks: [number, number, number][] = [
	[0, 0, 4], // 0
	[0, 4, 8], // 1 — overlaps chunk 0 (shares para 4)
	[0, 10, 14], // 2 — same episode, within gap of chunk 1
	[1, 0, 4], // 3 — different episode, same paragraph numbers
	[1, 3, 6], // 4 — overlaps chunk 3
	[0, 40, 44], // 5 — same episode, far from everything
	[2, 0, 60] // 6 — huge range
];

const hit = (index: number, score: number): Scored => ({ index, score });

describe('clusterHits', () => {
	test('merges overlapping hits in the same episode into one wider excerpt', () => {
		const kept = clusterHits([hit(0, 0.9), hit(1, 0.8)], chunks, { k: 4, gap: 3, maxSpan: 30 });
		expect(kept).toHaveLength(1);
		expect(kept[0]).toMatchObject({ epIdx: 0, paraStart: 0, paraEnd: 8, score: 0.9 });
	});

	test('merges nearby (within gap) hits — depth on one topic beats deduping', () => {
		// chunk 2 starts 2 paragraphs after chunk 1 ends
		const kept = clusterHits([hit(1, 0.9), hit(2, 0.8)], chunks, { k: 4, gap: 3, maxSpan: 30 });
		expect(kept).toHaveLength(1);
		expect(kept[0]).toMatchObject({ epIdx: 0, paraStart: 4, paraEnd: 14 });
	});

	test('keeps hits from different episodes separate', () => {
		const kept = clusterHits([hit(0, 0.9), hit(3, 0.8)], chunks, { k: 4, gap: 3, maxSpan: 30 });
		expect(kept.map((c) => c.epIdx)).toEqual([0, 1]);
	});

	test('keeps distant hits in the same episode separate', () => {
		const kept = clusterHits([hit(0, 0.9), hit(5, 0.8)], chunks, { k: 4, gap: 3, maxSpan: 30 });
		expect(kept).toHaveLength(2);
	});

	test('caps distinct clusters at k but still deepens existing ones past the cap', () => {
		const kept = clusterHits(
			[hit(0, 0.9), hit(3, 0.8), hit(5, 0.7), hit(1, 0.6)],
			chunks,
			{ k: 2, gap: 3, maxSpan: 30 }
		);
		// hit(5) can't open a third cluster, but hit(1) still widens cluster 0
		expect(kept).toHaveLength(2);
		expect(kept[0]).toMatchObject({ epIdx: 0, paraStart: 0, paraEnd: 8 });
	});

	test('drops a hit whose merge would exceed maxSpan — region already saturated', () => {
		// merging chunk 0 (0–4) with chunk 5 (40–44) would span 45 paragraphs;
		// a separate cluster would only duplicate adjacent text, so the hit goes
		const kept = clusterHits([hit(0, 0.9), hit(5, 0.8)], chunks, { k: 4, gap: 50, maxSpan: 30 });
		expect(kept).toHaveLength(1);
		expect(kept[0]).toMatchObject({ paraStart: 0, paraEnd: 4 });
	});

	test('clusters keep the score of their best hit and stay best-first', () => {
		const kept = clusterHits([hit(0, 0.9), hit(3, 0.8), hit(1, 0.7)], chunks, {
			k: 4,
			gap: 3,
			maxSpan: 30
		});
		expect(kept.map((c) => c.score)).toEqual([0.9, 0.8]);
	});
});
