# stream_720p_q80_face192m1.4_gray_beam40

mode `stream` on `cuda:0` · beam 40 · LM weight 0.2 · CTC weight 0.1 · adapter off · 720p face crop 192px JPEG q80 gray (137 KB/s)

| group | clips | top1_wer | exact@1 | exact@3 | exact@5 | exact@10 | oracle_wer@5 | within1@5 |
|---|---|---|---|---|---|---|---|---|
| nilesh/silent | 30 | 63% | 7% | 13% | 13% | 17% | 54% | 23% |
| rahul/silent | 30 | 37% | 37% | 37% | 43% | 53% | 29% | 57% |
| sarvajith/silent | 30 | 14% | 57% | 73% | 73% | 73% | 7% | 87% |
| ALL/silent | 90 | 38% | 33% | 41% | 43% | 48% | 30% | 56% |

Median timings (ms): face_wait_ms 121, crop_ms 17, encode_ms 35, beam_ms 848, lipread_ms 882, finish_ms 1028
