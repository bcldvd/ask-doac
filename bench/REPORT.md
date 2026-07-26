# On-device model benchmark — ask-doac

Generated 2026-07-26T21:06:48.187Z on this MacBook Pro (Chromium + WebGPU via Playwright). 12 questions (11 corpus + 1 off-topic control), identical RAG excerpts from the app's real retrieval, app's real system prompt. Judge: claude -p, rubric over groundedness / citations / helpfulness / quality (0-5 each, 20 max).

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
