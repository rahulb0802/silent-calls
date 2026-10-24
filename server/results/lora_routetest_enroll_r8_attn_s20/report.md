# lora_routetest_enroll_r8_attn_s20

routetest · source `enroll` · 8 train / 0 val / 2 test clips · rank 8, alpha 16, targets linear_q+linear_k+linear_v+linear_out · 20 steps (best 20), lr 0.0005, batch 8 · 589,824 trainable params · 0.467 s/step, 9 s training on cuda:1

| test set | top-1 WER | exact@1 | exact@5 | exact@10 | oracle WER@10 |
|---|---|---|---|---|---|
| held-out, before | 64% | 50% | 50% | 50% | 45% |
| held-out, after | 64% | 50% | 50% | 50% | 45% |

| sentence | before | after |
|---|---|---|
| let's meet tomorrow morning | let's meet tomorrow morning | let's meet tomorrow morning |
| my number is the same as before | i got a pretty good example before i | i got a pretty good example before i |
