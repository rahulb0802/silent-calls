# lora_cv5_feasibility_r8_attn_s300_lr0.0005/sarvajith_fold2

sarvajith · source `feasibility` · 24 train / 0 val / 6 test clips · rank 8, alpha 16, targets linear_q+linear_k+linear_v+linear_out · 300 steps (best 300), lr 0.0005, batch 8 · 589,824 trainable params · 0.266 s/step, 80 s training on cuda:1

| test set | top-1 WER | exact@1 | exact@5 | exact@10 | oracle WER@10 |
|---|---|---|---|---|---|
| held-out, before | 15% | 33% | 67% | 83% | 3% |
| held-out, after | 9% | 67% | 100% | 100% | 0% |

| sentence | before | after |
|---|---|---|
| yes that works for me | yes that was me | yes that was me |
| sure go ahead | go ahead | sure go ahead |
| can we move it to three thirty | can we move it to thirty | can we move it to three thirty |
| I just finished my homework | i just finished my homework | i just finished my homework |
| the doctor said I need to rest | the doctor said i need rest | the doctor said i need a rest |
| I don't think that's a good plan | i don't think that's a good plan | i don't think that's a good plan |
