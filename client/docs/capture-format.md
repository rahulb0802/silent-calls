# Meeting capture data (memory only)

The capture structure remains an internal renderer object for replay and future approved transport callbacks. Meeting-video export is not available; frames are never saved to disk or logged. Discard happens when the camera stops, the widget closes/reloads, or the native hook cancels. Enrollment is a separate consent-based flow.

Frames contain an unmirrored JPEG data URL and monotonic `timestampMs`; only preview rendering is mirrored. Clip metadata includes an ID allocated at key-down, width/height, targetFps, pressedAtMs, releasedAtMs, actual pre/post-roll duration, endedBy and frames. It is not a wire protocol; follow the root docs/PROTOCOL.md and agree any changes before integration.
