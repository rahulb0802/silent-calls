# lora_curve_train12/nilesh_fold1

nilesh · source `feasibility` · 12 train / 0 val / 6 test clips · rank 16, alpha 32, targets linear_q+linear_k+linear_v+linear_out · 100 steps (best 100), lr 0.001, batch 8 · 1,179,648 trainable params · 0.24 s/step, 24 s training on cuda:1

| test set | top-1 WER | exact@1 | exact@5 | exact@10 | oracle WER@10 |
|---|---|---|---|---|---|
| held-out, before | 57% | 17% | 17% | 17% | 46% |
| held-out, after | 70% | 17% | 17% | 17% | 57% |

| sentence | before | after |
|---|---|---|
| let's meet tomorrow morning | tomorrow morning | tomorrow morning |
| can you send me the link | or something like | something like |
| I'm not feeling very well today | i'm not feeling very well today | i'm not feeling very well today |
| I'll pick up the groceries on the way home | call me up don't stop me | tell me don't stop |
| leave the package at the front door | leave the bags at the front door | leave them back inside the front |
| okay bye see you later | let me ask you again | i'm asked to read it |
