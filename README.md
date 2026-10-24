<div align="center">

<img src="client/build/icon.png" alt="Silent Calls" width="112" />

# Silent Calls

### Take a call without making a sound.

Mouth your reply at your webcam. A lip-reading model on a cloud GPU reads it, a personal adapter trained on
*your* lips in 35 seconds makes it read you better, and Silent Calls says it into Zoom, Meet or FaceTime
**in your own cloned voice**.

![Cal Hacks 13.0](https://img.shields.io/badge/Cal_Hacks-13.0-1f6f50?style=flat-square)
[![Python 3.11](https://img.shields.io/badge/python-3.11-3776AB?style=flat-square&logo=python&logoColor=white)](requirements.txt)
[![PyTorch](https://img.shields.io/badge/PyTorch-2.4-EE4C2C?style=flat-square&logo=pytorch&logoColor=white)](server/requirements-gpu.txt)
[![Electron + React](https://img.shields.io/badge/Electron_+_React-45_/_19-47848F?style=flat-square&logo=electron&logoColor=white)](client/package.json)
[![Claude](https://img.shields.io/badge/Claude-Opus_5.5-D97757?style=flat-square&logo=anthropic&logoColor=white)](silentcalls/copilot.py)
[![Cartesia](https://img.shields.io/badge/Cartesia-Sonic_+_Ink-111111?style=flat-square)](silentcalls/voice.py)
[![Vultr GPU](https://img.shields.io/badge/Vultr-A16_GPU-007BFC?style=flat-square&logo=vultr&logoColor=white)](server/setup_gpu.sh)

[How it works](#how-it-works) · [Results](#results) · [Built with](#built-with) · [Run it](#run-it) · [Privacy](#privacy-and-safety) · [Full results log](docs/RESULTS.md)

</div>

---

<table>
<tr>
<td align="center" width="25%"><h2>35 s</h2>to train a personal lip-reading adapter on your face<br/><sub>1.2M parameters, 0.5% of the model</sub></td>
<td align="center" width="25%"><h2>37% → 31%</h2>word error rate on sentences the adapter never saw<br/><sub>no change on anyone else: it's personal</sub></td>
<td align="center" width="25%"><h2>0.92 s</h2>from releasing the key to 10 sentence guesses<br/><sub>1.3 s over venue Wi-Fi</sub></td>
<td align="center" width="25%"><h2>77%</h2>right sentence on top once the co-pilot anticipates the reply<br/><sub>up from 36%</sub></td>
</tr>
</table>

## Why

Some people can move their lips but can't speak aloud: after a laryngectomy or vocal-cord surgery, with
voice loss from ALS or Parkinson's, on doctor-ordered voice rest. Everyone else sometimes needs to answer a call
where they can't talk: a library, a hospital ward, next to a sleeping baby.

Today the options are typing into a chat box (if the call has one) or not taking the call. **Silent Calls keeps
them in the conversation, in their own voice**, on the call apps they already use, with no extra hardware beyond
a webcam.

## How it works

### 1. Read the lips: a visual speech recognition model on the GPU

```mermaid
flowchart LR
    CAM["Webcam<br/>VP8 stream, 25 fps"] --> MP["MediaPipe<br/>face landmarks"]
    MP --> CROP["96×96 mouth crop<br/>aligned to a mean face"]
    CROP --> ENC["AutoAVSR encoder<br/>visual frontend + 12 Conformer blocks"]
    LORA[["your LoRA adapter"]] -.-> ENC
    ENC --> BEAM["Beam search, width 40<br/>attention decoder + CTC + LM"]
    VOCAB[["your names + vocabulary"]] -.-> BEAM
    GIVEN[["co-pilot's replies,<br/>scored on the same video"]] -.-> BEAM
    BEAM --> TOP["Top 10 sentences<br/>with scores"]
```

While you hold a key and mouth a sentence, the app streams video to an NVIDIA A16 on Vultr. With frames streamed
as they're captured, face detection finishes during the hold, so after you release the key only the mouth crop,
the encoder and the beam search are left: **0.92 s** median to a ranked top 10. On weak Wi-Fi the app sends a
compressed VP8 stream instead, decoded after release: **1.3 s** end to end over the venue's network.

The model is **AutoAVSR** (visual-only, LRS3, ~250M parameters, 19.1% WER on its benchmark), which knows nothing
about your face, your webcam or your conversation. We extended its decoder in three ways
([`server/lipread/model.py`](server/lipread/model.py)):

- **Personal adapters** (below): a per-user LoRA inside the encoder, swapped in per request.
- **Vocabulary bias:** a beam scorer that rewards subword pieces spelling one of your names or words, and takes
  the bonus back if the word isn't finished. No false names in 102 clips with no names spoken.
- **Closed-set scoring:** sentences we expect you might say are scored against the video with exactly the
  log-probability a beam hypothesis would get, then ranked alongside the beam's own guesses (step 3).

We also tuned the decoder on our own clips (LM weight 0.2, CTC weight 0.1, beam 40) and moved the client from
JPEG frames to a VP8 stream so it works on venue Wi-Fi.

### 2. Learn your lips: a personal adapter in 35 seconds

```mermaid
flowchart LR
    CAL["Calibration<br/>30–60 prompted sentences,<br/>incl. your name + words"] --> STORE["Mouth crops only<br/>stored per user"]
    STORE --> SPLIT["80% train<br/>20% held out"]
    SPLIT --> TRAIN["LoRA training on GPU 1<br/>100 steps · ~35 s"]
    TRAIN --> REPORT["Before / after report<br/>on the held-out clips"]
    TRAIN --> HOT["Hot-loaded on your<br/>next utterance (GPU 0)"]
    COACH["Post-call coach:<br/>approved practice sentences"] -.-> CAL
```

People mouth words differently, and a pretrained model reads some of us far better than others (16% WER for one of
our testers, 57% for another). So the app has a 10-minute calibration: you mouth 30–60 prompted call sentences,
including ones built from your own name and vocabulary, and the server trains an adapter just for you
([`server/lora/`](server/lora/)):

| | |
|---|---|
| **What's trained** | Rank-16 LoRA (alpha 32) on the query/key/value/output projections of all 12 Conformer blocks: 1.18M parameters, 0.5% of the model. Visual frontend, decoder and LM stay frozen. |
| **Recipe** | 100 steps, batch 8, AdamW lr 1e-3 with warm-up + cosine decay, fp16. The checkpoint's own loss (0.1 × CTC + 0.9 × attention). Augmentation from the AutoAVSR recipe: random 88×88 crops and adaptive time masking. |
| **Where** | GPU 1 of the A16, as a subprocess, so training never slows a live call on GPU 0. ~0.35 s per step. |
| **How we chose it** | Cross-validated sweeps: rank 8 vs 16, attention-only vs attention + feed-forward (overfits), 50–300 steps, 6–24 training sentences. Rank 16 at lr 1e-3 matches 300 steps of rank 8 in a third of the time. |
| **Is it personal?** | Yes. Your adapter cuts WER by about a sixth on sentences it never saw; someone else's adapter on your lips does nothing (control below). |

The adapter is written per user and loaded only for that user's requests; retraining reloads it on the next
utterance with no added latency.

### 3. In a call: the conversation fills in what lips can't carry

```mermaid
flowchart LR
    subgraph GPU["Vultr GPU · NVIDIA A16"]
        LIP["Lip-reader<br/>+ your adapter + your vocabulary"]
    end

    subgraph LAPTOP["Your laptop: Electron app + local Python service"]
        direction TB
        CAM["Hold a key,<br/>mouth your reply"]
        CAP["Captions of the other person<br/><i>Cartesia Ink STT</i>"]
        COP["Co-pilot<br/><i>Claude + Calendar / Gmail</i>"]
        DEC["Rank + repair<br/><i>TypeSafe Jev · Claude</i>"]
        PICK["You pick 1 / 2 / 3"]
        TTS["Your cloned voice<br/><i>Cartesia Sonic</i>"]
    end

    CAM -- "VP8 over SSH tunnel" --> LIP
    CAP --> COP
    COP -- "likely replies" --> LIP
    LIP -- "top 10" --> DEC
    CAP --> DEC
    DEC --> PICK --> TTS
    TTS -- "virtual mic" --> CALL(["Zoom · Meet · FaceTime"])
```

1. **You mouth your reply** while holding a key. The lip-reader decodes it with your adapter and vocabulary.
2. **The co-pilot's replies are scored against the same video.** While the other person was talking (captioned live
   by Cartesia), Claude prepared up to 4 likely replies from the conversation and, read-only, your calendar and email.
   The model scores each one on your lips: *your mouthing picks the reply*, and the co-pilot supplies what lips can't
   show (times, order numbers, names). With the right reply in the list, the top guess is right **77%** of the time
   instead of 36%; when it isn't, nothing gets worse.
3. **Jev ranks the options with the conversation**, and Claude offers a repaired sentence when the lip-reader is
   close but wrong (p/b/m and f/v look identical on lips).
4. **You pick one** (keys 1–3) and it's spoken in your cloned voice through a virtual microphone, ~90 ms to first
   audio. **Nothing is ever spoken without your pick.**

After the call, a **coach agent** looks at where lip-reading struggled and proposes words and practice sentences;
the ones you approve feed the vocabulary bias and your next calibration.

## Results

Measured on **90 silently mouthed call sentences from 3 people**, recorded on ordinary laptop webcams, plus
spoken-aloud clips as a control. Out of the box, the pretrained model puts the right sentence first **36%** of the
time and in its top 10 **56%** of the time. Each accuracy number links to a run folder in
[`server/results/`](server/results/) with per-clip CSVs and every N-best list; the full log with every sweep and
timing is [docs/RESULTS.md](docs/RESULTS.md).

> **Metrics.** *WER*: word error rate of the top guess. *exact@K*: the exact sentence is among the top K guesses.
> *within1@5*: some top-5 guess is at most one word off.

### Headline

| | Before | After |
|---|---|---|
| **Personal LoRA adapter**, sentences it never saw | WER 37%, exact@5 49%, within1@5 64% | WER **31%**, exact@5 **56%**, within1@5 **73%** |
| Same adapter on *someone else's* lips (control) | WER 37% | WER 37%: **the gain is personal** |
| Biggest single gain (one tester, own adapter) | WER 38% | WER **21%** |
| **Co-pilot anticipated the reply** (closed-set scoring, +60 ms) | top guess 36%, WER 37% | top guess **77%**, top 3 **84%**, WER **19%** |
| **Jev reranking with the call context** | top 1 31%, top 3 41% | top 1 **42%**, top 3 **56%** |

### Latency, end to end

| Stage | Measured |
|---|---|
| Lip-read after key release (A16, face detection hidden during the hold) | **0.92 s** median |
| Key release → candidates on the laptop, over venue Wi-Fi | **1.3 s** median |
| Personal adapter training (100 steps on one A16) | **~35 s** |
| Jev ranking (warm connection) | **80–250 ms** |
| Pick → first audio in your cloned voice | **87–95 ms** |
| Co-pilot replies ready after the other person's line | **2.3 s** (2.9 s with an email search) |
| Claude repair offered as an extra option | ~3 s |

<details>
<summary><b>Personal adapters: cross-validated, with a control</b></summary>
<br/>

5-fold cross-validation by sentence: each person's 30 sentences are split into 5 groups, an adapter trains on 24 and
is scored on the 6 it never saw, so every clip is scored by an adapter that didn't train on it
([`lora_cv5_final_r16_s100_lm0.2`](server/results/lora_cv5_final_r16_s100_lm0.2/crossval.md)). The control scores
each adapter on the *other two people's* clips of the same held-out sentences.

| | clips | WER | exact@1 | exact@5 | exact@10 | oracle WER@10 | within1@5 |
|---|---|---|---|---|---|---|---|
| base model | 90 | 37% | 36% | 49% | 56% | 24% | 64% |
| **own adapter** (100 steps) | 90 | **31%** | **40%** | **56%** | **60%** | **18%** | **73%** |
| other people's clips, someone else's adapter | 180 | 37% | 35% | 49% | 56% | 24% | 65% |

Per person, WER base → own adapter: Rahul 38% → **21%**, Sarvajith 15% → 13%, Nilesh 59% → 58% (his clips were
cut off and fast, which no adapter fixes). It learns how *you* mouth words and your camera, not the sentences.

**Finding the recipe** (same cross-validation, all 90 clips; base is 38% WER / 53% exact@10 at the older LM weight):

| adapter | trainable params | steps | WER | exact@10 | training time |
|---|---|---|---|---|---|
| rank 8, attention only, lr 5e-4 | 590k | 300 | 29% | 60% | ~110 s |
| rank 8, attention + feed-forward | 2.06M | 300 | 34% | 60% | ~110 s |
| **rank 16, attention only, lr 1e-3** | 1.18M | **100** | 29% | 61% | **~35 s** |

**How much calibration is enough?** Final recipe, training on only N sentences:

| training sentences | 0 | 6 | 12 | 18 | 24 |
|---|---|---|---|---|---|
| WER | 37% | 38% | 34% | **28%** | 31% |
| exact@10 | 56% | 52% | 56% | **64%** | 60% |

Six sentences hurt (the adapter memorizes them); the full gain is there by 18. The app requires 30 clips (24 to
train, 6 for its before/after report) and asks for 60.

**First real enrollments** through the app (small held-out sets, so anecdotes rather than measurements): Rahul's
held-out WER 34% → 13%; Sarvajith's adapter, scored on the separate 30-sentence test set, exact@10 83% → 90%.

</details>

<details>
<summary><b>Decoder tuning and name biasing</b></summary>
<br/>

**Decoder sweep** ([`sweep.md`](server/results/sweep.md)), no training, 90 silent clips:

| LM weight | CTC weight | WER | exact@1 | exact@10 |
|---|---|---|---|---|
| 0.0 | 0.1 | 41% | 33% | 53% |
| 0.1 | 0.1 | 40% | 34% | 53% |
| **0.2** | **0.1** | **37%** | **36%** | **56%** |
| 0.3 (old default) | 0.1 | 38% | 32% | 53% |
| 0.5 | 0.1 | 39% | 30% | 48% |

A lighter LM also leaves more room for conversation context. Beam 20 would save 0.26 s for ~2 points of exact@10;
we keep 40 because the network, not the GPU, dominates the delay.

**Names.** On 102 clips with 8 names passed as vocabulary and **no names spoken**, a bias of 2.0 put **no false
name in any top 10**, for +75 ms ([`names_vocab_biasonly`](server/results/names_vocab_biasonly/summary.md)). At 4,
hypotheses that keep spelling names survive so long the beam ran out of GPU memory, so 2.0 stays. Lip-shape name
swaps were noisy (*"like a"* looks like *"anika"*, *"pray"* like *"priya"*) and are off by default. Live, *"hi my
name is Rahul"* came out as *"hi my name is **wrong**"*; Claude's repair, knowing "Rahul" is a likely name, offered
**"Hi, my name is Rahul."**

</details>

<details>
<summary><b>Bandwidth: making it work on venue Wi-Fi</b></summary>
<br/>

The venue uplink measured ~0.5 MB/s, too slow for JPEG frames. We switched the client to a VP8 stream from
`MediaRecorder` and decode on the server.

| Client sends | Upload | WER | exact@10 | Key release → candidates over venue Wi-Fi |
|---|---|---|---|---|
| JPEG 480p q80 | 1.1 MB/s | 37% | 56% | **10.7 s** median (1.8–23 s) |
| VP8 480p, 1 Mbps | 125 KB/s | 38% | 49% | **1.29 s** median (0.93–2.1 s) |
| VP8 480p, 2 Mbps (app default) | 250 KB/s | 37% | 53% | |

Also tested: 360p–720p frames, face crops from 96 to 320 px, JPEG quality 30–80, VP8 at 250 kbps–2 Mbps. Full
tables in [docs/RESULTS.md §2–3](docs/RESULTS.md#2-live-path-frames-streamed-as-jpegs-as-the-desktop-app-sends-them).

</details>

<details>
<summary><b>Closed-set scoring: how the co-pilot's replies meet the lip-reader</b></summary>
<br/>

Among a short list, **the true sentence is the best-scoring one 98–99% of the time**, but the beam's own best guess
always wins on likelihood alone (the beam is a likelihood maximizer), so prepared replies get a prior bonus *B*.
Choosing *B* offline ([`given_scores`](server/results/given_scores/sweep.md), lists of 5):

| B | truth among 4 others: top 1 | truth among 4 look-alikes: top 1 | only one-word-off replies: a wrong one wins |
|---|---|---|---|
| 0 | 32% | 32% | 0% |
| 4 | 59% | 59% | 0% |
| **8** | **77%** | **77%** | **1%** |
| 12 | 88% | 88% | 16% |
| 15 | 90% | 90% | 53% |

Through the real decoding path at B = 8 ([`given_d4_bonus8`](server/results/given_d4_bonus8/summary.md)):

| Co-pilot's list | WER | exact@1 | exact@3 | wrong reply on top |
|---|---|---|---|---|
| none (lip-reading alone) | 37% | 36% | 43% | – |
| contains what was said (+4 other sentences) | **19%** | **77%** | **84%** | 0% |
| contains what was said (+4 look-alikes) | **19%** | **77%** | **84%** | 0% |
| doesn't contain it | 37% | 36% | 43% | 0% |

The lips really do separate near-identical sentences: with the truth plus 4 one-word-off replies, the truth still
wins 77% of the time.

</details>

<details>
<summary><b>Conversation context: Jev and decision weights</b></summary>
<br/>

- **Fusion** (`silentcalls/fit_weights.py`): w_lip 0.5, w_jev 1.2. At combined score ≥ 0.97, 14 of 90 clips were
  all correct. Auto-speak is still **off**: the user always picks.
- **In practice:** with *"hi server jet yes i can"*, *"hi so very yes i can"*, *"hi sarvajith yes i can"* and
  Sarvajith as a likely name, Jev ranked the lip-reader's **third** guess first at 87%.
- **Keeping the connection warm** cut Jev's latency from ~1 s (over the 0.5 s budget) to 98–245 ms.

</details>

<details>
<summary><b>Choosing the Claude model for the co-pilot</b></summary>
<br/>

[`tools/copilot_bench.py`](tools/copilot_bench.py): 12 scripted calls against a fake calendar and inbox (order
numbers, confirmation codes, calendar conflicts, an honest "let me check" when the fact doesn't exist), 3 runs per
model ([`results/copilot_models/`](results/copilot_models/)).

| Model | Right reply in list | Right reply first | Invented facts | Median latency (no search / search) | Cost per line |
|---|---|---|---|---|---|
| **Opus 5.5, fast mode** (shipped) | 100% | 97% | 0 | **1.4 s / 2.2 s** | $0.032 |
| Opus 5.5 | 100% | 100% | 0 | 3.3 s / 4.9 s | $0.016 |
| Sonnet 5.5 | 100% | 100% | 0 | 2.3 s / 3.9 s | $0.008 |
| Haiku 5.5 | 97% | 81% | 0 | 2.9 s / 3.8 s | $0.0005 |

Fast mode is the only setting with replies ready in about 2 s, before the user has finished mouthing. Sonnet 5.5 is
the fallback.

</details>

<details>
<summary><b>Post-call coach agent</b></summary>
<br/>

After a call, Claude Opus 5.5 reviews every line you spoke (what was shown vs. what was finally said) and calls
proposal tools; you approve each one in the widget. On a scripted call where *"Priya"* came out as *"pray"* and
*"Devansh"* as *"the bunch"*, it proposed **Priya, Devansh, Figma** and two practice sentences, each with quoted
evidence, in 15.9 s, and left the correctly read line alone.

</details>

**Test data:** 3 people × 30 silently mouthed call sentences ([`server/eval_data/`](server/eval_data/)), plus
spoken-aloud clips. **Model:** AutoAVSR visual-only, LRS3 (`LRS3_V_WER19.1`, ~250M params) with its subword LM.
**Hardware:** Vultr, 2 × NVIDIA A16 (16 GB each). With 30 sentences per person, one clip is ~1.1 points overall,
so small differences are noise; we say so in the log wherever it matters.

## Built with

**Webcam → Vultr GPU** (MediaPipe crop, AutoAVSR + your LoRA) **→ top 10 → Jev + Claude** rank and repair, using
Cartesia captions and Claude's co-pilot **→ you pick → Cartesia** speaks it in your voice **→ virtual mic → the call.**

| Layer | Tool | Role |
|---|---|---|
| **Model** | **AutoAVSR + ESPnet** on **PyTorch** | Lip-reading model and beam search, extended with LoRA adapters, vocabulary bias and closed-set scoring ([`server/lipread/`](server/lipread/), [`server/lora/`](server/lora/)) |
| | **MediaPipe** | Face landmarks for the mouth crop; a local mouth-movement meter in the app |
| | **[Vultr Cloud GPU](https://www.vultr.com/products/cloud-gpu/)** | NVIDIA A16: GPU 0 serves calls (FastAPI, `systemd`), GPU 1 trains adapters; every evaluation ran here |
| **Voice** | **[Cartesia](https://cartesia.ai)** | Voice cloning in onboarding, Sonic TTS for every reply (~90 ms), Ink streaming STT for live captions ([`silentcalls/voice.py`](silentcalls/voice.py)) |
| **Context** | **[Claude](https://www.anthropic.com/api)** | Co-pilot (Opus 5.5 fast mode, Gmail search as a tool), repair of near-miss sentences, post-call coach ([`copilot.py`](silentcalls/copilot.py), [`decision.py`](silentcalls/decision.py), [`coach.py`](silentcalls/coach.py)) |
| | **TypeSafe Jev** | Ranks the top 10 with the live conversation; fused with the lip scores ([`decision.py`](silentcalls/decision.py)) |
| | **Google Calendar + Gmail** | Read-only facts for the co-pilot: next 7 days of events, email search snippets ([`google_data.py`](silentcalls/google_data.py)) |
| **App** | **Electron + React** | Onboarding, calibration, always-on-top meeting widget, global hold-to-talk key, automatic SSH tunnel to the GPU |
| | **VB-CABLE / BlackHole, WASAPI loopback** | Virtual mic for your cloned voice; call-audio capture for captions |

## Run it

**Prerequisites:** Python 3.11, Node 22.12+, a webcam, API keys for Cartesia, Anthropic and TypeSafe, and a GPU
host for the lip-reader.

**1. Local service**

```sh
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt      # macOS/Linux: .venv/bin/pip
cp .env.example .env                               # add CARTESIA_API_KEY, ANTHROPIC_API_KEY, TYPESAFE_API_KEY
```

In `.env`, set `VIRTUAL_MIC_DEVICE=CABLE Input` (Windows) or `BlackHole 2ch` (macOS).

**2. Virtual microphone.** Install [VB-CABLE](https://vb-audio.com/Cable/) (Windows) or
[BlackHole 2ch](https://existential.audio/blackhole/) (macOS). In Zoom/Meet, set the **microphone** to CABLE Output
/ BlackHole 2ch and keep the **speaker** on your real speakers.

**3. GPU server.** Run [`server/setup_gpu.sh`](server/setup_gpu.sh) on a Vultr GPU instance, then
`systemctl start lipread`. The app reaches it through an SSH tunnel it opens itself (`~/.ssh/vultr_lipread`;
override with `SILENT_SSH_KEY`, `SILENT_SSH_HOST`).

**4. Optional:** Google sign-in for the co-pilot's calendar and email, read-only: [docs/COPILOT.md](docs/COPILOT.md).

**5. Launch**

```sh
cd client
npm ci
npm run dev
```

The app walks you through onboarding (camera, voice clone, meeting audio, calibration) and starts the local
service itself. To check every piece at once:

```sh
python tools/check_setup.py          # local checks + GPU reachability, no paid API calls
python tools/check_setup.py --live   # also one tiny request each to Jev, Claude and Cartesia
```

## Privacy and safety

- **Nothing is spoken without your pick.** Jev and Claude only rank and suggest; auto-speak is off.
- **Video stays in memory.** Webcam frames are processed and dropped. Only calibration clips are kept, and only as
  96×96 mouth crops with their sentence, per user.
- **Your adapter and vocabulary are yours**, loaded only for your profile.
- **Google access is read-only**, snippets only, nothing logged. The co-pilot shows where every fact came from and
  can be switched off in the widget.
- **No keys in the repo.** Secrets live in `.env` and `~/.silentcalls/`.

## Known limits

- **Lip-reading is hard.** Out of the box, the right sentence is the top guess about a third of the time. Everything
  else is built around that: your adapter, your vocabulary, three options to pick from, the co-pilot, Jev, Claude's
  repair.
- **Adapters don't fix every input.** Clips that are cut off or mouthed too fast stay hard (one tester saw no gain).
- **Names and rare words** need to be in your vocabulary (or said in the call); even then a strong look-alike can
  win, and Claude's repair is the dependable fix.
- **Numbers barely show on lips**; the co-pilot supplies them from your calendar and email.
- **Small test set:** 3 people, 30 sentences each. Decision thresholds were fitted and scored on the same clips.
- **Single-user GPU server** reached over SSH; no multi-user authentication yet.

## Repository

```
server/lipread/    GPU lip-reading service: model, vocab bias, given-sentence scoring, HTTP + WebSocket
server/lora/       Personal adapters: enrollment data, LoRA, trainer, cross-validation
server/eval*.py    The evaluations behind every number in docs/RESULTS.md
server/results/    Every run: summaries, per-clip CSVs, N-best lists
client/            Electron + React app: widget, onboarding, calibration, SSH tunnel
silentcalls/       Local Python service: captions, co-pilot, coach, decision (Jev + Claude), Cartesia voice
tools/             Setup checker, co-pilot benchmark, WebSocket replay, Jev smoke test
docs/              Architecture, protocol, results, setup guides
tests/             Python tests (app tests in client/tests/)
```

Deeper reading: [Architecture](docs/ARCHITECTURE.md) · [WebSocket protocol](docs/PROTOCOL.md) ·
[Results log](docs/RESULTS.md) · [Co-pilot setup](docs/COPILOT.md)

## Team

| | |
|---|---|
| **Sarvajith** | Desktop app: capture, global hold-to-talk, onboarding, calibration, meeting widget |
| **Rahul** | GPU lip-reading: model serving, vocabulary bias, closed-set scoring, LoRA adapters, evaluation |
| **Nilesh** | Voice and decisions: Cartesia cloning, TTS and captions, Jev + Claude decision layer |

## Acknowledgements

The lip-reader is **AutoAVSR** (Ma et al., *Auto-AVSR: Audio-Visual Speech Recognition with Automatic Labels*,
ICASSP 2023) via
[mpc001/Visual_Speech_Recognition_for_Multiple_Languages](https://github.com/mpc001/Visual_Speech_Recognition_for_Multiple_Languages).
Its weights are licensed for non-commercial research use.

<div align="center">
<sub>Built in 36 hours at Cal Hacks 13.0 by Rahul, Sarvajith and Nilesh.</sub>
</div>
