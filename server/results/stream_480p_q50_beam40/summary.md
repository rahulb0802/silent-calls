# stream_480p_q50_beam40

mode `stream` on `cuda:0` · beam 40 · LM weight 0.2 · CTC weight 0.1 · adapter off · 480p JPEG q50 (645 KB/s)

| group | clips | top1_wer | exact@1 | exact@3 | exact@5 | exact@10 | oracle_wer@5 | within1@5 |
|---|---|---|---|---|---|---|---|---|
| nilesh/silent | 30 | 54% | 13% | 23% | 23% | 23% | 42% | 43% |
| rahul/silent | 30 | 37% | 33% | 47% | 50% | 53% | 29% | 60% |
| sarvajith/silent | 30 | 20% | 50% | 63% | 73% | 80% | 9% | 87% |
| ALL/silent | 90 | 37% | 32% | 44% | 49% | 52% | 26% | 63% |

Median timings (ms): face_wait_ms 140, crop_ms 21, encode_ms 38, beam_ms 1336, lipread_ms 1386, finish_ms 1528
