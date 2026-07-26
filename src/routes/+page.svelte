<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { replaceState } from '$app/navigation';
	import { app } from '$lib/state/app.svelte';
	import { renderAnswer } from '$lib/llm/render';
	import { questionFromSearch, searchWithQuestion, sharePayload } from '$lib/share';
	import SourceItem from '$lib/components/SourceItem.svelte';
	import DownloadCard from '$lib/components/DownloadCard.svelte';

	// A shared link (?q=…) queues its question: it prefills the composer so
	// it's visible during model warm-up, then auto-asks once ready.
	let sharedQ = questionFromSearch(location.search);
	let draft = $state(sharedQ ?? '');
	let feed: HTMLElement | undefined = $state();

	const CARDS = [
		'What actually makes people rich?',
		'How do I fix my sleep?',
		'What morning habits do guests swear by?',
		'How do I start a business with no money?'
	];

	onMount(() => {
		app.boot();
	});

	async function submit(question?: string) {
		const q = (question ?? draft).trim();
		if (!q || !ready || app.generating) return;
		// The first question of a session becomes the shareable URL — no
		// database, so the link carries the question itself.
		if (app.messages.length === 0) replaceState(searchWithQuestion(location.search, q), {});
		draft = '';
		await app.ask(q);
	}

	// Share an answer via the native share sheet (iOS/Android show their
	// panel); where the Share API is missing (desktop Chrome/Firefox on some
	// platforms), copy the same text + link to the clipboard instead.
	let copiedIndex = $state(-1);

	async function share(i: number) {
		const question = app.messages[i - 1]?.text ?? '';
		const payload = sharePayload(question, app.messages[i].text, location.origin);
		if (typeof navigator.share === 'function') {
			try {
				await navigator.share(payload);
			} catch {
				// user dismissed the share sheet
			}
		} else {
			await navigator.clipboard.writeText(payload.text);
			copiedIndex = i;
			setTimeout(() => {
				if (copiedIndex === i) copiedIndex = -1;
			}, 2000);
		}
	}

	// Auto-ask the shared question once the model is ready — unless the
	// visitor rewrote the draft during warm-up (then they've taken over).
	$effect(() => {
		if (ready && sharedQ) {
			const q = sharedQ;
			sharedQ = null;
			if (draft === q) submit(q);
		}
	});

	// keep the newest message in view while streaming
	$effect(() => {
		const last = app.messages.at(-1);
		void last?.text;
		void app.messages.length;
		tick().then(() => feed?.lastElementChild?.scrollIntoView({ block: 'end', behavior: 'smooth' }));
	});

	const ready = $derived(app.stage === 'ready');
	// The first-ever load pulls 2 GB — explain it. Cached loads read from disk
	// in seconds, so the "first visit" card would be wrong (and just flash).
	const downloadingFresh = $derived(
		(app.stage === 'downloading' || app.stage === 'initializing') && !app.modelCached
	);
	const placeholder = $derived(
		app.stage === 'error'
			? 'Reload to try again'
			: ready
				? 'Ask the diary anything…'
				: 'You can type while the studio warms up…'
	);
</script>

