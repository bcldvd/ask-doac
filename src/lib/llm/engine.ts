import { Engine, type Conversation } from '@litert-lm/core';
import type { GemmaModel } from './models';
import { SYSTEM_PROMPT } from './prompt';

export interface LoadProgress {
	/** 0..1 of the model download; -1 while compiling/initializing on GPU */
	fraction: number;
	receivedBytes: number;
	totalBytes: number;
	stage: 'downloading' | 'initializing' | 'ready';
}

export type ProgressCallback = (p: LoadProgress) => void;

/**
 * Fetch the model (through the service worker's Cache API) while reporting
 * byte progress, then boot the LiteRT-LM engine on WebGPU.
 */
export async function loadEngine(model: GemmaModel, onProgress: ProgressCallback) {
	const res = await fetch(model.url);
	if (!res.ok || !res.body) throw new Error(`model download failed: HTTP ${res.status}`);
	const totalBytes = Number(res.headers.get('Content-Length')) || model.sizeBytes;

	let receivedBytes = 0;
	const counted = res.body.pipeThrough(
		new TransformStream<Uint8Array, Uint8Array>({
			transform(chunk, controller) {
				receivedBytes += chunk.byteLength;
				onProgress({
					fraction: Math.min(receivedBytes / totalBytes, 1),
					receivedBytes,
					totalBytes,
					stage: 'downloading'
				});
				controller.enqueue(chunk);
			}
		})
	);

	// Buffer into a Blob first: lets the download progress reach 100% before
	// the (opaque, unprogressable) GPU init phase starts.
	const blob = await new Response(counted).blob();
	onProgress({ fraction: -1, receivedBytes, totalBytes, stage: 'initializing' });

	const engine = await Engine.create({
		model: blob,
		mainExecutorSettings: { maxNumTokens: 4096 }
	});
	onProgress({ fraction: 1, receivedBytes, totalBytes, stage: 'ready' });
	return engine;
}

export async function createGroundedConversation(engine: Engine): Promise<Conversation> {
	return engine.createConversation({
		preface: { messages: [{ role: 'system', content: SYSTEM_PROMPT }] }
	});
}

/** Stream assistant text chunks for one user turn. */
export async function* streamAnswer(conversation: Conversation, userTurn: string) {
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
