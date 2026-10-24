# lora_curve_train18/nilesh_fold2

nilesh · source `feasibility` · 18 train / 0 val / 6 test clips · rank 16, alpha 32, targets linear_q+linear_k+linear_v+linear_out · 100 steps (best 100), lr 0.001, batch 8 · 1,179,648 trainable params · 0.354 s/step, 35 s training on cuda:1

| test set | top-1 WER | exact@1 | exact@5 | exact@10 | oracle WER@10 |
|---|---|---|---|---|---|
| held-out, before | 68% | 0% | 17% | 17% | 47% |
| held-out, after | 56% | 17% | 50% | 50% | 29% |

| sentence | before | after |
|---|---|---|
| yes that works for me | that's how it works for me | yes that works for me |
| sure go ahead | did you know that | did you know that |
| can we move it to three thirty | removing the green card | removing the green card |
| I just finished my homework | i also finished my week | i also finished my week |
| the doctor said I need to rest | doctor said i can do this | the doctor said i can do this |
| I don't think that's a good plan | that's a good plan | that's a good plan |
