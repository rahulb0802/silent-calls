# video_vp8_480p_2000k_beam40

mode `video` on `cuda:0` · beam 40 · LM weight 0.2 · CTC weight 0.1 · adapter off · VP8 480p at 2000kbps (247 KB/s)

| group | clips | top1_wer | exact@1 | exact@3 | exact@5 | exact@10 | oracle_wer@5 | within1@5 |
|---|---|---|---|---|---|---|---|---|
| nilesh/silent | 30 | 58% | 7% | 17% | 20% | 23% | 47% | 43% |
| rahul/silent | 30 | 37% | 40% | 43% | 50% | 57% | 24% | 60% |
| sarvajith/silent | 30 | 17% | 53% | 63% | 73% | 80% | 9% | 87% |
| ALL/silent | 90 | 37% | 33% | 41% | 48% | 53% | 27% | 63% |

Median timings (ms): crop_ms 22, encode_ms 35, beam_ms 873, lipread_ms 908, finish_ms 2277
