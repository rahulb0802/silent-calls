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

## 3. Bandwidth: the venue uplink can't carry 480p

Replaying 12 clips from the laptop at the venue to the server over the WebSocket ([`tools/ws_replay.py`](../tools/ws_replay.py),
through an SSH tunnel because port 8000 isn't open yet) took **5-23 s** from key release to candidates, while the
server itself needed only ~1 s (`server_ms`). The frames were still in flight: 480p q80 is ~1.1 MB/s, and the venue
Wi-Fi measured ~0.5 MB/s up (5 MB in 10 s) and ~22 KB/s down at the time (ping ~550 ms). So the stream has to be
much smaller, or the demo laptop needs a better connection (phone hotspot or ethernet).

Smaller streams, all through the live path (LM weight 0.2, see section 4; baseline full 480p frames):

| what the client sends | upload | WER | exact@1 | exact@5 | exact@10 |
|---|---|---|---|---|---|
| [480p full frame, q80](../server/results/stream_480p_q80_beam40/summary.md) (baseline) | 1122 KB/s | 37% | 34% | 50% | 56% |
| 360p full frame, q80 (LM 0.3) | 696 KB/s | 38% | 32% | 48% | 50% |
| face crop 320 px, 2.0× face box, gray | 298 KB/s | 39% | 30% | 47% | 51% |
| face crop 256 px, 1.4× box, gray | 208 KB/s | 42% | 31% | 43% | 46% |
| face crop 224 px, 2.0× box, gray | 173 KB/s | 40% | 31% | 43% | 49% |
| face crop 192 px, 1.4× box, gray | 137 KB/s | 38% | 33% | 43% | 48% |
| face crop 160 px, 2.0× box, gray | 104 KB/s | 42% | 30% | 43% | 49% |
| face crop 160 px, 2.0× box, color | 126 KB/s | 42% | 31% | 43% | 49% |
| face crop 128 px, 2.0× box, gray | 75 KB/s | 46% | 26% | 39% | 46% |
| face crop 96 px, 2.0× box, gray | 50 KB/s | 49% | 22% | 33% | 37% |

Face crops cost 5-7 points of exact@10 at any size from 160 px up, so the loss isn't only resolution (MediaPipe's
landmarks are probably less accurate on a frame that is all face). Below 160 px accuracy falls off quickly.

<!-- LOWQ -->

## 4. Decoder settings (no training)

All on the cached mouth crops of the 90 silent clips, beam 40 unless stated
([`sweep.md`](../server/results/sweep.md); every config has its own folder).

| LM weight | CTC weight | WER | exact@1 | exact@5 | exact@10 | oracle WER@10 |
|---|---|---|---|---|---|---|
| 0.0 | 0.1 | 41% | 33% | 46% | 53% | 24% |
| 0.0 | 0.3 | 40% | 31% | 44% | 50% | 26% |
| 0.1 | 0.1 | 40% | 34% | 47% | 53% | 23% |
| 0.1 | 0.3 | 39% | 31% | 47% | 52% | 24% |
| **0.2** | **0.1** | **37%** | **36%** | 49% | **56%** | 24% |
| 0.2 | 0.3 | 38% | 32% | 46% | 53% | 25% |
| 0.3 (old default) | 0.1 | 38% | 32% | 50% | 53% | 25% |
| 0.3 | 0.3 | 38% | 31% | 48% | 52% | 25% |
| 0.5 | 0.1 | 39% | 30% | 44% | 48% | 28% |
| 0.5 | 0.3 | 37% | 30% | 44% | 48% | 27% |

Beam 20 (LM 0.3): WER 38%, exact@5 49%, exact@10 51%, model time 0.60 s instead of 0.86 s
([`file_beam20`](../server/results/file_beam20/summary.md)).

**Decision:** LM weight **0.2**, CTC 0.1, beam 40. Best exact@1 and exact@10, and a lighter LM leaves more room
for Jev's conversation context. The gain over 0.3 is 3 clips, so treat it as "no worse", not as a real win.
Beam 20 would save 0.26 s for ~2 points of exact@10; we keep 40 because the uplink, not the GPU, dominates the delay.

