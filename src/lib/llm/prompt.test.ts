import { describe, expect, test } from 'vitest';
import { buildGroundedPrompt, SYSTEM_PROMPT } from './prompt';

const source = (over: Partial<Parameters<typeof buildGroundedPrompt>[1][number]> = {}) => ({
	episodeTitle: 'Alex Hormozi: How To Get Rich',
	timestamp: '00:14:02',
	text: 'The single biggest lever is volume. Most people simply do not do enough.',
	...over
});

describe('buildGroundedPrompt', () => {
	test('numbers each source and includes episode title, timestamp and text', () => {
		const prompt = buildGroundedPrompt('How do I get rich?', [
			source(),
			source({ episodeTitle: 'Naval on Wealth', timestamp: '01:02:03', text: 'Seek wealth, not money.' })
		]);
		expect(prompt).toContain('[1] Alex Hormozi: How To Get Rich (00:14:02)');
		expect(prompt).toContain('[2] Naval on Wealth (01:02:03)');
		expect(prompt).toContain('volume');
		expect(prompt).toContain('Seek wealth, not money.');
	});

	test('ends with the user question', () => {
		const prompt = buildGroundedPrompt('What did they say about sleep?', [source()]);
		expect(prompt.trimEnd().endsWith('What did they say about sleep?')).toBe(true);
	});

	test('system prompt pins answers to the excerpts and asks for [n] citations', () => {
		expect(SYSTEM_PROMPT).toMatch(/Diary of a CEO/i);
		expect(SYSTEM_PROMPT).toMatch(/\[n\]|\[1\]/);
		expect(SYSTEM_PROMPT).toMatch(/excerpt/i);
	});

	test('system prompt asks for partial answers instead of a binary refusal', () => {
		// The model must synthesize what the excerpts DO say and only decline
		// when nothing relates — a small model over-triggers on "if the
		// excerpts don't cover the question, say so".
		expect(SYSTEM_PROMPT).toMatch(/partial/i);
		expect(SYSTEM_PROMPT).toMatch(/only .*(decline|say you can)/i);
		expect(SYSTEM_PROMPT).not.toMatch(/don't cover the question, say so/i);
	});

	test('system prompt defers language choice to the user turn instead of asking the model to infer it', () => {
		expect(SYSTEM_PROMPT).not.toMatch(/same language as the question/i);
		expect(SYSTEM_PROMPT).toMatch(/language/i);
		expect(SYSTEM_PROMPT).toMatch(/translate quoted phrases/i);
	});

	test('pins English questions to an explicit "Answer in English."', () => {
		// "Same language as the question" makes the small model INFER the
		// language, and it sometimes misfires (an English question once got a
		// Portuguese answer). When we know the question is English, say so.
		const prompt = buildGroundedPrompt('How do I get rich?', [source()], true);
		expect(prompt).toContain('Answer in English.');
		expect(prompt).not.toMatch(/same language as the question/i);
	});

	test('non-English questions keep the mirror-the-question instruction near the tail', () => {
		// Small models weight the tail of the prompt most; the system prompt
		// alone is too far away once excerpts pile up.
		const prompt = buildGroundedPrompt('Comment devenir riche ?', [source()], false);
		const reminderAt = prompt.search(/same language as the question/i);
		expect(reminderAt).toBeGreaterThan(-1);
		expect(reminderAt).toBeGreaterThan(prompt.indexOf('volume'));
		expect(prompt).not.toContain('Answer in English.');
	});

	test('defaults to the English pin when no language flag is given', () => {
		const prompt = buildGroundedPrompt('How do I get rich?', [source()]);
		expect(prompt).toContain('Answer in English.');
	});

	test('states when there are no relevant excerpts', () => {
		const prompt = buildGroundedPrompt('Anything?', []);
		expect(prompt).toMatch(/no relevant excerpts/i);
	});
});
