# lora_curve_train6/nilesh_fold3

nilesh · source `feasibility` · 6 train / 0 val / 6 test clips · rank 16, alpha 32, targets linear_q+linear_k+linear_v+linear_out · 100 steps (best 100), lr 0.001, batch 8 · 1,179,648 trainable params · 0.197 s/step, 20 s training on cuda:1

| test set | top-1 WER | exact@1 | exact@5 | exact@10 | oracle WER@10 |
|---|---|---|---|---|---|
| held-out, before | 47% | 17% | 33% | 33% | 31% |
| held-out, after | 66% | 17% | 17% | 17% | 47% |

| sentence | before | after |
|---|---|---|
| it was about forty dollars | it was about forty dollars | and once i made a forty dollars |
| where should I park | question number | what should i marry |
| please call me back later | it's coming back here | let's start with my letter |
| could you say that again | you say that again | let's try that again |
| that sounds like a great idea | it sounds like a great idea | that sounds like a great idea |
| thanks so much talk to you soon | so i'm going to start | let's open it a little soon |
