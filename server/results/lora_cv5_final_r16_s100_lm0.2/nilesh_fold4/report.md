# lora_cv5_final_r16_s100_lm0.2/nilesh_fold4

nilesh · source `feasibility` · 24 train / 0 val / 6 test clips · rank 16, alpha 32, targets linear_q+linear_k+linear_v+linear_out · 100 steps (best 100), lr 0.001, batch 8 · 1,179,648 trainable params · 0.339 s/step, 34 s training on cuda:1

| test set | top-1 WER | exact@1 | exact@5 | exact@10 | oracle WER@10 |
|---|---|---|---|---|---|
| held-out, before | 53% | 17% | 33% | 33% | 32% |
| held-out, after | 55% | 0% | 33% | 33% | 29% |

| sentence | before | after |
|---|---|---|
| hi sorry I'm in the library right now | it's already come in the library right now | i'm in the library right now |
| my number is the same as before | my number is the same as before | bottom braces i passed before |
| did you get my email | you get my email | you get my email |
| how did the interview go | i'm going to let everyone know | how did that ever go |
| I really like the new design | i really like to use | i really like |
| we need to book the tickets tonight | another building is that | but i don't |
