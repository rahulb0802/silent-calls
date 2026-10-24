# lora_cv5_feasibility_r16_attn_s300_lr0.001/nilesh_fold3

nilesh · source `feasibility` · 24 train / 0 val / 6 test clips · rank 16, alpha 32.0, targets linear_q+linear_k+linear_v+linear_out · 300 steps (best 300), lr 0.001, batch 8 · 1,179,648 trainable params · 0.321 s/step, 96 s training on cuda:1

| test set | top-1 WER | exact@1 | exact@5 | exact@10 | oracle WER@10 |
|---|---|---|---|---|---|
| held-out, before | 47% | 17% | 33% | 33% | 31% |
| held-out, after | 28% | 33% | 33% | 33% | 25% |

| sentence | before | after |
|---|---|---|
| it was about forty dollars | it was about forty dollars | it was about forty dollars |
| where should I park | question number | where should i marry |
| please call me back later | he's coming back here | so i'll be back later |
| could you say that again | you say that again | you say that again |
| that sounds like a great idea | it sounds like a great idea | that sounds like a great idea |
| thanks so much talk to you soon | so i'm going to start | so please talk a little soon |
