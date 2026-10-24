# stream_720p_q60_face256m1.4_gray_beam40

mode `stream` on `cuda:0` · beam 40 · LM weight 0.2 · CTC weight 0.1 · adapter off · 720p face crop 256px JPEG q60 gray (142 KB/s)

| group | clips | top1_wer | exact@1 | exact@3 | exact@5 | exact@10 | oracle_wer@5 | within1@5 |
|---|---|---|---|---|---|---|---|---|
| nilesh/silent | 30 | 62% | 7% | 13% | 13% | 13% | 52% | 33% |
| rahul/silent | 30 | 35% | 30% | 40% | 47% | 60% | 22% | 63% |
| sarvajith/silent | 30 | 16% | 60% | 70% | 73% | 77% | 9% | 87% |
| ALL/silent | 90 | 38% | 32% | 41% | 44% | 50% | 28% | 61% |

Median timings (ms): face_wait_ms 125, crop_ms 20, encode_ms 37, beam_ms 1302, lipread_ms 1352, finish_ms 1540
