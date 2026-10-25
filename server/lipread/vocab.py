"""Names and other rare words the lip-reader should be able to say ("vocab"). Pure Python, no torch.

The model was trained on TED talks, so a name like "Sarvajith" never reaches the top 10: it reads
"server jet" instead, which looks the same on the lips. Two fixes use the same word list:

1. model.NameBias boosts the beam search toward the list's spellings (needs the word in the list).
2. add_name_variants() runs after decoding: wherever a candidate's words look like a listed name on
   the lips (same viseme sequence, give or take a vowel), it adds a copy with the name swapped in.

Where the list comes from: the user's own list (PUT /vocab/{user_id}), plus names heard in the call
(names_from_text on the captions), plus whatever the caller passes per utterance.
"""

import hashlib
import json
import re

from .paths import VOCAB_DIR

MAX_WORDS = 200
# Look-alikes are common ("like a" ~ "anika" on the lips), so swaps are rationed: one per utterance, only from
# the top SOURCE_TOP guesses, and it can only push out the last original. With 8 names on every clip, 3 swaps
# from any guess cost 3 points of exact@10 on the 90 feasibility clips (docs/RESULTS.md).
MAX_VARIANTS = 1  # name-swapped candidates added per utterance
SOURCE_TOP = 3  # only swap into the top guesses
MATCH_THRESHOLD = 0.25  # viseme distance / name length at or below which a span "looks like" the name
SWAP_COST = 1.0  # log-prob a swapped candidate is ranked below its source, plus DIST_COST * distance
DIST_COST = 4.0


def clean(words) -> list[str]:
    """Lowercase, letters/apostrophes/spaces only, deduped, order kept, at most MAX_WORDS."""
    out, seen = [], set()
    for w in words or []:
        w = " ".join(re.sub(r"[^a-z' ]+", " ", str(w).lower().replace("’", "'")).split())
        if w and w not in seen:
            seen.add(w)
            out.append(w)
    return out[:MAX_WORDS]


def _path(user_id: str):
    return VOCAB_DIR / f"{re.sub(r'[^a-z0-9_]', '_', user_id.lower())}.json"  # same key as lora.adapter_key


MAX_PRACTICE = 5


def _load(user_id: str | None) -> dict:
    p = _path(user_id) if user_id else None
    return json.loads(p.read_text()) if p and p.exists() else {}


def load_user(user_id: str | None) -> list[str]:
    return clean(_load(user_id).get("words", []))


def load_practice(user_id: str | None) -> list[str]:
    """Practice sentences the user approved (from the post-call coach), for calibration."""
    return clean_sentences(_load(user_id).get("practice", []))


def clean_sentences(sentences) -> list[str]:
    out = [" ".join(re.sub(r"[^a-z0-9' ]+", " ", str(s).lower().replace("’", "'")).split()) for s in sentences or []]
    return list(dict.fromkeys(s for s in out if 2 <= len(s.split()) <= 20))[:MAX_PRACTICE]


def save_user(user_id: str, words, practice=None) -> list[str]:
    """Save the user's words (and, if given, their practice sentences; otherwise the saved ones are kept)."""
    words = clean(words)
    p = _path(user_id)
    p.parent.mkdir(parents=True, exist_ok=True)
    keep = clean_sentences(practice) if practice is not None else load_practice(user_id)
    p.write_text(json.dumps({"words": words, "practice": keep}, indent=1))
    return words


# Capitalized words that aren't names, for names_from_text.
_NOT_NAMES = set("""
i i'm i'll i've i'd a an the and but or so yes yeah no ok okay hi hey hello thanks thank sorry well oh um uh
monday tuesday wednesday thursday friday saturday sunday january february march april may june july august
september october november december english zoom google meet facetime mr mrs ms dr
""".split())
_INTRO = re.compile(r"\b(?:this is|it's|it is|i'm|i am|name is|call me|with|meet|ask|tell)\s+([A-Z][a-z']+)")


def names_from_text(text: str) -> list[str]:
    """Likely names in caption text: capitalized words that don't start a sentence, plus the word after
    "this is" / "I'm" / "name is"... (STT capitalizes names). Crude on purpose: a wrong pick only costs
    a small bias toward a word that was said anyway."""
    found = [m.group(1) for m in _INTRO.finditer(text)]
    for sent in re.split(r"[.!?\n]+", text):
        words = re.findall(r"[A-Za-z][A-Za-z']*", sent)
        found += [w for w in words[1:] if w[0].isupper() and not w.isupper()]
    return [w for w in clean(found) if w not in _NOT_NAMES]


