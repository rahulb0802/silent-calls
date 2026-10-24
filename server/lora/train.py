"""Train a per-user LoRA adapter on the AutoAVSR encoder and report before/after accuracy.

    python -m server.lora.train --user rahul                      # enrollment clips -> adapters/rahul/
    python -m server.lora.train --user rahul --source feasibility # smoke test: the 30 feasibility clips
    python -m server.lora.train --user rahul --test-feasibility   # also score on the 30 feasibility clips

The test sentences are held out by sentence (never trained on). Loss is the checkpoint's own hybrid
objective: 0.1 x CTC + 0.9 x attention (label smoothing 0.1). Only the adapter is trained; the visual
frontend runs without gradients and every BatchNorm stays frozen.
"""

import argparse
import json
import logging
import math
import random
import time
from pathlib import Path

import torch
from torch import nn

from ..lipread.metrics import score, summarize
from ..lipread.model import DecodeConfig, decode, load
from ..lipread.paths import ADAPTER_DIR, RESULTS_DIR, add_vsr_to_path
from . import lora
from .data import Sample, Tokenizer, augment, center, collate, load_enrollment, load_feasibility

add_vsr_to_path()
from espnet.nets.pytorch_backend.nets_utils import make_non_pad_mask  # noqa: E402
from espnet.nets.pytorch_backend.transformer.add_sos_eos import add_sos_eos  # noqa: E402
from espnet.nets.pytorch_backend.transformer.mask import target_mask  # noqa: E402

log = logging.getLogger("lora")
TARGETS = {"attn": lora.DEFAULT_TARGETS, "attn_ffn": lora.DEFAULT_TARGETS + ("w_1", "w_2")}


def freeze_norms(model: nn.Module) -> None:
    for m in model.modules():
        if isinstance(m, nn.modules.batchnorm._BatchNorm):
            m.eval()


def hybrid_loss(model, xs_pad, xlens, ys_pad) -> tuple[torch.Tensor, float, float]:
    """The E2E training objective. The checkpoint's E2E class only ships inference code, so this mirrors
    Encoder.forward with the frontend under no_grad (it has no trainable parameters)."""
    enc = model.encoder
    masks = make_non_pad_mask(xlens).to(xs_pad.device).unsqueeze(-2)  # (B, 1, T)
    with torch.no_grad():
        feats = enc.frontend(xs_pad)  # (B, T, 512); the 3D-conv/ResNet frontend keeps T
    xs = enc.embed(feats)
    xs, hmask = enc.encoders(xs, masks)
    if isinstance(xs, tuple):
        xs = xs[0]
    if enc.normalize_before:
        xs = enc.after_norm(xs)
    loss_ctc = model.ctc(xs, xlens.to(xs.device), ys_pad)
    ys_in, ys_out = add_sos_eos(ys_pad, model.sos, model.eos, model.ignore_id)
    pred, _ = model.decoder(ys_in, target_mask(ys_in, model.ignore_id), xs, hmask)
    loss_att = model.criterion(pred, ys_out)
    a = model.mtlalpha
    return a * loss_ctc + (1 - a) * loss_att, float(loss_ctc), float(loss_att)


