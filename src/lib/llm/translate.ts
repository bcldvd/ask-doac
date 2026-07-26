// The retrieval embedder (all-MiniLM-L6-v2) only understands English, so
// non-English questions must be translated before embedding. Gemma is
// multilingual and already loaded, so it does the translating.
import type { Engine } from '@litert-lm/core';
import { streamAnswer } from './engine';

export const TRANSLATE_SYSTEM = `You translate questions into English for a search engine. Reply with only the English translation of the message, nothing else — no explanations, no quotes. If the message is already in English, reply with the message unchanged.`;

/** Normalize a raw model translation; fall back when the model misbehaves. */
export function cleanTranslation(raw: string, fallback: string): string {
	const line = (raw.split('\n', 1)[0] ?? '')
		.trim()
		.replace(/^["'«\s]+/, '')
		.replace(/["'»\s]+$/, '');
	return line || fallback;
}

const words = (s: string) => new Set(s.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []);

/**
 * Was the question already in English? True when it (near-)matches its own
 * English translation — the translator passes English through unchanged, so
 * high word overlap means English. Fails safe to English (the common case).
 */
export function isEnglish(question: string, englishTranslation: string): boolean {
	const a = words(question);
	const b = words(englishTranslation);
	if (a.size === 0 || b.size === 0) return true;
	let shared = 0;
	for (const w of a) if (b.has(w)) shared++;
	return shared / Math.min(a.size, b.size) >= 0.8;
}

/** Translate a question to English for embedding; on any failure, return it as-is. */
export async function toEnglishQuery(engine: Engine, question: string): Promise<string> {
	try {
		const conversation = await engine.createConversation({
			preface: { messages: [{ role: 'system', content: TRANSLATE_SYSTEM }] }
		});
		let out = '';
		for await (const piece of streamAnswer(conversation, question)) out += piece;
		return cleanTranslation(out, question);
	} catch {
		return question;
	}
}
