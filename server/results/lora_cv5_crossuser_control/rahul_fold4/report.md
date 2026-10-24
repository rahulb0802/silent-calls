# lora_cv5_crossuser_control/rahul_fold4

rahul · source `feasibility` · 24 train / 0 val / 6 test clips · rank 8, alpha 16, targets linear_q+linear_k+linear_v+linear_out · 300 steps (best 300), lr 0.0005, batch 8 · 589,824 trainable params · 0.319 s/step, 96 s training on cuda:1

| test set | top-1 WER | exact@1 | exact@5 | exact@10 | oracle WER@10 |
|---|---|---|---|---|---|
| held-out, before | 58% | 17% | 33% | 33% | 45% |
| held-out, after | 29% | 33% | 33% | 33% | 21% |

| sentence | before | after |
|---|---|---|
| hi sorry I'm in the library right now | i'm in the library right now | i'm in the library right now |
| my number is the same as before | i got a pretty good example before i | my number is the same as before |
| did you get my email | can you get my email | can you get my email |
| how did the interview go | how can i feel at home | how can you know |
| I really like the new design | i really like the new design | i really like the new design |
| we need to book the tickets tonight | we need you more than a chance to die | we need to mark this yesterday |
