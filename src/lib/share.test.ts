import { describe, it, expect } from 'vitest';
import { questionFromSearch, searchWithQuestion, plainAnswer, sharePayload } from './share';

describe('questionFromSearch', () => {
	it('decodes the q param', () => {
		expect(questionFromSearch('?q=how%20do%20I%20fix%20my%20sleep%3F')).toBe(
			'how do I fix my sleep?'
		);
	});

	it('reads q alongside other params', () => {
		expect(questionFromSearch('?mock=1&q=what+makes+people+rich')).toBe('what makes people rich');
	});

	it('returns null when absent, empty, or whitespace', () => {
		expect(questionFromSearch('')).toBeNull();
		expect(questionFromSearch('?mock=1')).toBeNull();
		expect(questionFromSearch('?q=')).toBeNull();
		expect(questionFromSearch('?q=%20%20')).toBeNull();
	});

	it('trims surrounding whitespace', () => {
		expect(questionFromSearch('?q=%20hello%20')).toBe('hello');
	});
});

describe('searchWithQuestion', () => {
	it('produces a ?q= search string', () => {
		expect(searchWithQuestion('', 'how do I fix my sleep?')).toBe('?q=how+do+I+fix+my+sleep%3F');
	});

	it('preserves existing params like mock', () => {
		expect(searchWithQuestion('?mock=1', 'hello')).toBe('?mock=1&q=hello');
	});

	it('replaces a previous q', () => {
		expect(searchWithQuestion('?q=old', 'new question')).toBe('?q=new+question');
	});

	it('round-trips through questionFromSearch', () => {
		const q = 'what did the sleep expert say about caffeine? & more';
		expect(questionFromSearch(searchWithQuestion('?mock=1', q))).toBe(q);
	});
});

describe('plainAnswer', () => {
	it('strips [n] citation marks', () => {
		expect(plainAnswer('Volume matters most [1]. Identity too [2, 3].')).toBe(
			'Volume matters most. Identity too.'
		);
	});

	it('strips ** bold markers but keeps the words', () => {
		expect(plainAnswer('Sleep is **the** foundation.')).toBe('Sleep is the foundation.');
	});

	it('keeps paragraph breaks but trims stray whitespace', () => {
		expect(plainAnswer('  First point [1].\n\n\nSecond point.  ')).toBe(
			'First point.\n\nSecond point.'
		);
	});
});

describe('sharePayload', () => {
	const origin = 'https://ask-doac.example';

	it('links back to the site with the question preloaded', () => {
		const p = sharePayload('how do I fix my sleep?', 'Go to bed earlier [1].', origin);
		expect(p.url).toBe('https://ask-doac.example/?q=how+do+I+fix+my+sleep%3F');
	});

	it('never carries the current page params (like mock) into the link', () => {
		const p = sharePayload('hello', 'Answer.', origin);
		expect(p.url).not.toContain('mock');
	});

	it('leads with the question and a citation-free answer', () => {
		const p = sharePayload('how do I fix my sleep?', 'Go to bed **earlier** [1].', origin);
		expect(p.text).toContain('Q: how do I fix my sleep?');
		expect(p.text).toContain('Go to bed earlier.');
		expect(p.text).not.toContain('[1]');
		expect(p.text).not.toContain('**');
	});

	it('promotes the site in the closing line', () => {
		const p = sharePayload('hello', 'Answer.', origin);
		expect(p.text).toMatch(/Diary of a CEO/);
		expect(p.text.trimEnd()).toMatch(/Ask your own:$/);
	});

	it('has a title for share targets that use one', () => {
		const p = sharePayload('how do I fix my sleep?', 'Answer.', origin);
		expect(p.title).toBe('Ask the Diary — how do I fix my sleep?');
	});

	it('carries long answers in full — each generation is unique', () => {
		const long = `First paragraph. ${'word '.repeat(200).trim()}\n\nSecond paragraph, still included.`;
		const p = sharePayload('q', long, origin);
		expect(p.text).toContain('word word word');
		expect(p.text).toContain('Second paragraph, still included.');
		expect(p.text).not.toContain('…');
	});
});
