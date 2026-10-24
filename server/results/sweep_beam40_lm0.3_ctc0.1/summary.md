# sweep_beam40_lm0.3_ctc0.1

mode `file` on `cuda:0` · beam 40 · LM weight 0.3 · CTC weight 0.1 · adapter off

| group | clips | top1_wer | exact@1 | exact@3 | exact@5 | exact@10 | oracle_wer@5 | within1@5 |
|---|---|---|---|---|---|---|---|---|
| nilesh/silent | 30 | 57% | 13% | 20% | 23% | 23% | 46% | 40% |
| rahul/silent | 30 | 39% | 33% | 47% | 57% | 57% | 27% | 63% |
| sarvajith/silent | 30 | 16% | 50% | 63% | 70% | 80% | 10% | 87% |
| ALL/silent | 90 | 38% | 32% | 43% | 50% | 53% | 28% | 63% |

Median timings (ms): encode_ms 34, beam_ms 828, lipread_ms 868, finish_ms 875
