import { describe, it, expect } from 'vitest';
import { questionFromSearch, searchWithQuestion } from './share';

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
