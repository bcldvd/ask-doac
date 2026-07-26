import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startBootLog, crumb, stageLabel } from './bootlog';

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

describe('boot breadcrumbs', () => {
	it('reports a crash when the previous trail ended mid-stage', () => {
		crumb('boot', 1000);
		crumb('engine-weights', 9000);
		// page killed here — no 'ready', no 'error'
		const report = startBootLog();
		expect(report).toEqual({ stage: 'engine-weights', afterMs: 8000 });
	});

	it('reports nothing when the previous boot reached ready', () => {
		crumb('boot', 1000);
		crumb('ready', 5000);
		expect(startBootLog()).toBeNull();
	});

	it('reports nothing when the previous boot failed with a caught error', () => {
		crumb('boot', 1000);
		crumb('error: model download failed', 2000);
		expect(startBootLog()).toBeNull();
	});

	it('rotation clears the trail so one crash is only reported once', () => {
		crumb('boot', 1000);
		crumb('webgpu-device', 2000);
		expect(startBootLog()).not.toBeNull();
		expect(startBootLog()).toBeNull();
	});

	it('survives a missing localStorage', () => {
		vi.stubGlobal('localStorage', undefined);
		expect(() => crumb('boot')).not.toThrow();
		expect(startBootLog()).toBeNull();
	});
});

describe('stageLabel', () => {
	it('maps known stages to human phrasing and passes unknown ones through', () => {
		expect(stageLabel('engine-weights')).toMatch(/GPU/);
		expect(stageLabel('something-new')).toBe('something-new');
	});
});
