# lora_cv5_feasibility_r8_attn_s300_lr0.0005/nilesh_fold2

nilesh · source `feasibility` · 24 train / 0 val / 6 test clips · rank 8, alpha 16, targets linear_q+linear_k+linear_v+linear_out · 300 steps (best 300), lr 0.0005, batch 8 · 589,824 trainable params · 0.385 s/step, 116 s training on cuda:1

| test set | top-1 WER | exact@1 | exact@5 | exact@10 | oracle WER@10 |
|---|---|---|---|---|---|
| held-out, before | 68% | 0% | 17% | 17% | 50% |
| held-out, after | 71% | 0% | 33% | 33% | 38% |

| sentence | before | after |
|---|---|---|
| yes that works for me | that's how it works for me | that's how it works for me |
| sure go ahead | did you know that | did you know that |
| can we move it to three thirty | removing the green card | they remove it in the winter |
| I just finished my homework | i also finished my week | i just finished my week |
| the doctor said I need to rest | doctor said i can do this | not to say anything crazy |
| I don't think that's a good plan | that's a good plan | that's a good plan |
