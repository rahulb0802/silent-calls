# lora_cv5_feasibility_r16_attn_s300_lr0.001/rahul_fold4

rahul · source `feasibility` · 24 train / 0 val / 6 test clips · rank 16, alpha 32.0, targets linear_q+linear_k+linear_v+linear_out · 300 steps (best 300), lr 0.001, batch 8 · 1,179,648 trainable params · 0.364 s/step, 109 s training on cuda:1

| test set | top-1 WER | exact@1 | exact@5 | exact@10 | oracle WER@10 |
|---|---|---|---|---|---|
| held-out, before | 58% | 17% | 33% | 33% | 45% |
| held-out, after | 29% | 33% | 33% | 50% | 13% |

| sentence | before | after |
|---|---|---|
| hi sorry I'm in the library right now | i'm in the library right now | i'm at the library right now |
| my number is the same as before | i got a pretty good example before i | my number is the same as before |
| did you get my email | can you get my email | can you get my email |
| how did the interview go | how can i feel at home | how can you know |
| I really like the new design | i really like the new design | i really like the new design |
| we need to book the tickets tonight | we need you more than a chance to die | we need to mark the test today |
