<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { app } from '$lib/state/app.svelte';
	import Preferences from '$lib/components/Preferences.svelte';

	let { children } = $props();

	const gb = (bytes: number) => (bytes / 1e9).toFixed(1);

	const status = $derived.by(() => {
		switch (app.stage) {
			case 'boot':
				return 'Opening the studio…';
			case 'downloading':
				return `Warming up the studio — ${gb(app.receivedBytes)} / ${gb(app.totalBytes)} GB`;
			case 'initializing':
				return 'Setting the stage…';
			case 'ready':
				return `ON AIR · ${app.model.label}`;
			case 'error':
				return 'The studio went dark';
		}
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Ask the Diary — every DOAC conversation, one question away</title>
</svelte:head>

<header class="header">
	<a class="wordmark" href="/">
		Ask <em>the Diary</em>
	</a>

	<div class="header-right">
		<p class="status" class:on-air={app.stage === 'ready'} class:error={app.stage === 'error'}>
			{#if app.stage === 'ready'}<span class="lamp" aria-hidden="true"></span>{/if}
			{status}
		</p>
		<button class="gear" aria-label="Preferences" onclick={() => (app.prefsOpen = true)}>
			<svg
				width="18"
				height="18"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.8"
				aria-hidden="true"
			>
				<circle cx="12" cy="12" r="3.2" />
				<path
					d="M19.4 15a1.6 1.6 0 0 0 .32 1.77l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-.97 1.47V21a2 2 0 1 1-4 0v-.09a1.6 1.6 0 0 0-1.05-1.47 1.6 1.6 0 0 0-1.77.32l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.6 1.6 0 0 0 4.86 15a1.6 1.6 0 0 0-1.47-.97H3a2 2 0 1 1 0-4h.09c.66 0 1.22-.42 1.47-1.05a1.6 1.6 0 0 0-.32-1.77l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.6 1.6 0 0 0 1.77.32H9a1.6 1.6 0 0 0 .97-1.47V3a2 2 0 1 1 4 0v.09c0 .64.38 1.22.97 1.47a1.6 1.6 0 0 0 1.77-.32l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.6 1.6 0 0 0-.32 1.77V9c.25.6.83.99 1.47.99H21a2 2 0 1 1 0 4h-.09a1.6 1.6 0 0 0-1.47.97z"
				/>
			</svg>
		</button>
	</div>

	{#if app.stage === 'downloading' || app.stage === 'initializing'}
		<div
			class="loadline"
			class:indeterminate={app.stage === 'initializing'}
			role="progressbar"
			aria-label="Model download"
			aria-valuenow={app.stage === 'downloading' ? Math.round(app.fraction * 100) : undefined}
		>
			<div
				class="loadline-fill"
				style:width={app.stage === 'downloading' ? `${app.fraction * 100}%` : '100%'}
			></div>
		</div>
	{/if}
</header>

{@render children()}

{#if app.prefsOpen}
	<Preferences />
{/if}

<style>
	.header {
		position: sticky;
		top: 0;
		z-index: 10;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.9rem 1.4rem;
		background: color-mix(in srgb, var(--ink) 82%, transparent);
		backdrop-filter: blur(12px);
		border-bottom: 1px solid var(--line);
	}

	.wordmark {
		font-family: var(--font-display);
		font-size: 1.15rem;
		font-weight: 560;
		letter-spacing: 0.01em;
		color: var(--paper);
		text-decoration: none;
	}

	.wordmark em {
		font-style: italic;
		color: var(--ember);
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.status {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.06em;
		color: var(--muted);
		display: flex;
		align-items: center;
		gap: 0.45rem;
		white-space: nowrap;
	}

	.status.on-air {
		color: var(--paper);
	}

	.status.error {
		color: var(--ember);
	}

	.lamp {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--ember);
		box-shadow: 0 0 10px 2px rgba(229, 68, 42, 0.55);
		animation: lamp-in 600ms ease-out;
	}

	@keyframes lamp-in {
		from {
			box-shadow: 0 0 0 0 rgba(229, 68, 42, 0);
			opacity: 0;
		}
	}

	.gear {
		color: var(--muted);
		display: grid;
		place-items: center;
		padding: 0.35rem;
		border-radius: 8px;
		transition: color 160ms ease;
	}

	.gear:hover {
		color: var(--paper);
	}

	.loadline {
		position: absolute;
		left: 0;
		right: 0;
		bottom: -1px;
		height: 2px;
		background: var(--line);
		overflow: hidden;
	}

	.loadline-fill {
		height: 100%;
		background: linear-gradient(90deg, #8c2c1c, var(--ember));
		box-shadow: 0 0 12px rgba(229, 68, 42, 0.7);
		transition: width 300ms ease;
	}

	.indeterminate .loadline-fill {
		animation: sweep 1.2s ease-in-out infinite;
		transform-origin: left;
	}

	@keyframes sweep {
		0% {
			transform: translateX(-100%) scaleX(0.4);
		}
		100% {
			transform: translateX(250%) scaleX(0.4);
		}
	}

	@media (max-width: 640px) {
		.status {
			font-size: 0.62rem;
		}
	}
</style>
