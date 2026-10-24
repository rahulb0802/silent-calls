# lora_cv5_feasibility_r8_attn_ffn_s300_lr0.0005/nilesh_fold3

nilesh · source `feasibility` · 24 train / 0 val / 6 test clips · rank 8, alpha 16, targets linear_q+linear_k+linear_v+linear_out+w_1+w_2 · 300 steps (best 300), lr 0.0005, batch 8 · 2,064,384 trainable params · 0.348 s/step, 104 s training on cuda:1

| test set | top-1 WER | exact@1 | exact@5 | exact@10 | oracle WER@10 |
|---|---|---|---|---|---|
| held-out, before | 47% | 17% | 33% | 33% | 31% |
| held-out, after | 56% | 17% | 17% | 17% | 41% |

| sentence | before | after |
|---|---|---|
| it was about forty dollars | it was about forty dollars | and what's the better for you now |
| where should I park | question number | where should i marry |
| please call me back later | he's coming back here | because i'll be back later |
| could you say that again | you say that again | you say the name |
| that sounds like a great idea | it sounds like a great idea | that sounds like a great idea |
| thanks so much talk to you soon | so i'm going to start | so please talk a little soon |
