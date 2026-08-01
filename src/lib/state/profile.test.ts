// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';
import {
	ONBOARDING_REMIND_AFTER_MS,
	sanitizeProfile,
	shouldPromptOnboarding,
	type UserProfile
} from './profile';

const profile: UserProfile = {
	focusArea: 'sleep',
	experienceLevel: 'beginner',
	answerStyle: 'tactical',
	timeBudget: '20 min / day',
	constraints: ''
};

describe('sanitizeProfile', () => {
	test('accepts a valid profile payload', () => {
		expect(sanitizeProfile(profile)).toEqual(profile);
	});

	test('rejects invalid enum values', () => {
		expect(
			sanitizeProfile({
				...profile,
				focusArea: 'money'
			})
		).toBeNull();
	});
});

describe('shouldPromptOnboarding', () => {
	test('prompts when no profile and no skip marker', () => {
		expect(shouldPromptOnboarding(null, null, 10_000)).toBe(true);
	});

	test('suppresses prompt inside cooldown window', () => {
		expect(shouldPromptOnboarding(null, 10_000, 10_000 + ONBOARDING_REMIND_AFTER_MS - 1)).toBe(false);
	});

	test('prompts after cooldown expires', () => {
		expect(shouldPromptOnboarding(null, 10_000, 10_000 + ONBOARDING_REMIND_AFTER_MS + 1)).toBe(true);
	});

	test('never prompts when a profile exists', () => {
		expect(shouldPromptOnboarding(profile, null, 10_000)).toBe(false);
	});
});
