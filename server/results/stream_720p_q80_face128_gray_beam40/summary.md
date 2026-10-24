# stream_720p_q80_face128_gray_beam40

mode `stream` on `cuda:0` · beam 40 · LM weight 0.2 · CTC weight 0.1 · adapter off · 720p face crop 128px JPEG q80 gray (75 KB/s)

| group | clips | top1_wer | exact@1 | exact@3 | exact@5 | exact@10 | oracle_wer@5 | within1@5 |
|---|---|---|---|---|---|---|---|---|
| nilesh/silent | 30 | 68% | 10% | 13% | 13% | 17% | 62% | 17% |
| rahul/silent | 30 | 51% | 20% | 37% | 43% | 50% | 34% | 53% |
| sarvajith/silent | 30 | 19% | 47% | 53% | 60% | 70% | 14% | 80% |
| ALL/silent | 90 | 46% | 26% | 34% | 39% | 46% | 37% | 50% |

Median timings (ms): face_wait_ms 120, crop_ms 17, encode_ms 35, beam_ms 864, lipread_ms 902, finish_ms 1040
