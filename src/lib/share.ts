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

/**
 * Web Share API payload for an answered question. The answer travels in
 * full — every generation is unique, so the shared text is the only copy
 * the recipient will ever see. The site URL lives INSIDE the text: when a
 * separate `url` field is present, many share targets (WhatsApp, iMessage,
 * Mail) keep only the URL and drop the text entirely. Closing on the bare
 * origin means every share advertises the app.
 */
export function sharePayload(
	question: string,
	answer: string,
	origin: string
): { title: string; text: string } {
	return {
		title: `Ask the Diary — ${question}`,
		text: `Q: ${question}\n\n${plainAnswer(answer)}\n\nAnswered from real Diary of a CEO episodes, entirely in the browser. Ask your own: ${origin}/`
	};
}
