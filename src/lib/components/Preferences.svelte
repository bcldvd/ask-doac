<script lang="ts">
	import { app } from '$lib/state/app.svelte';
	import { GEMMA_MODELS } from '$lib/llm/models';

	function isCached(url: string) {
		return app.cachedModels.includes(url);
	}

	function close() {
		app.prefsOpen = false;
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') close();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions (Escape closes via window handler) -->
<div class="scrim" role="presentation" onclick={close}>
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
	<div
		class="sheet"
		role="dialog"
		aria-modal="true"
		aria-label="Preferences"
		tabindex="-1"
		onclick={(e) => e.stopPropagation()}
	>
		<header class="sheet-head">
			<h2>Preferences</h2>
			<button class="close" aria-label="Close preferences" onclick={close}>✕</button>
		</header>

		<p class="section-label">Model</p>
		<div class="models">
			{#each GEMMA_MODELS as m (m.id)}
				<label class="model" class:active={m.id === app.model.id}>
					<input
						type="radio"
						name="model"
						value={m.id}
						checked={m.id === app.model.id}
						onchange={() => app.switchModel(m.id)}
					/>
					<span class="model-body">
						<span class="model-name">
							{m.label}
							{#if isCached(m.url)}<span class="tag">cached</span>{/if}
						</span>
						<span class="model-blurb">{m.blurb}</span>
					</span>
				</label>
			{/each}
		</div>

		<p class="note">
			Switching models reloads the page and downloads the new model once. Models stay cached in
			your browser, so the next visit starts instantly — even offline.
		</p>
	</div>
</div>

<style>
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 20;
		background: rgba(0, 0, 0, 0.6);
		backdrop-filter: blur(4px);
		display: grid;
		place-items: center;
		padding: 1.25rem;
	}

	.sheet {
		width: min(26rem, 100%);
		background: var(--panel);
		border: 1px solid var(--line);
		border-radius: 20px;
		padding: 1.4rem;
		box-shadow: 0 30px 80px rgba(0, 0, 0, 0.55);
	}

	.sheet-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1.4rem;
	}

	h2 {
		font-family: var(--font-display);
		font-weight: 400;
		text-transform: uppercase;
		font-size: 1.35rem;
		letter-spacing: 0.01em;
	}

	.close {
		color: var(--muted);
		padding: 0.3rem 0.5rem;
		border-radius: 999px;
	}

	.close:hover {
		color: var(--volt);
	}

	.section-label {
		font-family: var(--font-mono);
		font-size: 0.66rem;
		letter-spacing: var(--track-caps);
		text-transform: uppercase;
		color: var(--faint);
		margin-bottom: 0.6rem;
	}

	.models {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.model {
		display: flex;
		gap: 0.75rem;
		align-items: flex-start;
		background: var(--panel-2);
		border: 1px solid var(--line);
		border-radius: 12px;
		padding: 0.85rem 1rem;
		cursor: pointer;
		transition: border-color 160ms ease;
	}

	.model:hover {
		border-color: color-mix(in srgb, var(--volt) 45%, var(--line));
	}

	.model.active {
		border-color: var(--volt);
	}

	.model input {
		accent-color: var(--volt);
		margin-top: 0.25rem;
	}

	.model-body {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.model-name {
		font-weight: 600;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.tag {
		font-family: var(--font-mono);
		font-size: 0.6rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--volt);
		background: var(--volt-soft);
		padding: 0.1rem 0.4rem;
		border-radius: 99px;
	}

	.model-blurb {
		color: var(--muted);
		font-size: 0.85rem;
	}

	.note {
		margin-top: 1.1rem;
		color: var(--faint);
		font-size: 0.8rem;
		line-height: 1.5;
	}
</style>
