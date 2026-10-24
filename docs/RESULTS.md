# Results log (Person 2: lip-reading + LoRA)

Every number we can show, in the order we got it. Each row links to the run's folder in
`server/results/`, which has `summary.md` / `report.md`, per-clip CSVs and every N-best list.

## Headline numbers

| | |
|---|---|
| Lip-read time after key release (A16, live path) | **0.92 s** median (face detection hidden during the hold) |
| End to end over venue Wi-Fi (VP8 stream) | **1.3 s** median, key release → candidates on the laptop |
| Correct sentence among the top 10 (no training) | **56%** of silent clips (exact top guess 36%) |
| Personal LoRA adapter, unseen sentences | WER **37% → 31%**, top-5 **49% → 56%**, ≤1 word off in top 5 **64% → 73%** |
| Same adapter on someone else | no change (37% → 37%): the gain is personal |
| Training one adapter | **~35 s** on one A16 (1.2M parameters, 0.5% of the model) |
| Upload needed | 1.1 MB/s as JPEG frames, **~250 KB/s** as a VP8 stream at the same accuracy |
| Jev reranking with the call context | top guess right **31% → 42%**, truth in top 3 **41% → 56%** (90 silent clips) |
| Jev latency (connection kept warm) | **80-250 ms** per request; a cold connection took ~1 s and missed the 0.5 s budget |
| Enrollment needed for the adapter to help | **18+ training sentences**; 6 don't help. Minimum set to **30 clips** (24 train + 6 report) |
| Names in the vocab, on sentences without names | **no false names** in any top 10 (beam bias 2.0, +75 ms) |

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
still mouthing, which is how it behaves in a real call. (LM weight 0.3 here, the setting before section 4.)

| run | frame size | upload | WER | exact@1 | exact@5 | exact@10 | key release → candidates (median) |
|---|---|---|---|---|---|---|---|
| [`stream_720p_q80`](../server/results/stream_720p_q80_beam40/summary.md) | 720p | 2.2 MB/s | 35% | 34% | 43% | 51% | — |
| `stream_480p_q80` (folder since overwritten by the LM 0.2 rerun in section 3) | 480p | 1.1 MB/s | 37% | 32% | 51% | 54% | — |
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

Lower JPEG quality on full 480p frames barely saves bandwidth (JPEG has no inter-frame compression):

| what the client sends | upload | WER | exact@1 | exact@5 | exact@10 |
|---|---|---|---|---|---|
| 480p q50 | 645 KB/s | 37% | 32% | 49% | 52% |
| 480p q50 gray | 563 KB/s | 42% | 32% | 44% | 48% |
| 480p q30 | 480 KB/s | 41% | 27% | 44% | 52% |

**Video instead of JPEGs.** The client can send what Chrome's `MediaRecorder` produces (a VP8 webm stream in
~100 ms chunks) and the server decodes it on release (`LipReader.on_chunk`, `utterance.start` with
`encoding: "webm"`). Simulated by re-encoding each clip with libvpx in realtime mode at a capped bitrate:

| VP8 stream | upload | WER | exact@1 | exact@5 | exact@10 |
|---|---|---|---|---|---|
| 480p, 250 kbps | 33 KB/s | 45% | 27% | 40% | 47% |
| 480p, 500 kbps | 63 KB/s | 43% | 27% | 46% | 48% |
| 480p, 1 Mbps | 124 KB/s | 38% | 34% | 43% | 49% |
| 720p, 1 Mbps | 125 KB/s | 42% | 28% | 43% | 48% |
| 360p, 250 kbps | 32 KB/s | 49% | 24% | 36% | 41% |

| 480p, 2 Mbps | 247 KB/s | 37% | 33% | 48% | 53% |
| 720p, 2 Mbps | 247 KB/s | 42% | 29% | 43% | 50% |

At 2 Mbps / 480p (~250 KB/s) the stream is within noise of full JPEG frames. 720p is never better than 480p
at the same bitrate (the bits are spread over more pixels).

**End to end over the venue Wi-Fi** (laptop → SSH tunnel → server, 12 clips, real time):

