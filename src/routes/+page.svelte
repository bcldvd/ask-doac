<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { app } from '$lib/state/app.svelte';
	import { renderAnswer } from '$lib/llm/render';

	let draft = $state('');
	let feed: HTMLElement | undefined = $state();

	const CARDS = [
		'What actually makes people rich, according to Alex Hormozi?',
		'How do I fix my sleep?',
		'What morning habits do guests swear by?',
		'How do I start a business with no money?'
	];

	onMount(() => {
		app.boot();
	});

	async function submit(question?: string) {
		const q = question ?? draft;
		if (!q.trim()) return;
		draft = '';
		await app.ask(q);
	}

	// keep the newest message in view while streaming
	$effect(() => {
		const last = app.messages.at(-1);
		void last?.text;
		void app.messages.length;
		tick().then(() => feed?.lastElementChild?.scrollIntoView({ block: 'end', behavior: 'smooth' }));
	});

	const ready = $derived(app.stage === 'ready');
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
			<h1>The diary answers back.</h1>
			<p class="sub">
				Ask a question and Gemma 4 replies with only what Steven Bartlett and his guests actually
				said — cited to the minute. Nothing you type leaves this page.
			</p>

			<div class="cards">
				{#each CARDS as card, i (card)}
					<button
						class="card"
						style:--tilt="{[-1.4, 0.9, -0.7, 1.2][i]}deg"
						disabled={!ready}
						onclick={() => submit(card)}
					>
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
							<p class="thinking"><span></span><span></span><span></span></p>
						{:else}
							<div class="answer">
								<!-- eslint-disable-next-line svelte/no-at-html-tags — renderAnswer escapes -->
								{@html renderAnswer(msg.text)}
							</div>
						{/if}
						{#if msg.sources?.length && !msg.pending}
							<footer class="sources">
								{#each msg.sources as s, n (s.episodeTitle + s.timestamp)}
									<a class="source" href={s.episodeUrl} target="_blank" rel="noreferrer">
										<span class="source-n">[{n + 1}]</span>
										<span class="source-title">{s.episodeTitle.replace(/^Transcript of /, '')}</span>
										<span class="source-t">{s.timestamp}</span>
									</a>
								{/each}
							</footer>
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
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--faint);
		margin-bottom: 1.6rem;
	}

	h1 {
		font-family: var(--font-display);
		font-size: clamp(2.6rem, 7vw, 4.2rem);
		font-weight: 460;
		line-height: 1.04;
		letter-spacing: -0.015em;
	}

	.sub {
		color: var(--muted);
		max-width: 34rem;
		margin: 1.3rem auto 3rem;
		font-size: 1.02rem;
	}

	.cards {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.9rem;
		text-align: left;
	}

	.card {
		text-align: left;
		background: linear-gradient(160deg, var(--panel-2), var(--panel));
		border: 1px solid var(--line);
		border-radius: 12px;
		padding: 1.05rem 1.15rem 1.15rem;
		font-family: var(--font-display);
		font-size: 1.02rem;
		font-weight: 430;
		line-height: 1.35;
		color: var(--paper);
		box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35);
		transform: rotate(var(--tilt));
		transition:
			transform 200ms ease,
			border-color 200ms ease;
	}

	.card:hover:enabled {
		transform: rotate(0deg) translateY(-3px);
		border-color: color-mix(in srgb, var(--ember) 45%, var(--line));
	}

	.card:disabled {
		opacity: 0.55;
		cursor: wait;
	}

	.card-q {
		display: block;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		letter-spacing: 0.12em;
		color: var(--ember);
		margin-bottom: 0.45rem;
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
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--faint);
		margin-bottom: 0.5rem;
	}

	.question {
		font-family: var(--font-display);
		font-style: italic;
		font-weight: 480;
		font-size: 1.45rem;
		line-height: 1.25;
	}

	.turn-assistant {
		border-left: 2px solid var(--ember);
		padding-left: 1.25rem;
	}

	.answer :global(p) {
		margin-bottom: 0.85rem;
		color: var(--paper);
	}

	.answer :global(p:last-child) {
		margin-bottom: 0;
	}

	.answer :global(.cite) {
		font-family: var(--font-mono);
		font-size: 0.68em;
		color: var(--ember);
		margin-left: 0.1em;
	}

	.thinking span {
		display: inline-block;
		width: 6px;
		height: 6px;
		margin-right: 5px;
		border-radius: 50%;
		background: var(--muted);
		animation: pulse 1.2s ease-in-out infinite;
	}

	.thinking span:nth-child(2) {
		animation-delay: 0.2s;
	}

	.thinking span:nth-child(3) {
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

	.source {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		text-decoration: none;
		color: var(--muted);
		font-size: 0.85rem;
		padding: 0.35rem 0.5rem;
		margin-left: -0.5rem;
		border-radius: 8px;
		transition:
			background 160ms ease,
			color 160ms ease;
	}

	.source:hover {
		background: var(--panel);
		color: var(--paper);
	}

	.source-n {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--ember);
		flex-shrink: 0;
	}

	.source-title {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.source-t {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--faint);
		flex-shrink: 0;
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
		background: linear-gradient(transparent, var(--ink) 35%);
	}

	.composer-input {
		flex: 1;
		background: var(--panel);
		border: 1px solid var(--line);
		border-radius: 14px;
		padding: 0.95rem 1.15rem;
		font: inherit;
		color: var(--paper);
		transition:
			border-color 160ms ease,
			box-shadow 160ms ease;
	}

	.composer-input::placeholder {
		color: var(--faint);
	}

	.composer-input:focus {
		outline: none;
		border-color: color-mix(in srgb, var(--ember) 55%, var(--line));
		box-shadow: 0 0 0 3px var(--ember-soft);
	}

	.composer-send {
		width: 3.2rem;
		border-radius: 14px;
		background: var(--ember);
		color: #fff;
		display: grid;
		place-items: center;
		transition:
			filter 160ms ease,
			opacity 160ms ease;
	}

	.composer-send:hover:enabled {
		filter: brightness(1.12);
	}

	.composer-send:disabled {
		opacity: 0.35;
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
