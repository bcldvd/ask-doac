// Central app state (Svelte 5 runes). Boots the model + RAG index and runs
// grounded question/answer turns. `?mock=1` swaps in a canned engine so the
// UI can be developed and screenshotted without a 2 GB download.
import { loadEngine, createGroundedConversation, streamAnswer } from '$lib/llm/engine';
import { buildGroundedPrompt } from '$lib/llm/prompt';
import { getPreferredModel, setPreferredModel, type GemmaModel } from '$lib/llm/models';
import { loadIndex, retrieve, type RagIndex, type RetrievedChunk } from '$lib/rag/retrieve';
import { embedQuery } from '$lib/rag/embed';
import type { Conversation } from '@litert-lm/core';

export type Stage = 'boot' | 'downloading' | 'initializing' | 'ready' | 'error';

export interface Message {
	role: 'user' | 'assistant';
	text: string;
	sources?: RetrievedChunk[];
	pending?: boolean;
}

const MOCK_ANSWER = `Steven's guests keep coming back to the same idea: consistency compounds. Alex Hormozi puts it bluntly — the biggest lever is volume, most people "simply do not do enough" [1]. James Clear frames the same thing through identity: every action is "a vote for the type of person you wish to become" [2].`;

const MOCK_SOURCES: RetrievedChunk[] = [
	{
		episodeTitle: 'Alex Hormozi: The Man Who Made $100M Before 32',
		episodeUrl: 'https://podcasts.happyscribe.com/the-diary-of-a-ceo-with-steven-bartlett',
		timestamp: '00:14:02',
		text: 'The single biggest lever is volume.',
		score: 0.71
	},
	{
		episodeTitle: 'James Clear: Atomic Habits',
		episodeUrl: 'https://podcasts.happyscribe.com/the-diary-of-a-ceo-with-steven-bartlett',
		timestamp: '01:02:33',
		text: 'Every action you take is a vote.',
		score: 0.66
	}
];

class App {
	stage = $state<Stage>('boot');
	fraction = $state(0);
	receivedBytes = $state(0);
	totalBytes = $state(0);
	error = $state<string | null>(null);
	model = $state<GemmaModel>(getPreferredModel());
	messages = $state<Message[]>([]);
	generating = $state(false);
	prefsOpen = $state(false);
	/** model urls already in the service worker cache */
	cachedModels = $state<string[]>([]);

	mock = false;
	private index: RagIndex | null = null;
	private conversation: Conversation | null = null;
	private booted = false;

	async boot() {
		if (this.booted) return;
		this.booted = true;
		this.mock = new URLSearchParams(location.search).has('mock');
		if (this.mock) return this.bootMock();
		try {
			if ('serviceWorker' in navigator) {
				navigator.serviceWorker.register('/service-worker.js', { type: 'module' });
				navigator.serviceWorker.addEventListener('message', (e) => {
					if (e.data?.type === 'model-cache-status') this.cachedModels = e.data.cached;
				});
				navigator.serviceWorker.ready.then((reg) =>
					reg.active?.postMessage({ type: 'model-cache-status' })
				);
			}
			const indexPromise = loadIndex();
			this.stage = 'downloading';
			const engine = await loadEngine(this.model, (p) => {
				this.stage = p.stage === 'ready' ? 'ready' : p.stage;
				this.fraction = p.fraction;
				this.receivedBytes = p.receivedBytes;
				this.totalBytes = p.totalBytes;
			});
			this.conversation = await createGroundedConversation(engine);
			this.index = await indexPromise;
			this.stage = 'ready';
		} catch (e) {
			this.stage = 'error';
			this.error = e instanceof Error ? e.message : String(e);
		}
	}

	private async bootMock() {
		this.stage = 'downloading';
		this.totalBytes = this.model.sizeBytes;
		for (let i = 0; i <= 40; i++) {
			await new Promise((r) => setTimeout(r, 50));
			this.fraction = i / 40;
			this.receivedBytes = (this.model.sizeBytes * i) / 40;
		}
		this.stage = 'initializing';
		await new Promise((r) => setTimeout(r, 800));
		this.stage = 'ready';
	}

	async ask(question: string) {
		const q = question.trim();
		if (!q || this.generating || this.stage !== 'ready') return;
		this.generating = true;
		this.messages.push({ role: 'user', text: q });
		const reply = $state<Message>({ role: 'assistant', text: '', pending: true });
		this.messages.push(reply);
		try {
			if (this.mock) {
				await new Promise((r) => setTimeout(r, 600));
				reply.sources = MOCK_SOURCES;
				for (const word of MOCK_ANSWER.split(/(?<= )/)) {
					reply.text += word;
					await new Promise((r) => setTimeout(r, 24));
				}
			} else {
				const sources = await retrieve(this.index!, await embedQuery(q), 5);
				reply.sources = sources;
				const turn = buildGroundedPrompt(q, sources);
				for await (const piece of streamAnswer(this.conversation!, turn)) {
					reply.text += piece;
				}
			}
		} catch (e) {
			reply.text ||= `Something went wrong while answering: ${e instanceof Error ? e.message : e}`;
		} finally {
			reply.pending = false;
			this.generating = false;
		}
	}

	switchModel(id: string) {
		if (id === this.model.id) return;
		setPreferredModel(id);
		// A different model means a fresh engine: simplest correct path is reload.
		location.reload();
	}
}

export const app = new App();
