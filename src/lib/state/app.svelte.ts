// Central app state (Svelte 5 runes). Boots the model + RAG index and runs
// grounded question/answer turns. `?mock=1` swaps in a canned engine so the
// UI can be developed and screenshotted without a 2 GB download.
import { loadEngine, isModelCached, type Studio } from '$lib/llm/engine';
import { stripThinking } from '$lib/llm/thinking';
import { isEnglish, toEnglishQuery } from '$lib/llm/translate';
import { buildGroundedPrompt, SYSTEM_PROMPT } from '$lib/llm/prompt';
import {
	getPreferredModel,
	setPreferredModel,
	isMobileDevice,
	type GemmaModel
} from '$lib/llm/models';
import { cachedModelUrls } from '$lib/llm/modelStore';
import { loadIndex, retrieve, type RagIndex, type RetrievedChunk } from '$lib/rag/retrieve';
import { embedQuery } from '$lib/rag/embed';
import { searchingStatus, readingStatus } from './status';
import { startBootLog, crumb, type CrashReport } from './bootlog';
import { DownloadEta, type EtaEstimate } from './eta';

export type Stage = 'boot' | 'held' | 'downloading' | 'initializing' | 'ready' | 'error';

export interface Message {
	role: 'user' | 'assistant';
	text: string;
	sources?: RetrievedChunk[];
	pending?: boolean;
	/** plain-language line describing what the app is doing right now */
	status?: string;
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
	/** model urls with a complete copy in OPFS */
	cachedModels = $state<string[]>([]);
	/** time-remaining estimate while downloading (null while warming up or stalled) */
	eta = $state<EtaEstimate | null>(null);
	/** where the previous boot got killed by the OS, if it was (see bootlog) */
	lastCrash = $state<CrashReport | null>(null);
	/** true when the current model will load from disk, not the network */
	modelCached = $derived(this.cachedModels.includes(this.model.url));

	mock = false;
	private index: RagIndex | null = null;
	private engine: Studio | null = null;
	private booted = false;

	async boot() {
		if (this.booted) return;
		this.booted = true;
		this.mock = new URLSearchParams(location.search).has('mock');
		if (this.mock) return this.bootMock();
		// Register before the circuit breaker: a page held after a crash must
		// still pick up new deploys — the fix for its crash may be in one.
		this.registerServiceWorker();
		this.lastCrash = startBootLog();
		if (this.lastCrash && isMobileDevice()) {
			// Circuit breaker, phones only: the OS killed the previous attempt,
			// and retrying automatically produces an endless reload loop that
			// ends on the browser's "a problem repeatedly occurred" page. Hold
			// until a tap. Desktop never crash-loops like this, and a spurious
			// hold there (e.g. an interrupted boot that lost its final
			// breadcrumb) would stall the page for no reason.
			this.stage = 'held';
			return;
		}
		await this.start();
	}

	private registerServiceWorker() {
		if (!('serviceWorker' in navigator)) return;
		// If a NEW worker replaces the one controlling us, the page is
		// running stale cached code — reload to pick up the deploy. Two
		// guards make a reload loop impossible: only reload when a previous
		// controller existed, and at most once per tab until we reach ready
		// (a killed browser can leave a waiting worker that re-activates on
		// the next launch, which would otherwise chain reloads mid-download).
		const RELOADED_FLAG = 'ask-doac:sw-reloaded';
		if (navigator.serviceWorker.controller && !sessionStorage.getItem(RELOADED_FLAG)) {
			navigator.serviceWorker.addEventListener(
				'controllerchange',
				() => {
					sessionStorage.setItem(RELOADED_FLAG, '1');
					// mark the trail as deliberately ended — this reload must not
					// read as an OS kill and trip the crash circuit breaker
					crumb('reload');
					location.reload();
				},
				{ once: true }
			);
		}
		// Fire-and-forget: the worker only caches the app shell. Model files
		// go straight from the page into OPFS or WebLLM's own cache.
		navigator.serviceWorker.register('/service-worker.js', { type: 'module' });
	}

	/** Resume a boot held after a crash (the "try again" button). */
	retryBoot() {
		if (this.stage !== 'held') return;
		this.start();
	}

