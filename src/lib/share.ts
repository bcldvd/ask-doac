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
