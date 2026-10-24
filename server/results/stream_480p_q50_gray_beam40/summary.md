# stream_480p_q50_gray_beam40

mode `stream` on `cuda:0` · beam 40 · LM weight 0.2 · CTC weight 0.1 · adapter off · 480p JPEG q50 gray (563 KB/s)

| group | clips | top1_wer | exact@1 | exact@3 | exact@5 | exact@10 | oracle_wer@5 | within1@5 |
|---|---|---|---|---|---|---|---|---|
| nilesh/silent | 30 | 65% | 13% | 13% | 17% | 20% | 58% | 20% |
| rahul/silent | 30 | 44% | 30% | 43% | 50% | 53% | 29% | 57% |
| sarvajith/silent | 30 | 18% | 53% | 63% | 67% | 70% | 11% | 87% |
| ALL/silent | 90 | 42% | 32% | 40% | 44% | 48% | 32% | 54% |

Median timings (ms): face_wait_ms 138, crop_ms 20, encode_ms 35, beam_ms 867, lipread_ms 905, finish_ms 1059