| client sends | upload | key release → candidates (median) | range |
|---|---|---|---|
| JPEG 480p q80 | 1.0-1.4 MB/s | **10.7 s** | 1.8-23 s |
| VP8 webm 480p 1 Mbps | 125 KB/s | **1.29 s** | 0.93-2.1 s |

Server-side share of the webm run: decode + face detection 0.18-0.45 s, crop 20-50 ms, model 0.7-1.6 s (GPU 1
was training at the same time, so CPU was contended). The rest (~0.1 s) is the network.

These are pessimistic: our clips were already VP9-compressed by the browser, so this is a second lossy
generation; a live MediaRecorder stream is encoded once, straight from the camera. Decoding + face detection
after release adds ~0.2 s (they can't run during the hold on a webm stream).

**Recommendation for the client (Person 1):**
- On good Wi-Fi/ethernet/hotspot (≥1.5 MB/s up): JPEG 480p q80 frames, as in PROTOCOL.md. Best accuracy, ~0.9 s.
- On venue Wi-Fi: `MediaRecorder` VP8 at **2 Mbps, 480p** (`videoBitsPerSecond: 2_000_000`), `start(100)`, send
  each `dataavailable` blob as a binary message after `utterance.start {encoding: "webm"}`. ~250 KB/s, about the
  same accuracy as JPEG frames, +0.2 s. Drop to 1 Mbps if the uplink is worse than ~0.5 MB/s.
- Either way, test the uplink before the demo (e.g. `tools/ws_replay.py`); if `end→candidates` is much more than
  ~1 s, the network is the problem, not the model.

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
Training: 300 steps, batch 8, AdamW lr 5e-4, random 88 px crops + time masking, fp16. **0.30-0.37 s/step on one
A16, peak 2.6 GB**, on the second GPU so live calls aren't slowed.

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

**Variants** (same 5-fold cross-validation, all 90 clips pooled; "before" is 38% / 32% / 50% / 53% for every row):

| adapter | trainable params | steps | WER | exact@1 | exact@5 | exact@10 | training (0.34-0.37 s/step) |
|---|---|---|---|---|---|---|---|
| rank 8, attention only, lr 5e-4 | 590k | 300 | 29% | 43% | 56% | 60% | ~110 s |
| rank 8, attention + feed-forward ([`attn_ffn`](../server/results/lora_cv5_feasibility_r8_attn_ffn_s300_lr0.0005/crossval.md)) | 2.06M | 300 | 34% | 40% | 54% | 60% | ~110 s |
| rank 16, attention only, lr 1e-3 ([`r16`](../server/results/lora_cv5_feasibility_r16_attn_s300_lr0.001/crossval.md)), at step 100 | 1.18M | 100 | 29% | 44% | 57% | 61% | **~35 s** |
| same, at step 300 | 1.18M | 300 | 27% | 49% | 53% | 62% | ~100 s |

Adding the feed-forward layers overfits (more parameters, 24 training clips). Rank 16 with a higher learning
rate gets the same gain in a third of the steps.

**Decision:** rank 16, alpha 32, lr 1e-3, **100 steps** (~35 s of training on one A16), attention projections
only. These are the trainer defaults now.

**Final configuration, with the control** (rank 16, 100 steps, LM weight 0.2;
[`lora_cv5_final_r16_s100_lm0.2`](../server/results/lora_cv5_final_r16_s100_lm0.2/crossval.md)):

| | clips | WER | exact@1 | exact@5 | exact@10 | oracle WER@10 | within1@5 |
|---|---|---|---|---|---|---|---|
| base model | 90 | 37% | 36% | 49% | 56% | 24% | 64% |
| **own adapter** (100 steps) | 90 | **31%** | **40%** | **56%** | **60%** | **18%** | **73%** |
| own adapter at step 50 | 90 | 30% | 44% | 56% | 62% | 19% | 72% |
| other people's clips, base model | 180 | 37% | 36% | 49% | 56% | 24% | 64% |
| other people's clips, **someone else's adapter** | 180 | 37% | 35% | 49% | 56% | 24% | 65% |

Per person, base → own adapter: Rahul 38% → 21% WER (exact@10 60% → 70%), Sarvajith 15% → 13% (exact@5
70% → 80%), Nilesh 59% → 58% (no change: his clips are cut off).

**How many enrollment sentences?** Same cross-validation and final configuration, but each adapter trains on
only N of its fold's 24 training sentences (`server.lora.train --max-train N`); all 90 clips pooled:

| training sentences | WER | exact@1 | exact@5 | exact@10 | oracle WER@10 | within1@5 |
|---|---|---|---|---|---|---|
| none (base model) | 37% | 36% | 49% | 56% | 24% | 64% |
| 6 ([`lora_curve_train6`](../server/results/lora_curve_train6/crossval.md)) | 38% | 40% | 50% | **52%** | 24% | 62% |
| 12 ([`lora_curve_train12`](../server/results/lora_curve_train12/crossval.md)) | 34% | 40% | 51% | 56% | 21% | 63% |
| 18 ([`lora_curve_train18`](../server/results/lora_curve_train18/crossval.md)) | **28%** | **46%** | **59%** | **64%** | **17%** | 71% |
| 24 ([`lora_curve_train24`](../server/results/lora_curve_train24/crossval.md)) | 31% | 40% | 56% | 60% | 18% | **73%** |

6 sentences don't help (exact@10 drops; Rahul 60% → 50%: the adapter memorizes them), 12 help a little, and the
full gain is there by 18. 18 vs 24 is within noise (one clip ≈ 1 point; different random subsets). So the
training minimum is **30 clips**, not 8: the trainer holds out 20% for the before/after report, leaving 24 to train
(18 needed, plus margin for clips that fail the quality check). The app asks for all 60 and allows 30. Not
measured: whether 48 training sentences (all 60 prompts) beat 24; the feasibility set has only 30 per person.

## 6. Enrollment → adapter, end to end

Tested through the HTTP endpoints (`POST /enroll/{user}/clip` ×10, `POST /train/{user}`, polling
`GET /train/{user}/status`): clips are cropped and stored as mouth crops only, training runs on GPU 1 as a
subprocess, the adapter is written to `/opt/lr/adapters/<user>/adapter.pt`, and the live reader picks it up on
that user's next utterance (reloads when it is retrained). Verified over the WebSocket: the same 6 clips came
back with `adapter: "routetest"` for that user and `adapter: null` for another, with no added latency.
(That run used 10 clips and 20 steps, only to test the plumbing; its accuracy numbers mean nothing.)

**First real enrollments** (through the app's calibration screen, 300 steps, before the 30-clip minimum and
the 100-step default; held-out sets of 2-6 clips, so these are anecdotes, not measurements):

| who | clips (train / test) | held-out WER | held-out top 5 | on the 30 feasibility sentences (separate test set) |
|---|---|---|---|---|
| Rahul | 30 (24 / 6) | 34% → 13% | 67% → 83% | not scored |
| Sarvajith | 9 (7 / 2) | 17% → 0% | 50% → 100% | WER 15% → 14%, exact@5 70% → 83%, exact@10 83% → 90% |

The app now requests 100 steps (same gain in cross-validation, ~35 s instead of ~100 s). **Personal sentences:**
the prompt list now includes up to 5 sentences built from the user's name and saved vocabulary ("hi my name is
rahul", "can we talk about {word} later", ...) among the first 30, so the 30-clip minimum covers them
(`GET /enroll/sentences?user_id=`). The trainer always holds one or more of them out and reports `vocab@1` /
`vocab@5` before and after, decoded with the name bias on: the first real measurement of names, once recorded.

## 7. Names (vocab biasing) and decision weights

**False-positive check** (no names are spoken in these clips): the 102 feasibility clips with 8 names
(`sarvajith sarva nilesh rahul priya anika devansh kavya`) passed as the vocab on every clip, GPU 1.

| run | silent WER | exact@1 | exact@5 | exact@10 | aloud exact@10 | beam_ms (median) |
|---|---|---|---|---|---|---|
| no vocab ([`names_baseline`](../server/results/names_baseline/summary.md)) | 37% | 36% | 49% | 56% | 83% | 868 |
| beam bias 2.0 only ([`names_vocab_biasonly`](../server/results/names_vocab_biasonly/summary.md)) | 37% | 36% | 49% | 56% | 83% | 942 |
| + loose lip-shape swaps, 3/utterance ([`names_vocab_bias2`](../server/results/names_vocab_bias2/summary.md)) | 37% | 36% | 49% | 53% | 75% | 934 |
| + rationed swaps, 1/utterance ([`names_vocab_tight`](../server/results/names_vocab_tight/summary.md)) | 37% | 36% | 49% | 54% | 83% | 936 |

- The beam bias is free of false positives here: no name appears anywhere in any top 10, and top-1 changed
  on 2 clips, both already wrong. It costs ~75 ms of beam search.
- Lip-shape swaps are noisy, because many ordinary words really do look like names ("like a" ~ "anika",
  "pray" ~ "priya"). Even rationed, they added 21 swaps and pushed one true sentence out of
  the top 10. So swaps are **off by default** (`DecodeConfig.name_variants`) until the name clips
  (`server/eval_data/name_sentences.csv`, not recorded yet) show they recover names the bias misses.

**Decision weights** (`silentcalls/fit_weights.py`, Jev through TypeSafe, top 10 from `names_baseline`):
w_lip 0.5, w_jev 1.2. Top-1 31% → 42%, top-3 41% → 56% with Jev. Speak without asking at combined ≥ 0.97
(14 of 90 clips, all correct); show the top 3 at ≥ 0.53 (49 clips, 57% contain the truth); below that, ask to
repeat (27 clips). Fitted and scored on the same 90 clips, so treat the thresholds as optimistic. Jev latency
after the first request: 76-236 ms (`tools/jev_smoke.py`).

**In a live call (Rahul mouthing "hi my name is Rahul", pronounced "raw-hull"):** the name reached the
lip-reader (server log: 1 vocab word per capture), but the top guesses were "hi my name is **wrong**" and
"**walker**": at strength 2.0 the bias doesn't lift it above words the model reads with more confidence. Jev
can't fix that (it only ranks the guesses), but Claude's repair, given "Rahul" as a likely name, returned
"**Hi, my name is Rahul.**" as the suggested option. Names now reach the lip-reader from every source: the app's
vocabulary, the profile name, `.env` `VOCAB`, and names heard in the call captions (which Cartesia sometimes
misspells: "Sarvajith" came back as "Sarvahiv" / "Sarvahif"). Untested: a stronger bias (3-6) on recorded name
sentences.

## 8. The call loop in the desktop app

The app now sends each GPU result to the local decision service (Jev + Claude, `auto_speak` off: nothing is
spoken without a pick) and shows the call's captions live. Measured on Rahul's laptop (Windows 11), local
service against TypeSafe and Anthropic:

| step | time |
|---|---|
| Jev ranking, cold connection (first request, or after >5 s idle before the fix) | **~1 s**: over the 0.5 s budget, so Jev was skipped |
| Jev ranking, connection kept warm (keepalive + GET every 60 s, opened at startup) | **98 ms** first, 245 ms after 8 s idle, 115 ms after 20 s idle |
| Claude's repair (offered as an extra option) | ~3 s after the candidates |
| Live caption, word to screen (speaker → WASAPI loopback → Cartesia STT) | words appear ~0.5 s apart while speaking; the finished line ~0.1 s after the pause |
| SSH tunnel opened by the app (cold) / reused | 757 ms / 78 ms |

Example ranking (`hi server jet yes i can` / `hi so very yes i can` / `hi sarvajith yes i can`, with "Sarvajith"
as a likely name): Jev put **"hi sarvajith yes i can" first at 87%** although it was the lip-reader's third
guess. Call audio on Windows needs no second virtual cable: captions record the speakers through WASAPI
loopback (`CALL_AUDIO_DEVICE=loopback`, never the VB-CABLE that carries our own voice).
