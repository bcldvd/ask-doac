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
				.replace(/\[(\d+(?:,\s*\d+)*)\]/g, '<sup class="cite">$1</sup>')
				.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
				.replace(/\n/g, '<br>');
			return `<p>${safe}</p>`;
		})
		.filter((p) => p !== '<p></p>')
		.join('');
}
