<script lang="ts">
	// First-visit explainer: what the 2 GB download is, why it happens once,
	// and how long is left. Only rendered when the model isn't already cached.
	import { app } from '$lib/state/app.svelte';
	import { formatEta, formatSpeed } from '$lib/state/eta';

	const gb = (bytes: number) => (bytes / 1e9).toFixed(1);

	const initializing = $derived(app.stage === 'initializing');
	const meta = $derived.by(() => {
		if (initializing) return 'Loading onto your graphics chip…';
		const bytes = `${gb(app.receivedBytes)} / ${gb(app.totalBytes)} GB`;
		if (!app.eta) return bytes;
		return `${bytes} · ${formatEta(app.eta.seconds)} · ${formatSpeed(app.eta.bytesPerSec)}`;
	});
</script>

<aside class="download-card">
	<p class="dl-title">
		<svg
			width="14"
			height="14"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2.4"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path d="M12 3v12m0 0 5-5m-5 5-5-5" />
			<path d="M4 21h16" />
		</svg>
		First visit — downloading the AI
	</p>
	<p class="dl-body">
		Gemma, a real AI model, is downloading to your device — {gb(app.totalBytes ||
			app.model.sizeBytes)} GB, once. After this, answers are generated right here in your browser,
		even offline.
	</p>
	<div
		class="dl-bar"
		class:indeterminate={initializing}
		role="progressbar"
		aria-label="Model download"
		aria-valuenow={initializing ? undefined : Math.round(app.fraction * 100)}
	>
		<div class="dl-fill" style:width={initializing ? '100%' : `${app.fraction * 100}%`}></div>
	</div>
	<p class="dl-meta">{meta}</p>
</aside>

<style>
	.download-card {
		text-align: left;
		background: var(--black);
		border: 1px solid var(--line);
		border-radius: 20px;
		padding: 1.15rem 1.3rem 1.2rem;
		margin: 0 auto 2.2rem;
		max-width: 34rem;
	}

	.dl-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-family: var(--font-display);
		text-transform: uppercase;
		font-size: 0.95rem;
		letter-spacing: 0.02em;
		color: var(--volt);
		margin-bottom: 0.55rem;
	}

	.dl-body {
		color: var(--muted);
		font-size: 0.92rem;
		font-weight: 300;
		line-height: 1.5;
		margin-bottom: 1rem;
	}

	.dl-bar {
		height: 6px;
		border-radius: 999px;
		background: var(--panel-2);
		overflow: hidden;
		margin-bottom: 0.6rem;
	}

	.dl-fill {
		height: 100%;
		border-radius: 999px;
		background: var(--volt);
		transition: width 300ms ease;
	}

	.indeterminate .dl-fill {
		animation: dl-sweep 1.2s ease-in-out infinite;
		transform-origin: left;
	}

	@keyframes dl-sweep {
		0% {
			transform: translateX(-100%) scaleX(0.4);
		}
		100% {
			transform: translateX(250%) scaleX(0.4);
		}
	}

	.dl-meta {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--muted);
	}
</style>
