# stream_480p_q80_beam40

mode `stream` on `cuda:0` · beam 40 · LM weight 0.2 · CTC weight 0.1 · adapter off · 480p JPEG q80 (1122 KB/s)

| group | clips | top1_wer | exact@1 | exact@3 | exact@5 | exact@10 | oracle_wer@5 | within1@5 |
|---|---|---|---|---|---|---|---|---|
| nilesh/silent | 30 | 57% | 13% | 23% | 27% | 27% | 42% | 43% |
| rahul/silent | 30 | 33% | 40% | 47% | 53% | 60% | 25% | 60% |
| sarvajith/silent | 30 | 19% | 50% | 63% | 70% | 80% | 9% | 90% |
| ALL/silent | 90 | 37% | 34% | 44% | 50% | 56% | 25% | 64% |

Median timings (ms): face_wait_ms 144, crop_ms 20, encode_ms 35, beam_ms 924, lipread_ms 966, finish_ms 1112
