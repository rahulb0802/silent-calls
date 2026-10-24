# lora_cv5_feasibility_r8_attn_ffn_s300_lr0.0005/sarvajith_fold3

sarvajith · source `feasibility` · 24 train / 0 val / 6 test clips · rank 8, alpha 16, targets linear_q+linear_k+linear_v+linear_out+w_1+w_2 · 300 steps (best 300), lr 0.0005, batch 8 · 2,064,384 trainable params · 0.273 s/step, 82 s training on cuda:1

| test set | top-1 WER | exact@1 | exact@5 | exact@10 | oracle WER@10 |
|---|---|---|---|---|---|
| held-out, before | 31% | 50% | 67% | 83% | 12% |
| held-out, after | 28% | 67% | 67% | 67% | 22% |

| sentence | before | after |
|---|---|---|
| it was about forty dollars | it was about forty dollars | it was about forty dollars |
| where should I park | why don't you get married | why don't you get married |
| please call me back later | please call me back later | please call me back later |
| could you say that again | you say that again | could you say that again |
| that sounds like a great idea | that sounds like a great idea | that sounds like a great idea |
| thanks so much talk to you soon | thanks so much doctor | thanks so much |
