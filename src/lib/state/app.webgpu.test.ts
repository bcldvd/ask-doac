// @vitest-environment jsdom
// Separate file from app.svelte.test.ts on purpose: `app` is a module-level
// singleton whose boot() runs once, and a fresh module registry per test file
// is the only way to get an un-booted instance.
import { describe, expect, it, vi } from 'vitest';

const engineMocks = vi.hoisted(() => ({
	loadEngine: vi.fn(),
	createGroundedConversation: vi.fn(),
	streamAnswer: vi.fn()
}));

vi.mock('$lib/llm/engine', () => engineMocks);
vi.mock('$lib/rag/retrieve', () => ({ loadIndex: vi.fn(), retrieve: vi.fn() }));
vi.mock('$lib/rag/embed', () => ({ embedQuery: vi.fn(), getEmbedder: vi.fn() }));

import { app } from './app.svelte';

describe('app.boot without WebGPU', () => {
	// jsdom has no navigator.gpu — the same situation as Safari on iOS < 26,
	// Lockdown Mode, or any browser with WebGPU disabled.
	it('fails fast with a WebGPU message instead of starting the 2 GB download', async () => {
		await app.boot();
		expect(app.stage).toBe('error');
		expect(app.error).toMatch(/WebGPU/);
		expect(engineMocks.loadEngine).not.toHaveBeenCalled();
	});
});
