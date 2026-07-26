import {
	Backend,
	Engine,
	getOrLoadGlobalLiteRtLm,
	setupDefaultWebGpuDevice,
	type Conversation
} from '@litert-lm/core';
import type { GemmaModel } from './models';
import { getModelFile } from './modelStore';
import { crumb } from '$lib/state/bootlog';

export interface LoadProgress {
	/** 0..1 of the model download; -1 while compiling/initializing on GPU */
	fraction: number;
	receivedBytes: number;
	totalBytes: number;
	stage: 'downloading' | 'initializing' | 'ready';
}

export type ProgressCallback = (p: LoadProgress) => void;

/**
 * A loaded model, whichever runtime carries it. `respond` runs one stateless
 * grounded turn: fresh context every call, because each turn ships its own
 * excerpts and a shared history would blow the context window fast.
 */
export interface Studio {
	respond(system: string, user: string): AsyncGenerator<string>;
}

/** Boot the runtime the model asks for (LiteRT-LM or WebLLM) on WebGPU. */
export async function loadEngine(model: GemmaModel, onProgress: ProgressCallback): Promise<Studio> {
	const studio =
		model.engine === 'webllm'
			? await loadWebllm(model, onProgress)
			: await loadLitert(model, onProgress);
	onProgress({
		fraction: 1,
		receivedBytes: model.sizeBytes,
		totalBytes: model.sizeBytes,
		stage: 'ready'
	});
	return studio;
}

/**
 * LiteRT-LM path: stream the model into OPFS (see modelStore) while reporting
 * byte progress, then boot the engine from the disk-backed File. Never buffer
 * the model in page memory: iOS kills and reloads any tab that holds 2 GB in
 * RAM before the download even finishes.
 */
async function loadLitert(model: GemmaModel, onProgress: ProgressCallback): Promise<Studio> {
	crumb('model-file');
	const file = await getModelFile(model, onProgress);
	onProgress({ fraction: -1, receivedBytes: file.size, totalBytes: file.size, stage: 'initializing' });

	// Engine.create would do all three of these steps internally — running
	// them one by one leaves a breadcrumb per step, so when iOS kills the
	// page mid-boot the next load can say exactly which step died.
	crumb('wasm-runtime');
	await getOrLoadGlobalLiteRtLm();
	crumb('webgpu-device');
	await setupDefaultWebGpuDevice();
	crumb('engine-weights');
	const engine = await Engine.create({
		model: file,
		backend: model.backend === 'GPU' ? Backend.GPU : Backend.GPU_ARTISAN,
		mainExecutorSettings: { maxNumTokens: model.maxNumTokens }
	}).catch((e) => {
		throw new Error(`engine startup failed: ${e instanceof Error ? e.message : String(e)}`);
	});
	return {
		async *respond(system, user) {
			const conversation = await engine.createConversation({
				preface: { messages: [{ role: 'system', content: system }] }
			});
			yield* streamAnswer(conversation, user);
		}
	};
}

/**
 * WebLLM path (phones): MLC's runtime manages its own download and Cache API
 * storage in ~100 MB shards, so memory stays low without our OPFS plumbing.
 * The context window override matters — KV cache is real memory (the 4096
 * default costs ~200 MB more than 2048 on this model).
 */
async function loadWebllm(model: GemmaModel, onProgress: ProgressCallback): Promise<Studio> {
	crumb('webllm-engine');
	const { CreateMLCEngine } = await import('@mlc-ai/web-llm');
	const engine = await CreateMLCEngine(
		model.webllmId!,
		{
			initProgressCallback: (p) => {
				// WebLLM reports one 0..1 progress for network fetch AND cache
				// loads through the same callback — only the text tells them
				// apart. Cache loads and GPU/shader work show as initializing so
				// a repeat visit never looks like a re-download.
				const downloading = p.progress < 1 && /fetching/i.test(p.text);
				onProgress(
					downloading
						? {
								fraction: p.progress,
								receivedBytes: Math.round(p.progress * model.sizeBytes),
								totalBytes: model.sizeBytes,
								stage: 'downloading'
							}
						: {
								fraction: -1,
								receivedBytes: model.sizeBytes,
								totalBytes: model.sizeBytes,
								stage: 'initializing'
							}
				);
			}
		}
		// no chatOpts: the prebuilt record's own overrides are the config the
		// model lib was compiled and tested against — overriding the window
		// setup broke Gemma 3 in two different ways before Llama replaced it
	).catch((e) => {
		throw new Error(`engine startup failed: ${e instanceof Error ? e.message : String(e)}`);
	});
	return {
		async *respond(system, user) {
			const stream = await engine.chat.completions.create({
				messages: [
					{ role: 'system', content: system },
					{ role: 'user', content: user }
				],
				stream: true
			});
			for await (const chunk of stream) {
				const piece = chunk.choices[0]?.delta?.content;
				if (piece) yield piece;
			}
		}
	};
}

/** True when the model's bytes are already on this device. */
export async function isModelCached(model: GemmaModel): Promise<boolean> {
	if (model.engine === 'webllm') {
		try {
			const { hasModelInCache } = await import('@mlc-ai/web-llm');
			return await hasModelInCache(model.webllmId!);
		} catch {
			return false;
		}
	}
	const { cachedModelUrls } = await import('./modelStore');
	return (await cachedModelUrls()).includes(model.url);
}

/** Stream assistant text chunks for one user turn (LiteRT conversation). */
async function* streamAnswer(conversation: Conversation, userTurn: string) {
	for await (const chunk of conversation.sendMessageStreaming(userTurn)) {
		for (const item of chunk.content ?? []) {
			if (typeof item === 'string') {
				if (item) yield item;
			} else if (item.type === 'text' && item.text) {
				yield item.text;
			}
		}
	}
}
