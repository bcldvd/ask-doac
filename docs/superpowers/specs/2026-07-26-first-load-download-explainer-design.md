# First-load download explainer — design

**Date:** 2026-07-26
**Goal:** On the very first visit, make it unmistakable that the app is downloading
an AI model that will run offline in the browser, and show how long is left —
instead of today's easy-to-miss header line ("Warming up the studio — 0.4 / 2.0 GB")
and 2px progress bar.

## Constraints

- Copy readable by a broad audience; the one technical fact we *do* want to land is
  "a real AI model is downloading to your device, once, and then works offline".
- Follow existing patterns: state in `app.svelte.ts` (Svelte 5 runes), pure helpers
  unit-tested under node vitest, mock mode (`?mock=1`) simulating the full flow.
- Repeat visits read the model from the service-worker cache in seconds — the
  "first visit / happens once" card must not flash there.

## What the visitor sees

**First visit (model not in SW cache), hero, between sub-text and suggestion cards:**

> **⬇ FIRST VISIT — DOWNLOADING THE AI**
> Gemma, a real AI model, is downloading to your device — 2.0 GB, once.
> After this, answers are generated right here in your browser, even offline.
>
> ▓▓▓▓▓▓░░░░░░░ `0.9 / 2.0 GB`
> `about 2 min left · 15.2 MB/s`

- During `initializing` the bar goes indeterminate and the meta line reads
  "Loading onto your graphics chip…".
- The card disappears when the app reaches `ready`.
- The header status line gains the ETA: `Warming up the studio — 0.9 / 2.0 GB · ~2 min`.
- The header keeps working exactly as today when the card isn't shown (cached loads).

**Repeat visit (model cached):** no card; today's lightweight header treatment only.

## Mechanics

### ETA estimator — `src/lib/state/eta.ts` (pure, unit-tested)

- `class DownloadEta` (or factory): `sample(now: number, receivedBytes: number)` +
  `estimate(now, receivedBytes, totalBytes): { seconds: number; bytesPerSec: number } | null`.
- Sliding window: keep samples from the last ~5 s; speed = Δbytes/Δtime across the
  window. Returns `null` until the window spans ≥1 s (no garbage numbers) or when
  speed is 0.
- `formatEta(seconds): string` → friendly text: "about N min left" (≥90 s),
  "about a minute left" (60–90 s), "under a minute left" (10–60 s),
  "a few seconds left" (<10 s). `formatSpeed(bytesPerSec)` → "15.2 MB/s".
- Time is injected (`now` param) so tests don't fake timers.

### State plumbing — `app.svelte.ts`

- New derived/held state: `etaSeconds: number | null`, `bytesPerSec: number | null`,
  updated from the `loadEngine` progress callback via a `DownloadEta` instance
  (using `performance.now()`).
- `modelCached` derived: `cachedModels` includes `model.url`.
- **Race fix:** boot currently posts `model-cache-status` to the SW and starts the
  download without waiting for the reply, so `cachedModels` is briefly empty even on
  repeat visits (card would flash). Boot now awaits the first cache-status reply
  (500 ms timeout — SW may be absent/slow) before flipping to `downloading`.
- Mock mode: `cachedModels` stays empty and the mock loop feeds synthetic samples,
  so the card + ETA render in dev/screenshots.

### UI

- New `src/lib/components/DownloadCard.svelte`: volt-accented card following the
  design system (black surface, hairline border, 20px radius, mono meta text,
  display-caps title). Progress bar is chunky (~6px), volt fill; indeterminate sweep
  during `initializing` (reuse the header's sweep animation pattern).
  `role="status"` + `aria-live="polite"` on the meta line is enough; the bar itself
  reuses `role="progressbar"`.
- `+page.svelte`: render the card in the hero (below `.sub`, above `.cards`) when
  `(app.stage === 'downloading' || app.stage === 'initializing') && !app.modelCached`.
- `+layout.svelte`: append `· ~N min` to the downloading status line when an
  estimate exists.

## Error handling

- Download failure keeps today's path: stage `error`, header shows "The studio went
  dark", card unmounts (stage is no longer downloading/initializing).
- ETA hides (meta line shows just bytes) whenever the estimator returns `null` —
  stalled or not yet warmed up.

## Testing

- Unit tests for `eta.ts`: window math, null before 1 s of data, stall → null,
  rounding buckets of `formatEta`, `formatSpeed`.
- `app.svelte.test.ts`: boot exposes ETA state from progress callbacks; card
  condition (`modelCached`) true/false.
- Visual check in mock mode via a playwright shot script (pattern:
  `scripts/shots/shoot-wait.mjs`).

## Out of scope (YAGNI)

Pause/resume download, per-file breakdown, connection-quality warnings, letting the
visitor pick the smaller/larger model from the card (Preferences already does this).
