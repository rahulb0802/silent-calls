# lora_curve_train12/rahul_fold0

rahul · source `feasibility` · 12 train / 0 val / 6 test clips · rank 16, alpha 32, targets linear_q+linear_k+linear_v+linear_out · 100 steps (best 100), lr 0.001, batch 8 · 1,179,648 trainable params · 0.345 s/step, 34 s training on cuda:1

| test set | top-1 WER | exact@1 | exact@5 | exact@10 | oracle WER@10 |
|---|---|---|---|---|---|
| held-out, before | 9% | 83% | 100% | 100% | 0% |
| held-out, after | 21% | 67% | 67% | 67% | 12% |

| sentence | before | after |
|---|---|---|
| hey can you hear me okay | hey can you hear me o k | i didn't hear me o k |
| no I haven't heard back yet | no i haven't heard back yet | no i have a good idea |
| I'll be there in ten minutes | i'll be there in ten minutes | i'll be there in ten minutes |
| what time does it start | what time is this going | what time does it start |
| can you speak a little louder | can you speak a little louder | can you speak a little louder |
| I'm running a little late | i'm running a little late | i'm running a little late |
