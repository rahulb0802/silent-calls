# stream_720p_q80_beam40

mode `stream` on `cuda:0` · beam 40 · LM weight 0.3 · CTC weight 0.1 · adapter off · 720p JPEG q80 (2159 KB/s)

| group | clips | top1_wer | exact@1 | exact@3 | exact@5 | exact@10 | oracle_wer@5 | within1@5 |
|---|---|---|---|---|---|---|---|---|
| nilesh/silent | 30 | 56% | 13% | 17% | 17% | 27% | 46% | 40% |
| rahul/silent | 30 | 34% | 33% | 43% | 47% | 57% | 27% | 57% |
| sarvajith/silent | 30 | 15% | 57% | 63% | 67% | 70% | 12% | 87% |
| ALL/silent | 90 | 35% | 34% | 41% | 43% | 51% | 28% | 61% |

Median timings (ms): face_wait_ms 190, crop_ms 23, encode_ms 35, beam_ms 829, lipread_ms 868, finish_ms 1078
