# lora_cv5_feasibility_r8_attn_s300_lr0.0005/sarvajith_fold0

sarvajith · source `feasibility` · 24 train / 0 val / 6 test clips · rank 8, alpha 16, targets linear_q+linear_k+linear_v+linear_out · 300 steps (best 300), lr 0.0005, batch 8 · 589,824 trainable params · 0.266 s/step, 80 s training on cuda:1

| test set | top-1 WER | exact@1 | exact@5 | exact@10 | oracle WER@10 |
|---|---|---|---|---|---|
| held-out, before | 6% | 67% | 100% | 100% | 0% |
| held-out, after | 3% | 83% | 83% | 100% | 0% |

| sentence | before | after |
|---|---|---|
| hey can you hear me okay | can you hear me ok | hey can you hear me going |
| no I haven't heard back yet | no i haven't gone back yet | no i haven't heard back yet |
| I'll be there in ten minutes | i'll be there in ten minutes | i'll be there in ten minutes |
| what time does it start | what time does it start | what time does it start |
| can you speak a little louder | can you speak a little louder | can you speak a little louder |
| I'm running a little late | i'm running a little late | i'm running a little late |
