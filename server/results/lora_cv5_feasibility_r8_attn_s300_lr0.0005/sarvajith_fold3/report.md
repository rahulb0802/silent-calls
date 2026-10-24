# lora_cv5_feasibility_r8_attn_s300_lr0.0005/sarvajith_fold3

sarvajith · source `feasibility` · 24 train / 0 val / 6 test clips · rank 8, alpha 16, targets linear_q+linear_k+linear_v+linear_out · 300 steps (best 300), lr 0.0005, batch 8 · 589,824 trainable params · 0.262 s/step, 78 s training on cuda:1

| test set | top-1 WER | exact@1 | exact@5 | exact@10 | oracle WER@10 |
|---|---|---|---|---|---|
| held-out, before | 31% | 50% | 67% | 83% | 12% |
| held-out, after | 28% | 67% | 67% | 67% | 25% |

| sentence | before | after |
|---|---|---|
| it was about forty dollars | it was about forty dollars | it was about forty dollars |
| where should I park | why don't you get married | why don't you get married |
| please call me back later | please call me back later | please call me back later |
| could you say that again | you say that again | could you say that again |
| that sounds like a great idea | that sounds like a great idea | that sounds like a great idea |
| thanks so much talk to you soon | thanks so much doctor | thanks so much |
