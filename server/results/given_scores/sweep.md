# Prior bonus for given sentences (90 silent clips, offline from scores.jsonl)

| prior bonus B | truth in list (random others): top 1 | truth in list (look-alikes): top 1 | truth not in list (random): wrong reply wins | truth not in list (look-alikes): wrong reply wins | truth not in list (look-alikes): still right | truth + 4 one-word-off replies: top 1 | only one-word-off replies: wrong reply wins |
|---|---|---|---|---|---|---|---|
| 0 | 32% | 32% | 0% | 0% | 31% | 32% | 0% |
| 4 | 59% | 59% | 0% | 0% | 31% | 59% | 0% |
| 6 | 64% | 64% | 0% | 0% | 31% | 64% | 0% |
| 8 | 77% | 77% | 0% | 0% | 31% | 77% | 1% |
| 10 | 83% | 83% | 0% | 0% | 31% | 83% | 6% |
| 12 | 88% | 88% | 0% | 0% | 31% | 88% | 16% |
| 15 | 90% | 90% | 1% | 1% | 31% | 90% | 53% |
