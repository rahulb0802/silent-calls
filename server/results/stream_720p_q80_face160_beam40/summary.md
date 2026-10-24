# stream_720p_q80_face160_beam40

mode `stream` on `cuda:0` · beam 40 · LM weight 0.2 · CTC weight 0.1 · adapter off · 720p face crop 160px JPEG q80 (126 KB/s)

| group | clips | top1_wer | exact@1 | exact@3 | exact@5 | exact@10 | oracle_wer@5 | within1@5 |
|---|---|---|---|---|---|---|---|---|
| nilesh/silent | 30 | 61% | 13% | 17% | 17% | 17% | 55% | 27% |
| rahul/silent | 30 | 48% | 23% | 33% | 47% | 57% | 29% | 60% |
| sarvajith/silent | 30 | 16% | 57% | 63% | 67% | 73% | 11% | 83% |
| ALL/silent | 90 | 42% | 31% | 38% | 43% | 49% | 32% | 57% |

Median timings (ms): face_wait_ms 122, crop_ms 18, encode_ms 35, beam_ms 854, lipread_ms 894, finish_ms 1035
