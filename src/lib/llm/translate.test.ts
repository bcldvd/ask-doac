import { describe, expect, test } from 'vitest';
import { cleanTranslation, TRANSLATE_SYSTEM } from './translate';

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