<main class="page">
	{#if app.messages.length === 0}
		<section class="hero">
			<p class="eyebrow">228 episodes · every word indexed · runs entirely in your browser</p>
			<h1>The diary<br /><mark class="hl">answers back</mark></h1>
			<p class="sub">
				Ask a question and get an answer built only from what Steven Bartlett and his guests
				actually said — cited to the minute. Nothing you type leaves this page.
			</p>

			{#if downloadingFresh}
				<DownloadCard />
			{/if}

			<div class="cards">
				{#each CARDS as card (card)}
					<button class="card" disabled={!ready} onclick={() => submit(card)}>
						<span class="card-q">Q.</span>
						{card}
					</button>
				{/each}
			</div>
		</section>
	{:else}
		<section class="feed" bind:this={feed} aria-live="polite">
			{#each app.messages as msg, i (i)}
				{#if msg.role === 'user'}
					<article class="turn-user">
						<p class="turn-label">You asked</p>
						<h2 class="question">{msg.text}</h2>
					</article>
				{:else}
					<article class="turn-assistant">
						{#if msg.pending && !msg.text}
							<p class="thinking">
								{#if msg.status}<span class="status-text">{msg.status}</span>{/if}
								<span class="dots" aria-hidden="true"><span></span><span></span><span></span></span>
							</p>
						{:else}
							<div class="answer">
								<!-- eslint-disable-next-line svelte/no-at-html-tags — renderAnswer escapes -->
								{@html renderAnswer(msg.text)}
							</div>
						{/if}
						{#if msg.sources?.length}
							<footer class="sources">
								{#each msg.sources as s, n (s.episodeTitle + s.timestamp)}
									<div class="source-reveal" style:animation-delay="{n * 70}ms">
										<SourceItem source={s} {n} />
									</div>
								{/each}
							</footer>
						{/if}
						{#if !msg.pending && msg.text}
							<button class="share" onclick={() => share(i)} aria-label="Share this answer">
								<svg
									width="13"
									height="13"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
									aria-hidden="true"
								>
									<path d="M12 15V3m0 0L8 7m4-4 4 4" />
									<path d="M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8" />
								</svg>
								{copiedIndex === i ? 'Link copied' : 'Share'}
							</button>
						{/if}
					</article>
				{/if}
			{/each}
		</section>
	{/if}

	<form
		class="composer"
		onsubmit={(e) => {
			e.preventDefault();
			submit();
		}}
	>
		<input
			class="composer-input"
			type="text"
			{placeholder}
			bind:value={draft}
			disabled={app.stage === 'error'}
			aria-label="Your question"
		/>
		<button
			class="composer-send"
			type="submit"
			disabled={!ready || app.generating || !draft.trim()}
			aria-label="Ask"
		>
			<svg
				width="18"
				height="18"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				aria-hidden="true"
			>
				<path d="M5 12h13M13 6l6 6-6 6" />
			</svg>
		</button>
	</form>
</main>

<style>
	.page {
		max-width: var(--w-column);
		margin: 0 auto;
		padding: 0 1.25rem 7.5rem;
		display: flex;
		flex-direction: column;
		min-height: calc(100dvh - 3.6rem);
	}

	/* ---- hero / empty state ---- */
	.hero {
		margin: auto 0;
		padding-top: 4rem;
		text-align: center;
	}

	.eyebrow {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		letter-spacing: var(--track-caps);
		text-transform: uppercase;
		color: var(--muted);
		margin-bottom: 1.6rem;
	}

	h1 {
		font-family: var(--font-display);
		font-size: clamp(3rem, 9vw, 5.4rem);
		font-weight: 400;
		text-transform: uppercase;
		line-height: 0.98;
		letter-spacing: 0.005em;
	}

	.hl {
		display: inline-block;
		background: var(--volt);
		color: var(--black);
		padding: 0.02em 0.18em 0.06em;
		margin-top: 0.08em;
	}

	.sub {
		color: var(--muted);
		max-width: 34rem;
		margin: 1.4rem auto 3rem;
		font-size: 1.05rem;
		font-weight: 300;
		text-wrap: balance;
	}

	.cards {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.9rem;
		text-align: left;
	}

	.card {
		text-align: left;
		background: var(--black);
		border: 1px solid var(--line);
		border-radius: 20px;
		padding: 0.95rem 1.15rem 1rem;
		font-size: 1.05rem;
		font-weight: 500;
		line-height: 1.35;
		color: var(--white);
		transition:
			background 200ms ease,
			color 200ms ease,
			border-color 200ms ease;
	}

	.card:hover:enabled {
		background: var(--volt);
		border-color: var(--volt);
		color: var(--black);
	}

	.card:hover:enabled .card-q {
		color: var(--black);
	}

	.card:disabled {
		opacity: 0.55;
		cursor: wait;
	}

	.card-q {
		font-family: var(--font-display);
		font-size: 0.95em;
		letter-spacing: 0.02em;
		color: var(--volt);
		margin-right: 0.35em;
		transition: color 200ms ease;
	}

	/* ---- conversation feed ---- */
	.feed {
		padding-top: 2.5rem;
		display: flex;
		flex-direction: column;
		gap: 2.4rem;
	}

	.turn-label {
		font-family: var(--font-mono);
		font-size: 0.66rem;
		letter-spacing: var(--track-caps);
		text-transform: uppercase;
		color: var(--faint);
		margin-bottom: 0.5rem;
	}

	.question {
		font-family: var(--font-display);
		font-weight: 400;
		text-transform: uppercase;
		font-size: 1.9rem;
		line-height: 1.05;
		letter-spacing: 0.005em;
	}

	.turn-assistant {
		border-left: 2px solid var(--volt);
		padding-left: 1.25rem;
	}

	.answer :global(p) {
		margin-bottom: 0.85rem;
		color: var(--white);
	}

	.answer :global(p:last-child) {
		margin-bottom: 0;
	}

	.answer :global(.cite) {
		font-family: var(--font-mono);
		font-size: 0.68em;
		color: var(--volt);
		margin-left: 0.1em;
		user-select: none;
		-webkit-user-select: none;
	}

	.answer :global(.cite)::before {
		content: attr(data-n);
	}

	.thinking {
		display: flex;
		align-items: baseline;
		gap: 0.7rem;
	}

	.status-text {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: var(--track-caps);
		text-transform: uppercase;
		color: var(--muted);
	}

	.dots span {
		display: inline-block;
		width: 6px;
		height: 6px;
		margin-right: 5px;
		border-radius: 50%;
		background: var(--muted);
		animation: pulse 1.2s ease-in-out infinite;
	}

	.dots span:nth-child(2) {
		animation-delay: 0.2s;
	}

	.dots span:nth-child(3) {
		animation-delay: 0.4s;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 0.25;
			transform: translateY(0);
		}
		50% {
			opacity: 1;
			transform: translateY(-2px);
		}
	}

	.sources {
		margin-top: 1.4rem;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.source-reveal {
		animation: reveal 320ms ease backwards;
	}

	@keyframes reveal {
		from {
			opacity: 0;
			transform: translateY(6px);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.source-reveal {
			animation: none;
		}
	}

	.share {
		margin-top: 1.2rem;
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		font-family: var(--font-mono);
		font-size: 0.66rem;
		letter-spacing: var(--track-caps);
		text-transform: uppercase;
		color: var(--muted);
		background: none;
		border: 1px solid var(--line);
		border-radius: 999px;
		padding: 0.5rem 0.95rem;
		transition:
			color 160ms ease,
			border-color 160ms ease;
	}

	.share:hover {
		color: var(--volt);
		border-color: var(--volt);
	}

	/* ---- composer ---- */
	.composer {
		position: fixed;
		bottom: 0;
		left: 50%;
		transform: translateX(-50%);
		width: min(var(--w-column), calc(100vw - 2rem));
		display: flex;
		gap: 0.6rem;
		padding: 1rem 0 1.4rem;
		background: linear-gradient(transparent, var(--black) 35%);
	}

	.composer-input {
		flex: 1;
		background: var(--black);
		border: 1px solid var(--line);
		border-radius: 999px;
		padding: 0.95rem 1.4rem;
		font: inherit;
		color: var(--white);
		transition:
			border-color 160ms ease,
			box-shadow 160ms ease;
	}

	.composer-input::placeholder {
		color: var(--faint);
	}

	.composer-input:focus {
		outline: none;
		border-color: var(--volt);
		box-shadow: 0 0 0 3px var(--volt-soft);
	}

	.composer-send {
		width: 3.4rem;
		border-radius: 999px;
		background: var(--volt);
		color: var(--black);
		display: grid;
		place-items: center;
		transition:
			transform 160ms ease,
			opacity 160ms ease;
	}

	.composer-send:hover:enabled {
		transform: scale(1.06);
	}

	.composer-send:disabled {
		background: var(--panel-2);
		color: var(--faint);
		cursor: not-allowed;
	}

	@media (max-width: 640px) {
		.cards {
			grid-template-columns: 1fr;
		}

		.hero {
			padding-top: 2.5rem;
		}
	}
</style>
