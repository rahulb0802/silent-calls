# sweep_beam40_lm0.0_ctc0.1

mode `file` on `cuda:0` · beam 40 · LM weight 0.0 · CTC weight 0.1 · adapter off

| group | clips | top1_wer | exact@1 | exact@3 | exact@5 | exact@10 | oracle_wer@5 | within1@5 |
|---|---|---|---|---|---|---|---|---|
| nilesh/silent | 30 | 65% | 10% | 17% | 23% | 30% | 45% | 37% |
| rahul/silent | 30 | 40% | 33% | 37% | 47% | 53% | 30% | 53% |
| sarvajith/silent | 30 | 18% | 57% | 63% | 67% | 77% | 11% | 87% |
| ALL/silent | 90 | 41% | 33% | 39% | 46% | 53% | 29% | 59% |

Median timings (ms): encode_ms 34, beam_ms 716, lipread_ms 750, finish_ms 756
