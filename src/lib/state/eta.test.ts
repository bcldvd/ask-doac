import { describe, expect, it } from 'vitest';
import { DownloadEta, formatEta, formatSpeed } from './eta';

const MB = 1_000_000;

/** Feed `eta` one sample per second at a constant speed, returning the last estimate. */
function run(eta: DownloadEta, seconds: number, bytesPerSec: number, total: number) {
	let last = null;
	for (let t = 0; t <= seconds; t++) {
		last = eta.sample(t * 1000, t * bytesPerSec, total);
	}
	return last;
}

describe('DownloadEta', () => {
	it('returns null until the window spans at least a second', () => {
		const eta = new DownloadEta();
		expect(eta.sample(0, 0, 100 * MB)).toBeNull();
		expect(eta.sample(400, 5 * MB, 100 * MB)).toBeNull();
		expect(eta.sample(1200, 15 * MB, 100 * MB)).not.toBeNull();
	});

	it('estimates seconds left from a steady download speed', () => {
		const eta = new DownloadEta();
		// 10 MB/s against 100 MB total: after 4s (40 MB down), 60 MB left → 6s.
		const est = run(eta, 4, 10 * MB, 100 * MB)!;
		expect(est.bytesPerSec).toBeCloseTo(10 * MB, -3);
		expect(est.seconds).toBeCloseTo(6, 1);
	});

	it('only trusts the recent window, not the whole download', () => {
		const eta = new DownloadEta();
		// 20 s at 20 MB/s, then the connection halves to 10 MB/s for 10 s.
		let received = 0;
		for (let t = 0; t <= 20; t++) eta.sample(t * 1000, (received = t * 20 * MB), 1000 * MB);
		let est = null;
		for (let t = 21; t <= 30; t++) est = eta.sample(t * 1000, (received += 10 * MB), 1000 * MB);
		// Recent speed is 10 MB/s — the old 20 MB/s stretch must not drag it up.
		expect(est!.bytesPerSec).toBeCloseTo(10 * MB, -3);
	});

	it('returns null when the download stalls', () => {
		const eta = new DownloadEta();
		run(eta, 4, 10 * MB, 100 * MB);
		// Same byte count 6 s later: the 5 s window holds no progress at all.
		expect(eta.sample(10_000, 40 * MB, 100 * MB)).toBeNull();
	});

	it('clamps to zero seconds when the tail says done', () => {
		const eta = new DownloadEta();
		const est = run(eta, 10, 10 * MB, 100 * MB)!;
		expect(est.seconds).toBe(0);
	});
});

describe('formatEta', () => {
	it('buckets into friendly phrases', () => {
		expect(formatEta(600)).toBe('about 10 min left');
		expect(formatEta(95)).toBe('about 2 min left');
		expect(formatEta(75)).toBe('about a minute left');
		expect(formatEta(30)).toBe('under a minute left');
		expect(formatEta(5)).toBe('a few seconds left');
	});
});

describe('formatSpeed', () => {
	it('renders MB/s with one decimal', () => {
		expect(formatSpeed(15_240_000)).toBe('15.2 MB/s');
		expect(formatSpeed(800_000)).toBe('0.8 MB/s');
	});
});
