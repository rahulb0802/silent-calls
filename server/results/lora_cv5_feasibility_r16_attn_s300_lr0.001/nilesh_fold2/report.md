# lora_cv5_feasibility_r16_attn_s300_lr0.001/nilesh_fold2

nilesh · source `feasibility` · 24 train / 0 val / 6 test clips · rank 16, alpha 32.0, targets linear_q+linear_k+linear_v+linear_out · 300 steps (best 300), lr 0.001, batch 8 · 1,179,648 trainable params · 0.322 s/step, 96 s training on cuda:1

| test set | top-1 WER | exact@1 | exact@5 | exact@10 | oracle WER@10 |
|---|---|---|---|---|---|
| held-out, before | 68% | 0% | 17% | 17% | 50% |
| held-out, after | 44% | 33% | 33% | 33% | 32% |

| sentence | before | after |
|---|---|---|
| yes that works for me | that's how it works for me | yes that works for me |
| sure go ahead | did you know that | sorry okay |
| can we move it to three thirty | removing the green card | removing the window |
| I just finished my homework | i also finished my week | i also finished my week |
| the doctor said I need to rest | doctor said i can do this | the doctor said i did crazy |
| I don't think that's a good plan | that's a good plan | i don't think that's a good plan |
