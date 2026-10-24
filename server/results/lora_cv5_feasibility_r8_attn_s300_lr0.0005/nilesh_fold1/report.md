# lora_cv5_feasibility_r8_attn_s300_lr0.0005/nilesh_fold1

nilesh · source `feasibility` · 24 train / 0 val / 6 test clips · rank 8, alpha 16, targets linear_q+linear_k+linear_v+linear_out · 300 steps (best 300), lr 0.0005, batch 8 · 589,824 trainable params · 0.309 s/step, 93 s training on cuda:1

| test set | top-1 WER | exact@1 | exact@5 | exact@10 | oracle WER@10 |
|---|---|---|---|---|---|
| held-out, before | 57% | 17% | 17% | 17% | 46% |
| held-out, after | 70% | 17% | 17% | 17% | 62% |

| sentence | before | after |
|---|---|---|
| let's meet tomorrow morning | tomorrow morning | tomorrow morning |
| can you send me the link | or something like | there's something there |
| I'm not feeling very well today | i'm not feeling very well today | i'm not feeling very well today |
| I'll pick up the groceries on the way home | call me up don't stop me | tell me don't stop |
| leave the package at the front door | leave the bags at the front door | i'll leave it back inside the front door |
| okay bye see you later | let me ask you again | am i straight |