def split(samples: list[Sample], test_frac: float, seed: int, fold: int | None = None,
          folds: int = 5) -> tuple[list[Sample], list[Sample]]:
    """Hold out whole sentences. With `fold`, the test set is that fold of a `folds`-way partition."""
    keys = sorted({s.key for s in samples})
    random.Random(seed).shuffle(keys)
    if fold is not None:
        test = set(keys[fold * len(keys) // folds:(fold + 1) * len(keys) // folds])
    else:
        test = set(keys[:max(1, round(len(keys) * test_frac))])
    return [s for s in samples if s.key not in test], [s for s in samples if s.key in test]


def evaluate(avsr, samples: list[Sample]) -> tuple[dict, list[dict]]:
    rows = []
    for s in samples:
        nbest, _ = decode(avsr, s.crop, 10)
        hyps = [c[0] for c in nbest]
        rows.append({"key": s.key, "ref": s.text, "top1": hyps[0] if hyps else "", **score(s.text, hyps)})
    return summarize(rows), rows


@torch.no_grad()
def val_loss(model, tok, samples: list[Sample], batch: int, device: str) -> float:
    model.eval()
    total = 0.0
    for i in range(0, len(samples), batch):
        b = samples[i:i + batch]
        xs, xl, ys = collate([center(s.crop) for s in b], [tok.encode(s.text) for s in b])
        with torch.autocast("cuda", dtype=torch.float16, enabled=device.startswith("cuda")):
            loss, _, _ = hybrid_loss(model, xs.to(device), xl, ys.to(device))
        total += float(loss) * len(b)
    return total / max(1, len(samples))


class Status:
    def __init__(self, user_key: str, enabled: bool):
        self.path = ADAPTER_DIR / user_key / "status.json"
        self.enabled = enabled
        self.d: dict = {"state": "queued", "started": time.time()}

    def update(self, **kw) -> None:
        self.d.update(kw, updated=time.time())
        if self.enabled:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.path.with_suffix(".tmp")
            tmp.write_text(json.dumps(self.d))
            tmp.replace(self.path)


def train(args, avsr=None) -> dict:
    """Train + evaluate one adapter. Pass `avsr` to reuse a loaded model (cross-validation)."""
    t_start = time.time()
    user_key = lora.adapter_key(args.user)
    status = Status(user_key, enabled=args.save)
    status.update(state="loading")
    torch.manual_seed(args.seed)
    rng = random.Random(args.seed)

    samples = load_feasibility(args.user) if args.source == "feasibility" else load_enrollment(user_key)
    if len(samples) < 8:
        status.update(state="failed", error=f"only {len(samples)} clips for {args.user}")
        raise SystemExit(f"only {len(samples)} {args.source} clips for {args.user}")
    train_set, test_set = split(samples, args.test_frac, args.seed, args.fold, args.folds)
    val_set: list[Sample] = []
    if len(train_set) >= 30:  # small validation split from the training sentences, for picking the step
        train_set, val_set = split(train_set, 0.12, args.seed + 1)
    extra_test = load_feasibility(args.user) if args.test_feasibility and args.source != "feasibility" else []

    avsr = avsr or load(DecodeConfig(beam=args.beam), args.device)
    model = avsr.model
    lora.drop(model, user_key)  # a previous fold's adapter
    tok = Tokenizer(avsr.token_list)
    cov = tok.coverage([s.text for s in samples])
    log.info("%d train / %d val / %d test clips, token coverage %.3f", len(train_set), len(val_set), len(test_set), cov)

    status.update(state="evaluating", phase="before", n_train=len(train_set), n_test=len(test_set))
    lora.set_active(model, None)
    before, before_rows = evaluate(avsr, test_set)
    before_x = evaluate(avsr, extra_test)[0] if extra_test else None
    log.info("before: %s", before)

    for p in model.parameters():
        p.requires_grad_(False)
    lora.inject(model, TARGETS[args.targets])
    n_params = lora.add_adapter(model, user_key, r=args.r, alpha=args.alpha, dropout=args.dropout)
    lora.set_active(model, user_key)
    params = lora.adapter_parameters(model, user_key)
    opt = torch.optim.AdamW(params, lr=args.lr, weight_decay=0.01)
    warm = max(1, args.steps // 10)
    sched = torch.optim.lr_scheduler.LambdaLR(
        opt, lambda s: min(1.0, (s + 1) / warm) * 0.5 * (1 + math.cos(math.pi * min(1.0, s / args.steps))))
    use_amp = args.device.startswith("cuda")
    scaler = torch.cuda.amp.GradScaler(enabled=use_amp)

    eval_steps = {int(x) for x in args.eval_steps.split(",")} if args.eval_steps else set()
    checkpoints: dict[int, dict] = {}
    curve, best = [], (float("inf"), None, 0)
    order: list[Sample] = []
    status.update(state="training", step=0, steps=args.steps, trainable_params=n_params)
    t_train = time.time()
    for step in range(1, args.steps + 1):
        model.train()
        freeze_norms(model)
        if len(order) < args.batch:
            order = train_set[:]
            rng.shuffle(order)
        b, order = order[:args.batch], order[args.batch:]
        xs, xl, ys = collate([augment(s.crop, rng) for s in b], [tok.encode(s.text) for s in b])
        with torch.autocast("cuda", dtype=torch.float16, enabled=use_amp):
            loss, l_ctc, l_att = hybrid_loss(model, xs.to(args.device), xl, ys.to(args.device))
        opt.zero_grad(set_to_none=True)
        scaler.scale(loss).backward()
        scaler.unscale_(opt)
        torch.nn.utils.clip_grad_norm_(params, 5.0)
        scaler.step(opt)
        scaler.update()
        sched.step()
        point = {"step": step, "loss": round(float(loss), 4), "ctc": round(l_ctc, 4), "att": round(l_att, 4)}
        if val_set and (step % args.eval_every == 0 or step == args.steps):
            point["val_loss"] = round(val_loss(model, tok, val_set, args.batch, args.device), 4)
            if point["val_loss"] < best[0]:
                best = (point["val_loss"], {k: v.clone() for k, v in lora.state(model, user_key).items()}, step)
        curve.append(point)
        if step in eval_steps:  # accuracy on the held-out sentences at this step (for choosing --steps)
            s_, rows_ = evaluate(avsr, test_set)
            checkpoints[step] = {"test": s_, "rows": rows_,
                                 "feasibility": evaluate(avsr, extra_test)[0] if extra_test else None}
            log.info("step %d held-out: %s", step, s_)
        if step % 10 == 0 or step == 1:
            log.info("step %d %s", step, point)
            status.update(step=step, loss=point["loss"], val_loss=point.get("val_loss"))
    train_s = time.time() - t_train

    if best[1] is not None:  # restore the step with the lowest validation loss
        for path_, m in lora.lora_modules(model).items():
            if f"{path_}.A" in best[1]:
                m.lora_A[user_key].data.copy_(best[1][f"{path_}.A"])
                m.lora_B[user_key].data.copy_(best[1][f"{path_}.B"])
    best_step = best[2] or args.steps

    status.update(state="evaluating", phase="after")
    lora.set_active(model, user_key)
    after, after_rows = evaluate(avsr, test_set)
    after_x = evaluate(avsr, extra_test)[0] if extra_test else None
    log.info("after: %s", after)

    meta = {"user": args.user, "r": args.r, "alpha": args.alpha, "targets": list(TARGETS[args.targets]),
            "source": args.source, "best_step": best_step, "created": time.time()}
    report = {
        "user": args.user, "source": args.source, "n_train": len(train_set), "n_val": len(val_set),
        "n_test": len(test_set), "test_sentences": sorted({s.key for s in test_set}),
        "before_wer": before["top1_wer"], "after_wer": after["top1_wer"],
        "before_top5": before["exact@5"], "after_top5": after["exact@5"],
        "before": before, "after": after,
        "feasibility_before": before_x, "feasibility_after": after_x,
        "per_clip": [{"key": b_["key"], "ref": b_["ref"], "before": b_["top1"], "after": a_["top1"],
                      "before_rank": b_["exact_rank"], "after_rank": a_["exact_rank"]}
                     for b_, a_ in zip(before_rows, after_rows)],
        "config": {**meta, "steps": args.steps, "lr": args.lr, "batch": args.batch, "dropout": args.dropout,
                   "trainable_params": n_params, "token_coverage": round(cov, 4)},
        "train_seconds": round(train_s, 1), "seconds_per_step": round(train_s / args.steps, 3),
        "total_seconds": round(time.time() - t_start, 1), "device": args.device,
        "gpu_mem_peak_gb": round(torch.cuda.max_memory_allocated(args.device) / 2**30, 2) if use_amp else None,
        "curve": curve,
        "before_rows": before_rows, "after_rows": after_rows,
        "checkpoints": {str(k): v for k, v in sorted(checkpoints.items())},
    }
    if args.save:
        out = ADAPTER_DIR / user_key
        lora.save(model, user_key, out / "adapter.pt", meta)
        (out / "report.json").write_text(json.dumps(report, indent=2))
    tag = args.tag or f"lora_{user_key}_{args.source}_r{args.r}_{args.targets}_s{args.steps}"
    rd = RESULTS_DIR / tag
    rd.mkdir(parents=True, exist_ok=True)
    (rd / "report.json").write_text(json.dumps(report, indent=2))
    (rd / "report.md").write_text(render_md(tag, report))
    status.update(state="done", report={k: report[k] for k in
                                        ("before_wer", "after_wer", "before_top5", "after_top5", "n_train", "n_test")})
    print(render_md(tag, report))
    return report


def render_md(tag: str, r: dict) -> str:
    c = r["config"]
    lines = [f"# {tag}", "",
             f"{r['user']} · source `{r['source']}` · {r['n_train']} train / {r['n_val']} val / {r['n_test']} test clips · "
             f"rank {c['r']}, alpha {c['alpha']}, targets {'+'.join(c['targets'])} · {c['steps']} steps "
             f"(best {c['best_step']}), lr {c['lr']}, batch {c['batch']} · {c['trainable_params']:,} trainable params · "
             f"{r['seconds_per_step']} s/step, {r['train_seconds']:.0f} s training on {r['device']}", "",
             "| test set | top-1 WER | exact@1 | exact@5 | exact@10 | oracle WER@10 |", "|---|---|---|---|---|---|"]
    def row(name, s):
        return f"| {name} | {s['top1_wer']:.0%} | {s['exact@1']:.0%} | {s['exact@5']:.0%} | {s['exact@10']:.0%} | {s['oracle_wer@10']:.0%} |"
    lines += [row("held-out, before", r["before"]), row("held-out, after", r["after"])]
    if r.get("feasibility_before"):
        lines += [row("feasibility 30, before", r["feasibility_before"]), row("feasibility 30, after", r["feasibility_after"])]
    lines += ["", "| sentence | before | after |", "|---|---|---|"]
    lines += [f"| {p['ref']} | {p['before']} | {p['after']} |" for p in r["per_clip"]]
    return "\n".join(lines) + "\n"


def build_parser(prog: str = "python -m server.lora.train") -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog=prog)
    p.add_argument("--user", required=prog.endswith("train"))
    p.add_argument("--source", choices=["enroll", "feasibility"], default="enroll")
    p.add_argument("--device", default="cuda:1" if torch.cuda.device_count() > 1 else ("cuda:0" if torch.cuda.is_available() else "cpu"))
    p.add_argument("--r", type=int, default=16)
    p.add_argument("--alpha", type=float, default=32)
    p.add_argument("--dropout", type=float, default=0.05)
    p.add_argument("--targets", choices=list(TARGETS), default="attn")
    p.add_argument("--steps", type=int, default=100)
    p.add_argument("--lr", type=float, default=1e-3)
    p.add_argument("--batch", type=int, default=8)
    p.add_argument("--eval-every", type=int, default=25)
    p.add_argument("--test-frac", type=float, default=0.2)
    p.add_argument("--fold", type=int, help="cross-validation: hold out this fold of the sentences")
    p.add_argument("--folds", type=int, default=5)
    p.add_argument("--eval-steps", help="e.g. 50,100,200: also score the held-out set at these steps")
    p.add_argument("--beam", type=int, default=40)
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--test-feasibility", action="store_true", help="also score on the user's 30 feasibility clips")
    p.add_argument("--save", action=argparse.BooleanOptionalAction, default=None,
                   help="write adapters/<user>/ (default: yes for enrollment, no for feasibility)")
    p.add_argument("--tag")
    return p


def main() -> None:
    args = build_parser().parse_args()
    if args.save is None:
        args.save = args.source == "enroll"
    logging.basicConfig(level=logging.WARNING, format="%(asctime)s %(name)s %(message)s")
    log.setLevel(logging.INFO)
    try:
        train(args)
    except Exception as e:
        Status(lora.adapter_key(args.user), args.save).update(state="failed", error=repr(e))
        raise


if __name__ == "__main__":
    main()
