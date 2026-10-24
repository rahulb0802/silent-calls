# lora_cv5_final_r16_s100_lm0.2/nilesh_fold1

nilesh · source `feasibility` · 24 train / 0 val / 6 test clips · rank 16, alpha 32, targets linear_q+linear_k+linear_v+linear_out · 100 steps (best 100), lr 0.001, batch 8 · 1,179,648 trainable params · 0.31 s/step, 31 s training on cuda:1

| test set | top-1 WER | exact@1 | exact@5 | exact@10 | oracle WER@10 |
|---|---|---|---|---|---|
| held-out, before | 57% | 17% | 17% | 17% | 46% |
| held-out, after | 59% | 17% | 17% | 17% | 59% |

| sentence | before | after |
|---|---|---|
| let's meet tomorrow morning | tomorrow morning | tomorrow morning |
| can you send me the link | or something like | or something like that |
| I'm not feeling very well today | i'm not feeling very well today | i'm not feeling very well today |
| I'll pick up the groceries on the way home | call me up don't stop me | don't stop in the rain |
| leave the package at the front door | leave the bags at the front door | leave the bag inside the front door |
| okay bye see you later | let me ask you again | okay my screen |
