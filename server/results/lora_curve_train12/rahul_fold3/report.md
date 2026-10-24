# lora_curve_train12/rahul_fold3

rahul · source `feasibility` · 12 train / 0 val / 6 test clips · rank 16, alpha 32, targets linear_q+linear_k+linear_v+linear_out · 100 steps (best 100), lr 0.001, batch 8 · 1,179,648 trainable params · 0.35 s/step, 35 s training on cuda:1

| test set | top-1 WER | exact@1 | exact@5 | exact@10 | oracle WER@10 |
|---|---|---|---|---|---|
| held-out, before | 34% | 33% | 50% | 67% | 25% |
| held-out, after | 41% | 33% | 50% | 50% | 34% |

| sentence | before | after |
|---|---|---|
| it was about forty dollars | it was about forty dollars | it was about forty dollars |
| where should I park | where should i party | rush at a party |
| please call me back later | he taught me my leader | start me by little |
| could you say that again | could you say that again | could you say that again |
| that sounds like a great idea | it sounds like a great idea | it sounds like a great idea |
| thanks so much talk to you soon | so much on tuesday | not so much not too soon |
