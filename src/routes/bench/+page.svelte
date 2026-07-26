<script lang="ts">
	// Benchmark harness page. Driven by Playwright (scripts/bench/run.mjs) via
	// query params; publishes progress and results on window.__bench.
	//
	//   /bench?engine=litert&model=gemma-4-E2B&mode=full
	//   /bench?engine=webllm&model=Qwen3-1.7B-q4f16_1-MLC&nothink=1&mode=full
	//   mode=load → only measure engine load (used for the warm-load pass)
	import { onMount } from 'svelte';
	import { GEMMA_MODELS } from '$lib/llm/models';
	import { loadEngine, createGroundedConversation, streamAnswer } from '$lib/llm/engine';
	import { buildGroundedPrompt, SYSTEM_PROMPT, type RetrievedSource } from '$lib/llm/prompt';

	interface QuestionResult {
		id: string;
		question: string;
		excerptsUsed: number;
		promptChars: number;
		ttftMs: number;
		totalMs: number;
		answer: string;
		thinkChars: number;
		usage?: unknown;
	}

	interface BenchState {
		params: Record<string, string>;
		status: string;
		loadMs?: number;
		downloadBytes?: number;
		contextWindow?: number;
		results: QuestionResult[];
		done: boolean;
		error?: string;
	}

	const bench: BenchState = { params: {}, status: 'boot', results: [], done: false };
	let view = $state({ status: 'boot', n: 0, error: '' });
	const setStatus = (s: string) => {
		bench.status = s;
		view.status = s;
	};

	const MAX_TOKENS = 700;
	/** rough chars-per-token for English transcript text */
	const CPT = 3.6;

	/** Trim excerpts (never the question) until the prompt fits the budget. */
	function fitPrompt(question: string, sources: RetrievedSource[], budgetTokens: number) {
		for (let n = sources.length; n >= 1; n--) {
			const prompt = buildGroundedPrompt(question, sources.slice(0, n), true);
			if (prompt.length / CPT <= budgetTokens) return { prompt, excerptsUsed: n };
		}
		return { prompt: buildGroundedPrompt(question, sources.slice(0, 1), true), excerptsUsed: 1 };
	}

	function stripThink(text: string) {
		const m = text.match(/<think>([\s\S]*?)<\/think>/);
		const answer = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
		return { answer, thinkChars: m ? m[1].length : 0 };
	}

	async function runLitert(model: string, dataset: any, mode: string) {
		const gm = GEMMA_MODELS.find((m) => m.id === model);
		if (!gm) throw new Error(`unknown litert model ${model}`);
		setStatus('loading');
		const t0 = performance.now();
		let bytes = 0;
		const engine = await loadEngine(gm, (p) => {
			bytes = Math.max(bytes, p.receivedBytes);
			setStatus(`loading:${p.stage}:${Math.round(p.fraction * 100)}%`);
		});
		bench.loadMs = performance.now() - t0;
		bench.downloadBytes = bytes;
		bench.contextWindow = 32768;
		if (mode === 'load') return;

		for (const item of dataset.items) {
			setStatus(`generating:${item.id}`);
			// fresh conversation per question — no history contamination
			const conversation = await createGroundedConversation(engine);
			const { prompt, excerptsUsed } = fitPrompt(item.question, item.sources, 32768 - MAX_TOKENS - 500);
			const tq = performance.now();
			let ttft = 0;
			let text = '';
			for await (const chunk of streamAnswer(conversation, prompt)) {
				if (!ttft && chunk.trim()) ttft = performance.now() - tq;
				text += chunk;
			}
			const { answer, thinkChars } = stripThink(text);
			bench.results.push({
				id: item.id,
				question: item.question,
				excerptsUsed,
				promptChars: prompt.length,
				ttftMs: Math.round(ttft),
				totalMs: Math.round(performance.now() - tq),
				answer,
				thinkChars
			});
			view.n = bench.results.length;
		}
	}

	async function runWebllm(model: string, dataset: any, mode: string, nothink: boolean) {
		const webllm = await import('@mlc-ai/web-llm');
		const appConfig = structuredClone(webllm.prebuiltAppConfig);
		if (!appConfig.model_list.some((m: any) => m.model_id === model)) {
			// custom entry: DeepSeek-R1-Distill-Qwen-1.5B reuses the Qwen2-1.5B lib (same arch)
			appConfig.model_list.push({
				model: `https://huggingface.co/mlc-ai/${model.replace(/-MLC$/, '')}-MLC`,
				model_id: model,
				model_lib:
					webllm.modelLibURLPrefix +
					webllm.modelVersion +
					'/Qwen2-1.5B-Instruct-q4f16_1_cs1k-webgpu.wasm',
				low_resource_required: true,
				vram_required_MB: 1700,
				overrides: { context_window_size: 4096 }
			} as any);
		}
		setStatus('loading');
		const t0 = performance.now();
		let engine: any;
		let ctx = 8192;
		// try a roomier KV cache first; fall back to the lib's compiled default
		try {
			engine = await webllm.CreateMLCEngine(
				model,
				{ appConfig, initProgressCallback: (p: any) => setStatus(`loading:${p.text?.slice(0, 80)}`) },
				{ context_window_size: ctx }
			);
		} catch (e) {
			console.warn('ctx 8192 failed, retrying with model default', e);
			ctx = 4096;
			engine = await webllm.CreateMLCEngine(model, {
				appConfig,
				initProgressCallback: (p: any) => setStatus(`loading:${p.text?.slice(0, 80)}`)
			});
		}
		bench.loadMs = performance.now() - t0;
		bench.contextWindow = ctx;
		if (mode === 'load') return;

		for (const item of dataset.items) {
			setStatus(`generating:${item.id}`);
			const budget = ctx - MAX_TOKENS - Math.ceil(SYSTEM_PROMPT.length / CPT) - 300;
			const fitted = fitPrompt(item.question, item.sources, budget);
			const userTurn = nothink ? `${fitted.prompt} /no_think` : fitted.prompt;
			const tq = performance.now();
			let ttft = 0;
			let text = '';
			let usage: unknown;
			const stream = await engine.chat.completions.create({
				messages: [
					{ role: 'system', content: SYSTEM_PROMPT },
					{ role: 'user', content: userTurn }
				],
				stream: true,
				stream_options: { include_usage: true },
				max_tokens: MAX_TOKENS
			});
			for await (const chunk of stream) {
				const delta = chunk.choices?.[0]?.delta?.content ?? '';
				if (!ttft && delta.trim()) ttft = performance.now() - tq;
				text += delta;
				if (chunk.usage) usage = chunk.usage;
			}
			const { answer, thinkChars } = stripThink(text);
			bench.results.push({
				id: item.id,
				question: item.question,
				excerptsUsed: fitted.excerptsUsed,
				promptChars: fitted.prompt.length,
				ttftMs: Math.round(ttft),
				totalMs: Math.round(performance.now() - tq),
				answer,
				thinkChars,
				usage
			});
			view.n = bench.results.length;
		}
	}

	onMount(async () => {
		(window as any).__bench = bench;
		const q = new URLSearchParams(location.search);
		bench.params = Object.fromEntries(q.entries());
		const engine = q.get('engine') ?? 'litert';
		const model = q.get('model') ?? 'gemma-4-E2B';
		const mode = q.get('mode') ?? 'full';
		try {
			const dataset = await fetch('/bench-dataset.json').then((r) => {
				if (!r.ok) throw new Error(`dataset HTTP ${r.status}`);
				return r.json();
			});
			if (engine === 'litert') await runLitert(model, dataset, mode);
			else await runWebllm(model, dataset, mode, q.get('nothink') === '1');
			setStatus('done');
			bench.done = true;
		} catch (e) {
			bench.error = e instanceof Error ? (e.stack ?? e.message) : String(e);
			view.error = bench.error;
			bench.done = true;
			setStatus('error');
		}
	});
</script>

<svelte:head><title>bench</title></svelte:head>

<main style="font-family: monospace; padding: 2rem;">
	<h1>LLM bench</h1>
	<p>status: {view.status}</p>
	<p>answers: {view.n}</p>
	{#if view.error}<pre style="color: red; white-space: pre-wrap;">{view.error}</pre>{/if}
</main>
