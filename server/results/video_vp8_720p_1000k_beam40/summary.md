# video_vp8_720p_1000k_beam40

mode `video` on `cuda:0` · beam 40 · LM weight 0.2 · CTC weight 0.1 · adapter off · VP8 720p at 1000kbps (125 KB/s)

| group | clips | top1_wer | exact@1 | exact@3 | exact@5 | exact@10 | oracle_wer@5 | within1@5 |
|---|---|---|---|---|---|---|---|---|
| nilesh/silent | 30 | 64% | 7% | 13% | 17% | 20% | 48% | 37% |
| rahul/silent | 30 | 40% | 27% | 43% | 47% | 47% | 31% | 50% |
| sarvajith/silent | 30 | 22% | 50% | 63% | 67% | 77% | 13% | 87% |
| ALL/silent | 90 | 42% | 28% | 40% | 43% | 48% | 31% | 58% |

Median timings (ms): crop_ms 22, encode_ms 35, beam_ms 876, lipread_ms 916, finish_ms 2807
