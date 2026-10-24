# stream_360p_q80_beam40

mode `stream` on `cuda:0` · beam 40 · LM weight 0.3 · CTC weight 0.1 · adapter off · 360p JPEG q80 (696 KB/s)

| group | clips | top1_wer | exact@1 | exact@3 | exact@5 | exact@10 | oracle_wer@5 | within1@5 |
|---|---|---|---|---|---|---|---|---|
| nilesh/silent | 30 | 59% | 13% | 20% | 23% | 23% | 45% | 37% |
| rahul/silent | 30 | 36% | 33% | 50% | 50% | 53% | 27% | 60% |
| sarvajith/silent | 30 | 18% | 50% | 70% | 70% | 73% | 10% | 83% |
| ALL/silent | 90 | 38% | 32% | 47% | 48% | 50% | 27% | 60% |

Median timings (ms): face_wait_ms 138, crop_ms 19, encode_ms 35, beam_ms 848, lipread_ms 889, finish_ms 1054
