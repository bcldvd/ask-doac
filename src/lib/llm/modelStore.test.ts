// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getModelFile, cachedModelUrls } from './modelStore';
import { GEMMA_MODELS } from './models';

const MODEL = GEMMA_MODELS[0];

/**
 * Minimal in-memory OPFS: just the parts modelStore touches
 * (root dir → 'models' dir → file handles with getFile/createWritable).
 */
function fakeOpfs(seed: Record<string, Uint8Array | string> = {}) {
	const store = new Map<string, Uint8Array>();
	for (const [name, content] of Object.entries(seed)) {
		store.set(name, typeof content === 'string' ? new TextEncoder().encode(content) : content);
	}
	const fileHandle = (name: string) => ({
		async getFile() {
			return new File([store.get(name)!.slice()], name);
		},
		async createWritable(opts?: { keepExistingData?: boolean }) {
			let bytes = opts?.keepExistingData ? store.get(name)!.slice() : new Uint8Array(0);
			return {
				async write(
					chunk: Uint8Array | string | { type: 'write'; position: number; data: Uint8Array }
				) {
					const positioned = typeof chunk === 'object' && 'type' in chunk;
					const raw = positioned ? chunk.data : chunk;
					const data = typeof raw === 'string' ? new TextEncoder().encode(raw) : raw;
					const at = positioned ? chunk.position : bytes.length;
					const next = new Uint8Array(Math.max(bytes.length, at + data.length));
					next.set(bytes);
					next.set(data, at);
					bytes = next;
				},
				async close() {
					store.set(name, bytes);
				},
				async abort() {}
			};
		}
	});
	const modelsDir = {
		async getFileHandle(name: string, opts?: { create?: boolean }) {
			if (!store.has(name)) {
				if (!opts?.create) throw new DOMException(name, 'NotFoundError');
				store.set(name, new Uint8Array(0));
			}
			return fileHandle(name);
		}
	};
	const root = { async getDirectoryHandle() { return modelsDir; } };
	Object.defineProperty(navigator, 'storage', {
		value: { getDirectory: async () => root },
		configurable: true
	});
	return store;
}

