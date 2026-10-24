# sweep_beam40_lm0.1_ctc0.3

mode `file` on `cuda:0` · beam 40 · LM weight 0.1 · CTC weight 0.3 · adapter off

| group | clips | top1_wer | exact@1 | exact@3 | exact@5 | exact@10 | oracle_wer@5 | within1@5 |
|---|---|---|---|---|---|---|---|---|
| nilesh/silent | 30 | 62% | 10% | 23% | 23% | 27% | 45% | 37% |
| rahul/silent | 30 | 40% | 27% | 43% | 47% | 53% | 30% | 57% |
| sarvajith/silent | 30 | 15% | 57% | 67% | 70% | 77% | 11% | 87% |
| ALL/silent | 90 | 39% | 31% | 44% | 47% | 52% | 28% | 60% |

Median timings (ms): encode_ms 33, beam_ms 819, lipread_ms 856, finish_ms 862
