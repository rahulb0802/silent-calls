# sweep_beam40_lm0.3_ctc0.3

mode `file` on `cuda:0` · beam 40 · LM weight 0.3 · CTC weight 0.3 · adapter off

| group | clips | top1_wer | exact@1 | exact@3 | exact@5 | exact@10 | oracle_wer@5 | within1@5 |
|---|---|---|---|---|---|---|---|---|
| nilesh/silent | 30 | 57% | 13% | 17% | 23% | 23% | 45% | 37% |
| rahul/silent | 30 | 41% | 30% | 43% | 50% | 57% | 30% | 60% |
| sarvajith/silent | 30 | 17% | 50% | 63% | 70% | 77% | 11% | 87% |
| ALL/silent | 90 | 38% | 31% | 41% | 48% | 52% | 28% | 61% |

Median timings (ms): encode_ms 34, beam_ms 806, lipread_ms 847, finish_ms 855
