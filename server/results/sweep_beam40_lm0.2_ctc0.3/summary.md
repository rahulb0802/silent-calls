# sweep_beam40_lm0.2_ctc0.3

mode `file` on `cuda:0` · beam 40 · LM weight 0.2 · CTC weight 0.3 · adapter off

| group | clips | top1_wer | exact@1 | exact@3 | exact@5 | exact@10 | oracle_wer@5 | within1@5 |
|---|---|---|---|---|---|---|---|---|
| nilesh/silent | 30 | 62% | 7% | 17% | 20% | 23% | 45% | 40% |
| rahul/silent | 30 | 38% | 33% | 43% | 47% | 60% | 30% | 60% |
| sarvajith/silent | 30 | 15% | 57% | 67% | 70% | 77% | 10% | 87% |
| ALL/silent | 90 | 38% | 32% | 42% | 46% | 53% | 28% | 62% |

Median timings (ms): encode_ms 34, beam_ms 800, lipread_ms 839, finish_ms 846
