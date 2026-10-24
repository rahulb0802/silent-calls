# lora_cv5_crossuser_control/sarvajith_fold4

sarvajith · source `feasibility` · 24 train / 0 val / 6 test clips · rank 8, alpha 16, targets linear_q+linear_k+linear_v+linear_out · 300 steps (best 300), lr 0.0005, batch 8 · 589,824 trainable params · 0.197 s/step, 59 s training on cuda:1

| test set | top-1 WER | exact@1 | exact@5 | exact@10 | oracle WER@10 |
|---|---|---|---|---|---|
| held-out, before | 13% | 67% | 67% | 67% | 11% |
| held-out, after | 16% | 67% | 67% | 67% | 5% |

| sentence | before | after |
|---|---|---|
| hi sorry I'm in the library right now | i started at the library right now | i'm at the library right now |
| my number is the same as before | my number is the same as before | my number is the same as before |
| did you get my email | did you get my email | did you get my email |
| how did the interview go | how did the interview go | how did the interview go |
| I really like the new design | i really like the new design | i really like the new design |
| we need to book the tickets tonight | we need to book the tickets to day | we need to bring the test to day |
