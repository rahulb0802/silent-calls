# Personal vocabulary and saved phrases

Open Vocabulary & saved phrases from the widget or Training & settings. The main-window route is `#/library`.

Both collections start empty. Add, edit or remove up to 100 vocabulary entries and 50 saved phrases. No personal names or introductions are prefilled.

## Persistence

The versioned `silent-calls:personal-library:v1` localStorage record is shared by the renderer windows at the same app origin. Writes finish before the UI reports success. Same-window events and cross-window storage events refresh consumers. Read-modify-write operations reread the current saved record to avoid overwriting another window's earlier update. Invalid stored data is reported without being automatically replaced; quota and storage errors appear to the user. This is local persistence, not cloud sync or backup. Clearing app data removes the library. Development origins and the packaged app origin have separate storage.

## Vocabulary

Each term has its preferred spelling and optional alternate readings, separated by commas (up to eight per term). When a top-three GPU candidate contains an explicitly supplied alternate reading, the UI offers a corrected sentence under From your vocabulary. Matching is case-insensitive, uses whole word/phrase boundaries with Unicode letter/number handling, and escapes user regex characters. Clicking a correction copies it into the editable phrase field; only Speak edited phrase sends it to the voice service. The original candidates remain intact. Entries without alternate readings are still available as insertion buttons below the editor.

These are deterministic local suggestions based on user-supplied mappings, not retraining, phonetic inference or server vocabulary biasing. No vocabulary is sent to the GPU and no wire protocols change. Only explicitly spoken text is sent to the local voice service / Cartesia through the existing path.

## Saved phrases

Saved phrases appear in the widget, Type to speak and the library's optional preview. Clicking one is explicit consent to speak that exact text. The action can connect/start the existing developer-configured voice service if needed. It respects the main process's single-flight speech gate and never automatically retries speech. Save/edit/delete never speaks anything.

## User-run steps

Restart Electron so it loads the new main-window route allowlist. Open Vocabulary & saved phrases; add your own term and, optionally, a mistaken reading. Add a phrase. Save messages should appear and the widget should update. Quit/reopen the app at the same origin to observe that entries persist. A matching GPU candidate should offer a correction; clicking it should only fill the editor. Click Speak edited phrase to explicitly send it. Saved phrase buttons speak on click. You can edit and remove entries from the library.

No tests, typechecks, builds, app launches, verification passes, live model calls or speech requests were run by the agent. No changes pushed.
