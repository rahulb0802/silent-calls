# lora_cv5_feasibility_r16_attn_s300_lr0.001/rahul_fold0

rahul · source `feasibility` · 24 train / 0 val / 6 test clips · rank 16, alpha 32.0, targets linear_q+linear_k+linear_v+linear_out · 300 steps (best 300), lr 0.001, batch 8 · 1,179,648 trainable params · 0.34 s/step, 102 s training on cuda:1

| test set | top-1 WER | exact@1 | exact@5 | exact@10 | oracle WER@10 |
|---|---|---|---|---|---|
| held-out, before | 12% | 67% | 100% | 100% | 0% |
| held-out, after | 6% | 83% | 100% | 100% | 0% |

| sentence | before | after |
|---|---|---|
| hey can you hear me okay | hey can you hear me o k | hey can you hear me ok |
| no I haven't heard back yet | no i haven't heard back yet | no i haven't heard about it |
| I'll be there in ten minutes | i'll be there in ten minutes | i'll be there in ten minutes |
| what time does it start | what time is this going | what time does it start |
| can you speak a little louder | can you speak a little louder | can you speak a little louder |
| I'm running a little late | i'm running a little light | i'm running a little late |
