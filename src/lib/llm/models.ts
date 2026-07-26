export interface GemmaModel {
	id: string;
	label: string;
	/** short marketing-ish descriptor shown in preferences */
	blurb: string;
	url: string;
	sizeBytes: number;
	/** context window to request from the engine (some builds cap the KV cache) */
	maxNumTokens: number;
	/** how many transcript excerpts to feed the prompt — sized to the window */
	excerpts: number;
	/** overrides for excerpt clustering — small windows need shorter excerpts */
	retrieval?: { gap?: number; maxSpan?: number; margin?: number };
	/** appended to each user turn — e.g. Qwen 3's soft switch for thinking mode */
	promptSuffix?: string;
	/**
	 * 'GPU' loads the whole file into WASM memory before init — required for
	 * builds whose tokenizer section the streaming loader can't parse; only
	 * viable for small files. Default is the streaming 'GPU_ARTISAN'.
	 */
	backend?: 'GPU' | 'GPU_ARTISAN';
	/** which runtime carries the model — defaults to LiteRT-LM */
	engine?: 'litert' | 'webllm';
	/** WebLLM prebuilt model_id (engine === 'webllm' only) */
	webllmId?: string;
}

export const GEMMA_MODELS: GemmaModel[] = [
	{
		id: 'gemma-4-E2B',
		label: 'Gemma 4 E2B',
		blurb: 'Fast and light — great on computers (2.0 GB)',
		url: 'https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it-web.litertlm',
		sizeBytes: 2_008_000_000,
		maxNumTokens: 32768,
		excerpts: 8
	},
	{
		id: 'gemma-4-E4B',
		label: 'Gemma 4 E4B',
		blurb: 'Smarter answers, bigger download (3.0 GB)',
		url: 'https://huggingface.co/litert-community/gemma-4-E4B-it-litert-lm/resolve/main/gemma-4-E4B-it-web.litertlm',
		sizeBytes: 2_969_000_000,
		maxNumTokens: 32768,
		excerpts: 8
	},
	{
		// The phone model, on WebLLM. LiteRT can't run anything phone-sized
		// here (its non-streaming loader buffers the whole file in WASM
		// memory, the small Gemma .litertlm builds are license-gated, Qwen3's
		// KV cache is enormous). Gemma 3 1B's MLC build was tried and is
		// unusable for long grounded prompts: its 512-token sliding-window
		// attention either generates noise (window disabled) or overflows the
		// paged KV cache (window kept). Llama 3.2 1B has plain full attention
		// and a real 4096 window — ~880 MB all-in, inside a phone's budget.
		id: 'llama-3.2-1b-webllm',
		label: 'Llama 3.2 1B',
		blurb: 'Phone-sized — the pick for mobile (0.7 GB)',
		url: 'https://huggingface.co/mlc-ai/Llama-3.2-1B-Instruct-q4f16_1-MLC',
		sizeBytes: 640_000_000,
		maxNumTokens: 4096,
		excerpts: 2,
		retrieval: { gap: 2, maxSpan: 8, margin: 1 },
		engine: 'webllm',
		webllmId: 'Llama-3.2-1B-Instruct-q4f16_1-MLC'
	},
	{
		// Kept for experiments — the only small model with an ungated
		// .litertlm build, but LiteRT's in-memory loader makes it die on
		// phones and its KV cache is heavy for its size.
		id: 'qwen3-0.6B',
		label: 'Qwen 3 0.6B',
		blurb: 'Phone-sized — fits mobile browsers (0.5 GB)',
		url: 'https://huggingface.co/litert-community/Qwen3-0.6B/resolve/main/qwen3_0_6b_mixed_int4.litertlm',
		sizeBytes: 497_664_000,
		// The build's own metadata caps max_num_tokens at 2048 — and KV cache
		// for this architecture costs ~224 KB/token in fp16, so every token of
		// window is real memory on a phone (~460 MB at 2048, ~920 MB at 4096).
		maxNumTokens: 2048,
		excerpts: 2,
		// keep both excerpts short so prompt + answer fit the 2048 window
		retrieval: { gap: 2, maxSpan: 8, margin: 1 },
		// Qwen 3 "thinks" before answering by default, which burns the small
		// window on preamble — this soft switch turns it off per turn.
		promptSuffix: ' /no_think',
		// the streaming loader chokes on this build's zlib tokenizer section
		backend: 'GPU'
	}
];

export const DEFAULT_MODEL_ID = 'gemma-4-E2B';
/**
 * Phone browsers kill any page around 1.5–3 GB of memory no matter how much
 * RAM the device has, so the 2 GB models can never finish loading there —
 * mobile defaults to the small build.
 */
export const MOBILE_MODEL_ID = 'llama-3.2-1b-webllm';
const PREF_KEY = 'ask-doac:model';

export function getModel(id: string | null | undefined): GemmaModel {
	return GEMMA_MODELS.find((m) => m.id === id) ?? GEMMA_MODELS[0];
}

export function isMobileDevice(): boolean {
	if (typeof navigator === 'undefined') return false;
	// iPadOS reports itself as Macintosh — multitouch is the tell
	return (
		/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
		(/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
	);
}

export function getPreferredModel(): GemmaModel {
	const fallback = isMobileDevice() ? MOBILE_MODEL_ID : DEFAULT_MODEL_ID;
	if (typeof localStorage === 'undefined') return getModel(fallback);
	return getModel(localStorage.getItem(PREF_KEY) ?? fallback);
}

export function setPreferredModel(id: string) {
	localStorage.setItem(PREF_KEY, getModel(id).id);
}
