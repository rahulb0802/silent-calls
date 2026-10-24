# lora_cv5_feasibility_r8_attn_ffn_s300_lr0.0005/rahul_fold2

rahul · source `feasibility` · 24 train / 0 val / 6 test clips · rank 8, alpha 16, targets linear_q+linear_k+linear_v+linear_out+w_1+w_2 · 300 steps (best 300), lr 0.0005, batch 8 · 2,064,384 trainable params · 0.404 s/step, 121 s training on cuda:1

| test set | top-1 WER | exact@1 | exact@5 | exact@10 | oracle WER@10 |
|---|---|---|---|---|---|
| held-out, before | 44% | 17% | 50% | 50% | 21% |
| held-out, after | 35% | 33% | 50% | 67% | 9% |

| sentence | before | after |
|---|---|---|
| yes that works for me | it's not one for me | does that work for me |
| sure go ahead | sure go ahead | sure okay |
| can we move it to three thirty | and we move into three thirty | can we move into learning |
| I just finished my homework | i try to finish my homework | i just finished my homework |
| the doctor said I need to rest | and understand i need to rest | the doctor said i need to rest |
| I don't think that's a good plan | i know that that's a grand plan | i know that that's a great play |
