import { describe, expect, test, vi } from 'vitest';
import { cleanTranslation, isEnglish, toEnglishQuery, TRANSLATE_SYSTEM } from './translate';
import type { Engine } from '@litert-lm/core';

vi.mock('./engine', () => ({
	streamAnswer: async function* () {
		// how a thinking model (Qwen 3) answers the translate prompt
		yield '<think>';
		yield '</think>';
		yield '\nHow do I fix my sleep?';
	}
}));

describe('toEnglishQuery', () => {
	test('the think block never becomes the search query', async () => {
		const engine = { createConversation: async () => ({}) } as unknown as Engine;
		expect(await toEnglishQuery(engine, 'Comment mieux dormir ?')).toBe('How do I fix my sleep?');
	});
});

describe('TRANSLATE_SYSTEM', () => {
	test('instructs the model to reply with only the English translation', () => {
		expect(TRANSLATE_SYSTEM).toMatch(/only/i);
		expect(TRANSLATE_SYSTEM).toMatch(/English/);
	});

	test('tells the model to pass English input through unchanged', () => {
		expect(TRANSLATE_SYSTEM).toMatch(/already in English/i);
		expect(TRANSLATE_SYSTEM).toMatch(/unchanged/i);
	});
});

describe('cleanTranslation', () => {
	test('trims whitespace around the translation', () => {
		expect(cleanTranslation('  How do I sleep better?  \n', 'q')).toBe('How do I sleep better?');
	});

	test('strips wrapping quotes a chatty model adds', () => {
		expect(cleanTranslation('"How do I sleep better?"', 'q')).toBe('How do I sleep better?');
		expect(cleanTranslation('« How do I sleep better? »', 'q')).toBe('How do I sleep better?');
	});

	test('keeps only the first line when the model rambles', () => {
		expect(cleanTranslation('How do I sleep better?\nLet me know if...', 'q')).toBe(
			'How do I sleep better?'
		);
	});

	test('falls back to the original question when the model returns nothing usable', () => {
		expect(cleanTranslation('', 'Comment mieux dormir ?')).toBe('Comment mieux dormir ?');
		expect(cleanTranslation('  "" \n', 'Comment mieux dormir ?')).toBe('Comment mieux dormir ?');
	});
});

describe('isEnglish', () => {
	test('question identical to its English translation is English', () => {
		expect(isEnglish('How do I fix my sleep?', 'How do I fix my sleep?')).toBe(true);
	});

	test('tolerates case and punctuation tweaks from the translator', () => {
		expect(isEnglish('how do i fix my sleep', 'How do I fix my sleep?')).toBe(true);
	});

	test('tolerates the translator rewording one word', () => {
		expect(isEnglish('How do I fix my sleep?', 'How can I fix my sleep?')).toBe(true);
	});

	test('a French question with an English translation is not English', () => {
		expect(isEnglish('Comment mieux dormir ?', 'How do I sleep better?')).toBe(false);
	});

	test('a fully rewritten question is not English', () => {
		expect(isEnglish('¿Cómo arreglo mi sueño?', 'How do I fix my sleep?')).toBe(false);
	});

	test('fails safe to English when a side is empty', () => {
		expect(isEnglish('', 'How do I sleep?')).toBe(true);
		expect(isEnglish('How do I sleep?', '')).toBe(true);
	});
});
