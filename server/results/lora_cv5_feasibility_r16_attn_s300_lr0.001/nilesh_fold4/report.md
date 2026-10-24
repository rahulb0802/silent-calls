# lora_cv5_feasibility_r16_attn_s300_lr0.001/nilesh_fold4

nilesh · source `feasibility` · 24 train / 0 val / 6 test clips · rank 16, alpha 32.0, targets linear_q+linear_k+linear_v+linear_out · 300 steps (best 300), lr 0.001, batch 8 · 1,179,648 trainable params · 0.322 s/step, 97 s training on cuda:1

| test set | top-1 WER | exact@1 | exact@5 | exact@10 | oracle WER@10 |
|---|---|---|---|---|---|
| held-out, before | 45% | 17% | 33% | 33% | 32% |
| held-out, after | 47% | 17% | 17% | 33% | 34% |

| sentence | before | after |
|---|---|---|
| hi sorry I'm in the library right now | i'm in the library right now | i'm in the library right now |
| my number is the same as before | my number is the same as before | my number is the same as before |
| did you get my email | you get my email | can you get my email |
| how did the interview go | how can you never know | how can i leave you here |
| I really like the new design | i really like | i really like to do it |
| we need to book the tickets tonight | but it's | and i don't play again today |
