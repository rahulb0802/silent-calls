# sweep_beam40_lm0.5_ctc0.3

mode `file` on `cuda:0` · beam 40 · LM weight 0.5 · CTC weight 0.3 · adapter off

| group | clips | top1_wer | exact@1 | exact@3 | exact@5 | exact@10 | oracle_wer@5 | within1@5 |
|---|---|---|---|---|---|---|---|---|
| nilesh/silent | 30 | 55% | 13% | 20% | 23% | 23% | 46% | 37% |
| rahul/silent | 30 | 39% | 27% | 40% | 47% | 47% | 28% | 57% |
| sarvajith/silent | 30 | 18% | 50% | 63% | 63% | 73% | 11% | 87% |
| ALL/silent | 90 | 37% | 30% | 41% | 44% | 48% | 28% | 60% |

Median timings (ms): encode_ms 34, beam_ms 796, lipread_ms 836, finish_ms 842
