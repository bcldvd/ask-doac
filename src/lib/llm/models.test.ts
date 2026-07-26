// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPreferredModel, DEFAULT_MODEL_ID, MOBILE_MODEL_ID } from './models';

const setUA = (ua: string, touchPoints = 0) => {
	Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
	Object.defineProperty(navigator, 'maxTouchPoints', { value: touchPoints, configurable: true });
};

// this vitest jsdom setup has no localStorage global — stub a minimal one
const stored = new Map<string, string>();
beforeEach(() => {
	vi.stubGlobal('localStorage', {
		getItem: (k: string) => stored.get(k) ?? null,
		setItem: (k: string, v: string) => stored.set(k, v)
	});
});
afterEach(() => {
	stored.clear();
	vi.unstubAllGlobals();
});

describe('getPreferredModel device default', () => {
	it('defaults phones to the small model — big ones die on the ~1.5–3 GB page memory cap', () => {
		setUA('Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15');
		expect(getPreferredModel().id).toBe(MOBILE_MODEL_ID);
	});

	it('detects iPads that masquerade as Macs via multitouch', () => {
		setUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', 5);
		expect(getPreferredModel().id).toBe(MOBILE_MODEL_ID);
	});

	it('keeps the full-size default on desktops', () => {
		setUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/135', 0);
		expect(getPreferredModel().id).toBe(DEFAULT_MODEL_ID);
	});

	it('an explicit preference beats the device default', () => {
		setUA('Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15');
		localStorage.setItem('ask-doac:model', DEFAULT_MODEL_ID);
		expect(getPreferredModel().id).toBe(DEFAULT_MODEL_ID);
	});
});
