# stream_720p_q80_face96_gray_beam40

mode `stream` on `cuda:0` · beam 40 · LM weight 0.2 · CTC weight 0.1 · adapter off · 720p face crop 96px JPEG q80 gray (50 KB/s)

| group | clips | top1_wer | exact@1 | exact@3 | exact@5 | exact@10 | oracle_wer@5 | within1@5 |
|---|---|---|---|---|---|---|---|---|
| nilesh/silent | 30 | 75% | 10% | 13% | 17% | 17% | 59% | 20% |
| rahul/silent | 30 | 49% | 17% | 27% | 27% | 37% | 35% | 53% |
| sarvajith/silent | 30 | 23% | 40% | 53% | 57% | 57% | 15% | 73% |
| ALL/silent | 90 | 49% | 22% | 31% | 33% | 37% | 36% | 49% |

Median timings (ms): face_wait_ms 117, crop_ms 17, encode_ms 36, beam_ms 924, lipread_ms 968, finish_ms 1088
