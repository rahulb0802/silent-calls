# video_vp8_480p_500k_beam40

mode `video` on `cuda:0` · beam 40 · LM weight 0.2 · CTC weight 0.1 · adapter off · VP8 480p at 500kbps (63 KB/s)

| group | clips | top1_wer | exact@1 | exact@3 | exact@5 | exact@10 | oracle_wer@5 | within1@5 |
|---|---|---|---|---|---|---|---|---|
| nilesh/silent | 30 | 66% | 10% | 17% | 23% | 23% | 44% | 47% |
| rahul/silent | 30 | 46% | 20% | 33% | 40% | 43% | 32% | 47% |
| sarvajith/silent | 30 | 17% | 50% | 63% | 73% | 77% | 9% | 90% |
| ALL/silent | 90 | 43% | 27% | 38% | 46% | 48% | 28% | 61% |

Median timings (ms): crop_ms 22, encode_ms 36, beam_ms 890, lipread_ms 935, finish_ms 2378
