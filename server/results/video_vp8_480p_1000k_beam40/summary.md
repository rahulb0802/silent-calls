# video_vp8_480p_1000k_beam40

mode `video` on `cuda:0` · beam 40 · LM weight 0.2 · CTC weight 0.1 · adapter off · VP8 480p at 1000kbps (124 KB/s)

| group | clips | top1_wer | exact@1 | exact@3 | exact@5 | exact@10 | oracle_wer@5 | within1@5 |
|---|---|---|---|---|---|---|---|---|
| nilesh/silent | 30 | 59% | 13% | 13% | 13% | 20% | 49% | 40% |
| rahul/silent | 30 | 37% | 33% | 47% | 50% | 50% | 26% | 57% |
| sarvajith/silent | 30 | 18% | 57% | 67% | 67% | 77% | 9% | 90% |
| ALL/silent | 90 | 38% | 34% | 42% | 43% | 49% | 28% | 62% |

Median timings (ms): crop_ms 21, encode_ms 35, beam_ms 871, lipread_ms 910, finish_ms 2290
