# lora_curve_train12/nilesh_fold3

nilesh · source `feasibility` · 12 train / 0 val / 6 test clips · rank 16, alpha 32, targets linear_q+linear_k+linear_v+linear_out · 100 steps (best 100), lr 0.001, batch 8 · 1,179,648 trainable params · 0.286 s/step, 29 s training on cuda:1

| test set | top-1 WER | exact@1 | exact@5 | exact@10 | oracle WER@10 |
|---|---|---|---|---|---|
| held-out, before | 47% | 17% | 33% | 33% | 31% |
| held-out, after | 41% | 33% | 33% | 33% | 34% |

| sentence | before | after |
|---|---|---|
| it was about forty dollars | it was about forty dollars | it was about forty dollars |
| where should I park | question number | why should i marry |
| please call me back later | it's coming back here | i'll be back later |
| could you say that again | you say that again | you say that again |
| that sounds like a great idea | it sounds like a great idea | that sounds like a great idea |
| thanks so much talk to you soon | so i'm going to start | don't be scared |
