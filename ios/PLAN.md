# Ask the Diary — iOS app plan

Native iOS counterpart to the web app. Motivation: mobile browsers kill the page around
1–1.5 GB of memory, so the in-browser LLM can never load reliably on iPhone. Native sidesteps
the limit entirely — and with Apple Foundation Models there is **no model download at all**.

## Locked decisions

| Decision | Choice | Why |
|---|---|---|
| Framework | **Native SwiftUI, iOS 26 SDK** | Escaping browser limits is the whole point; native gives real memory headroom, Metal/ANE inference, and first-class Liquid Glass. Cross-platform (RN/Flutter) fights both the ML runtimes and the 2026 design language. Android is out of scope for v1. |
| LLM | **Apple Foundation Models framework** (on-device ~3B, `LanguageModelSession`) | User requirement: zero download wait on first use. Free, private, streams natively, no bundle bloat. Requires Apple Intelligence (iPhone 15 Pro+/Air — user's device is an iPhone Air ✓). Devices without it get a clear unsupported screen; MLX fallback is a possible v2. |
| Visual direction | **Liquid Glass over a dark "recording studio" scene** | Keeps the web app's ON AIR identity (dark studio, warm signal-red accent, mic/waveform motifs) but re-expressed natively: glass toolbars/chips floating over a deep gradient, citation chips as glass capsules, `glassEffect`/`buttonStyle(.glass)` throughout. This *is* the 2026 iOS design language — matching it beats fighting it. |
| Embedder | **all-MiniLM-L6-v2 → Core ML** (fp16 `.mlpackage`, ~23 MB) + Swift WordPiece tokenizer | Query embeddings must live in the same 384-dim space as the prebuilt index. Parity-checked against the JS embedder (cosine ≥ 0.99 on fixtures, top-k overlap on the bench set). |
| Search index | **Bundle the existing artifacts unchanged** — `embeddings.bin` (11 MB int8), `scales.bin`, `index.json`, `youtube.json`, all 228 transcripts (21 MB) | Zero data-pipeline changes; app works fully offline from first launch. ~35 MB payload is nothing next to the 2 GB the web app downloads. Search = int8 cosine top-k via Accelerate, then the same cluster/hydrate logic. |
| Persistence | **SwiftData + CloudKit** (private DB) | User requirement: storage is iCloud. History syncs across devices, no server. iCloud entitlement needs the paid dev program → code ships CloudKit-ready, runs local-only under free signing until enrollment. |
| Project layout | `ios/` in this repo: **XcodeGen** (`project.yml`) + local SwiftPM package **AskDiaryKit** | Kit holds all engine logic (vectors, clustering, retrieval, prompt, tokenizer) and tests via `swift test` — buildable with CLT alone, no Xcode needed. The app target is a thin SwiftUI shell. Deterministic project file, no pbxproj merge pain. |
| Min OS | **iOS 26** | Foundation Models + Liquid Glass APIs require it; the only supported device class (Apple Intelligence) already runs it. |

## Architecture

```
question ─▶ WordPieceTokenizer ─▶ MiniLM.mlpackage (Core ML, ~5 ms)
                                        │ 384-d query vector
                                        ▼
                    int8 cosine top-k over 30,308 chunks (Accelerate)
                                        │ clusterHits (gap-merge, same params as web)
                                        ▼
                    transcript hydration (bundled JSON, per-episode cache)
                                        │ numbered excerpts
                                        ▼
        buildGroundedPrompt ─▶ LanguageModelSession.streamResponse
                                        │
                                        ▼
        streamed answer, [n] chips ─▶ citation cards ─▶ YouTube deep links
                                        │
                                        ▼
                        SwiftData (CloudKit-mirrored) history
```

`AskDiaryKit` is platform-agnostic (macOS + iOS) so the whole engine is unit-tested from the
CLI. The app layer owns only: FM session management, SwiftUI views, SwiftData models.

Foundation Models specifics: 4,096-token context — excerpt budget must be trimmed to fit
(retrieval k=6 with maxSpan 24 paragraphs can exceed it; measure and cap by token estimate).
`SystemLanguageModel.default.availability` drives the unsupported/model-downloading states.
Guardrails may refuse some health-adjacent questions — surface gracefully, offer rephrase.

## Onboarding (à la Slate — user-provided reference)

Modeled on Slate - Private Journal's onboarding (screenshot provided 2026-07-30): pure dark
screens, thin progress bar, a bold plain-spoken headline ("We cannot read your journal.
Not won't, can't."), an icon-row card explaining the pipeline in one line each, muted proof
copy, single white pill Continue. Ours: "We cannot see your questions. Not won't, can't." —
rows for question embedding (on this phone), search (index ships inside the app), answer
(Apple's on-device model, never phones home), optional iCloud sync of history. Proof point
carries over verbatim-in-spirit: airplane mode changes nothing, there is nothing to
disconnect from. Final page checks Apple Intelligence availability.

## Autonomous iteration loop

- Engine: `swift test` in `ios/AskDiaryKit` (works today, CLT only).
- App: `xcodegen && xcodebuild -scheme AskDiary -destination 'iOS Simulator,name=iPhone 17 Pro' build test`.
- Visual self-review: `xcrun simctl boot / launch / io screenshot` → read the PNG, critique,
  iterate. Multiple sizes (Air/Pro/Pro Max-class) + light/dark. A `--mock-llm` launch argument
  fakes the FM stream so UI iteration never depends on model availability in the simulator.
- Debugging: `simctl spawn booted log stream --predicate 'subsystem == "diary.ask"'`.
- Real-FM check in simulator requires Apple Intelligence enabled on this Mac (macOS 26.5,
  M5 Max ✓ — enable in System Settings if off); final quality validation happens on device.

## Distribution path

1. **Now → enrollment**: free personal-team signing, cable install to the iPhone Air via
   `devicectl` (7-day cert, no iCloud sync yet).
2. **User enrolls** in the Apple Developer Program ($99/yr) → App Store Connect app record,
   iCloud + push entitlements, App Store Connect API key for CLI uploads.
3. **TestFlight** internal build (no review wait) — user validates on the Air.
4. **App Store submission**: archive → upload → metadata + screenshots (generated via simctl)
   → privacy label ("Data Not Collected") → review. Content note: transcripts are scraped;
   framing is "unofficial companion / search engine over public transcripts" with clear
   attribution and no DOAC branding in name/icon (App Review 4.1/5.2 risk to manage).

## Milestones

1. ✅ Plan + decisions (this doc)
2. AskDiaryKit engine ported + green `swift test` (no Xcode needed)
3. MiniLM Core ML conversion + tokenizer parity vs JS fixtures
4. Xcode installed → project scaffold → app boots in simulator (mock LLM)
5. Full UI, Liquid Glass pass, screenshot-driven polish loop
6. Real Foundation Models answers in simulator/device; latency + quality tuning
7. SwiftData + CloudKit history
8. Device build on iPhone Air (user plugs in)
9. Icon, metadata, App Store assets, archive pipeline
10. TestFlight → App Store submission (needs user's dev account)
