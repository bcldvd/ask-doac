# Live wait insights — design

**Date:** 2026-07-26
**Goal:** While an answer is being generated, show what the app is doing in plain,
non-technical language, and reveal the retrieved sources immediately — so the wait
(dominated by the model reading a ~14k-token prompt before the first streamed word)
feels shorter and gives the visitor something real to read.

## Constraints

- Copy must be understandable by a broad audience: no model names, no "embedding",
  "prefill", "tokens", or similarity scores.
- No elapsed timers or progress bars — out of scope (they read as technical and can
  make waits feel longer).
- Follow existing patterns: state in `app.svelte.ts` (Svelte 5 runes), pure helpers
  unit-tested under node vitest, mock mode (`?mock=1`) simulating the full flow.

## What the visitor sees

1. **On ask** — the volt-bordered assistant block appears with a status line where
   the bare pulsing dots are today: **"Searching 228 episodes…"** (episode count
   taken from the loaded index). Dots keep pulsing next to the text.
2. **~1s in, retrieval done** — source cards appear under the status, one by one
   with a short stagger animation. They are the real, clickable source items
   (episode title, timestamp, expandable excerpt) the visitor can read right away.
   Status becomes **"Found 8 moments in 5 episodes — reading them closely…"**
   (counts computed from the actual results, singular/plural handled;
   zero results → "Putting an answer together…").
3. **Long stretch** (model reading the prompt) — status + dots stay; visitor
   explores the excerpts.
4. **First streamed words** — the status line is replaced by the streaming answer
   in place; sources stay below. No layout jump: the block fills in.

## Mechanics

- `Message` gains `status?: string`.
- New pure helper `src/lib/state/status.ts`:
  - `searchingStatus(episodeCount: number): string`
  - `readingStatus(sources: { episodeTitle: string }[]): string`
- `app.ask()` (both real and mock paths): set `status` before embedding, update it
  when `retrieve()` resolves (sources are assigned to the message at the same
  moment, as today), clear it in `finally`. Mock path simulates the same stages
  with short delays (~700ms searching, ~1200ms reading) so dev/screenshots show
  the full choreography.
- `+page.svelte`:
  - Pending branch renders `msg.status` text next to the pulsing dots.
  - Sources footer condition changes from `msg.sources?.length && !msg.pending`
    to `msg.sources?.length`; each item is wrapped in a reveal element with a
    per-index `animation-delay` for the stagger.
- Error mid-generation: existing catch writes the error into `text`; `finally`
  clears `pending` and `status`, so no stuck spinner.

## Testing

- Unit tests for `status.ts` (counts, pluralization, zero-results case) —
  node vitest, same pattern as `share.test.ts`.
- Full choreography verified in the browser in mock mode (screenshots of the
  searching state, the sources-revealed state, and the final answer).

## Out of scope (YAGNI)

Elapsed timers, similarity scores, token counts, per-stage progress bars,
retrieval statistics panels.