	private async start() {
		crumb('boot');
		try {
			// The engine runs on WebGPU, full stop — fail fast with a clear
			// message rather than pulling 2 GB and dying in Engine.create.
			if (!('gpu' in navigator)) {
				throw new Error(
					'WebGPU is not available in this browser. The model runs on your GPU — ' +
						'on iPhone/iPad that needs iOS 26 or later (and WebGPU stays off in Lockdown Mode); ' +
						'elsewhere use a current Safari, Chrome or Edge.'
				);
			}
			// Ask for durable storage so the model cache isn't evicted.
			navigator.storage?.persist?.().catch(() => {});
			// The first-visit explainer card keys off `modelCached` — resolve it
			// before entering the downloading stage so a repeat visit never
			// flashes "first visit: downloading…".
			await this.refreshCachedModels();
			const indexPromise = loadIndex();
			this.stage = 'downloading';
			const etaTracker = new DownloadEta();
			let etaSampledAt = 0;
			const engine = await loadEngine(this.model, (p) => {
				// Engine-ready isn't app-ready: the RAG index may still be loading,
				// and `ready` is the signal auto-ask (?q=) fires on. The real flip
				// to 'ready' happens below, once both engine and index are set.
				this.stage = p.stage === 'ready' ? 'initializing' : p.stage;
				this.fraction = p.fraction;
				this.receivedBytes = p.receivedBytes;
				this.totalBytes = p.totalBytes;
				if (p.stage === 'downloading') {
					// Progress fires per network chunk — sample every ~250ms so the
					// ETA text doesn't churn on every frame.
					const now = performance.now();
					if (now - etaSampledAt >= 250) {
						etaSampledAt = now;
						this.eta = etaTracker.sample(now, p.receivedBytes, p.totalBytes);
					}
				} else {
					this.eta = null;
				}
			});
			this.engine = engine;
			this.index = await indexPromise;
			// A download may have just completed — refresh the "cached" tags.
			await this.refreshCachedModels();
			crumb('ready');
			this.stage = 'ready';
			// Booted fine — future deploys may auto-reload this tab again.
			sessionStorage.removeItem('ask-doac:sw-reloaded');
		} catch (e) {
			// Keep the full stack reachable via a remote Web Inspector — the UI
			// only shows the message.
			console.error('boot failed:', e);
			crumb(`error: ${e instanceof Error ? e.message : e}`);
			this.stage = 'error';
			this.error = e instanceof Error ? e.message : String(e);
		}
	}

	private async refreshCachedModels() {
		const urls = await cachedModelUrls().catch((): string[] => []);
		if (this.model.engine === 'webllm' && (await isModelCached(this.model).catch(() => false))) {
			urls.push(this.model.url);
		}
		this.cachedModels = urls;
	}

	private async bootMock() {
		this.stage = 'downloading';
		this.totalBytes = this.model.sizeBytes;
		const etaTracker = new DownloadEta();
		for (let i = 0; i <= 40; i++) {
			await new Promise((r) => setTimeout(r, 50));
			this.fraction = i / 40;
			this.receivedBytes = (this.model.sizeBytes * i) / 40;
			// Each 50ms tick plays as a second of real download, so the mock shows
			// a believable speed and a counting-down ETA.
			this.eta = etaTracker.sample(i * 1000, this.receivedBytes, this.totalBytes);
		}
		this.eta = null;
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
				reply.status = searchingStatus(228);
				await new Promise((r) => setTimeout(r, 700));
				reply.sources = MOCK_SOURCES;
				reply.status = readingStatus(MOCK_SOURCES);
				await new Promise((r) => setTimeout(r, 1200));
				for (const word of MOCK_ANSWER.split(/(?<= )/)) {
					reply.text += word;
					await new Promise((r) => setTimeout(r, 24));
				}
			} else {
				reply.status = searchingStatus(this.index!.episodes.length);
				// Crumbs per step: a phone can run out of memory here too (the
				// embedder loads on the first question), and the next launch
				// should be able to say exactly which step died.
				crumb('ask-translate');
				// The embedder is English-only, so non-English questions retrieve
				// noise unless translated first (the model passes English through).
				const searchQuery = await toEnglishQuery(this.engine!, q, this.model.promptSuffix);
				crumb('ask-embed');
				const queryVector = await embedQuery(searchQuery);
				crumb('ask-retrieve');
				// Excerpt count is budgeted per model (see models.ts): nearby hits in
				// one episode merge into longer excerpts (see clusterHits), and the
				// whole set must fit the model's context window with room to answer.
				const sources = await retrieve(
					this.index!,
					queryVector,
					this.model.excerpts,
					fetch,
					this.model.retrieval
				);
				reply.sources = sources;
				reply.status = readingStatus(sources);
				crumb('ask-generate');
				// If the question survived translation (near-)unchanged it was
				// English, and the prompt pins the answer language explicitly —
				// letting the model infer it occasionally lands on the wrong one.
				const turn =
					buildGroundedPrompt(q, sources, isEnglish(q, searchQuery)) +
					(this.model.promptSuffix ?? '');
				// Fresh context per question (see Studio.respond): every turn carries
				// its own excerpts, so history would blow the context window fast.
				for await (const piece of stripThinking(this.engine!.respond(SYSTEM_PROMPT, turn))) {
					reply.text += piece;
				}
			}
		} catch (e) {
			reply.text ||= `Something went wrong while answering: ${e instanceof Error ? e.message : e}`;
		} finally {
			// clean trail ending — the page survived this question
			if (!this.mock) crumb('done');
			reply.pending = false;
			reply.status = undefined;
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
