# length

Stitched silent clips (one person, k sentences, 0.4 s still pause between). Whole: the stitched clip read at once. Split: each sentence read separately and joined.

| sentences | seconds (median) | words | WER whole | WER split | exact whole | decode whole (median) | decode split (sum, median) | peak GPU MB |
|---|---|---|---|---|---|---|---|---|
| 1 | 2.2 | 6 | 37% | 37% | 36% | 910 ms | 897 ms | 1662 |
| 2 | 4.7 | 12 | 47% | 42% | 0% | 1787 ms | 1821 ms | 1661 |
| 3 | 7.4 | 18 | 39% | 37% | 8% | 3679 ms | 2865 ms | 1965 |
| 4 | 10.8 | 24 | 46% | 41% | 0% | 6073 ms | 4129 ms | 2096 |
| 6 | 15.1 | 36 | 39% | 40% | 8% | 9872 ms | 5391 ms | 2620 |
| 8 | 20.6 | 47 | 34% | 34% | 8% | 17000 ms | 7999 ms | 3195 |
