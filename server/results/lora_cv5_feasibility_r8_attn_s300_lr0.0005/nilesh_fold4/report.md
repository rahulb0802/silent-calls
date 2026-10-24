# lora_cv5_feasibility_r8_attn_s300_lr0.0005/nilesh_fold4

nilesh · source `feasibility` · 24 train / 0 val / 6 test clips · rank 8, alpha 16, targets linear_q+linear_k+linear_v+linear_out · 300 steps (best 300), lr 0.0005, batch 8 · 589,824 trainable params · 0.34 s/step, 102 s training on cuda:1

| test set | top-1 WER | exact@1 | exact@5 | exact@10 | oracle WER@10 |
|---|---|---|---|---|---|
| held-out, before | 45% | 17% | 33% | 33% | 32% |
| held-out, after | 39% | 17% | 17% | 33% | 29% |

| sentence | before | after |
|---|---|---|
| hi sorry I'm in the library right now | i'm in the library right now | i'm in the library right now |
| my number is the same as before | my number is the same as before | my number is the same as before |
| did you get my email | you get my email | you get my email |
| how did the interview go | how can you never know | how did that ever go |
| I really like the new design | i really like | i really like this |
| we need to book the tickets tonight | but it's | but i don't mind |
