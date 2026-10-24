# lora_curve_train18/sarvajith_fold0

sarvajith · source `feasibility` · 18 train / 0 val / 6 test clips · rank 16, alpha 32, targets linear_q+linear_k+linear_v+linear_out · 100 steps (best 100), lr 0.001, batch 8 · 1,179,648 trainable params · 0.272 s/step, 27 s training on cuda:1

| test set | top-1 WER | exact@1 | exact@5 | exact@10 | oracle WER@10 |
|---|---|---|---|---|---|
| held-out, before | 0% | 100% | 100% | 100% | 0% |
| held-out, after | 3% | 83% | 100% | 100% | 0% |

| sentence | before | after |
|---|---|---|
| hey can you hear me okay | hey can you hear me ok | hey can you hear me going |
| no I haven't heard back yet | no i haven't heard back yet | no i haven't heard back yet |
| I'll be there in ten minutes | i'll be there in ten minutes | i'll be there in ten minutes |
| what time does it start | what time does it start | what time does it start |
| can you speak a little louder | can you speak a little louder | can you speak a little louder |
| I'm running a little late | i'm running a little late | i'm running a little late |
