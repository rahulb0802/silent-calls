# stream_480p_q30_beam40

mode `stream` on `cuda:0` · beam 40 · LM weight 0.2 · CTC weight 0.1 · adapter off · 480p JPEG q30 (480 KB/s)

| group | clips | top1_wer | exact@1 | exact@3 | exact@5 | exact@10 | oracle_wer@5 | within1@5 |
|---|---|---|---|---|---|---|---|---|
| nilesh/silent | 30 | 60% | 10% | 17% | 17% | 20% | 47% | 33% |
| rahul/silent | 30 | 42% | 23% | 43% | 50% | 60% | 24% | 60% |
| sarvajith/silent | 30 | 21% | 47% | 57% | 67% | 77% | 10% | 87% |
| ALL/silent | 90 | 41% | 27% | 39% | 44% | 52% | 27% | 60% |

Median timings (ms): face_wait_ms 138, crop_ms 20, encode_ms 35, beam_ms 906, lipread_ms 946, finish_ms 1096
