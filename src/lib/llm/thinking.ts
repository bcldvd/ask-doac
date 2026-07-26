const OPEN = '<think>';
const CLOSE = '</think>';

/**
 * Strip a leading `<think>…</think>` block from a streamed answer. Qwen 3
 * emits one before every reply (empty under /no_think, reasoning otherwise);
 * models that never think (Gemma) pass through with at most a 7-character
 * buffering delay. Only a block at the very start of the stream is dropped.
 */
export async function* stripThinking(chunks: AsyncIterable<string>): AsyncGenerator<string> {
	let buffer = '';
	let mode: 'detect' | 'inside' | 'through' = 'detect';
	// after a dropped block, also swallow the whitespace that separated it
	// from the answer — a reply must not begin with stray newlines
	let trimStart = false;
	for await (const p of chunks) {
		let piece = p;
		if (mode === 'through') {
			if (trimStart) {
				piece = piece.replace(/^\s+/, '');
				if (!piece) continue;
				trimStart = false;
			}
			yield piece;
			continue;
		}
		buffer += piece;
		if (mode === 'detect') {
			const lead = buffer.trimStart();
			if (lead.length < OPEN.length) {
				// could still turn into '<think>' — keep buffering
				if (OPEN.startsWith(lead)) continue;
			}
			if (lead.startsWith(OPEN)) {
				mode = 'inside';
			} else {
				mode = 'through';
				yield buffer;
				buffer = '';
				continue;
			}
		}
		const end = buffer.indexOf(CLOSE);
		if (end === -1) continue;
		mode = 'through';
		const rest = buffer.slice(end + CLOSE.length).replace(/^\s+/, '');
		buffer = '';
		if (rest) yield rest;
		else trimStart = true;
	}
	// stream ended while buffering (e.g. a partial '<th' that never resolved)
	if (buffer && mode === 'detect') yield buffer;
}
