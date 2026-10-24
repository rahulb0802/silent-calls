# lora_cv5_crossuser_control/rahul_fold1

rahul · source `feasibility` · 24 train / 0 val / 6 test clips · rank 8, alpha 16, targets linear_q+linear_k+linear_v+linear_out · 300 steps (best 300), lr 0.0005, batch 8 · 589,824 trainable params · 0.331 s/step, 99 s training on cuda:1

| test set | top-1 WER | exact@1 | exact@5 | exact@10 | oracle WER@10 |
|---|---|---|---|---|---|
| held-out, before | 41% | 33% | 50% | 50% | 27% |
| held-out, after | 14% | 50% | 83% | 83% | 3% |

| sentence | before | after |
|---|---|---|
| let's meet tomorrow morning | let's meet tomorrow morning | let's meet tomorrow morning |
| can you send me the link | can you tell me that | can you send me the link |
| I'm not feeling very well today | i'm not feeling very well to day | i'm not feeling very well today |
| I'll pick up the groceries on the way home | i'll make up groceries on the way home | i'll become groceries on the way home |
| leave the package at the front door | if they buy each other very short | leave the package in the front door |
| okay bye see you later | hurry up i see you later | okay i'll see you later |
