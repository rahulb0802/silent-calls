# file_beam20

mode `file` on `cuda:0` · beam 20 · LM weight 0.3 · CTC weight 0.1 · adapter off

| group | clips | top1_wer | exact@1 | exact@3 | exact@5 | exact@10 | oracle_wer@5 | within1@5 |
|---|---|---|---|---|---|---|---|---|
| nilesh/silent | 30 | 57% | 13% | 20% | 23% | 23% | 46% | 40% |
| rahul/silent | 30 | 40% | 30% | 43% | 53% | 53% | 27% | 60% |
| sarvajith/silent | 30 | 16% | 50% | 63% | 70% | 77% | 11% | 87% |
| ALL/silent | 90 | 38% | 31% | 42% | 49% | 51% | 28% | 62% |

Median timings (ms): encode_ms 34, beam_ms 556, lipread_ms 596, finish_ms 604
