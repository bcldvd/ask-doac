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
		async createWritable() {
			let bytes = new Uint8Array(0);
			return {
				async write(chunk: Uint8Array | string) {
					const data = typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk;
					const next = new Uint8Array(bytes.length + data.length);
					next.set(bytes);
					next.set(data, bytes.length);
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
