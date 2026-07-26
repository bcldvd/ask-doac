// Shareable question links. The app has no server or database, so a share
// link encodes the initial question itself in the URL: /?q=<question>.
// A query param (rather than a path) keeps the service worker's shell
// handling and static-host fallback untouched, and composes with ?mock=1.

/** Extract the shared question from a location.search string, or null. */
export function questionFromSearch(search: string): string | null {
	const q = new URLSearchParams(search).get('q')?.trim();
	return q ? q : null;
}

/** Return `search` with `q` set to `question`, preserving other params. */
export function searchWithQuestion(search: string, question: string): string {
	const params = new URLSearchParams(search);
	params.set('q', question);
	return `?${params}`;
}

/** Model answer → plain text: drop [n] citations and ** markers, tidy whitespace. */
export function plainAnswer(text: string): string {
	return text
		.replace(/\s*\[\d+(?:,\s*\d+)*\]/g, '')
		.replace(/\*\*([^*]+)\*\*/g, '$1')
		.split(/\n{2,}/)
		.map((p) => p.trim())
		.filter(Boolean)
		.join('\n\n');
}

const EXCERPT_MAX = 400;

/**
 * Web Share API payload for an answered question. The url reloads the same
 * question on our site (dev params like ?mock never leak into it), and the
 * text closes on an invitation so every share promotes the app.
 */
export function sharePayload(
	question: string,
	answer: string,
	origin: string
): { title: string; text: string; url: string } {
	let excerpt = plainAnswer(answer);
	if (excerpt.length > EXCERPT_MAX) {
		excerpt = excerpt.slice(0, EXCERPT_MAX);
		const cut = excerpt.lastIndexOf(' ');
		excerpt = `${(cut > 0 ? excerpt.slice(0, cut) : excerpt).trimEnd()}…`;
	}
	return {
		title: `Ask the Diary — ${question}`,
		text: `Q: ${question}\n\n${excerpt}\n\nAnswered from real Diary of a CEO episodes, entirely in the browser. Ask your own:`,
		url: `${origin}/${searchWithQuestion('', question)}`
	};
}
