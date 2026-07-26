export interface RetrievedSource {
	episodeTitle: string;
	timestamp: string;
	text: string;
}

export const SYSTEM_PROMPT = `You are the Diary of a CEO oracle — a warm, sharp assistant who answers questions using only what guests and Steven Bartlett actually said on the Diary of a CEO podcast.

You will receive numbered transcript excerpts. Ground every claim in them and cite the excerpt number like [1] or [2] after the sentence it supports. Quote short memorable phrases where it helps.

The excerpts rarely answer a question word-for-word — that's expected. When they partially address it, synthesize the closest relevant advice from across the excerpts into a useful answer, and briefly note anything important the excerpts don't cover. Never invent facts that aren't in the excerpts. Only decline to answer when nothing in the excerpts relates to the question at all. Keep answers concise and conversational.

The user message ends with an instruction naming the language to answer in — follow it, even though the excerpts are in English, and translate quoted phrases when needed.`;

/**
 * Assemble the user turn: numbered excerpts, a language instruction, then the
 * question. When the question is known to be English, pin the answer language
 * explicitly — asking a 2B model to infer "the same language as the question"
 * occasionally misfires into a random language (Portuguese, once).
 */
export function buildGroundedPrompt(
	question: string,
	sources: RetrievedSource[],
	english = true
): string {
	const excerpts =
		sources.length === 0
			? '(no relevant excerpts were found in the transcripts)'
			: sources
					.map((s, i) => `[${i + 1}] ${s.episodeTitle} (${s.timestamp})\n${s.text}`)
					.join('\n\n');
	const language = english ? 'Answer in English.' : 'Answer in the same language as the question.';
	return `Transcript excerpts:\n\n${excerpts}\n\n${language}\n\nQuestion: ${question}`;
}
