# lora_cv5_crossuser_control/rahul_fold2

rahul · source `feasibility` · 24 train / 0 val / 6 test clips · rank 8, alpha 16, targets linear_q+linear_k+linear_v+linear_out · 300 steps (best 300), lr 0.0005, batch 8 · 589,824 trainable params · 0.328 s/step, 98 s training on cuda:1

| test set | top-1 WER | exact@1 | exact@5 | exact@10 | oracle WER@10 |
|---|---|---|---|---|---|
| held-out, before | 44% | 17% | 50% | 50% | 21% |
| held-out, after | 26% | 33% | 50% | 50% | 15% |

| sentence | before | after |
|---|---|---|
| yes that works for me | it's not one for me | does that work for me |
| sure go ahead | sure go ahead | sure ok |
| can we move it to three thirty | and we move into three thirty | and we move into three thirty |
| I just finished my homework | i try to finish my homework | i just finished my homework |
| the doctor said I need to rest | and understand i need to rest | the doctor said i need to rest |
| I don't think that's a good plan | i know that that's a grand plan | i don't think that's a great play |
