# /// script
# requires-python = ">=3.11,<3.13"
# dependencies = [
#   "torch==2.4.1",
#   "transformers==4.42.4",
#   "coremltools>=8.0",
#   "numpy<2",
# ]
# ///
"""Convert all-MiniLM-L6-v2 to Core ML for the iOS app.

The exported model takes input_ids + attention_mask (flexible 1..256 tokens)
and returns the final 384-dim sentence embedding — masked mean pooling and
L2 normalization are baked into the graph so Swift only tokenizes.

Verifies the converted model against the fixtures produced by
ios/scripts/gen-tokenizer-fixtures.mjs (the exact embeddings the web app
would compute): cosine similarity must be >= 0.98 on every case.

Run from the repo root:  uv run ios/scripts/convert-minilm.py
"""

import json
import pathlib
import sys

import coremltools as ct
import numpy as np
import torch
from transformers import AutoModel, AutoTokenizer

MODEL = "sentence-transformers/all-MiniLM-L6-v2"
REPO = pathlib.Path(__file__).resolve().parents[2]
OUT = REPO / "ios/AskDiary/Resources/MiniLM.mlpackage"
FIXTURES = REPO / "ios/AskDiaryKit/Tests/AskDiaryKitTests/Fixtures/embeddings.json"
# Fixed shape: queries are short, padding to 128 is cheap, and static shapes
# keep Core ML on the fast path (RangeDim produced NaN + "Data-dependent
# shapes" errors from E5RT at prediction time).
MAX_SEQ = 128


class SentenceEmbedder(torch.nn.Module):
    def __init__(self, model):
        super().__init__()
        self.model = model

    def forward(self, input_ids, attention_mask):
        hidden = self.model(input_ids=input_ids, attention_mask=attention_mask).last_hidden_state
        mask = attention_mask.unsqueeze(-1).to(hidden.dtype)
        pooled = (hidden * mask).sum(dim=1) / mask.sum(dim=1).clamp(min=1e-9)
        return torch.nn.functional.normalize(pooled, p=2, dim=1)


def main():
    # eager attention keeps the traced graph inside coremltools' op coverage
    # (SDPA paths emit ops like new_ones that its TorchScript frontend lacks)
    model = AutoModel.from_pretrained(MODEL, attn_implementation="eager").eval()

    # transformers fills masked positions with finfo(fp32).min (-3.4e38), which
    # the FLOAT16 conversion turns into -inf → NaN through softmax. -1e4 is the
    # classic fp16-safe additive mask and changes nothing numerically at fp32.
    def fp16_safe_extended_mask(self, attention_mask, input_shape, device=None, dtype=None):
        ext = attention_mask[:, None, None, :].to(torch.float32)
        return (1.0 - ext) * -1e4

    model.get_extended_attention_mask = fp16_safe_extended_mask.__get__(model, type(model))
    wrapper = SentenceEmbedder(model).eval()

    example = (
        torch.ones((1, MAX_SEQ), dtype=torch.int32),
        torch.ones((1, MAX_SEQ), dtype=torch.int32),
    )
    traced = torch.jit.trace(wrapper, example)

    mlmodel = ct.convert(
        traced,
        inputs=[
            ct.TensorType(name="input_ids", shape=(1, MAX_SEQ), dtype=np.int32),
            ct.TensorType(name="attention_mask", shape=(1, MAX_SEQ), dtype=np.int32),
        ],
        outputs=[ct.TensorType(name="embedding")],
        convert_to="mlprogram",
        compute_precision=ct.precision.FLOAT16,
        minimum_deployment_target=ct.target.iOS17,
    )
    mlmodel.short_description = "all-MiniLM-L6-v2 sentence embedder (mean-pooled, L2-normalized)"
    OUT.parent.mkdir(parents=True, exist_ok=True)
    mlmodel.save(str(OUT))
    print(f"saved {OUT}")

    # ---- parity check against the web app's own embeddings ----
    tokenizer = AutoTokenizer.from_pretrained(MODEL)
    cases = json.loads(FIXTURES.read_text())
    worst = 1.0
    for text, expected in cases.items():
        enc = tokenizer(
            text, return_tensors="np", padding="max_length", truncation=True, max_length=MAX_SEQ
        )
        pred = mlmodel.predict(
            {
                "input_ids": enc["input_ids"].astype(np.int32),
                "attention_mask": enc["attention_mask"].astype(np.int32),
            }
        )["embedding"][0]
        expected = np.asarray(expected)
        cos = float(np.dot(pred, expected) / (np.linalg.norm(pred) * np.linalg.norm(expected)))
        if not np.isfinite(cos):
            sys.exit(f"PARITY FAILURE: non-finite embedding for {text!r}")
        worst = min(worst, cos)
        print(f"cos={cos:.5f}  {text[:60]!r}")
    print(f"worst cosine: {worst:.5f}")
    if not worst >= 0.98:
        sys.exit("PARITY FAILURE: converted model diverges from the web embedder")


if __name__ == "__main__":
    main()
