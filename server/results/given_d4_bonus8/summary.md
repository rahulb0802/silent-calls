# given_d4_bonus8

90 silent clips · given list = truth + 4 other sentences (absent: 5 others, no truth) · beam 40, LM 0.2

| condition | WER | exact@1 | exact@3 | exact@10 | list@1 | wrong given at top | scoring ms |
|---|---|---|---|---|---|---|---|
| open | 37% | 36% | 43% | 56% | - | 0% | 0.0 |
| random | 19% | 77% | 84% | 84% | 99% | 0% | 60.0 |
| hard | 19% | 77% | 84% | 84% | 98% | 0% | 60.0 |
| absent | 37% | 36% | 43% | 56% | - | 0% | 73.0 |

Scoring check: a given sentence equal to the beam's top guess scores within 0.0 (median) of the beam's own score.
