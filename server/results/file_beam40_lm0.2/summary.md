# file_beam40_lm0.2

mode `file` on `cuda:0` · beam 40 · LM weight 0.2 · CTC weight 0.1 · adapter off

| group | clips | top1_wer | exact@1 | exact@3 | exact@5 | exact@10 | oracle_wer@5 | within1@5 |
|---|---|---|---|---|---|---|---|---|
| nilesh/silent | 30 | 59% | 13% | 23% | 23% | 23% | 44% | 43% |
| rahul/silent | 30 | 38% | 37% | 43% | 53% | 60% | 28% | 63% |
| sarvajith/silent | 30 | 15% | 57% | 63% | 70% | 83% | 10% | 87% |
| ALL/silent | 90 | 37% | 36% | 43% | 49% | 56% | 27% | 64% |

Median timings (ms): encode_ms 34, beam_ms 853, lipread_ms 894, finish_ms 901