# ---- lip shapes ----
# Letters -> visemes. Consonants that look the same on the lips share a class; vowels are kept as three
# coarse classes (open / spread / rounded) and are cheap to swap, because they're the hardest to read.
# "th" counts as t (as in most South Asian names), "h" is invisible.
_DIGRAPHS = [("tch", "C"), ("sch", "SK"), ("ph", "F"), ("th", "T"), ("sh", "C"), ("ch", "C"), ("ck", "K"),
             ("qu", "KW"), ("wh", "W"), ("kn", "T"), ("gh", ""), ("wr", "R"), ("ng", "K"), ("au", "o"),
             ("aw", "o"), ("ou", "o"), ("oo", "o"), ("ee", "e"), ("ea", "e"), ("ie", "e"), ("ei", "e"),
             ("ai", "e"), ("ay", "e"), ("ey", "e")]
_LETTERS = {"p": "P", "b": "P", "m": "P", "f": "F", "v": "F", "t": "T", "d": "T", "n": "T", "l": "T",
            "s": "S", "z": "S", "x": "KS", "c": "K", "k": "K", "g": "K", "q": "K", "j": "C", "r": "R",
            "w": "W", "h": "", "a": "a", "e": "e", "i": "e", "y": "e", "o": "o", "u": "o"}
VOWELS = set("aeo")


def visemes(word: str) -> str:
    """'sarvajith' -> 'SaRFaCeT', one char per viseme, repeats collapsed."""
    w = re.sub(r"[^a-z]", "", word.lower())
    w = re.sub(r"c(?=[eiy])", "s", w)  # soft c
    w = re.sub(r"(?<=[^aeiou])e$", "", w) if len(w) > 3 else w  # silent final e ("claude", "nate")
    w = re.sub(r"[aeiou]r$", "a", w)  # final "er"/"ar" is a vowel on the lips ("server" ~ "sarva")
    out, i = [], 0
    while i < len(w):
        for dg, v in _DIGRAPHS:
            if w.startswith(dg, i):
                out.append(v)
                i += len(dg)
                break
        else:
            out.append(_LETTERS.get(w[i], ""))
            i += 1
    s = "".join(out)
    return re.sub(r"(.)\1+", r"\1", s)


def _cost(a: str, b: str) -> float:
    if a == b:
        return 0.0
    return 0.3 if a in VOWELS and b in VOWELS else 1.0


def _indel(a: str) -> float:
    return 0.4 if a in VOWELS else 1.0


def viseme_distance(a: str, b: str) -> float:
    """Weighted edit distance between two viseme strings (vowel swaps/drops are cheap)."""
    prev = [0.0]
    for ch in b:
        prev.append(prev[-1] + _indel(ch))
    for ca in a:
        cur = [prev[0] + _indel(ca)]
        for j, cb in enumerate(b):
            cur.append(min(prev[j] + _cost(ca, cb), prev[j + 1] + _indel(ca), cur[j] + _indel(cb)))
        prev = cur
    return prev[-1]


def _consonants(s: str) -> str:
    return "".join(c for c in s if c not in VOWELS)


def _edits(a: str, b: str) -> int:
    """Plain edit distance."""
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j - 1] + (ca != cb), prev[j] + 1, cur[j - 1] + 1))
        prev = cur
    return prev[-1]


def looks_like(span: str, name: str) -> float | None:
    """Normalized viseme distance if `span` could be `name` on the lips, else None. Consonant shapes must match
    (one slip allowed for names with 4+ consonant shapes); vowels are cheap to differ."""
    a, b = visemes(span.replace(" ", "")), visemes(name.replace(" ", ""))
    if len(b) < 3:
        return None
    cb = _consonants(b)
    if _edits(_consonants(a), cb) > (1 if len(cb) >= 4 else 0):
        return None
    d = viseme_distance(a, b) / len(b)
    return d if d <= MATCH_THRESHOLD else None


