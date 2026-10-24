# sweep_beam40_lm0.5_ctc0.1

mode `file` on `cuda:0` · beam 40 · LM weight 0.5 · CTC weight 0.1 · adapter off

| group | clips | top1_wer | exact@1 | exact@3 | exact@5 | exact@10 | oracle_wer@5 | within1@5 |
|---|---|---|---|---|---|---|---|---|
| nilesh/silent | 30 | 54% | 13% | 20% | 23% | 23% | 47% | 40% |
| rahul/silent | 30 | 46% | 27% | 43% | 47% | 47% | 30% | 57% |
| sarvajith/silent | 30 | 18% | 50% | 63% | 63% | 73% | 11% | 87% |
| ALL/silent | 90 | 39% | 30% | 42% | 44% | 48% | 29% | 61% |

Median timings (ms): encode_ms 34, beam_ms 810, lipread_ms 848, finish_ms 856
