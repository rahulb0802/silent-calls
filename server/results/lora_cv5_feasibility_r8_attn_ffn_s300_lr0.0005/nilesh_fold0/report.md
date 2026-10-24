# lora_cv5_feasibility_r8_attn_ffn_s300_lr0.0005/nilesh_fold0

nilesh · source `feasibility` · 24 train / 0 val / 6 test clips · rank 8, alpha 16, targets linear_q+linear_k+linear_v+linear_out+w_1+w_2 · 300 steps (best 300), lr 0.0005, batch 8 · 2,064,384 trainable params · 0.284 s/step, 85 s training on cuda:1

| test set | top-1 WER | exact@1 | exact@5 | exact@10 | oracle WER@10 |
|---|---|---|---|---|---|
| held-out, before | 71% | 17% | 17% | 17% | 53% |
| held-out, after | 62% | 17% | 17% | 17% | 44% |

| sentence | before | after |
|---|---|---|
| hey can you hear me okay | and then you're going to be ok | i don't know me ok |
| no I haven't heard back yet | no i haven't come in yet | don't ever come back again |
| I'll be there in ten minutes | i'll be there in ten minutes | i'll be there in ten minutes |
| what time does it start | ridiculously tall | what that does is talk |
| can you speak a little louder | on monday and saturday | don't make it louder |
| I'm running a little late | i'm going to look at it | i'm ready to leave |
