# video_vp8_480p_250k_beam40

mode `video` on `cuda:0` · beam 40 · LM weight 0.2 · CTC weight 0.1 · adapter off · VP8 480p at 250kbps (33 KB/s)

| group | clips | top1_wer | exact@1 | exact@3 | exact@5 | exact@10 | oracle_wer@5 | within1@5 |
|---|---|---|---|---|---|---|---|---|
| nilesh/silent | 30 | 65% | 7% | 13% | 17% | 20% | 54% | 33% |
| rahul/silent | 30 | 50% | 23% | 33% | 40% | 50% | 35% | 50% |
| sarvajith/silent | 30 | 20% | 50% | 63% | 63% | 70% | 11% | 87% |
| ALL/silent | 90 | 45% | 27% | 37% | 40% | 47% | 33% | 57% |

Median timings (ms): crop_ms 21, encode_ms 35, beam_ms 850, lipread_ms 896, finish_ms 2312
