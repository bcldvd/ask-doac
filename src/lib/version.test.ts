import { describe, expect, it } from 'vitest';
import { versionLabel } from './version';

describe('versionLabel', () => {
	it('formats the build moment as a readable date with the commit in parentheses', () => {
		expect(versionLabel('2026-07-26T15:42:07.000Z', '2c0c7f2')).toBe('26 Jul 2026, 15:42 (2c0c7f2)');
	});
});
