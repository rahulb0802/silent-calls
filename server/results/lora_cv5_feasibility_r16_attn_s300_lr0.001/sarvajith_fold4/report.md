# lora_cv5_feasibility_r16_attn_s300_lr0.001/sarvajith_fold4

sarvajith · source `feasibility` · 24 train / 0 val / 6 test clips · rank 16, alpha 32.0, targets linear_q+linear_k+linear_v+linear_out · 300 steps (best 300), lr 0.001, batch 8 · 1,179,648 trainable params · 0.236 s/step, 71 s training on cuda:1

| test set | top-1 WER | exact@1 | exact@5 | exact@10 | oracle WER@10 |
|---|---|---|---|---|---|
| held-out, before | 13% | 67% | 67% | 67% | 11% |
| held-out, after | 24% | 67% | 67% | 67% | 8% |

| sentence | before | after |
|---|---|---|
| hi sorry I'm in the library right now | i started at the library right now | i'm at the library right now |
| my number is the same as before | my number is the same as before | my number is the same as before |
| did you get my email | did you get my email | did you get my email |
| how did the interview go | how did the interview go | how did the interview go |
| I really like the new design | i really like the new design | i really like the new design |
| we need to book the tickets tonight | we need to book the tickets to day | we did some birthdays today |