function fetchResponse(body: string) {
	return new Response(body, { headers: { 'Content-Length': String(body.length) } });
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('getModelFile', () => {
	it('returns the OPFS file without any network fetch when the stored copy is complete', async () => {
		fakeOpfs({
			[`${MODEL.id}.litertlm`]: 'model-bytes',
			[`${MODEL.id}.json`]: JSON.stringify({ url: MODEL.url, size: 11 })
		});
		const fetchSpy = vi.fn();
		vi.stubGlobal('fetch', fetchSpy);

		const file = await getModelFile(MODEL, () => {});
		expect(await file.text()).toBe('model-bytes');
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('downloads to OPFS with progress and marks the file complete only afterwards', async () => {
		const store = fakeOpfs();
		vi.stubGlobal('fetch', vi.fn(async () => fetchResponse('fresh-model')));
		const progress = vi.fn();

		const file = await getModelFile(MODEL, progress);
		expect(await file.text()).toBe('fresh-model');
		expect(progress).toHaveBeenCalledWith(
			expect.objectContaining({ stage: 'downloading', totalBytes: 11 })
		);
		const manifest = JSON.parse(new TextDecoder().decode(store.get(`${MODEL.id}.json`)));
		expect(manifest.size).toBe(11);
	});

	it('redownloads when the stored file is incomplete (no manifest)', async () => {
		fakeOpfs({ [`${MODEL.id}.litertlm`]: 'trunca' });
		vi.stubGlobal('fetch', vi.fn(async () => fetchResponse('full-model!')));

		const file = await getModelFile(MODEL, () => {});
		expect(await file.text()).toBe('full-model!');
	});

	it('migrates a legacy service-worker cache hit instead of hitting the network', async () => {
		fakeOpfs();
		const legacyDelete = vi.fn();
		vi.stubGlobal('caches', {
			open: async () => ({
				match: async (url: string) => (url === MODEL.url ? fetchResponse('legacy-bytes') : undefined),
				delete: legacyDelete,
				keys: async () => []
			}),
			delete: vi.fn()
		});
		const fetchSpy = vi.fn();
		vi.stubGlobal('fetch', fetchSpy);

		const file = await getModelFile(MODEL, () => {});
		expect(await file.text()).toBe('legacy-bytes');
		expect(fetchSpy).not.toHaveBeenCalled();
		expect(legacyDelete).toHaveBeenCalledWith(MODEL.url);
	});
});

describe('getModelFile — flaky networks', () => {
	it('resumes a partial file with a Range request instead of starting over', async () => {
		// 6 bytes already on disk from an interrupted download (no manifest)
		fakeOpfs({ [`${MODEL.id}.litertlm`]: 'abcdef' });
		const fetchSpy = vi.fn(async (_url: string, init?: RequestInit) => {
			expect(new Headers(init?.headers).get('Range')).toBe('bytes=6-');
			return new Response('ghijkl', {
				status: 206,
				headers: { 'Content-Length': '6' }
			});
		});
		vi.stubGlobal('fetch', fetchSpy);

		const file = await getModelFile(MODEL, () => {});
		expect(await file.text()).toBe('abcdefghijkl');
		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});

	it('retries after a network failure, resuming from the committed bytes', async () => {
		vi.useFakeTimers();
		fakeOpfs();
		let pulled = false;
		const half = new Response(
			new ReadableStream<Uint8Array>({
				pull(controller) {
					if (pulled) return controller.error(new TypeError('Load failed'));
					pulled = true;
					controller.enqueue(new TextEncoder().encode('abcdef'));
				}
			}),
			{ headers: { 'Content-Length': '12' } }
		);
		const rest = new Response('ghijkl', { status: 206, headers: { 'Content-Length': '6' } });
		const fetchSpy = vi.fn().mockResolvedValueOnce(half).mockResolvedValueOnce(rest);
		vi.stubGlobal('fetch', fetchSpy);

		const pending = getModelFile(MODEL, () => {});
		// swallow to avoid unhandled-rejection noise if the retry path breaks
		pending.catch(() => {});
		await vi.runAllTimersAsync();
		const file = await pending;
		expect(await file.text()).toBe('abcdefghijkl');
		expect(new Headers(fetchSpy.mock.calls[1][1]?.headers).get('Range')).toBe('bytes=6-');
		vi.useRealTimers();
	});

	it('treats a cleanly-ended-early stream as a failure and resumes it', async () => {
		vi.useFakeTimers();
		fakeOpfs();
		// server claims 12 bytes but the connection closes after 6 — no error thrown
		const short = new Response('abcdef', { headers: { 'Content-Length': '12' } });
		const rest = new Response('ghijkl', { status: 206, headers: { 'Content-Length': '6' } });
		vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(short).mockResolvedValueOnce(rest));

		const pending = getModelFile(MODEL, () => {});
		pending.catch(() => {});
		await vi.runAllTimersAsync();
		expect(await (await pending).text()).toBe('abcdefghijkl');
		vi.useRealTimers();
	});

	it('gives up with a message naming the model download after repeated failures', async () => {
		vi.useFakeTimers();
		fakeOpfs();
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Load failed')));

		const pending = getModelFile(MODEL, () => {});
		const outcome = pending.then(
			() => 'resolved',
			(e: Error) => e.message
		);
		await vi.runAllTimersAsync();
		expect(await outcome).toMatch(/model download failed.*Load failed/);
		vi.useRealTimers();
	});
});

describe('cachedModelUrls', () => {
	it('lists only models whose file size matches their manifest', async () => {
		fakeOpfs({
			[`${MODEL.id}.litertlm`]: 'model-bytes',
			[`${MODEL.id}.json`]: JSON.stringify({ url: MODEL.url, size: 11 }),
			// second model present but truncated relative to its manifest
			[`${GEMMA_MODELS[1].id}.litertlm`]: 'oops',
			[`${GEMMA_MODELS[1].id}.json`]: JSON.stringify({ url: GEMMA_MODELS[1].url, size: 999 })
		});
		expect(await cachedModelUrls()).toEqual([MODEL.url]);
	});

	it('returns an empty list when OPFS is unavailable', async () => {
		Object.defineProperty(navigator, 'storage', { value: undefined, configurable: true });
		expect(await cachedModelUrls()).toEqual([]);
	});
});
