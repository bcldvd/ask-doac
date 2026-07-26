import { describe, expect, test } from 'vitest';
import { chunkParagraphs } from './chunk';

const p = (text: string, t = '00:00:00') => ({ t, text });

describe('chunkParagraphs', () => {
	test('returns empty array for no paragraphs', () => {
		expect(chunkParagraphs([], { maxChars: 100 })).toEqual([]);
	});

	test('merges consecutive paragraphs into one chunk under the size limit', () => {
		const chunks = chunkParagraphs([p('Hello there.'), p('General Kenobi.')], { maxChars: 100 });
		expect(chunks).toHaveLength(1);
		expect(chunks[0].text).toBe('Hello there.\nGeneral Kenobi.');
	});

	test('starts a new chunk when adding a paragraph would exceed maxChars', () => {
		const a = 'a'.repeat(60);
		const b = 'b'.repeat(60);
		const chunks = chunkParagraphs([p(a), p(b)], { maxChars: 100, overlap: 0 });
		expect(chunks).toHaveLength(2);
		expect(chunks[0].text).toBe(a);
		expect(chunks[1].text).toBe(b);
	});

	test('keeps an oversized single paragraph as its own chunk', () => {
		const big = 'x'.repeat(500);
		const chunks = chunkParagraphs([p('small'), p(big), p('tiny')], {
			maxChars: 100,
			overlap: 0
		});
		expect(chunks.map((c) => c.text)).toEqual(['small', big, 'tiny']);
	});

	test('overlaps chunks by the requested number of paragraphs', () => {
		const a = 'a'.repeat(50);
		const b = 'b'.repeat(50);
		const c = 'c'.repeat(50);
		const chunks = chunkParagraphs([p(a), p(b), p(c)], { maxChars: 110, overlap: 1 });
		expect(chunks).toHaveLength(2);
		expect(chunks[0].text).toBe(`${a}\n${b}`);
		// second chunk repeats the last paragraph of the first
		expect(chunks[1].text).toBe(`${b}\n${c}`);
	});

	test('records the paragraph range and timestamp of the first paragraph', () => {
		const chunks = chunkParagraphs(
			[p('one', '00:01:00'), p('two', '00:02:00'), p('three'.repeat(30), '00:03:00')],
			{ maxChars: 5, overlap: 0 }
		);
		expect(chunks[0]).toMatchObject({ paraStart: 0, paraEnd: 0, t: '00:01:00' });
		expect(chunks[1]).toMatchObject({ paraStart: 1, paraEnd: 1, t: '00:02:00' });
		expect(chunks[2]).toMatchObject({ paraStart: 2, paraEnd: 2, t: '00:03:00' });
	});

	test('skips empty paragraphs', () => {
		const chunks = chunkParagraphs([p(''), p('  '), p('real content')], { maxChars: 100 });
		expect(chunks).toHaveLength(1);
		expect(chunks[0].text).toBe('real content');
		expect(chunks[0].paraStart).toBe(2);
	});
});
