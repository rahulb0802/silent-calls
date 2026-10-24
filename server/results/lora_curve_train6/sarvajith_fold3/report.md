# lora_curve_train6/sarvajith_fold3

sarvajith · source `feasibility` · 6 train / 0 val / 6 test clips · rank 16, alpha 32, targets linear_q+linear_k+linear_v+linear_out · 100 steps (best 100), lr 0.001, batch 8 · 1,179,648 trainable params · 0.213 s/step, 21 s training on cuda:1

| test set | top-1 WER | exact@1 | exact@5 | exact@10 | oracle WER@10 |
|---|---|---|---|---|---|
| held-out, before | 31% | 50% | 67% | 83% | 12% |
| held-out, after | 34% | 67% | 67% | 67% | 25% |

| sentence | before | after |
|---|---|---|
| it was about forty dollars | it was about forty dollars | it was about forty dollars |
| where should I park | why don't you get married | watching a party |
| please call me back later | please call me back later | please call me back later |
| could you say that again | you say that again | could you say that again |
| that sounds like a great idea | that sounds like a great idea | that sounds like a great idea |
| thanks so much talk to you soon | thanks so much doctor | that's a bunch of doctors |
