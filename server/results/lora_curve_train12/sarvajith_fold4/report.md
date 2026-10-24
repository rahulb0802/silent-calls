# lora_curve_train12/sarvajith_fold4

sarvajith · source `feasibility` · 12 train / 0 val / 6 test clips · rank 16, alpha 32, targets linear_q+linear_k+linear_v+linear_out · 100 steps (best 100), lr 0.001, batch 8 · 1,179,648 trainable params · 0.261 s/step, 26 s training on cuda:1

| test set | top-1 WER | exact@1 | exact@5 | exact@10 | oracle WER@10 |
|---|---|---|---|---|---|
| held-out, before | 13% | 67% | 67% | 67% | 11% |
| held-out, after | 13% | 67% | 67% | 67% | 5% |

| sentence | before | after |
|---|---|---|
| hi sorry I'm in the library right now | i started out by the library right now | i started up at the library right now |
| my number is the same as before | my number is the same as before | my number is the same as before |
| did you get my email | did you get my email | did you get my email |
| how did the interview go | how did the interview go | how did the interview go |
| I really like the new design | i really like the new design | i really like the new design |
| we need to book the tickets tonight | we need to book the tickets to day | we need to book the tickets today |
