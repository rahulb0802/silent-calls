# stream_480p_q80_realtime_beam40

mode `stream` on `cuda:0` · beam 40 · LM weight 0.3 · CTC weight 0.1 · adapter off · 480p JPEG q80 (1122 KB/s) realtime

| group | clips | top1_wer | exact@1 | exact@3 | exact@5 | exact@10 | oracle_wer@5 | within1@5 |
|---|---|---|---|---|---|---|---|---|
| nilesh/silent | 30 | 55% | 13% | 20% | 23% | 23% | 45% | 37% |
| rahul/silent | 30 | 35% | 37% | 47% | 57% | 60% | 22% | 67% |
| sarvajith/silent | 30 | 22% | 47% | 70% | 73% | 80% | 8% | 90% |
| ALL/silent | 90 | 37% | 32% | 46% | 51% | 54% | 25% | 64% |

Median timings (ms): face_wait_ms 1, crop_ms 21, encode_ms 35, beam_ms 854, lipread_ms 894, finish_ms 918
