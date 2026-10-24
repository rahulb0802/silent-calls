# stream_720p_q80_face224_gray_beam40

mode `stream` on `cuda:0` · beam 40 · LM weight 0.2 · CTC weight 0.1 · adapter off · 720p face crop 224px JPEG q80 gray (173 KB/s)

| group | clips | top1_wer | exact@1 | exact@3 | exact@5 | exact@10 | oracle_wer@5 | within1@5 |
|---|---|---|---|---|---|---|---|---|
| nilesh/silent | 30 | 61% | 13% | 17% | 20% | 23% | 50% | 33% |
| rahul/silent | 30 | 43% | 23% | 33% | 43% | 50% | 33% | 53% |
| sarvajith/silent | 30 | 15% | 57% | 60% | 67% | 73% | 10% | 90% |
| ALL/silent | 90 | 40% | 31% | 37% | 43% | 49% | 31% | 59% |

Median timings (ms): face_wait_ms 120, crop_ms 18, encode_ms 35, beam_ms 832, lipread_ms 870, finish_ms 1036
