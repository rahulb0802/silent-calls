# stream_720p_q80_face256m1.4_gray_beam40

mode `stream` on `cuda:0` · beam 40 · LM weight 0.2 · CTC weight 0.1 · adapter off · 720p face crop 256px JPEG q80 gray (208 KB/s)

| group | clips | top1_wer | exact@1 | exact@3 | exact@5 | exact@10 | oracle_wer@5 | within1@5 |
|---|---|---|---|---|---|---|---|---|
| nilesh/silent | 30 | 68% | 7% | 13% | 13% | 17% | 52% | 30% |
| rahul/silent | 30 | 38% | 33% | 40% | 47% | 50% | 27% | 57% |
| sarvajith/silent | 30 | 19% | 53% | 67% | 70% | 70% | 11% | 83% |
| ALL/silent | 90 | 42% | 31% | 40% | 43% | 46% | 30% | 57% |

Median timings (ms): face_wait_ms 120, crop_ms 18, encode_ms 35, beam_ms 864, lipread_ms 895, finish_ms 1046
