# lora_cv5_feasibility_r16_attn_s300_lr0.001/nilesh_fold0

nilesh · source `feasibility` · 24 train / 0 val / 6 test clips · rank 16, alpha 32.0, targets linear_q+linear_k+linear_v+linear_out · 300 steps (best 300), lr 0.001, batch 8 · 1,179,648 trainable params · 0.26 s/step, 78 s training on cuda:1

| test set | top-1 WER | exact@1 | exact@5 | exact@10 | oracle WER@10 |
|---|---|---|---|---|---|
| held-out, before | 71% | 17% | 17% | 17% | 53% |
| held-out, after | 68% | 17% | 17% | 17% | 56% |

| sentence | before | after |
|---|---|---|
| hey can you hear me okay | and then you're going to be ok | can you tell me |
| no I haven't heard back yet | no i haven't come in yet | okay i've got my name |
| I'll be there in ten minutes | i'll be there in ten minutes | i'll be there in ten minutes |
| what time does it start | ridiculously tall | we take this song |
| can you speak a little louder | on monday and saturday | you must get down |
| I'm running a little late | i'm going to look at it | i'm ready to leave |
