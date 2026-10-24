# lora_curve_train18/rahul_fold2

rahul · source `feasibility` · 18 train / 0 val / 6 test clips · rank 16, alpha 32, targets linear_q+linear_k+linear_v+linear_out · 100 steps (best 100), lr 0.001, batch 8 · 1,179,648 trainable params · 0.379 s/step, 38 s training on cuda:1

| test set | top-1 WER | exact@1 | exact@5 | exact@10 | oracle WER@10 |
|---|---|---|---|---|---|
| held-out, before | 44% | 17% | 33% | 50% | 21% |
| held-out, after | 29% | 33% | 67% | 67% | 9% |

| sentence | before | after |
|---|---|---|
| yes that works for me | it's not one for me | it's not worked for me |
| sure go ahead | sure go ahead | sure all right |
| can we move it to three thirty | and we move into three thirty | and we move into three thirty |
| I just finished my homework | i try to finish my homework | i just finished my homework |
| the doctor said I need to rest | and understand i need to rest | the doctor said i need to rest |
| I don't think that's a good plan | i know that that's a grand plan | i don't think that's a great play |
