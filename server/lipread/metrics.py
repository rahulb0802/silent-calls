"""Scoring shared by the eval and the LoRA report (same definitions as the feasibility test)."""

import re
import statistics

import jiwer

KS = (1, 3, 5, 10)


def norm(s: str) -> str:
    s = s.lower().replace("’", "'")
    s = re.sub(r"[^a-z0-9' ]+", " ", s)
    s = " ".join(s.split())
    # LRS3 spells some words split ("O K", "TO DAY", "E MAIL"); count every spelling as the same word
    s = re.sub(r"\b(o k|ok)\b", "okay", s)
    return re.sub(r"\bto day\b", "today", re.sub(r"\be mail\b", "email", s))


def word_errors(ref: str, hyp: str) -> int:
    if not hyp:
        return len(ref.split())
    o = jiwer.process_words(ref, hyp)
    return o.substitutions + o.deletions + o.insertions


def score(ref: str, hyps: list[str]) -> dict:
    """One clip: top-1 errors, rank of the exact sentence, exact@K, oracle errors@K, within-1-word@K."""
    ref_n = norm(ref)
    hyps_n = [norm(h) for h in hyps]
    n = len(ref_n.split())
    errs = [word_errors(ref_n, h) for h in hyps_n] or [n]
    rank = next((i + 1 for i, h in enumerate(hyps_n) if h == ref_n), None)
    row = {"ref_words": n, "top1_errors": errs[0], "top1_wer": round(errs[0] / n, 3), "exact_rank": rank or ""}
    for k in KS:
        row[f"exact@{k}"] = int(rank is not None and rank <= k)
        row[f"oracle_errors@{k}"] = min(errs[:k])
        row[f"within1@{k}"] = int(min(errs[:k]) <= 1)
    return row


def summarize(rows: list[dict]) -> dict:
    """Aggregate scored rows: WER is pooled over words, exact@K is a fraction of clips."""
    if not rows:
        return {"clips": 0}
    words = sum(r["ref_words"] for r in rows)
    out = {"clips": len(rows), "top1_wer": sum(r["top1_errors"] for r in rows) / words}
    for k in KS:
        out[f"exact@{k}"] = statistics.mean(r[f"exact@{k}"] for r in rows)
    for k in (5, 10):
        out[f"oracle_wer@{k}"] = sum(r[f"oracle_errors@{k}"] for r in rows) / words
    out["within1@5"] = statistics.mean(r["within1@5"] for r in rows)
    return {k: round(v, 4) if isinstance(v, float) else v for k, v in out.items()}
