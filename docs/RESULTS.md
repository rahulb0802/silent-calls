# Results log (Person 2: lip-reading + LoRA)

Every number we can show, in the order we got it. Each row links to the run's folder in
`server/results/`, which has `summary.md` / `report.md`, per-clip CSVs and every N-best list.

**Test data:** 3 people × 30 silently mouthed call sentences (`server/eval_data/feasibility_sentences.csv`),
recorded on laptop webcams with `record.html` before the event, plus 6 spoken-aloud clips each for 2 people.
**Model:** AutoAVSR visual-only, LRS3 (`LRS3_V_WER19.1`, ~250M params) + LRS3 subword LM, no training on our data
unless stated. **Hardware:** Vultr, 2 × NVIDIA A16 (16 GB each), 12 vCPU.

**Metrics:** *WER* = word error rate of the top guess. *exact@K* = the exact sentence is among the top K guesses
(what a context reranker like Jev can at best recover). *oracle WER@10* = WER if we always picked the best of
the top 10. *within1@5* = some top-5 guess is at most one word off.

## 1. Baseline: pretrained model, silent clips (90)

| run | where | WER | exact@1 | exact@5 | exact@10 | oracle WER@10 | lip-read time / clip |
|---|---|---|---|---|---|---|---|
| Feasibility test (before the event) | laptop CPU | 38% | 32% | 48% | 50% | 25% | 4.8 s (incl. video decode) |
| [`file_beam40`](../server/results/file_beam40/summary.md): same clips, new server code | A16 GPU | 38% | 32% | 50% | 53% | 26% | **0.86 s** (model only) |

Per person (A16 run): Sarvajith 16% WER / 70% exact@5, Rahul 39% / 57%, Nilesh 57% / 23%. Clarity of mouthing
matters most; Nilesh's clips were cut off and fast.

The new code reproduces the feasibility numbers (differences are 1-3 clips, from dropping an intermediate
video re-encode), so everything below is comparable to it.

## 2. Live path: frames streamed as JPEGs, as the desktop app sends them

Each clip is replayed through `LipReader.on_frame()` / `finish()` as 25 fps JPEG frames (quality 80), at the
height the client would send. "Realtime" feeds frames at 25 fps, so face detection happens while the user is
still mouthing, which is how it behaves in a real call.

| run | frame size | upload | WER | exact@1 | exact@5 | exact@10 | key release → candidates (median) |
|---|---|---|---|---|---|---|---|
| [`stream_720p_q80`](../server/results/stream_720p_q80_beam40/summary.md) | 720p | 2.2 MB/s | 35% | 34% | 43% | 51% | — |
| [`stream_480p_q80`](../server/results/stream_480p_q80_beam40/summary.md) | 480p | 1.1 MB/s | 37% | 32% | 51% | 54% | — |
| [`stream_360p_q80`](../server/results/stream_360p_q80_beam40/summary.md) | 360p | 0.7 MB/s | 38% | 32% | 48% | 50% | — |
| [`stream_480p_q80_realtime`](../server/results/stream_480p_q80_realtime_beam40/summary.md) | 480p | 1.1 MB/s | 37% | 32% | 51% | 54% | **918 ms** |

Breakdown of the 918 ms (realtime 480p, medians): waiting for face detection 1 ms (fully hidden during the hold),
mouth crop 21 ms, encoder 35 ms, beam search 854 ms. **The 1.0 s target for this stage is met.**

**Decision:** the client sends **480p JPEG q80**: same accuracy as the whole-clip path, half the bandwidth of 720p.
720p is no better (its lower exact@5 is noise at 90 clips; one clip = 1.1 points).

<!-- sections 3+ are filled in as runs finish -->
