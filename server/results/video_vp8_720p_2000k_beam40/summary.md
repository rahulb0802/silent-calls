# video_vp8_720p_2000k_beam40

mode `video` on `cuda:0` · beam 40 · LM weight 0.2 · CTC weight 0.1 · adapter off · VP8 720p at 2000kbps (247 KB/s)

| group | clips | top1_wer | exact@1 | exact@3 | exact@5 | exact@10 | oracle_wer@5 | within1@5 |
|---|---|---|---|---|---|---|---|---|
| nilesh/silent | 30 | 64% | 7% | 17% | 20% | 27% | 47% | 43% |
| rahul/silent | 30 | 41% | 33% | 43% | 47% | 50% | 24% | 57% |
| sarvajith/silent | 30 | 19% | 47% | 63% | 63% | 73% | 11% | 83% |
| ALL/silent | 90 | 42% | 29% | 41% | 43% | 50% | 28% | 61% |

Median timings (ms): crop_ms 23, encode_ms 35, beam_ms 866, lipread_ms 902, finish_ms 2804
