# lora_curve_train24/nilesh_fold0

nilesh · source `feasibility` · 24 train / 0 val / 6 test clips · rank 16, alpha 32, targets linear_q+linear_k+linear_v+linear_out · 100 steps (best 100), lr 0.001, batch 8 · 1,179,648 trainable params · 0.288 s/step, 29 s training on cuda:1

| test set | top-1 WER | exact@1 | exact@5 | exact@10 | oracle WER@10 |
|---|---|---|---|---|---|
| held-out, before | 71% | 17% | 17% | 17% | 50% |
| held-out, after | 59% | 17% | 17% | 17% | 50% |

| sentence | before | after |
|---|---|---|
| hey can you hear me okay | and then you're going to be ok | you're going to be ok |
| no I haven't heard back yet | no i haven't come in yet | no i haven't heard my name |
| I'll be there in ten minutes | i'll be there in ten minutes | i'll be there in ten minutes |
| what time does it start | ridiculously tall | what that does is |
| can you speak a little louder | on monday | you might get down |
| I'm running a little late | i'm going to look at it | i'm going to look at that |
