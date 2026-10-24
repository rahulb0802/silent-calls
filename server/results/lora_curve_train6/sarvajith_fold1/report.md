# lora_curve_train6/sarvajith_fold1

sarvajith · source `feasibility` · 6 train / 0 val / 6 test clips · rank 16, alpha 32, targets linear_q+linear_k+linear_v+linear_out · 100 steps (best 100), lr 0.001, batch 8 · 1,179,648 trainable params · 0.242 s/step, 24 s training on cuda:1

| test set | top-1 WER | exact@1 | exact@5 | exact@10 | oracle WER@10 |
|---|---|---|---|---|---|
| held-out, before | 16% | 33% | 50% | 67% | 11% |
| held-out, after | 8% | 50% | 83% | 83% | 3% |

| sentence | before | after |
|---|---|---|
| let's meet tomorrow morning | let's meet tomorrow morning | let's meet tomorrow morning |
| can you send me the link | can you tell me that like | can you send me the link |
| I'm not feeling very well today | i'm not feeling very well to day | i'm not feeling very well to day |
| I'll pick up the groceries on the way home | i'll pick up the groceries on my way home | i'll pick up the groceries on my way home |
| leave the package at the front door | leave the package on the front door | leave the package on the front door |
| okay bye see you later | okay buy see you later | okay buy see you later |
