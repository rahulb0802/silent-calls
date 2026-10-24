# sweep_beam40_lm0.0_ctc0.3

mode `file` on `cuda:0` · beam 40 · LM weight 0.0 · CTC weight 0.3 · adapter off

| group | clips | top1_wer | exact@1 | exact@3 | exact@5 | exact@10 | oracle_wer@5 | within1@5 |
|---|---|---|---|---|---|---|---|---|
| nilesh/silent | 30 | 63% | 7% | 13% | 20% | 23% | 47% | 33% |
| rahul/silent | 30 | 40% | 27% | 40% | 43% | 50% | 31% | 53% |
| sarvajith/silent | 30 | 16% | 60% | 63% | 70% | 77% | 10% | 83% |
| ALL/silent | 90 | 40% | 31% | 39% | 44% | 50% | 29% | 57% |

Median timings (ms): encode_ms 34, beam_ms 650, lipread_ms 687, finish_ms 693
