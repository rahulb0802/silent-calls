# lora_cv5_feasibility_r8_attn_ffn_s300_lr0.0005/rahul_fold1

rahul · source `feasibility` · 24 train / 0 val / 6 test clips · rank 8, alpha 16, targets linear_q+linear_k+linear_v+linear_out+w_1+w_2 · 300 steps (best 300), lr 0.0005, batch 8 · 2,064,384 trainable params · 0.412 s/step, 124 s training on cuda:1

| test set | top-1 WER | exact@1 | exact@5 | exact@10 | oracle WER@10 |
|---|---|---|---|---|---|
| held-out, before | 41% | 33% | 50% | 50% | 27% |
| held-out, after | 22% | 33% | 83% | 83% | 3% |

| sentence | before | after |
|---|---|---|
| let's meet tomorrow morning | let's meet tomorrow morning | let's meet tomorrow morning |
| can you send me the link | can you tell me that | can you send me a letter |
| I'm not feeling very well today | i'm not feeling very well to day | i'm not feeling very well today |
| I'll pick up the groceries on the way home | i'll make up groceries on the way home | i'll become groceries on the way home |
| leave the package at the front door | if they buy each other very short | give the package to the front door |
| okay bye see you later | hurry up i see you later | okay i'll see you later |
