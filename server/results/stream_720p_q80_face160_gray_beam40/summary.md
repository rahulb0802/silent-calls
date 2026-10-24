# stream_720p_q80_face160_gray_beam40

mode `stream` on `cuda:0` · beam 40 · LM weight 0.2 · CTC weight 0.1 · adapter off · 720p face crop 160px JPEG q80 gray (104 KB/s)

| group | clips | top1_wer | exact@1 | exact@3 | exact@5 | exact@10 | oracle_wer@5 | within1@5 |
|---|---|---|---|---|---|---|---|---|
| nilesh/silent | 30 | 64% | 10% | 10% | 13% | 17% | 55% | 30% |
| rahul/silent | 30 | 45% | 23% | 37% | 50% | 53% | 29% | 60% |
| sarvajith/silent | 30 | 17% | 57% | 63% | 67% | 77% | 11% | 83% |
| ALL/silent | 90 | 42% | 30% | 37% | 43% | 49% | 32% | 58% |

Median timings (ms): face_wait_ms 119, crop_ms 18, encode_ms 35, beam_ms 869, lipread_ms 906, finish_ms 1036
