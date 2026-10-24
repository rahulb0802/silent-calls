# stream_720p_q80_face320m2.0_gray_beam40

mode `stream` on `cuda:0` · beam 40 · LM weight 0.2 · CTC weight 0.1 · adapter off · 720p face crop 320px JPEG q80 gray (298 KB/s)

| group | clips | top1_wer | exact@1 | exact@3 | exact@5 | exact@10 | oracle_wer@5 | within1@5 |
|---|---|---|---|---|---|---|---|---|
| nilesh/silent | 30 | 58% | 13% | 20% | 20% | 27% | 45% | 40% |
| rahul/silent | 30 | 43% | 20% | 37% | 43% | 47% | 31% | 53% |
| sarvajith/silent | 30 | 15% | 57% | 67% | 77% | 80% | 7% | 93% |
| ALL/silent | 90 | 39% | 30% | 41% | 47% | 51% | 27% | 62% |

Median timings (ms): face_wait_ms 120, crop_ms 19, encode_ms 35, beam_ms 849, lipread_ms 888, finish_ms 1012
