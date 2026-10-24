# lora_cv5_feasibility_r16_attn_s300_lr0.001/rahul_fold3

rahul · source `feasibility` · 24 train / 0 val / 6 test clips · rank 16, alpha 32.0, targets linear_q+linear_k+linear_v+linear_out · 300 steps (best 300), lr 0.001, batch 8 · 1,179,648 trainable params · 0.367 s/step, 110 s training on cuda:1

| test set | top-1 WER | exact@1 | exact@5 | exact@10 | oracle WER@10 |
|---|---|---|---|---|---|
| held-out, before | 41% | 33% | 50% | 50% | 38% |
| held-out, after | 25% | 33% | 50% | 67% | 16% |

| sentence | before | after |
|---|---|---|
| it was about forty dollars | it was about forty dollars | it was about forty dollars |
| where should I park | where should i be | where should i be |
| please call me back later | he taught me my leader | please call me by letter |
| could you say that again | could you say that again | could you say that again |
| that sounds like a great idea | it sounds like a great idea | it sounds like a great idea |
| thanks so much talk to you soon | so i'm not sure i do so | thanks so much |
