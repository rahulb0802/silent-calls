# names_vocab_bias2

mode `file` on `cuda:1` · beam 40 · LM weight 0.2 · CTC weight 0.1 · adapter off · vocab 8 words, bias 2.0

| group | clips | top1_wer | exact@1 | exact@3 | exact@5 | exact@10 | oracle_wer@5 | within1@5 |
|---|---|---|---|---|---|---|---|---|
| nilesh/silent | 30 | 59% | 13% | 23% | 23% | 23% | 45% | 43% |
| rahul/aloud | 6 | 15% | 67% | 83% | 83% | 83% | 6% | 83% |
| rahul/silent | 30 | 38% | 37% | 43% | 53% | 57% | 27% | 63% |
| sarvajith/aloud | 6 | 24% | 67% | 67% | 67% | 67% | 12% | 83% |
| sarvajith/silent | 30 | 15% | 57% | 63% | 70% | 80% | 10% | 87% |
| ALL/aloud | 12 | 19% | 67% | 75% | 75% | 75% | 9% | 83% |
| ALL/silent | 90 | 37% | 36% | 43% | 49% | 53% | 27% | 64% |

Median timings (ms): encode_ms 20, beam_ms 934, lipread_ms 990, finish_ms 998

Silent vs aloud on the same 12 sentences: top-1 WER 24% vs 19%