The fusion-weight fitting data for Person 3 (`silentcalls/fit_weights.py`) is
[`server/results/fit/clips_beam40_lm0.2.jsonl`](../server/results/fit/clips_beam40_lm0.2.jsonl): 90 silent clips,
each with `truth`, `context` (the other person's preceding line) and the top-10 `candidates` with scores.

## 5. Per-user LoRA adapters

Rank-8 LoRA on the query/key/value/output projections of all 12 encoder blocks (590k trainable parameters, 0.2% of
the model); visual frontend, decoder and LM frozen. Loss = the checkpoint's own 0.1 × CTC + 0.9 × attention.
Training: 300 steps, batch 8, AdamW lr 5e-4, random 88 px crops + time masking, fp16. **0.30 s/step on one A16
→ ~90 s per adapter**, on the second GPU so live calls aren't slowed.

Before enrollment data existed, we tested it on the feasibility clips with **5-fold cross-validation by sentence**:
each person's 30 sentences are split into 5 groups; an adapter is trained on 24 sentences and scored on the 6 it
never saw; repeated 5 times so every clip is scored once by an adapter that didn't train on it.

[`lora_cv5_feasibility_r8_attn_s300_lr0.0005`](../server/results/lora_cv5_feasibility_r8_attn_s300_lr0.0005/crossval.md):

| who | | WER | exact@1 | exact@5 | exact@10 | oracle WER@10 | within1@5 |
|---|---|---|---|---|---|---|---|
| **all 3 (90 clips)** | before | 38% | 32% | 50% | 53% | 25% | 63% |
| | step 100 | 33% | 41% | 53% | 57% | 20% | 69% |
| | step 200 | 29% | 44% | 57% | 61% | 19% | 72% |
| | **after (300)** | **29%** | **43%** | **56%** | **60%** | **19%** | **72%** |
| Rahul | before → after | 39% → **19%** | 33% → 50% | 57% → 67% | 57% → 67% | 26% → 10% | 63% → 80% |
| Sarvajith | before → after | 16% → 13% | 50% → 63% | 70% → 77% | 80% → 87% | 7% → 6% | 87% → 93% |
| Nilesh | before → after | 57% → 55% | 13% → 17% | 23% → 23% | 23% → 27% | 42% → 42% | 40% → 43% |

**Control: is it personal, or did it just learn our sentences/setup?**
[`lora_cv5_crossuser_control`](../server/results/lora_cv5_crossuser_control/crossval.md) scores each adapter on the
*other two people's* clips of the same held-out sentences:

| | clips | WER | exact@1 | exact@5 | exact@10 |
|---|---|---|---|---|---|
| other person, base model | 180 | 38% | 32% | 50% | 53% |
| other person, **someone else's adapter** | 180 | 39% | 32% | 47% | 53% |
| own clips, own adapter | 90 | 29% | 43% | 56% | 60% |

Someone else's adapter does nothing (slightly worse), while your own cuts WER by about a quarter. **The gain is
personal**: it learns how *you* mouth words (and your camera), not the sentences.

Caveats: 30 sentences per person, so one clip is 3.3 points per person; Nilesh's clips are cut off/too fast,
which no adapter fixes. The enrollment adapters (section 6) train on 60 new sentences and are tested on the
30 feasibility sentences, which is a cleaner split.

<!-- LORA_VARIANTS -->

## 6. Enrollment → adapter, end to end

Tested through the HTTP endpoints (`POST /enroll/{user}/clip` ×10, `POST /train/{user}`, polling
`GET /train/{user}/status`): clips are cropped and stored as mouth crops only, training runs on GPU 1 as a
subprocess, the adapter is written to `/opt/lr/adapters/<user>/adapter.pt`, and the live reader picks it up on
that user's next utterance (reloads when it is retrained).

<!-- ENROLL -->
