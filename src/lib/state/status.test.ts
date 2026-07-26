import { describe, it, expect } from 'vitest';
import { searchingStatus, readingStatus } from './status';

const src = (episodeTitle: string) => ({ episodeTitle });

describe('searchingStatus', () => {
	it('names the episode count', () => {
		expect(searchingStatus(228)).toBe('Searching 228 episodes…');
	});

	it('handles a single episode', () => {
		expect(searchingStatus(1)).toBe('Searching 1 episode…');
	});
});

describe('readingStatus', () => {
	it('counts moments and distinct episodes', () => {
		const sources = [src('A'), src('A'), src('B'), src('C'), src('B'), src('D'), src('E'), src('A')];
		expect(readingStatus(sources)).toBe('Found 8 moments in 5 episodes — reading them closely…');
	});

	it('uses singular forms for one moment in one episode', () => {
		expect(readingStatus([src('A')])).toBe('Found 1 moment in 1 episode — reading it closely…');
	});

	it('pluralizes moments within a single episode', () => {
		expect(readingStatus([src('A'), src('A')])).toBe(
			'Found 2 moments in 1 episode — reading them closely…'
		);
	});

	it('falls back gracefully when nothing was found', () => {
		expect(readingStatus([])).toBe('Putting an answer together…');
	});
});
