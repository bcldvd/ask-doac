<script lang="ts">
	import type { RetrievedChunk } from '$lib/rag/retrieve';

	let { source, n }: { source: RetrievedChunk; n: number } = $props();
	let open = $state(false);
</script>

<div class="source">
	<div class="row">
		<button
			class="toggle"
			aria-expanded={open}
			title={open ? 'Hide transcript excerpt' : 'Read the transcript excerpt'}
			onclick={() => (open = !open)}
		>
			<span class="source-n">[{n + 1}]</span>
			<span class="source-title">{source.episodeTitle.replace(/^Transcript of /, '')}</span>
			<svg
				class="chevron"
				class:open
				width="10"
				height="10"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2.5"
				aria-hidden="true"
			>
				<path d="M6 9l6 6 6-6" />
			</svg>
		</button>
		<a class="jump" href={source.videoUrl ?? source.episodeUrl} target="_blank" rel="noreferrer">
			{source.videoUrl ? '▶ ' : ''}{source.timestamp}
		</a>
	</div>
	{#if open}
		<blockquote class="quote">
			<p class="quote-label">From the transcript · {source.timestamp}</p>
			{#each source.text.split('\n') as para, i (i)}
				<p>{para}</p>
			{/each}
		</blockquote>
	{/if}
</div>

<style>
	.row {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
	}

	.toggle {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		text-align: left;
		color: var(--muted);
		font-size: 0.85rem;
		padding: 0.35rem 0.5rem;
		margin-left: -0.5rem;
		border-radius: 8px;
		transition:
			background 160ms ease,
			color 160ms ease;
	}

	.toggle:hover {
		background: var(--panel);
		color: var(--white);
	}

	.source-n {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--volt);
		flex-shrink: 0;
	}

	.source-title {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.chevron {
		flex-shrink: 0;
		align-self: center;
		color: var(--faint);
		transition: transform 180ms ease;
	}

	.chevron.open {
		transform: rotate(180deg);
	}

	.jump {
		flex-shrink: 0;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--faint);
		text-decoration: none;
		padding: 0.35rem 0.5rem;
		border-radius: 8px;
		transition:
			background 160ms ease,
			color 160ms ease;
	}

	.jump:hover {
		background: var(--volt);
		color: var(--black);
	}

	.quote {
		margin: 0.15rem 0 0.6rem 0.65rem;
		padding: 0.7rem 1rem 0.8rem;
		border-left: 1px solid var(--line);
		max-height: 16rem;
		overflow-y: auto;
		color: var(--muted);
		font-size: 0.88rem;
		line-height: 1.55;
	}

	.quote p {
		margin-bottom: 0.6rem;
	}

	.quote p:last-child {
		margin-bottom: 0;
	}

	.quote-label {
		font-family: var(--font-mono);
		font-size: 0.64rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--faint);
	}
</style>
