// Vendor everything the query embedder needs into static/embedder, so boot
// touches no third-party host.
//
// Why: transformers.js loads the MiniLM weights from huggingface.co and the
// onnxruntime-web WASM from cdn.jsdelivr.net (it hardcodes that fallback in
// src/backends/onnx.js). Either host being unreachable — a dropped connection,
// a VPN, an extension blocking huggingface.co — used to kill boot with
// "search embedder failed to load: Failed to fetch". An app that claims to run
// entirely in your browser, caches its shell for offline use, and keeps the
// chat model in OPFS has no business needing a CDN to start.
//
// Output is gitignored: the repo stays small and the files are refetched at
// install/build time. Run via `npm run vendor:embedder` (predev/prebuild do it
// for you). Idempotent, and once vendored it touches the network zero times —
// `npm run dev` has to keep working on a plane. Downloads land via a .part
// rename, so a file that exists is a file that finished; pass --force to
// refetch anyway.
import { createWriteStream } from 'node:fs';
import { copyFile, mkdir, rename, stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'static', 'embedder');
const ORT_DIST = path.join(root, 'node_modules', 'onnxruntime-web', 'dist');

const MODEL = 'Xenova/all-MiniLM-L6-v2';
// q8 on every device: one 23 MB file instead of a 90 MB fp32 one, and query
// embeddings still rank against the fp32-built index (96.9% top-8 overlap —
// scripts/rag/check-q8.mjs). '_quantized' is transformers' dtype→filename
// mapping for q8; keep this in step with the dtype embed.ts asks for.
const MODEL_FILES = [
	'config.json',
	'tokenizer.json',
	'tokenizer_config.json',
	'onnx/model_quantized.onnx'
];

// Only two of onnxruntime-web's four WASM builds can ever be requested:
// transformers picks the plain build on Safari and the asyncify build
// everywhere else (src/backends/onnx.js, mirrored in embed.ts). Copying from
// node_modules rather than the CDN keeps the WASM in lockstep with the ORT
// JS that transformers bundles — a hardcoded CDN version can drift.
const ORT_FILES = [
	'ort-wasm-simd-threaded.mjs',
	'ort-wasm-simd-threaded.wasm',
	'ort-wasm-simd-threaded.asyncify.mjs',
	'ort-wasm-simd-threaded.asyncify.wasm'
];

async function sizeOf(file) {
	try {
		return (await stat(file)).size;
	} catch {
		return -1;
	}
}

/** Download to a temp name then rename, so an interrupted run can't leave a
 * truncated file that later runs would happily skip. */
async function download(url, dest) {
	const res = await fetch(url, { redirect: 'follow' });
	if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
	const expected = Number(res.headers.get('content-length')) || 0;
	const tmp = `${dest}.part`;
	await mkdir(path.dirname(dest), { recursive: true });
	await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp));
	const got = await sizeOf(tmp);
	if (expected && got !== expected) {
		throw new Error(`${url}: expected ${expected} bytes, wrote ${got}`);
	}
	await rename(tmp, dest);
	return got;
}

const mb = (n) => `${(n / 1e6).toFixed(1)} MB`;
const force = process.argv.includes('--force');
let fetched = 0;
let skipped = 0;

// --- model weights + tokenizer, from the Hub ---------------------------------
for (const rel of MODEL_FILES) {
	const dest = path.join(OUT, MODEL, rel);
	if (!force && (await sizeOf(dest)) > 0) {
		skipped++;
		continue;
	}
	const url = `https://huggingface.co/${MODEL}/resolve/main/${rel}`;
	const size = await download(url, dest);
	console.log(`  fetched ${MODEL}/${rel} (${mb(size)})`);
	fetched++;
}

// --- onnxruntime-web WASM, from node_modules --------------------------------
for (const name of ORT_FILES) {
	const src = path.join(ORT_DIST, name);
	const dest = path.join(OUT, 'ort', name);
	const srcSize = await sizeOf(src);
	if (srcSize < 0) {
		throw new Error(
			`${src} is missing — is onnxruntime-web installed? ` +
				'It comes in via @huggingface/transformers; try `npm install`.'
		);
	}
	if (!force && (await sizeOf(dest)) === srcSize) {
		skipped++;
		continue;
	}
	await mkdir(path.dirname(dest), { recursive: true });
	await copyFile(src, dest);
	console.log(`  copied ort/${name} (${mb(srcSize)})`);
	fetched++;
}

console.log(`embedder vendored → static/embedder (${fetched} written, ${skipped} already current)`);
