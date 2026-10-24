# lora_curve_train18/sarvajith_fold2

sarvajith · source `feasibility` · 18 train / 0 val / 6 test clips · rank 16, alpha 32, targets linear_q+linear_k+linear_v+linear_out · 100 steps (best 100), lr 0.001, batch 8 · 1,179,648 trainable params · 0.256 s/step, 26 s training on cuda:1

| test set | top-1 WER | exact@1 | exact@5 | exact@10 | oracle WER@10 |
|---|---|---|---|---|---|
| held-out, before | 15% | 33% | 67% | 100% | 0% |
| held-out, after | 9% | 67% | 100% | 100% | 0% |

| sentence | before | after |
|---|---|---|
| yes that works for me | yes that was me | yes that was me |
| sure go ahead | go ahead | just go ahead |
| can we move it to three thirty | can we move it to thirty | can we move it to three thirty |
| I just finished my homework | i just finished my homework | i just finished my homework |
| the doctor said I need to rest | the doctor said i need rest | the doctor said i need to rest |
| I don't think that's a good plan | i don't think that's a good plan | i don't think that's a good plan |
