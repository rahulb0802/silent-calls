# lora_curve_train6/nilesh_fold0

nilesh · source `feasibility` · 6 train / 0 val / 6 test clips · rank 16, alpha 32, targets linear_q+linear_k+linear_v+linear_out · 100 steps (best 100), lr 0.001, batch 8 · 1,179,648 trainable params · 0.213 s/step, 21 s training on cuda:1

| test set | top-1 WER | exact@1 | exact@5 | exact@10 | oracle WER@10 |
|---|---|---|---|---|---|
| held-out, before | 71% | 17% | 17% | 17% | 50% |
| held-out, after | 74% | 17% | 17% | 17% | 56% |

| sentence | before | after |
|---|---|---|
| hey can you hear me okay | and then you're going to be ok | i know you're being ok |
| no I haven't heard back yet | no i haven't come in yet | don't ever come back again |
| I'll be there in ten minutes | i'll be there in ten minutes | i'll be there in ten minutes |
| what time does it start | ridiculously tall | ridiculously strong |
| can you speak a little louder | on monday | don't miss it now |
| I'm running a little late | i'm going to look at it | i'm ready to say |
