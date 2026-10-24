# lora_curve_train24

5-fold cross-validation by sentence on `feasibility` clips · rank 16, alpha 32, targets attn · 100 steps, lr 0.001, batch 8

| who | stage | clips | top1_wer | exact@1 | exact@5 | exact@10 | oracle_wer@10 | within1@5 |
|---|---|---|---|---|---|---|---|---|
| ALL | before | 90 | 37% | 36% | 49% | 56% | 24% | 64% |
| ALL | step 50 | 90 | 30% | 44% | 56% | 62% | 19% | 72% |
| ALL | after | 90 | 31% | 40% | 56% | 60% | 18% | 73% |
| rahul | before | 30 | 38% | 37% | 53% | 60% | 24% | 63% |
| rahul | step 50 | 30 | 23% | 50% | 60% | 70% | 10% | 77% |
| rahul | after | 30 | 21% | 47% | 63% | 70% | 8% | 83% |
| nilesh | before | 30 | 59% | 13% | 23% | 23% | 41% | 43% |
| nilesh | step 50 | 30 | 53% | 20% | 27% | 30% | 42% | 47% |
| nilesh | after | 30 | 58% | 10% | 23% | 23% | 41% | 43% |
| sarvajith | before | 30 | 15% | 57% | 70% | 83% | 7% | 87% |
| sarvajith | step 50 | 30 | 15% | 63% | 80% | 87% | 5% | 93% |
| sarvajith | after | 30 | 13% | 63% | 80% | 87% | 6% | 93% |

