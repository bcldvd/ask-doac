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

/** retry budget for one boot — cellular connections drop 2 GB fetches often */
const MAX_ATTEMPTS = 5;
/**
 * createWritable stages writes into a swap file that only lands on close();
 * committing every 128 MB caps how much a killed tab loses to one chunk.
 */
const CHECKPOINT_BYTES = 128 * 1024 * 1024;

/**
 * Return a disk-backed File for the model, downloading (or migrating from the
 * old service-worker cache) into OPFS if needed, with byte progress. Network
 * downloads resume from the committed bytes via Range requests, both across
 * attempts within this call and across page loads.
 */
export async function getModelFile(
	model: GemmaModel,
	onProgress: (p: LoadProgress) => void
): Promise<File> {
	const dir = await modelsDir();
	const cached = await completeFile(dir, model);
	if (cached) return cached;

	const legacy = await legacyCacheHit(model);
	if (legacy?.ok && legacy.body) {
		// disk-to-disk copy of a response the old service worker cached whole
		const totalBytes = Number(legacy.headers.get('Content-Length')) || model.sizeBytes;
		await writeBody(dir, model, legacy.body, 0, totalBytes, onProgress);
		await cleanupLegacyCache(model);
	} else {
		await downloadWithResume(dir, model, onProgress);
	}

	const handle = await dir.getFileHandle(modelFileName(model));
	const file = await handle.getFile();
	const manifest: Manifest = { url: model.url, size: file.size };
	const manifestHandle = await dir.getFileHandle(manifestFileName(model), { create: true });
	const manifestWritable = await manifestHandle.createWritable();
	await manifestWritable.write(JSON.stringify(manifest));
	await manifestWritable.close();
	return file;
}

async function downloadWithResume(
	dir: FileSystemDirectoryHandle,
	model: GemmaModel,
	onProgress: (p: LoadProgress) => void
): Promise<void> {
	let lastError: unknown;
	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		try {
			const offset = (await readFileIn(dir, modelFileName(model)))?.size ?? 0;
			// `bytes=N-` is a CORS-safelisted request header — no preflight.
			const res = await fetch(
				model.url,
				offset > 0 ? { headers: { Range: `bytes=${offset}-` } } : undefined
			);
			if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
			// 206 continues at `offset`; 200 means the server ignored the Range
			// header, so the file starts over.
			const start = res.status === 206 ? offset : 0;
			const remaining = Number(res.headers.get('Content-Length')) || 0;
			const totalBytes = remaining ? start + remaining : model.sizeBytes;
			const written = await writeBody(dir, model, res.body, start, totalBytes, onProgress);
			// A dropped connection can end the stream without throwing — catch
			// short files here so they never pass for complete downloads.
			if (remaining && written < remaining) {
				throw new Error(`connection closed at ${start + written} of ${totalBytes} bytes`);
			}
			return;
		} catch (e) {
			lastError = e;
			if (attempt < MAX_ATTEMPTS) {
				await new Promise((r) => setTimeout(r, 1500 * attempt));
			}
		}
	}
	const detail = lastError instanceof Error ? lastError.message : String(lastError);
	throw new Error(`model download failed after ${MAX_ATTEMPTS} attempts: ${detail}`);
}

/**
 * Stream `body` into the model file starting at byte `start`, committing
 * every CHECKPOINT_BYTES (and on failure) so completed bytes always survive
 * for the next resume. Returns the number of bytes written.
 */
async function writeBody(
	dir: FileSystemDirectoryHandle,
	model: GemmaModel,
	body: ReadableStream<Uint8Array>,
	start: number,
	totalBytes: number,
	onProgress: (p: LoadProgress) => void
): Promise<number> {
	const handle = await dir.getFileHandle(modelFileName(model), { create: true });
	let writable = await handle.createWritable({ keepExistingData: start > 0 });
	let position = start;
	let sinceCheckpoint = 0;
	const reader = body.getReader();
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			// network chunks are always plain ArrayBuffer-backed, never SAB
			await writable.write({ type: 'write', position, data: value as Uint8Array<ArrayBuffer> });
			position += value.byteLength;
			sinceCheckpoint += value.byteLength;
			onProgress({
				fraction: Math.min(position / totalBytes, 1),
				receivedBytes: position,
				totalBytes,
				stage: 'downloading'
			});
			if (sinceCheckpoint >= CHECKPOINT_BYTES) {
				await writable.close();
				writable = await handle.createWritable({ keepExistingData: true });
				sinceCheckpoint = 0;
			}
		}
		await writable.close();
	} catch (e) {
		// commit what did arrive — the next attempt resumes from these bytes
		await writable.close().catch(() => {});
		throw e;
	}
	return position - start;
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
