import { describe, expect, test } from 'vitest';
import { profileScoreBoost } from './retrieve';

describe('profileScoreBoost', () => {
	const profile = {
		focusArea: 'sleep',
		experienceLevel: 'beginner',
		answerStyle: 'tactical',
		timeBudget: '20 min / day',
		constraints: ''
	} as const;

	test('returns zero with no profile', () => {
		expect(profileScoreBoost(null, 'Sleep', 'sleep')).toBe(0);
	});

	test('boosts excerpts that match focus terms in title and text', () => {
		const high = profileScoreBoost(
			profile,
			'Deep Sleep Protocol',
			'Better sleep and circadian rhythm with simple start steps.'
		);
		const low = profileScoreBoost(profile, 'Sales strategy', 'Pipeline tactics for startups.');
		expect(high).toBeGreaterThan(low);
	});

	test('adds a small style hint for tactical profiles', () => {
		const tactical = profileScoreBoost(profile, 'Sleep basics', 'simple sleep protocol');
		const deep = profileScoreBoost(
			{ ...profile, answerStyle: 'deep' },
			'Sleep basics',
			'simple sleep protocol'
		);
		expect(tactical).toBeGreaterThan(deep);
	});
});
