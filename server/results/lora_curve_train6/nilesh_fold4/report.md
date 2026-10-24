# lora_curve_train6/nilesh_fold4

nilesh · source `feasibility` · 6 train / 0 val / 6 test clips · rank 16, alpha 32, targets linear_q+linear_k+linear_v+linear_out · 100 steps (best 100), lr 0.001, batch 8 · 1,179,648 trainable params · 0.207 s/step, 21 s training on cuda:1

| test set | top-1 WER | exact@1 | exact@5 | exact@10 | oracle WER@10 |
|---|---|---|---|---|---|
| held-out, before | 53% | 17% | 33% | 33% | 32% |
| held-out, after | 61% | 0% | 0% | 17% | 39% |

| sentence | before | after |
|---|---|---|
| hi sorry I'm in the library right now | it's already come in the library right now | i started coming to the library right now |
| my number is the same as before | my number is the same as before | bottom braces up as before |
| did you get my email | you get my email | you write my email |
| how did the interview go | i'm going to let everyone know | how did that ever go |
| I really like the new design | i really like to use | i really like to use |
| we need to book the tickets tonight | another building is that | i don't belong inside |
