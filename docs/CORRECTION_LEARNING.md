# Confirmed correction learning

## In a call

Learning remains opt-in in Settings. Selecting an alternate candidate, editing a
reply, or selecting a personal-name variant can offer a separate question:
“Is this exactly what you mouthed?” The exact proposed transcript is displayed.
A useful reply is not necessarily the transcript of the captured video.

Speaking or typing proceeds without waiting for this learning decision. Only
“Yes, save for learning” sends the existing `utterance.confirm` message with
`learn: true`. Skip saves nothing. Nod/raise eyebrows approves; shake or turn
skips while this question is visible. The user, rather than a second model,
confirms the words: the app cannot independently prove an arbitrary transcript
matches silent video.

The question expires after two minutes. Starting another capture dismisses an
unsent question. Disconnecting also dismisses it. The server accepts a correction
only for a completed utterance from that same WebSocket session and profile, and
only while its in-memory crop is still available (three minutes). Empty or overly
long transcripts are rejected. A successful save is shown only after the GPU's
`learned` acknowledgement; a missing acknowledgement is reported as unconfirmed.
No automatic retry can create a second example.

## Updating a personal model

Use “Train after my call” to start retraining, or “Check progress” to follow an
existing job. Saving an example does not trigger training on the live call path.
Deleting saved examples removes inputs to future training; it does not reverse
learning already present in an active adapter.

For saved enrollment training, the trainer:

1. Keeps the active adapter in place while training a separate candidate.
2. Reuses the active adapter's held-out sentence IDs. If they cannot be recovered,
   it refuses to replace the active adapter.
3. Excludes correction transcripts matching normalized test or validation
   references from the training examples.
4. Evaluates the current adapter and candidate on the same held-out clips with
   the same vocabulary and decoding settings. On first training, the base model
   is the comparison baseline.
5. Rejects a candidate with missing/non-finite evaluation, invalid weights,
   increased top-one word error rate, or decreased exact-match rate at rank one
   or within the top five. Ties are accepted.
6. Stages the checkpoint, checks that the active checkpoint has not changed,
   saves the old weights as `previous-adapter.pt`, and atomically replaces
   `adapter.pt` only for an accepted candidate.

`report.json` belongs to the saved active adapter. `last-training-report.json`
records the latest attempt, including rejection. The report endpoint returns the
latest attempt, while `has_adapter` continues to describe the actual checkpoint.
The consumer flow uses `active_n_enrollment` so a rejected candidate cannot count
its enrollment clips as a newly accepted model. The legacy before/after fields
still compare base versus candidate; `incumbent_*` fields describe the actual
replacement baseline. `promoted` and `promotion_reason` state the decision.

The guard measures performance on the available held-out sentences. It cannot
guarantee improved recognition for every future phrase, camera, or lighting
condition. Repeatedly using the same holdout can also reduce its usefulness as
an independent estimate; it is a conservative replacement gate, not a new
unbiased accuracy claim.

## Deployment

Deploy both the client changes and GPU server/trainer changes. Updating only the
Electron app does not add the replacement guard to an old GPU trainer. If the
server does not return a promotion verdict, the client reports the update as
unconfirmed. No protocol message was added for saving corrections.

Implementation was written without running tests, builds, training jobs, or app
previews, as requested.
