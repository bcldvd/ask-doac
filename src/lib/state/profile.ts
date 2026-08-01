export const FOCUS_AREAS = [
	{ id: 'sleep', label: 'Sleep' },
	{ id: 'fitness', label: 'Fitness' },
	{ id: 'business', label: 'Business' },
	{ id: 'mindset', label: 'Mindset' },
	{ id: 'relationships', label: 'Relationships' },
	{ id: 'productivity', label: 'Productivity' },
	{ id: 'nutrition', label: 'Nutrition' },
	{ id: 'longevity', label: 'Longevity' }
] as const;

export const EXPERIENCE_LEVELS = [
	{ id: 'beginner', label: 'Beginner' },
	{ id: 'intermediate', label: 'Intermediate' },
	{ id: 'advanced', label: 'Advanced' }
] as const;

export const ANSWER_STYLES = [
	{ id: 'tactical', label: 'Tactical steps' },
	{ id: 'deep', label: 'Deep explanation' },
	{ id: 'brief', label: 'Quick summary' }
] as const;

export const TIME_BUDGETS = [
	'10 min / day',
	'20 min / day',
	'30 min / day',
	'45 min / day',
	'60+ min / day'
] as const;

export const DEFAULT_TIME_BUDGET = TIME_BUDGETS[0];

export type FocusAreaId = (typeof FOCUS_AREAS)[number]['id'];
export type ExperienceLevelId = (typeof EXPERIENCE_LEVELS)[number]['id'];
export type AnswerStyleId = (typeof ANSWER_STYLES)[number]['id'];

export interface UserProfile {
	focusArea: FocusAreaId;
	experienceLevel: ExperienceLevelId;
	answerStyle: AnswerStyleId;
	timeBudget: string;
	constraints: string;
}

const PROFILE_KEY = 'ask-doac:user-profile:v1';
const SKIPPED_KEY = 'ask-doac:onboarding-skipped-at:v1';
export const ONBOARDING_REMIND_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null;
}

function hasString(v: Record<string, unknown>, key: string): v is Record<string, string> {
	return typeof v[key] === 'string';
}

function includesOption<T extends readonly { id: string }[]>(list: T, value: string): value is T[number]['id'] {
	return list.some((option) => option.id === value);
}

export function sanitizeProfile(input: unknown): UserProfile | null {
	if (!isRecord(input)) return null;
	if (!hasString(input, 'focusArea')) return null;
	if (!hasString(input, 'experienceLevel')) return null;
	if (!hasString(input, 'answerStyle')) return null;
	if (!hasString(input, 'timeBudget')) return null;
	if (!hasString(input, 'constraints')) return null;

	if (!includesOption(FOCUS_AREAS, input.focusArea)) return null;
	if (!includesOption(EXPERIENCE_LEVELS, input.experienceLevel)) return null;
	if (!includesOption(ANSWER_STYLES, input.answerStyle)) return null;
	const pickedBudget = input.timeBudget.trim();

	return {
		focusArea: input.focusArea,
		experienceLevel: input.experienceLevel,
		answerStyle: input.answerStyle,
		timeBudget: TIME_BUDGETS.includes(pickedBudget as (typeof TIME_BUDGETS)[number])
			? pickedBudget
			: DEFAULT_TIME_BUDGET,
		constraints: input.constraints.trim().slice(0, 240)
	};
}

export function loadStoredProfile(): UserProfile | null {
	if (typeof localStorage === 'undefined') return null;
	try {
		const raw = localStorage.getItem(PROFILE_KEY);
		if (!raw) return null;
		return sanitizeProfile(JSON.parse(raw));
	} catch {
		return null;
	}
}

export function storeProfile(profile: UserProfile) {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
	} catch {
		// ignore quota/storage failures
	}
}

export function clearStoredProfile() {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.removeItem(PROFILE_KEY);
	} catch {
		// ignore
	}
}

export function getOnboardingSkippedAt(): number | null {
	if (typeof localStorage === 'undefined') return null;
	try {
		const raw = localStorage.getItem(SKIPPED_KEY);
		if (!raw) return null;
		const ms = Number(raw);
		return Number.isFinite(ms) ? ms : null;
	} catch {
		return null;
	}
}

export function markOnboardingSkipped(at = Date.now()) {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(SKIPPED_KEY, String(at));
	} catch {
		// ignore
	}
}

export function clearOnboardingSkipped() {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.removeItem(SKIPPED_KEY);
	} catch {
		// ignore
	}
}

export function shouldPromptOnboarding(
	profile: UserProfile | null,
	skippedAt: number | null,
	now = Date.now(),
	cooldownMs = ONBOARDING_REMIND_AFTER_MS
): boolean {
	if (profile) return false;
	if (!skippedAt) return true;
	return now - skippedAt >= cooldownMs;
}

function lookupLabel<T extends readonly { id: string; label: string }[]>(options: T, id: string): string {
	return options.find((option) => option.id === id)?.label ?? id;
}

export function profileSummary(profile: UserProfile | null): string {
	if (!profile) return 'No profile set';
	return [
		lookupLabel(FOCUS_AREAS, profile.focusArea),
		lookupLabel(EXPERIENCE_LEVELS, profile.experienceLevel),
		lookupLabel(ANSWER_STYLES, profile.answerStyle)
	].join(' · ');
}
