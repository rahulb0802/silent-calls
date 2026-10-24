# lora_curve_train18/nilesh_fold1

nilesh · source `feasibility` · 18 train / 0 val / 6 test clips · rank 16, alpha 32, targets linear_q+linear_k+linear_v+linear_out · 100 steps (best 100), lr 0.001, batch 8 · 1,179,648 trainable params · 0.333 s/step, 33 s training on cuda:1

| test set | top-1 WER | exact@1 | exact@5 | exact@10 | oracle WER@10 |
|---|---|---|---|---|---|
| held-out, before | 57% | 17% | 17% | 17% | 46% |
| held-out, after | 68% | 17% | 17% | 17% | 59% |

| sentence | before | after |
|---|---|---|
| let's meet tomorrow morning | tomorrow morning | tomorrow morning |
| can you send me the link | or something like | there's something there |
| I'm not feeling very well today | i'm not feeling very well today | i'm not feeling very well today |
| I'll pick up the groceries on the way home | call me up don't stop me | tell me don't start |
| leave the package at the front door | leave the bags at the front door | i'll have the bag inside the front door |
| okay bye see you later | let me ask you again | okay my screen |
