# file_beam40

mode `file` on `cuda:0` · beam 40 · LM weight 0.3 · CTC weight 0.1 · adapter off

| group | clips | top1_wer | exact@1 | exact@3 | exact@5 | exact@10 | oracle_wer@5 | within1@5 |
|---|---|---|---|---|---|---|---|---|
| nilesh/silent | 30 | 57% | 13% | 20% | 23% | 23% | 46% | 40% |
| rahul/aloud | 6 | 15% | 67% | 83% | 83% | 83% | 6% | 83% |
| rahul/silent | 30 | 39% | 33% | 47% | 57% | 57% | 27% | 63% |
| sarvajith/aloud | 6 | 24% | 67% | 67% | 67% | 83% | 15% | 67% |
| sarvajith/silent | 30 | 16% | 50% | 63% | 70% | 80% | 10% | 87% |
| ALL/aloud | 12 | 19% | 67% | 75% | 75% | 83% | 10% | 75% |
| ALL/silent | 90 | 38% | 32% | 43% | 50% | 53% | 28% | 63% |

Median timings (ms): encode_ms 35, beam_ms 822, lipread_ms 859, finish_ms 1498

Silent vs aloud on the same 12 sentences: top-1 WER 28% vs 19%
