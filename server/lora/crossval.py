"""K-fold cross-validation of per-user LoRA: every sentence is scored by an adapter that never saw it.

    python -m server.lora.crossval --users rahul nilesh sarvajith --source feasibility --steps 300 \
        --eval-steps 50,100,200,300

Takes server.lora.train's flags. Writes server/results/<tag>/{crossval.md, crossval.json}: before/after
pooled over all folds (and at each --eval-steps checkpoint), per user, plus every sentence's before/after.
"""

import argparse
import json
import logging

from ..lipread.metrics import summarize
from ..lipread.model import DecodeConfig, load
from ..lipread.paths import RESULTS_DIR
from . import train as T

log = logging.getLogger("lora")
COLS = ("top1_wer", "exact@1", "exact@5", "exact@10", "oracle_wer@10", "within1@5")


def main() -> None:
    p = T.build_parser("python -m server.lora.crossval")
    p.add_argument("--users", nargs="+", required=True)
    p.add_argument("--cross-user", action="store_true",
                   help="control: also score each adapter on the other users' held-out clips")
    args = p.parse_args()
    logging.basicConfig(level=logging.WARNING, format="%(asctime)s %(name)s %(message)s")
    log.setLevel(logging.INFO)

    tag = args.tag or f"lora_cv{args.folds}_{args.source}_r{args.r}_{args.targets}_s{args.steps}_lr{args.lr}"
    avsr = load(DecodeConfig(beam=args.beam), args.device)
    out: dict = {"config": {k: v for k, v in vars(args).items() if k not in ("user", "fold", "save", "tag")},
                 "users": {}}
    pooled: dict[str, list] = {}
    cross: dict[str, list] = {}
    sentences = []
    for user in args.users:
        per: dict[str, list] = {}
        for fold in range(args.folds):
            a = argparse.Namespace(**{**vars(args), "user": user, "fold": fold, "save": False,
                                      "tag": f"{tag}/{user}_fold{fold}"})
            r = T.train(a, avsr)
            stages = {"before": r["before_rows"],
                      **{f"step {k}": v["rows"] for k, v in r["checkpoints"].items()},
                      "after": r["after_rows"]}
            if args.cross_user:
                # control: the same adapter on the OTHER users' clips of the same held-out sentences.
                # If it helps them as much as its owner, it learned the task/setup, not the person.
                key = T.lora.adapter_key(user)
                for other in args.users:
                    if other == user:
                        continue
                    _, test_o = T.split(T.load_feasibility(other), args.test_frac, args.seed, fold, args.folds)
                    T.lora.set_active(avsr.model, None)
                    _, rb = T.evaluate(avsr, test_o)
                    T.lora.set_active(avsr.model, key)
                    _, ra = T.evaluate(avsr, test_o)
                    cross.setdefault("other user, base model", []).extend(rb)
                    cross.setdefault("other user, this user's adapter", []).extend(ra)
            for name, rows in stages.items():
                per.setdefault(name, []).extend(rows)
                pooled.setdefault(name, []).extend(rows)
            for b, a_ in zip(r["before_rows"], r["after_rows"]):
                sentences.append({"user": user, "fold": fold, "ref": b["ref"], "before": b["top1"],
                                  "after": a_["top1"], "before_rank": b["exact_rank"], "after_rank": a_["exact_rank"]})
        out["users"][user] = {k: summarize(v) for k, v in per.items()}
    out["pooled"] = {k: summarize(v) for k, v in pooled.items()}
    if cross:
        out["pooled"].update({k: summarize(v) for k, v in cross.items()})
    out["sentences"] = sentences

    d = RESULTS_DIR / tag
    d.mkdir(parents=True, exist_ok=True)
    (d / "crossval.json").write_text(json.dumps(out, indent=2))
    md = render(tag, args, out)
    (d / "crossval.md").write_text(md)
    print(md)


def render(tag: str, args, out: dict) -> str:
    head = (f"# {tag}\n\n{args.folds}-fold cross-validation by sentence on `{args.source}` clips · rank {args.r}, "
            f"alpha {args.alpha}, targets {args.targets} · {args.steps} steps, lr {args.lr}, batch {args.batch}\n")
    lines = [head, "| who | stage | clips | " + " | ".join(COLS) + " |", "|" + "---|" * (len(COLS) + 3)]
    for who, stages in [("ALL", out["pooled"])] + [(u, out["users"][u]) for u in args.users]:
        for stage, s in stages.items():
            lines.append(f"| {who} | {stage} | {s['clips']} | " + " | ".join(f"{s[c]:.0%}" for c in COLS) + " |")
    lines += ["", "| user | sentence | before | after |", "|---|---|---|---|"]
    lines += [f"| {s['user']} | {s['ref']} | {s['before']} | {s['after']} |" for s in out["sentences"]]
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    main()
