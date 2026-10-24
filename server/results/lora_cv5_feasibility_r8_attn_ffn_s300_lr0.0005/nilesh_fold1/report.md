# lora_cv5_feasibility_r8_attn_ffn_s300_lr0.0005/nilesh_fold1

nilesh · source `feasibility` · 24 train / 0 val / 6 test clips · rank 8, alpha 16, targets linear_q+linear_k+linear_v+linear_out+w_1+w_2 · 300 steps (best 300), lr 0.0005, batch 8 · 2,064,384 trainable params · 0.32 s/step, 96 s training on cuda:1

| test set | top-1 WER | exact@1 | exact@5 | exact@10 | oracle WER@10 |
|---|---|---|---|---|---|
| held-out, before | 57% | 17% | 17% | 17% | 46% |
| held-out, after | 73% | 17% | 17% | 17% | 57% |

| sentence | before | after |
|---|---|---|
| let's meet tomorrow morning | tomorrow morning | hi tomorrow morning |
| can you send me the link | or something like | there's something there |
| I'm not feeling very well today | i'm not feeling very well today | i'm not feeling very well today |
| I'll pick up the groceries on the way home | call me up don't stop me | come along me can you start me |
| leave the package at the front door | leave the bags at the front door | i'll have them back inside the front door |
| okay bye see you later | let me ask you again | am i straight |
