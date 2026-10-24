# sweep_beam40_lm0.1_ctc0.1

mode `file` on `cuda:0` · beam 40 · LM weight 0.1 · CTC weight 0.1 · adapter off

| group | clips | top1_wer | exact@1 | exact@3 | exact@5 | exact@10 | oracle_wer@5 | within1@5 |
|---|---|---|---|---|---|---|---|---|
| nilesh/silent | 30 | 63% | 10% | 27% | 27% | 30% | 41% | 50% |
| rahul/silent | 30 | 38% | 37% | 47% | 47% | 53% | 28% | 60% |
| sarvajith/silent | 30 | 18% | 57% | 63% | 67% | 77% | 11% | 87% |
| ALL/silent | 90 | 40% | 34% | 46% | 47% | 53% | 27% | 66% |

Median timings (ms): encode_ms 34, beam_ms 874, lipread_ms 910, finish_ms 916
