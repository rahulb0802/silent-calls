"""Which profile a request belongs to, without accounts: the profile name plus a secret the app keeps per profile.

The app makes a random secret the first time a profile is used and sends it with every request (the
WebSocket's session.start, and an X-Profile-Secret header on HTTP). Everything for that person is stored
under "<name>~<16 hex of sha256(secret)>": calibration clips, personal adapter, corrections, word list. A
request with only the name, or another secret, gets a different (empty) profile, never theirs.

Profiles from before this (stored under the bare name) are moved under the first secret that claims them,
once; after that the bare name opens nothing. (The server is reachable only through the SSH tunnel, so who
can claim at all is limited to people holding the SSH key.)
"""

import hashlib
import logging
import re
import threading

from ..lora.lora import adapter_key
from .paths import ADAPTER_DIR, ENROLL_DIR, VOCAB_DIR

log = logging.getLogger(__name__)
_lock = threading.Lock()
SEP = "~"


class MissingSecret(ValueError):
    pass


def storage_id(name: str, secret: str | None) -> str:
    """The id everything for this profile is stored under; claims a pre-secret profile of that name once."""
    name = (name or "").strip()[:80]
    if not name or SEP in name:
        raise MissingSecret("choose a profile name")
    if not secret or not re.fullmatch(r"[A-Za-z0-9_-]{32,128}", secret):
        raise MissingSecret("this app version doesn't send a profile key; update and restart it")
    uid = f"{name}{SEP}{hashlib.sha256(secret.encode()).hexdigest()[:16]}"
    _claim_legacy(name, uid)
    return uid


def display_name(uid: str | None) -> str:
    """The profile name part of a storage id ("Rahul~3f2a..." -> "Rahul")."""
    return (uid or "").split(SEP)[0]


def _claim_legacy(name: str, uid: str) -> None:
    old, new = adapter_key(name), adapter_key(uid)
    pairs = [(ENROLL_DIR / old, ENROLL_DIR / new), (ADAPTER_DIR / old, ADAPTER_DIR / new),
             (VOCAB_DIR / f"{old}.json", VOCAB_DIR / f"{new}.json")]
    if not any(src.exists() for src, _ in pairs):
        return
    with _lock:
        moved = []
        for src, dst in pairs:
            if src.exists() and not dst.exists():
                dst.parent.mkdir(parents=True, exist_ok=True)
                src.rename(dst)
                moved.append(dst.parent.name)
        if moved:
            log.info("identity: moved a pre-secret profile under its key (%s)", ", ".join(moved))
