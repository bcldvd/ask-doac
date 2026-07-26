// Browser-side query embedding with the same model used at index build time.
import { env, pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';

const MODEL = 'Xenova/all-MiniLM-L6-v2';

let embedderPromise: Promise<FeatureExtractionPipeline> | null = null;

/**
 * Mirror of transformers' own Safari check (`isSafari` in its src/env.js): it
 * serves the plain WASM build to Safari and the asyncify one to everyone else,
 * and the two are not interchangeable. Its `apis.IS_SAFARI` isn't a public
 * export, so the test lives here — keep it in step with upstream.
 */
function isSafari() {
	const ua = navigator.userAgent;
	return (
		(navigator.vendor || '').includes('Apple') &&
		!/CriOS|FxiOS|EdgiOS|OPiOS|mercury|brave/i.test(ua) &&
		!ua.includes('Chrome') &&
		!ua.includes('Android')
	);
}

/**
 * Point transformers at our own origin. Left to itself it fetches weights from
 * huggingface.co and the ONNX runtime WASM from cdn.jsdelivr.net, which made
 * boot fail with "Failed to fetch" whenever either host was unreachable —
 * offline, on a VPN, or with an extension blocking the Hub. Everything is
 * vendored under static/embedder by scripts/vendor-embedder.mjs instead, so
 * boot needs no third-party host and works offline. Runs inside getEmbedder()
 * rather than at module scope so it can't touch `navigator` during prerender.
 */
function useVendoredAssets() {
	env.allowRemoteModels = false;
	env.allowLocalModels = true;
	env.localModelPath = '/embedder/';
	// The service worker already caches everything under /embedder/, and it has
	// to: the ONNX runtime fetches its WASM itself, outside transformers' cache.
	// Leaving transformers' own cache on as well stored the 23 MB model twice —
	// wasted quota on a device that also keeps a 2 GB chat model in OPFS.
	env.useBrowserCache = false;
	const variant = isSafari() ? '' : '.asyncify';
	env.backends.onnx.wasm!.wasmPaths = {
		mjs: `/embedder/ort/ort-wasm-simd-threaded${variant}.mjs`,
		wasm: `/embedder/ort/ort-wasm-simd-threaded${variant}.wasm`
	};
}

export function getEmbedder() {
	// q8 on every device. The chat model already occupies most of the page's
	// memory budget, and fp32 MiniLM (~90 MB weights + ONNX arena) can be the
	// straw that gets the page killed on a phone. Quantized query embeddings
	// rank against the fp32-built index almost identically — 96.9% mean top-8
	// overlap and identical top-1 on all 12 bench questions, measured by
	// scripts/rag/check-q8.mjs. One dtype also halves what we vendor.
	embedderPromise ??= (async () => {
		useVendoredAssets();
		return pipeline('feature-extraction', MODEL, { dtype: 'q8' });
	})();
	return embedderPromise;
}

export async function embedQuery(text: string): Promise<Float32Array> {
	const embedder = await getEmbedder();
	const out = await embedder(text, { pooling: 'mean', normalize: true });
	return out.data as Float32Array;
}
