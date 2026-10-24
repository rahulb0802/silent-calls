# lora_curve_train24/rahul_fold4

rahul · source `feasibility` · 24 train / 0 val / 6 test clips · rank 16, alpha 32, targets linear_q+linear_k+linear_v+linear_out · 100 steps (best 100), lr 0.001, batch 8 · 1,179,648 trainable params · 0.39 s/step, 39 s training on cuda:1

| test set | top-1 WER | exact@1 | exact@5 | exact@10 | oracle WER@10 |
|---|---|---|---|---|---|
| held-out, before | 53% | 17% | 33% | 33% | 45% |
| held-out, after | 26% | 33% | 33% | 50% | 11% |

| sentence | before | after |
|---|---|---|
| hi sorry I'm in the library right now | sorry i'm in the library right now | i'm in the library right now |
| my number is the same as before | i got a pretty good example before i | my number is the same as before |
| did you get my email | can you get my email | can you get my email |
| how did the interview go | how can i feel at home | how can you know |
| I really like the new design | i really like the new design | i really like the new design |
| we need to book the tickets tonight | we need to more than a chance to die | we need to book this yesterday |
