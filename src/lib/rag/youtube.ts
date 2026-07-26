/** '01:15:08' → 4508. Accepts HH:MM:SS or MM:SS; garbage → 0. */
export function timestampToSeconds(ts: string): number {
	const parts = ts.split(':').map(Number);
	if (parts.some(Number.isNaN) || parts.length < 2 || parts.length > 3) return 0;
	return parts.reduce((total, p) => total * 60 + p, 0);
}

/** Deep link into the episode's YouTube video at the excerpt's timestamp. */
export function youtubeUrl(videoId: string, timestamp: string): string {
	const s = timestampToSeconds(timestamp);
	return `https://www.youtube.com/watch?v=${videoId}${s > 0 ? `&t=${s}s` : ''}`;
}
