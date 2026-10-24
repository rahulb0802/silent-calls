# lora_curve_train12/rahul_fold1

rahul · source `feasibility` · 12 train / 0 val / 6 test clips · rank 16, alpha 32, targets linear_q+linear_k+linear_v+linear_out · 100 steps (best 100), lr 0.001, batch 8 · 1,179,648 trainable params · 0.357 s/step, 36 s training on cuda:1

| test set | top-1 WER | exact@1 | exact@5 | exact@10 | oracle WER@10 |
|---|---|---|---|---|---|
| held-out, before | 49% | 33% | 50% | 50% | 27% |
| held-out, after | 22% | 50% | 50% | 67% | 8% |

| sentence | before | after |
|---|---|---|
| let's meet tomorrow morning | let's meet tomorrow morning | let's meet tomorrow morning |
| can you send me the link | and do something like | can you send me the link |
| I'm not feeling very well today | i'm not feeling very well to day | i'm not feeling very well today |
| I'll pick up the groceries on the way home | i'll make up groceries on the way home | i'll become groceries on the way home |
| leave the package at the front door | if they buy each other very short | give the money to the front door |
| okay bye see you later | hurt him i see you later | can i see you later |
