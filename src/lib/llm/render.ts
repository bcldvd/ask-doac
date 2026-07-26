const ESCAPES: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;'
};

/**
 * Model output → safe HTML: escape everything, then re-introduce the few
 * marks we style — [n] citations, **bold**, and paragraph breaks.
 */
export function renderAnswer(text: string): string {
	return text
		.split(/\n{2,}/)
		.map((para) => {
			const safe = para
				.trim()
				.replace(/[&<>"]/g, (c) => ESCAPES[c])
				// The number lives in data-n and is drawn by CSS ::before, so
			// selecting and copying the answer never picks up citation marks.
			.replace(/\[(\d+(?:,\s*\d+)*)\]/g, '<sup class="cite" data-n="$1"></sup>')
				.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
				.replace(/\n/g, '<br>');
			return `<p>${safe}</p>`;
		})
		.filter((p) => p !== '<p></p>')
		.join('');
}
