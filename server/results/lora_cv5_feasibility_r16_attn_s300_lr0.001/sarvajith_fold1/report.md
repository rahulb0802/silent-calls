# lora_cv5_feasibility_r16_attn_s300_lr0.001/sarvajith_fold1

sarvajith · source `feasibility` · 24 train / 0 val / 6 test clips · rank 16, alpha 32.0, targets linear_q+linear_k+linear_v+linear_out · 300 steps (best 300), lr 0.001, batch 8 · 1,179,648 trainable params · 0.259 s/step, 78 s training on cuda:1

| test set | top-1 WER | exact@1 | exact@5 | exact@10 | oracle WER@10 |
|---|---|---|---|---|---|
| held-out, before | 16% | 33% | 50% | 67% | 8% |
| held-out, after | 5% | 67% | 67% | 100% | 0% |

| sentence | before | after |
|---|---|---|
| let's meet tomorrow morning | let's meet tomorrow morning | let's meet tomorrow morning |
| can you send me the link | can you tell me that like | can you send me the link |
| I'm not feeling very well today | i'm not feeling very well to day | i'm not feeling very well today |
| I'll pick up the groceries on the way home | i'll pick up the groceries on my way home | i'll pick up the groceries on my way home |
| leave the package at the front door | leave the package on the front door | leave the package at the front door |
| okay bye see you later | okay but see you later | okay buy see you later |
