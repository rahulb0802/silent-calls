# video_vp8_360p_250k_beam40

mode `video` on `cuda:0` · beam 40 · LM weight 0.2 · CTC weight 0.1 · adapter off · VP8 360p at 250kbps (32 KB/s)

| group | clips | top1_wer | exact@1 | exact@3 | exact@5 | exact@10 | oracle_wer@5 | within1@5 |
|---|---|---|---|---|---|---|---|---|
| nilesh/silent | 30 | 73% | 7% | 7% | 10% | 13% | 56% | 23% |
| rahul/silent | 30 | 50% | 20% | 33% | 33% | 33% | 42% | 43% |
| sarvajith/silent | 30 | 23% | 47% | 63% | 63% | 77% | 10% | 90% |
| ALL/silent | 90 | 49% | 24% | 34% | 36% | 41% | 36% | 52% |

Median timings (ms): crop_ms 20, encode_ms 35, beam_ms 888, lipread_ms 931, finish_ms 1738
