// Model files live in OPFS (origin-private file system), streamed to disk as
// they download. The page never holds more than one network chunk in memory —
// buffering the 2 GB model in RAM gets the tab killed by iOS's memory
// watchdog long before the download finishes. The File handed back to the
// engine is disk-backed, and LiteRT's streaming loader consumes it slice by
// slice, so memory stays flat end to end.
import { GEMMA_MODELS, type GemmaModel } from './models';
import type { LoadProgress } from './engine';

/** cache name used by service-worker versions that cached models themselves */
const LEGACY_CACHE = 'ask-doac-models-v1';

/**
 * Written next to the model file only after a download completes — its
 * presence (with a matching byte count) is what marks a copy as whole, so a
 * download killed halfway never passes for a cached model.
 */
interface Manifest {
	url: string;
	size: number;
}

const modelFileName = (model: GemmaModel) => `${model.id}.litertlm`;
const manifestFileName = (model: GemmaModel) => `${model.id}.json`;

async function modelsDir(): Promise<FileSystemDirectoryHandle> {
	const root = await navigator.storage.getDirectory();
	return root.getDirectoryHandle('models', { create: true });
}

async function readFileIn(dir: FileSystemDirectoryHandle, name: string): Promise<File | null> {
	try {
		const handle = await dir.getFileHandle(name);
		return await handle.getFile();
	} catch {
		return null;
	}
}

async function completeFile(dir: FileSystemDirectoryHandle, model: GemmaModel): Promise<File | null> {
	const [file, manifestFile] = await Promise.all([
		readFileIn(dir, modelFileName(model)),
		readFileIn(dir, manifestFileName(model))
	]);
	if (!file || !manifestFile) return null;
	try {
		const manifest: Manifest = JSON.parse(await manifestFile.text());
		return file.size === manifest.size ? file : null;
	} catch {
		return null;
	}
}

/** Response from the legacy service-worker cache, if this browser has one. */
async function legacyCacheHit(model: GemmaModel): Promise<Response | undefined> {
	if (typeof caches === 'undefined') return undefined;
	try {
		const cache = await caches.open(LEGACY_CACHE);
		return await cache.match(model.url);
	} catch {
		return undefined;
	}
}

/** Drop the migrated entry; remove the whole cache once it's empty. */
async function cleanupLegacyCache(model: GemmaModel): Promise<void> {
	try {
		const cache = await caches.open(LEGACY_CACHE);
		await cache.delete(model.url);
		if ((await cache.keys()).length === 0) await caches.delete(LEGACY_CACHE);
	} catch {
		// cleanup is best-effort; a leftover cache entry costs disk, not correctness
	}
}

/**
 * Return a disk-backed File for the model, downloading (or migrating from the
 * old service-worker cache) into OPFS if needed, with byte progress.
 */
export async function getModelFile(
	model: GemmaModel,
	onProgress: (p: LoadProgress) => void
): Promise<File> {
	const dir = await modelsDir();
	const cached = await completeFile(dir, model);
	if (cached) return cached;

	const legacy = await legacyCacheHit(model);
	const res = legacy ?? (await fetch(model.url));
	if (!res.ok || !res.body) throw new Error(`model download failed: HTTP ${res.status}`);
	const totalBytes = Number(res.headers.get('Content-Length')) || model.sizeBytes;

	const handle = await dir.getFileHandle(modelFileName(model), { create: true });
	const writable = await handle.createWritable();
	let receivedBytes = 0;
	const reader = res.body.getReader();
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			receivedBytes += value.byteLength;
			await writable.write(value);
			onProgress({
				fraction: Math.min(receivedBytes / totalBytes, 1),
				receivedBytes,
				totalBytes,
				stage: 'downloading'
			});
		}
		await writable.close();
	} catch (e) {
		await writable.abort().catch(() => {});
		throw e;
	}

	const manifest: Manifest = { url: model.url, size: receivedBytes };
	const manifestHandle = await dir.getFileHandle(manifestFileName(model), { create: true });
	const manifestWritable = await manifestHandle.createWritable();
	await manifestWritable.write(JSON.stringify(manifest));
	await manifestWritable.close();

	if (legacy) await cleanupLegacyCache(model);
	return handle.getFile();
}

/** Urls of models with a complete copy on disk (for the preferences sheet). */
export async function cachedModelUrls(): Promise<string[]> {
	try {
		const dir = await modelsDir();
		const urls: string[] = [];
		for (const model of GEMMA_MODELS) {
			if (await completeFile(dir, model)) urls.push(model.url);
		}
		return urls;
	} catch {
		return [];
	}
}
