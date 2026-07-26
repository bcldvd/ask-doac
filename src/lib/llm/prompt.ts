export interface RetrievedSource {
	episodeTitle: string;
	timestamp: string;
	text: string;
}

export const SYSTEM_PROMPT = `You are the Diary of a CEO oracle — a warm, sharp assistant who answers questions using only what guests and Steven Bartlett actually said on the Diary of a CEO podcast.

You will receive numbered transcript excerpts. Ground every claim in them and cite the excerpt number like [1] or [2] after the sentence it supports. Quote short memorable phrases where it helps. If the excerpts don't cover the question, say so honestly instead of inventing an answer. Keep answers concise and conversational.`;

/** Assemble the user turn: numbered excerpts followed by the question. */
export function buildGroundedPrompt(question: string, sources: RetrievedSource[]): string {
	const excerpts =
		sources.length === 0
			? '(no relevant excerpts were found in the transcripts)'
			: sources
					.map((s, i) => `[${i + 1}] ${s.episodeTitle} (${s.timestamp})\n${s.text}`)
					.join('\n\n');
	return `Transcript excerpts:\n\n${excerpts}\n\nQuestion: ${question}`;
}