| user | sentence | before | after |
|---|---|---|---|
| rahul | hey can you hear me okay | hey can you hear me o k | hey can you hear me ok |
| rahul | no I haven't heard back yet | no i haven't heard back yet | no i haven't heard my name |
| rahul | I'll be there in ten minutes | i'll be there in ten minutes | i'll be there in ten minutes |
| rahul | what time does it start | what time is this going | what time does it start |
| rahul | can you speak a little louder | can you speak a little louder | can you speak a little louder |
| rahul | I'm running a little late | i'm running a little late | i'm running a little late |
| rahul | let's meet tomorrow morning | let's meet tomorrow morning | let's meet tomorrow morning |
| rahul | can you send me the link | and do something like | can you send me the link |
| rahul | I'm not feeling very well today | i'm not feeling very well to day | i'm not feeling very well today |
| rahul | I'll pick up the groceries on the way home | i'll make up groceries on the way home | i'll make up groceries on the way home |
| rahul | leave the package at the front door | if they buy each other very short | leave the package in the front door |
| rahul | okay bye see you later | hurt him i see you later | okay i see you later |
| rahul | yes that works for me | it's not one for me | is that one for me |
| rahul | sure go ahead | sure go ahead | sure ok |
| rahul | can we move it to three thirty | and we move into three thirty | and we move into three thirty |
| rahul | I just finished my homework | i try to finish my homework | i just finished my homework |
| rahul | the doctor said I need to rest | and understand i need to rest | the doctor said i need to rest |
| rahul | I don't think that's a good plan | i know that that's a grand plan | i know that that's a great play |
| rahul | it was about forty dollars | it was about forty dollars | it was about forty dollars |
| rahul | where should I park | where should i party | where should i party |
| rahul | please call me back later | he taught me my leader | he taught me my little |
| rahul | could you say that again | could you say that again | could you say that again |
| rahul | that sounds like a great idea | it sounds like a great idea | it sounds like a great idea |
| rahul | thanks so much talk to you soon | so much on tuesday | thanks so much |
| rahul | hi sorry I'm in the library right now | sorry i'm in the library right now | i'm in the library right now |
| rahul | my number is the same as before | i got a pretty good example before i | my number is the same as before |
| rahul | did you get my email | can you get my email | can you get my email |
| rahul | how did the interview go | how can i feel at home | how can you know |
| rahul | I really like the new design | i really like the new design | i really like the new design |
| rahul | we need to book the tickets tonight | we need to more than a chance to die | we need to book this yesterday |
| nilesh | hey can you hear me okay | and then you're going to be ok | you're going to be ok |
| nilesh | no I haven't heard back yet | no i haven't come in yet | no i haven't heard my name |
| nilesh | I'll be there in ten minutes | i'll be there in ten minutes | i'll be there in ten minutes |
| nilesh | what time does it start | ridiculously tall | what that does is |
| nilesh | can you speak a little louder | on monday | you might get down |
| nilesh | I'm running a little late | i'm going to look at it | i'm going to look at that |
| nilesh | let's meet tomorrow morning | tomorrow morning | tomorrow morning |
| nilesh | can you send me the link | or something like | or something like that |
| nilesh | I'm not feeling very well today | i'm not feeling very well today | i'm not feeling very well today |
| nilesh | I'll pick up the groceries on the way home | call me up don't stop me | don't stop in the rain |
| nilesh | leave the package at the front door | leave the bags at the front door | leave the bag inside the front door |
| nilesh | okay bye see you later | let me ask you again | okay my screen |
| nilesh | yes that works for me | that's how it works for me | that's how it works for me |
| nilesh | sure go ahead | did you know that | did you know that |
| nilesh | can we move it to three thirty | removing the green card | removing the green card |
| nilesh | I just finished my homework | i also finished my week | i just finished my week |
| nilesh | the doctor said I need to rest | doctor said i can do this | not just any crazy |
| nilesh | I don't think that's a good plan | that's a good plan | that's a good plan |
| nilesh | it was about forty dollars | it was about forty dollars | and once i made a forty dollars |
| nilesh | where should I park | question number | where should i be |
| nilesh | please call me back later | it's coming back here | i'll be back later |
| nilesh | could you say that again | you say that again | you say that again |
| nilesh | that sounds like a great idea | it sounds like a great idea | that sounds like a great idea |
| nilesh | thanks so much talk to you soon | so i'm going to start | so please talk a little soon |
| nilesh | hi sorry I'm in the library right now | it's already come in the library right now | i'm in the library right now |
| nilesh | my number is the same as before | my number is the same as before | bottom braces i passed before |
| nilesh | did you get my email | you get my email | you get my email |
| nilesh | how did the interview go | i'm going to let everyone know | how did that ever go |
| nilesh | I really like the new design | i really like to use | i really like |
| nilesh | we need to book the tickets tonight | another building is that | but i don't |
| sarvajith | hey can you hear me okay | hey can you hear me ok | hey can you hear me going |
| sarvajith | no I haven't heard back yet | no i haven't heard back yet | no i haven't heard back yet |
| sarvajith | I'll be there in ten minutes | i'll be there in ten minutes | i'll be there in ten minutes |
| sarvajith | what time does it start | what time does it start | what time does it start |
| sarvajith | can you speak a little louder | can you speak a little louder | can you speak a little louder |
| sarvajith | I'm running a little late | i'm running a little late | i'm running a little late |
| sarvajith | let's meet tomorrow morning | let's meet tomorrow morning | let's meet tomorrow morning |
| sarvajith | can you send me the link | can you tell me that like | can you send me the letter |
| sarvajith | I'm not feeling very well today | i'm not feeling very well to day | i'm not feeling very well to day |
| sarvajith | I'll pick up the groceries on the way home | i'll pick up the groceries on my way home | i'll pick up the groceries on my way home |
| sarvajith | leave the package at the front door | leave the package on the front door | leave the package on the front door |
| sarvajith | okay bye see you later | okay buy see you later | okay buy see you later |
| sarvajith | yes that works for me | yes that was me | yes that was me |
| sarvajith | sure go ahead | go ahead | sure go ahead |
| sarvajith | can we move it to three thirty | can we move it to thirty | can we move into three thirty |
| sarvajith | I just finished my homework | i just finished my homework | i just finished my homework |
| sarvajith | the doctor said I need to rest | the doctor said i need rest | the doctor said i need to rest |
| sarvajith | I don't think that's a good plan | i don't think that's a good plan | i don't think that's a good plan |
| sarvajith | it was about forty dollars | it was about forty dollars | it was about forty dollars |
| sarvajith | where should I park | why don't you get married | why don't you get married |
| sarvajith | please call me back later | please call me back later | please call me back later |
| sarvajith | could you say that again | you say that again | could you say that again |
| sarvajith | that sounds like a great idea | that sounds like a great idea | that sounds like a great idea |
| sarvajith | thanks so much talk to you soon | thanks so much doctor | thanks so much |
| sarvajith | hi sorry I'm in the library right now | i started out by the library right now | i started i'm at the library right now |
| sarvajith | my number is the same as before | my number is the same as before | my number is the same as before |
| sarvajith | did you get my email | did you get my email | did you get my email |
| sarvajith | how did the interview go | how did the interview go | how did the interview go |
| sarvajith | I really like the new design | i really like the new design | i really like the new design |
| sarvajith | we need to book the tickets tonight | we need to book the tickets to day | we need to book the tickets to day |