def add_name_variants(nbest: list[tuple[str, float, int]], vocab: list[str],
                      nbest_size: int) -> list[tuple[str, float, int]]:
    """Find the span (1-3 words) in the top SOURCE_TOP guesses that looks most like a listed name on the lips;
    if close enough, add that guess with the span replaced by the name, ranked just below its source.
    Returns the merged list, best first, distinct texts, at most nbest_size, at most MAX_VARIANTS added.
    Names already present in some candidate are skipped."""
    if not vocab or not nbest:
        return nbest
    texts = {t for t, _, _ in nbest}
    found: dict[str, tuple[float, str, float, int]] = {}  # new text -> (distance, text, score, n_tokens)
    for name in vocab:
        if any(f" {name} " in f" {t} " for t in texts):
            continue
        for text, score, n_tok in nbest[:SOURCE_TOP]:
            words = text.split()
            best = None
            for n in (1, 2, 3):
                for i in range(len(words) - n + 1):
                    d = looks_like(" ".join(words[i:i + n]), name)
                    if d is not None and (best is None or d < best[0]):
                        best = (d, " ".join(words[:i] + name.split() + words[i + n:]))
            if best and best[1] not in texts:
                d, new = best
                cand = (d, new, score - SWAP_COST - DIST_COST * d, n_tok)
                if new not in found or cand[2] > found[new][2]:
                    found[new] = cand
                break  # the highest-ranked guess that contains a look-alike wins for this name
    variants = sorted(found.values(), key=lambda v: (v[0], -v[2]))[:MAX_VARIANTS]  # closest look-alike first
    merged = sorted(nbest + [(t, s, n) for _, t, s, n in variants], key=lambda c: c[1], reverse=True)
    # keep every original that fits; variants take the lowest slots if the list is full
    if len(merged) > nbest_size:
        keep = set(t for t, _, _ in nbest[:nbest_size - len(variants)]) | {v[1] for v in variants}
        merged = [c for c in merged if c[0] in keep][:nbest_size]
    return merged


# ---- personal enrollment prompts ----
# A few enrollment sentences built from the user's own name and vocabulary, so the adapter sees how they mouth
# those words, and the held-out ones measure whether the names come out right. Placed among the first 30
# prompts (the training minimum), and kept to 5 of 60+: more and the adapter memorizes a few sentences.
PERSONAL_SLOTS = (1, 6, 11, 16, 21)  # positions in the prompt list
PERSONAL_PREFIX = "p_"
TEMPLATES = ("can we talk about {w} later", "did you get my message about {w}", "i just heard back about {w}",
             "let me check on {w} and get back to you", "{w} is on my list for today")


def own_name(user_id: str | None) -> str | None:
    """The profile id, if it looks like a name ("Rahul"), lowercase."""
    name = (user_id or "").split("~")[0].strip().lower()  # a storage id is "<name>~<key hash>" (identity.py)
    return name if re.fullmatch(r"[a-z][a-z' -]{1,39}", name) else None


def personal_sentences(user_id: str | None, vocab: list[str], practice: list[str] | None = None) -> list[dict]:
    """[{id, sentence}]: "hi my name is <you>" if the profile id is a name, the practice sentences the user
    approved, then one sentence per vocabulary word, up to len(PERSONAL_SLOTS). Ids hash the text, so editing
    the vocabulary makes new prompts and leaves the clips already recorded valid."""
    me = own_name(user_id)
    sentences = [f"hi my name is {me}"] if me else []
    sentences += [s for s in clean_sentences(practice) if s not in sentences][:len(PERSONAL_SLOTS) - len(sentences)]
    words = [w for w in clean(vocab) if w != me]
    for i, w in enumerate(words[:len(PERSONAL_SLOTS) - len(sentences)]):
        sentences.append(TEMPLATES[i % len(TEMPLATES)].format(w=w))
    return [{"id": PERSONAL_PREFIX + hashlib.sha1(t.encode()).hexdigest()[:8], "sentence": t} for t in sentences]


def with_personal(prompts: list[dict], personal: list[dict]) -> list[dict]:
    """The prompt list with the personal sentences at PERSONAL_SLOTS (all within the first 30)."""
    out = list(prompts)
    for slot, p in zip(PERSONAL_SLOTS, personal):
        out.insert(min(slot, len(out)), p)
    return out


def words_in(text: str, vocab: list[str]) -> list[str]:
    """The vocabulary words that occur in text (whole words, case-insensitive)."""
    t = " " + " ".join(re.sub(r"[^a-z' ]+", " ", text.lower()).split()) + " "
    return [w for w in vocab if f" {w} " in t]

