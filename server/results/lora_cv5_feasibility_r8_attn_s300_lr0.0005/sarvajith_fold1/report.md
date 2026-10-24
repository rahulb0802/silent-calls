# lora_cv5_feasibility_r8_attn_s300_lr0.0005/sarvajith_fold1

sarvajith · source `feasibility` · 24 train / 0 val / 6 test clips · rank 8, alpha 16, targets linear_q+linear_k+linear_v+linear_out · 300 steps (best 300), lr 0.0005, batch 8 · 589,824 trainable params · 0.276 s/step, 83 s training on cuda:1

| test set | top-1 WER | exact@1 | exact@5 | exact@10 | oracle WER@10 |
|---|---|---|---|---|---|
| held-out, before | 16% | 33% | 50% | 67% | 8% |
| held-out, after | 11% | 33% | 67% | 100% | 0% |

| sentence | before | after |
|---|---|---|
| let's meet tomorrow morning | let's meet tomorrow morning | let's meet tomorrow morning |
| can you send me the link | can you tell me that like | can you send me the letter |
| I'm not feeling very well today | i'm not feeling very well to day | i'm not feeling very well to day |
| I'll pick up the groceries on the way home | i'll pick up the groceries on my way home | i'll pick up the groceries on my way home |
| leave the package at the front door | leave the package on the front door | leave the package on the front door |
| okay bye see you later | okay but see you later | okay i see you later |
