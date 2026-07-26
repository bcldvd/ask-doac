// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

// boot() wires the real engine + RAG index; both are mocked so the test can
// control the order in which they become available.
const engineMocks = vi.hoisted(() => ({
	loadEngine: vi.fn(),
	isModelCached: vi.fn(async () => false)
}));
const ragMocks = vi.hoisted(() => ({
	loadIndex: vi.fn(),
	retrieve: vi.fn(),
	clusterHits: vi.fn()
}));

vi.mock('$lib/llm/engine', () => engineMocks);
vi.mock('$lib/rag/retrieve', () => ragMocks);
vi.mock('$lib/rag/embed', () => ({ embedQuery: vi.fn(), getEmbedder: vi.fn(async () => ({})) }));
vi.mock('$lib/llm/translate', () => ({ toEnglishQuery: vi.fn(async (_e: unknown, q: string) => q) }));

import { app } from './app.svelte';

describe('app.boot', () => {
	it('only reaches ready once BOTH the engine and the RAG index are loaded', async () => {
		// jsdom has no navigator.gpu; without it boot() fails the WebGPU preflight.
		Object.defineProperty(navigator, 'gpu', { value: {}, configurable: true });
		let resolveIndex!: (index: unknown) => void;
		ragMocks.loadIndex.mockReturnValue(new Promise((r) => (resolveIndex = r)));
		// The real loadEngine reports stage 'ready' via onProgress before it
		// returns — on a refresh (model cached) this happens while the index
		// fetch is still in flight.
		engineMocks.loadEngine.mockImplementation(async (_model, onProgress) => {
			onProgress({ fraction: 1, receivedBytes: 1, totalBytes: 1, stage: 'ready' });
			return {};
		});

		const boot = app.boot();

		// Engine is ready, index is not: asking now would crash on a null index,
		// so the app must not advertise itself as ready yet.
		expect(app.stage).not.toBe('ready');

		resolveIndex({ episodes: [], chunks: [], vectors: new Float32Array(), dim: 0 });
		await boot;
		expect(app.stage).toBe('ready');
	});
});

describe('app.modelCached', () => {
	it('is true only when the service worker reports the current model url as cached', () => {
		expect(app.modelCached).toBe(false);
		app.cachedModels = ['https://example.com/other-model.litertlm'];
		expect(app.modelCached).toBe(false);
		app.cachedModels = [app.model.url];
		expect(app.modelCached).toBe(true);
		app.cachedModels = [];
	});
});
