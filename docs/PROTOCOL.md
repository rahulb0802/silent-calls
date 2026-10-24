# WebSocket Protocol v0.1

Status: DRAFT. Agree on this Friday night, then freeze it. Any change needs
all three people and bumps the version.

## Connections
- `ws://<server>:8000/ws/session?user_id=<id>`: control, frames, candidates, voice
- `ws://<server>:8000/ws/call-audio?user_id=<id>`: upstream call audio only

Text messages are JSON with a `type` field. Binary messages are described per socket.
One utterance is open at a time per session.

## /ws/session: client → server

| type | fields | notes |
|---|---|---|
| `session.start` | `user_id`, `use_adapter: bool`, `voice_id` | first message |
| `utterance.start` | `utt_id: str`, `fps: 25`, `t_press_ms` | then binary frames follow |
| *(binary)* | raw JPEG bytes | one frame per message, belongs to the open utterance, in order |
| `utterance.end` | `utt_id`, `t_release_ms`, `n_frames` | sent after the 0.3 s post-roll |
| `utterance.cancel` | `utt_id` | discard, speak nothing |
| `pick` | `utt_id`, `choice: "candidate" \| "repair" \| "custom"`, `index?`, `text?` | user confirms; server speaks it |
| `quick_phrase` | `text` | speak immediately, bypasses lip-reading |

## /ws/session: server → client

| type | fields | notes |
|---|---|---|
| `candidates` | `utt_id`, `candidates: [{text, lip_score, lm_score, combined}]` (top 10, sorted), `confidence: 0–1`, `route: "speak" \| "pick" \| "repeat"`, `timings: {crop_ms, lipread_ms, jev_ms}` | sent as soon as Jev finishes |
| `repair` | `utt_id`, `text`, `rationale` | may arrive after `candidates`, or never |
| `caption` | `speaker: "remote" \| "self"`, `text`, `final: bool` | remote = STT; self = what we spoke |
| `audio.start` | `utt_id`, `text`, `sample_rate`, `encoding: "pcm_s16le"`, `channels: 1` | then binary audio chunks follow |
| *(binary)* | PCM chunks | play into the virtual mic in order |
| `audio.end` | `utt_id`, `timings: {tts_first_byte_ms, total_ms}` | |
| `error` | `utt_id?`, `code`, `message` | client shows it in the overlay |

Routing rule: when `route == "speak"`, the server starts TTS for `candidates[0]`
without waiting for the client. For `pick` and `repeat`, nothing is spoken until a
`pick` arrives.

## /ws/call-audio: client → server
- First message JSON: `{"type":"audio.config","sample_rate":16000,"encoding":"pcm_s16le","channels":1}`
- Then binary PCM chunks (~100 ms each) of the call's incoming audio.
- Captions come back on /ws/session as `caption` messages.

## Example: high-confidence utterance
```
C→S {"type":"utterance.start","utt_id":"u7","fps":25,"t_press_ms":1729700000000}
C→S <jpeg> <jpeg> ... (~60 frames)
C→S {"type":"utterance.end","utt_id":"u7","t_release_ms":...,"n_frames":62}
S→C {"type":"candidates","utt_id":"u7","confidence":0.86,"route":"speak",
     "candidates":[{"text":"sounds good see you then","lip_score":-3.1,"lm_score":-1.2,"combined":-2.4}, ...],
     "timings":{"crop_ms":180,"lipread_ms":770,"jev_ms":190}}
S→C {"type":"audio.start","utt_id":"u7","text":"sounds good see you then","sample_rate":44100,...}
S→C <pcm> <pcm> ...
S→C {"type":"audio.end","utt_id":"u7","timings":{"tts_first_byte_ms":210,"total_ms":1390}}
```
