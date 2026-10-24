# Server-backed enrollment and training

The user authorized connecting the existing Person 2 HTTP endpoints. No wire protocol modifications were made.

Open Training & settings, keep the port-8000 SSH tunnel open, and click Connect enrollment & training. Connection loads /enroll/sentences, /enroll/{profile} and /train/{profile}/status, retaining the actual server prompt IDs and accepted sentence IDs. API defaults to the WebSocket's loopback origin, with an optional explicit HTTP loopback URL. Profile/settings are saved on connect and locked until disconnect; queued clips are never reassigned to another profile. The backend's SSH-access model is unchanged and profile IDs are not authentication.

Recording uses a video-only MediaRecorder (VP8 WebM preferred, WebM/MP4 fallback), 1Mbps target, up to14s and20MB, and retains one unuploaded clip in memory. User can review, retake or discard it. Upload requires explicit consent and a separate click. POST /enroll/{profile}/clip uses multipart sentence_id, text and file exactly as defined by routes.py. Rejected quality prompts retake; success refreshes authoritative progress and releases the local blob. Existing accepted clips are loaded on reconnect; retaking an accepted sentence replaces its saved server crop, not the count. The server retains mouth crops/transcripts, temporarily decoding the uploaded enrollment video as already implemented by Rahul.

Train my adapter requires at least 30 accepted server clips, no outstanding local clip, explicit consent and no known running job. The client refreshes count/status before POST /train/{profile}?steps=300. HTTP409 resumes status polling, not another training start. Start errors never automatically resubmit: user must refresh status because the request could have reached the server. Current server defaults, including optional feasibility evaluation, are preserved.

Status is polled every2.5s through queued/loading/evaluating/training/done/failed. Progress is indeterminate outside training; during training it shows actual step/steps and loss. Stop waiting only stops polling and says the server job continues. Refresh status or reconnect resumes any existing job. Network timeouts/errors stop polling and offer refresh without canceling or duplicating the server job. Unmount aborts HTTP requests and releases local recorder/preview resources.

On done, GET /train/{profile}/report loads held-out before/after WER (lower better, may exceed100%), exact@5 (higher better), train/test counts and per_clip reference/before/after text. Status-summary metrics remain visible if the full report request fails. Training complete does not claim improvement: values are whatever the server reported. A saved adapter is automatically used on subsequent GPU utterances with the same profile and use_adapter=true; widget Server details reports the adapter actually used.

Manual steps for the user:
1. Restart Electron after pulling, open Training & settings and connect using the existing tunnel/profile.
2. Enable camera; mouth a server sentence, record, stop, review. Grant upload consent and upload it.
3. Confirm accepted count rises; rejected clips should show quality reasons and allow retake.
4. Repeat for at least 30 distinct accepted sentences (more available up to the server's60 prompts).
5. Click Train my adapter, then observe reported stages/steps. Leaving the page does not cancel training.
6. Refresh/reconnect to resume status and view final reported WER/top-five/per-sentence results.
7. Reconnect the widget if the profile changed, capture a new phrase and inspect Server details for the adapter used.

No tests, builds, typechecks, browser previews, app launches, live endpoint requests, uploads, speech or GPU training were performed by the agent. Implementation and push are source-only at the user's direction.
