<script lang="ts">
	import { onMount } from 'svelte';
	import { app } from '$lib/state/app.svelte';
	import {
		ANSWER_STYLES,
		DEFAULT_TIME_BUDGET,
		EXPERIENCE_LEVELS,
		FOCUS_AREAS,
		TIME_BUDGETS,
		type AnswerStyleId,
		type ExperienceLevelId,
		type FocusAreaId
	} from '$lib/state/profile';

	let focusArea = $state<FocusAreaId>(app.userProfile?.focusArea ?? FOCUS_AREAS[0].id);
	let experienceLevel = $state<ExperienceLevelId>(
		app.userProfile?.experienceLevel ?? EXPERIENCE_LEVELS[0].id
	);
	let answerStyle = $state<AnswerStyleId>(app.userProfile?.answerStyle ?? ANSWER_STYLES[0].id);
	let timeBudget = $state(
		TIME_BUDGETS.includes((app.userProfile?.timeBudget ?? '') as (typeof TIME_BUDGETS)[number])
			? (app.userProfile?.timeBudget as (typeof TIME_BUDGETS)[number])
			: DEFAULT_TIME_BUDGET
	);
	let constraints = $state(app.userProfile?.constraints ?? '');
	let sheet: HTMLElement | undefined;

	const editing = $derived(Boolean(app.userProfile));

	function save() {
		app.saveUserProfile({
			focusArea,
			experienceLevel,
			answerStyle,
			timeBudget,
			constraints: constraints.trim()
		});
	}

	function onKeydown(e: KeyboardEvent) {
		if (!sheet) return;
		if (e.key === 'Tab') {
			const focusables = Array.from(
				sheet.querySelectorAll<HTMLElement>(
					'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
				)
			).filter((el) => !el.hasAttribute('disabled'));
			const first = focusables[0];
			const last = focusables.at(-1);
			if (!first || !last) return;

			if (e.shiftKey && document.activeElement === first) {
				e.preventDefault();
				last.focus();
			} else if (!e.shiftKey && document.activeElement === last) {
				e.preventDefault();
				first.focus();
			}
		}
		if (e.key === 'Escape' && editing) app.onboardingOpen = false;
	}

	onMount(() => {
		sheet?.focus();
		const prev = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = prev;
		};
	});
</script>

<svelte:window onkeydown={onKeydown} />

<div class="scrim" role="presentation">
	<div
		bind:this={sheet}
		class="sheet"
		role="dialog"
		aria-modal="true"
		aria-label="Personalization setup"
		tabindex="-1"
	>
		<header class="sheet-head">
			<p class="eyebrow">Personalized experience</p>
			<h2>{editing ? 'Update your focus' : 'Tune your diary'}</h2>
			<p class="sub">
				Tell us what you want right now. We will prioritize transcript excerpts that better match your
				focus.
			</p>
		</header>

		<div class="form-grid">
			<label class="field">
				<span>Primary focus area</span>
				<select bind:value={focusArea}>
					{#each FOCUS_AREAS as option (option.id)}
						<option value={option.id}>{option.label}</option>
					{/each}
				</select>
			</label>

			<label class="field">
				<span>Current level</span>
				<select bind:value={experienceLevel}>
					{#each EXPERIENCE_LEVELS as option (option.id)}
						<option value={option.id}>{option.label}</option>
					{/each}
				</select>
			</label>

			<label class="field">
				<span>Answer style</span>
				<select bind:value={answerStyle}>
					{#each ANSWER_STYLES as option (option.id)}
						<option value={option.id}>{option.label}</option>
					{/each}
				</select>
			</label>

			<label class="field">
				<span>Time budget</span>
				<select bind:value={timeBudget}>
					{#each TIME_BUDGETS as option (option)}
						<option value={option}>{option}</option>
					{/each}
				</select>
			</label>

			<label class="field field-wide">
				<span>Constraints (optional)</span>
				<textarea
					bind:value={constraints}
					rows="3"
					maxlength="240"
					placeholder="Low energy, very busy week, recovering from injury..."
				></textarea>
			</label>
		</div>

		<footer class="actions">
			{#if !editing}
				<button class="ghost" type="button" onclick={() => app.skipOnboarding()}>Skip for now</button>
			{:else}
				<button class="ghost" type="button" onclick={() => (app.onboardingOpen = false)}>
					Cancel
				</button>
			{/if}
			<button class="primary" type="button" onclick={save}>
				{editing ? 'Save changes' : 'Start with this profile'}
			</button>
		</footer>
	</div>
</div>

<style>
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 30;
		background: rgba(0, 0, 0, 0.72);
		backdrop-filter: blur(5px);
		display: grid;
		place-items: center;
		padding: 1.2rem;
	}

	.sheet {
		width: min(42rem, 100%);
		background: var(--panel);
		border: 1px solid var(--line);
		border-radius: 22px;
		padding: 1.35rem;
		box-shadow: 0 32px 90px rgba(0, 0, 0, 0.55);
	}

	.sheet-head {
		margin-bottom: 1.2rem;
	}

	.eyebrow {
		font-family: var(--font-mono);
		font-size: 0.66rem;
		letter-spacing: var(--track-caps);
		text-transform: uppercase;
		color: var(--faint);
		margin-bottom: 0.5rem;
	}

	h2 {
		font-family: var(--font-display);
		font-size: clamp(1.4rem, 3vw, 1.95rem);
		font-weight: 400;
		text-transform: uppercase;
		line-height: 1;
		letter-spacing: 0.01em;
	}

	.sub {
		margin-top: 0.7rem;
		color: var(--muted);
		font-size: 0.9rem;
		line-height: 1.45;
	}

	.form-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.85rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}

	.field-wide {
		grid-column: 1 / -1;
	}

	.field span {
		font-family: var(--font-mono);
		font-size: 0.63rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--faint);
	}

	select,
	textarea {
		width: 100%;
		background: var(--panel-2);
		color: var(--white);
		border: 1px solid var(--line);
		border-radius: 12px;
		padding: 0.65rem 0.75rem;
		font: inherit;
	}

	textarea {
		resize: vertical;
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.6rem;
		margin-top: 1.2rem;
	}

	.ghost,
	.primary {
		padding: 0.56rem 0.95rem;
		border-radius: 999px;
		font-family: var(--font-display);
		text-transform: uppercase;
		font-size: 0.8rem;
		letter-spacing: 0.03em;
	}

	.ghost {
		background: transparent;
		color: var(--muted);
		border: 1px solid var(--line);
	}

	.primary {
		background: var(--volt);
		color: var(--black);
	}

	@media (max-width: 760px) {
		.sheet {
			padding: 1.1rem;
		}

		.form-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
