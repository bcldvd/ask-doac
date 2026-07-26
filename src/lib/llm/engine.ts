import { Engine, type Conversation } from '@litert-lm/core';
import type { GemmaModel } from './models';
import { getModelFile } from './modelStore';
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
 * Stream the model into OPFS (see modelStore) while reporting byte progress,
 * then boot the LiteRT-LM engine on WebGPU from the disk-backed File. Never
 * buffer the model in page memory: iOS kills and reloads any tab that holds
 * the 2 GB in RAM before the download even finishes.
 */
export async function loadEngine(model: GemmaModel, onProgress: ProgressCallback) {
	const file = await getModelFile(model, onProgress);
	onProgress({ fraction: -1, receivedBytes: file.size, totalBytes: file.size, stage: 'initializing' });

	const engine = await Engine.create({
		model: file,
		// Gemma 4 E2B/E4B are trained for a 32k context — use all of it so long
		// excerpt sets and long answers never hit the window.
		mainExecutorSettings: { maxNumTokens: 32768 }
	});
	onProgress({ fraction: 1, receivedBytes: file.size, totalBytes: file.size, stage: 'ready' });
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
