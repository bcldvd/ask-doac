# On-device model benchmark — ask-doac

Generated 2026-07-26T21:07:11.151Z on this MacBook Pro (Chromium + WebGPU via Playwright). 12 questions (11 corpus + 1 off-topic control), identical RAG excerpts from the app's real retrieval, app's real system prompt. Judge: claude -p, rubric over groundedness / citations / helpfulness / quality (0-5 each, 20 max).

| Model | Score /20 | Grnd | Cite | Help | Qual | Cold load | Warm load | TTFT | Answer time | tok/s | Ctx | Excerpts used |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Gemma 4 E4B | **18.3** | 4.8 | 4.8 | 4.7 | 4.1 | 238.1s | 1.7s | 3.5s | 12.2s | — | 32768 | 6.0/6 |
| Gemma 4 E2B (current default) | **16.7** | 4.3 | 4.6 | 3.8 | 3.9 | 151.9s | 1.0s | 2.4s | 6.1s | — | 32768 | 6.0/6 |
| Qwen3 1.7B | **9.3** | 2.8 | 0.5 | 2.8 | 3.1 | 75.5s | 1.2s | 2.9s | 7.9s | 34 | 8192 | 5.6/6 |
| Qwen3 0.6B | **5.1** | 2.3 | 0.8 | 1.5 | 0.5 | 30.7s | 0.9s | 2.1s | 17.7s | 35 | 8192 | 5.6/6 |
| Llama 3.2 1B | **3.3** | 1.0 | 0.3 | 1.3 | 0.8 | 54.9s | 1.3s | 1.5s | 8.5s | 73 | 8192 | 5.6/6 |
| Qwen3.5 2B | **2.7** | 0.9 | 0.3 | 1.1 | 0.4 | 119.9s | 1.4s | 4.0s | 22.0s | 36 | 8192 | 5.6/6 |
| SmolLM2 1.7B (SmolLM3 stand-in) | **2.5** | 0.8 | 0.0 | 1.0 | 0.7 | 72.4s | 1.1s | 2.3s | 6.0s | 91 | 8192 | 5.6/6 |
| DeepSeek R1 Distill 1.5B (custom lib) | FAILED | | | | | | | | | | | incompatible: no prebuilt WebLLM build; reusing the Qwen2-1. |

TTFT/answer time exclude the control question. "Excerpts used" < 6 means the model's context window forced trimming.

## Findings

1. **The Gemma models win by a landslide — and it's the task, not the leaderboard.** General-purpose rankings put Qwen3/Llama 3.2 close to Gemma-class models, but this app's core task is long-context grounded QA: 5-6 transcript excerpts (~5-8k tokens), synthesize, cite `[n]`, never invent. The q4 WebLLM small models degrade badly here: fabricated claims, missing citations, degenerate repetition (Llama repeated one paragraph 6×; Qwen3.5-2B emitted garbled tokens like "ビール式").
2. **Gemma 4 E2B (current default) is validated**: 16.7/20, best-in-class groundedness/citations, 2.4s avg TTFT, 6.1s avg answer, ~1s warm load.
3. **Gemma 4 E4B is the quality ceiling** (18.3/20, +1.6 over E2B) at the cost of a 3 GB download (238s cold here) and ~2× answer latency vs E2B.
4. **A "lighter default for old phones" is not free**: Qwen3-0.6B loads 5× faster cold (30.7s vs 152s) but scores 5.1/20 — it hallucinates on the app's core promise. If download drop-off matters, the better lever is keeping E2B and improving download UX, not swapping the model.
5. **DeepSeek-R1-Distill-1.5B has no working browser build** (custom wasm lib reuse → garbled output). **LFM2 has no browser runtime at all** (GGUF/ExecuTorch only) and was excluded; **SmolLM3** has no WebLLM build either — SmolLM2-1.7B stood in (2.5/20).

## Caveats

- Hardware is an M-series MacBook Pro, not a phone: absolute times will stretch on an iPhone (and Safari's WebGPU differs from Chromium's), but relative standings should hold; the quality scores are hardware-independent.
- The app's system prompt was originally tuned for Gemma — some home advantage. But the WebLLM models' failures (repetition loops, fabricated specifics) aren't prompt-fixable at this scale.
- WebLLM models ran with an 8192-token context (excerpts trimmed to ~5.6/6); Gemma used its full 32k with all 6. That asymmetry is the shipping reality of each stack.
- Answers capped at 700 tokens for WebLLM models (some truncated mid-ramble; judge penalized accordingly). Gemma streams uncapped in the app and averaged ~300-400 tokens — under the cap anyway.
- Single LLM judge (claude -p), one generation per question, runtime-default sampling.

## Reproduce

```
node scripts/bench/build-dataset.mjs   # embeds questions, runs app's real retrieval
node scripts/bench/run.mjs [ids...]    # drives /bench via Playwright+WebGPU
node scripts/bench/judge.mjs           # scores answers with claude -p (incremental)
node scripts/bench/aggregate.mjs       # regenerates the table above
```
