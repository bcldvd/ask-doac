import { describe, expect, it } from 'vitest';
import { stripThinking } from './thinking';

async function* chunks(...pieces: string[]) {
	for (const p of pieces) yield p;
}

async function collect(stream: AsyncIterable<string>) {
	let out = '';
	for await (const piece of stream) out += piece;
	return out;
}

describe('stripThinking', () => {
	it('drops an empty leading think block (Qwen 3 with /no_think)', async () => {
		expect(await collect(stripThinking(chunks('<think></think> Answer [1].')))).toBe('Answer [1].');
	});

	it('drops a full leading think block split across chunks', async () => {
		expect(
			await collect(stripThinking(chunks('<thi', 'nk>let me reason', '…</thi', 'nk>\n\nAnswer.')))
		).toBe('Answer.');
	});

	it('passes text through untouched when there is no think block (Gemma)', async () => {
		expect(await collect(stripThinking(chunks("Steven's guests say", ' consistency [2].')))).toBe(
			"Steven's guests say consistency [2]."
		);
	});

	it('does not eat a later, non-leading <think> literal', async () => {
		expect(await collect(stripThinking(chunks('The tag <think> appears here.')))).toBe(
			'The tag <think> appears here.'
		);
	});

	it('flushes a partial prefix that never became <think>', async () => {
		expect(await collect(stripThinking(chunks('<th')))).toBe('<th');
	});
});
