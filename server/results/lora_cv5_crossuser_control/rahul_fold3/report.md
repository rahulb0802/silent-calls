# lora_cv5_crossuser_control/rahul_fold3

rahul · source `feasibility` · 24 train / 0 val / 6 test clips · rank 8, alpha 16, targets linear_q+linear_k+linear_v+linear_out · 300 steps (best 300), lr 0.0005, batch 8 · 589,824 trainable params · 0.326 s/step, 98 s training on cuda:1

| test set | top-1 WER | exact@1 | exact@5 | exact@10 | oracle WER@10 |
|---|---|---|---|---|---|
| held-out, before | 41% | 33% | 50% | 50% | 38% |
| held-out, after | 19% | 50% | 83% | 83% | 6% |

| sentence | before | after |
|---|---|---|
| it was about forty dollars | it was about forty dollars | it was about forty dollars |
| where should I park | where should i be | where should i party |
| please call me back later | he taught me my leader | please call me back later |
| could you say that again | could you say that again | could you say that again |
| that sounds like a great idea | it sounds like a great idea | it sounds like a great idea |
| thanks so much talk to you soon | so i'm not sure i do so | thanks so much |
