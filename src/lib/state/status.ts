// Plain-language status lines shown while an answer is being prepared.
// Deliberately non-technical: no model names, tokens, or scores.

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function searchingStatus(episodeCount: number): string {
	return `Searching ${plural(episodeCount, 'episode')}…`;
}

export function readingStatus(sources: { episodeTitle: string }[]): string {
	if (sources.length === 0) return 'Putting an answer together…';
	const episodes = new Set(sources.map((s) => s.episodeTitle)).size;
	const them = sources.length === 1 ? 'it' : 'them';
	return `Found ${plural(sources.length, 'moment')} in ${plural(episodes, 'episode')} — reading ${them} closely…`;
}
