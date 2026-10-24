# lora_cv5_feasibility_r16_attn_s300_lr0.001

5-fold cross-validation by sentence on `feasibility` clips · rank 16, alpha 32.0, targets attn · 300 steps, lr 0.001, batch 8

| who | stage | clips | top1_wer | exact@1 | exact@5 | exact@10 | oracle_wer@10 | within1@5 |
|---|---|---|---|---|---|---|---|---|
| ALL | before | 90 | 38% | 32% | 50% | 53% | 25% | 63% |
| ALL | step 100 | 90 | 29% | 44% | 57% | 61% | 18% | 69% |
| ALL | step 200 | 90 | 28% | 47% | 54% | 61% | 20% | 69% |
| ALL | after | 90 | 27% | 49% | 53% | 62% | 18% | 70% |
| rahul | before | 30 | 39% | 33% | 57% | 57% | 26% | 63% |
| rahul | step 100 | 30 | 22% | 40% | 63% | 70% | 7% | 80% |
| rahul | step 200 | 30 | 22% | 40% | 57% | 70% | 9% | 77% |
| rahul | after | 30 | 19% | 47% | 57% | 73% | 7% | 80% |
| nilesh | before | 30 | 57% | 13% | 23% | 23% | 42% | 40% |
| nilesh | step 100 | 30 | 53% | 20% | 27% | 27% | 41% | 37% |
| nilesh | step 200 | 30 | 50% | 23% | 27% | 27% | 43% | 40% |
| nilesh | after | 30 | 51% | 23% | 23% | 27% | 42% | 40% |
| sarvajith | before | 30 | 16% | 50% | 70% | 80% | 7% | 87% |
| sarvajith | step 100 | 30 | 13% | 73% | 80% | 87% | 6% | 90% |
| sarvajith | step 200 | 30 | 12% | 77% | 80% | 87% | 6% | 90% |
| sarvajith | after | 30 | 12% | 77% | 80% | 87% | 6% | 90% |

| user | sentence | before | after |
|---|---|---|---|
| rahul | hey can you hear me okay | hey can you hear me o k | hey can you hear me ok |
| rahul | no I haven't heard back yet | no i haven't heard back yet | no i haven't heard about it |
| rahul | I'll be there in ten minutes | i'll be there in ten minutes | i'll be there in ten minutes |
| rahul | what time does it start | what time is this going | what time does it start |
| rahul | can you speak a little louder | can you speak a little louder | can you speak a little louder |
| rahul | I'm running a little late | i'm running a little light | i'm running a little late |
| rahul | let's meet tomorrow morning | let's meet tomorrow morning | let's meet tomorrow morning |
| rahul | can you send me the link | can you tell me that | can you send me the link |
| rahul | I'm not feeling very well today | i'm not feeling very well to day | i'm not feeling very well today |
| rahul | I'll pick up the groceries on the way home | i'll make up groceries on the way home | i'll become groceries on the way home |
| rahul | leave the package at the front door | if they buy each other very short | give the package at the front door |
| rahul | okay bye see you later | hurry up i see you later | okay i see you later |
| rahul | yes that works for me | it's not one for me | does that work for me |
| rahul | sure go ahead | sure go ahead | sure okay |
| rahul | can we move it to three thirty | and we move into three thirty | can we move into three thirty |
| rahul | I just finished my homework | i try to finish my homework | i just finished my homework |
| rahul | the doctor said I need to rest | and understand i need to rest | the doctor said i need to rest |
| rahul | I don't think that's a good plan | i know that that's a grand plan | i don't think that's a great play |
| rahul | it was about forty dollars | it was about forty dollars | it was about forty dollars |
| rahul | where should I park | where should i be | where should i be |
| rahul | please call me back later | he taught me my leader | please call me by letter |
| rahul | could you say that again | could you say that again | could you say that again |
| rahul | that sounds like a great idea | it sounds like a great idea | it sounds like a great idea |
| rahul | thanks so much talk to you soon | so i'm not sure i do so | thanks so much |
| rahul | hi sorry I'm in the library right now | i'm in the library right now | i'm at the library right now |
| rahul | my number is the same as before | i got a pretty good example before i | my number is the same as before |
| rahul | did you get my email | can you get my email | can you get my email |
| rahul | how did the interview go | how can i feel at home | how can you know |
| rahul | I really like the new design | i really like the new design | i really like the new design |
| rahul | we need to book the tickets tonight | we need you more than a chance to die | we need to mark the test today |
| nilesh | hey can you hear me okay | and then you're going to be ok | can you tell me |
| nilesh | no I haven't heard back yet | no i haven't come in yet | okay i've got my name |
| nilesh | I'll be there in ten minutes | i'll be there in ten minutes | i'll be there in ten minutes |
| nilesh | what time does it start | ridiculously tall | we take this song |
| nilesh | can you speak a little louder | on monday and saturday | you must get down |
| nilesh | I'm running a little late | i'm going to look at it | i'm ready to leave |
| nilesh | let's meet tomorrow morning | tomorrow morning | hi it's tomorrow morning |
| nilesh | can you send me the link | or something like | do something like |
| nilesh | I'm not feeling very well today | i'm not feeling very well today | i'm not feeling very well to day |
| nilesh | I'll pick up the groceries on the way home | call me up don't stop me | come along me good don't start |
| nilesh | leave the package at the front door | leave the bags at the front door | i'll leave the bag inside the front door |
| nilesh | okay bye see you later | let me ask you again | okay my screen |
| nilesh | yes that works for me | that's how it works for me | yes that works for me |
| nilesh | sure go ahead | did you know that | sorry okay |
| nilesh | can we move it to three thirty | removing the green card | removing the window |
| nilesh | I just finished my homework | i also finished my week | i also finished my week |
| nilesh | the doctor said I need to rest | doctor said i can do this | the doctor said i did crazy |
| nilesh | I don't think that's a good plan | that's a good plan | i don't think that's a good plan |
| nilesh | it was about forty dollars | it was about forty dollars | it was about forty dollars |
| nilesh | where should I park | question number | where should i marry |
| nilesh | please call me back later | he's coming back here | so i'll be back later |
| nilesh | could you say that again | you say that again | you say that again |
| nilesh | that sounds like a great idea | it sounds like a great idea | that sounds like a great idea |
| nilesh | thanks so much talk to you soon | so i'm going to start | so please talk a little soon |
| nilesh | hi sorry I'm in the library right now | i'm in the library right now | i'm in the library right now |
| nilesh | my number is the same as before | my number is the same as before | my number is the same as before |
| nilesh | did you get my email | you get my email | can you get my email |
| nilesh | how did the interview go | how can you never know | how can i leave you here |
| nilesh | I really like the new design | i really like | i really like to do it |
| nilesh | we need to book the tickets tonight | but it's | and i don't play again today |
| sarvajith | hey can you hear me okay | can you hear me ok | hey can you hear me going |
| sarvajith | no I haven't heard back yet | no i haven't gone back yet | no i haven't heard back yet |
| sarvajith | I'll be there in ten minutes | i'll be there in ten minutes | i'll be there in ten minutes |
| sarvajith | what time does it start | what time does it start | what time does it start |
| sarvajith | can you speak a little louder | can you speak a little louder | can you speak a little louder |
| sarvajith | I'm running a little late | i'm running a little late | i'm running a little late |
| sarvajith | let's meet tomorrow morning | let's meet tomorrow morning | let's meet tomorrow morning |
| sarvajith | can you send me the link | can you tell me that like | can you send me the link |
| sarvajith | I'm not feeling very well today | i'm not feeling very well to day | i'm not feeling very well today |
| sarvajith | I'll pick up the groceries on the way home | i'll pick up the groceries on my way home | i'll pick up the groceries on my way home |
| sarvajith | leave the package at the front door | leave the package on the front door | leave the package at the front door |
| sarvajith | okay bye see you later | okay but see you later | okay buy see you later |
| sarvajith | yes that works for me | yes that was me | yes that works for me |
| sarvajith | sure go ahead | go ahead | sure go ahead |
| sarvajith | can we move it to three thirty | can we move it to thirty | can we move it to three thirty |
| sarvajith | I just finished my homework | i just finished my homework | i just finished my homework |
| sarvajith | the doctor said I need to rest | the doctor said i need rest | the doctor said i need to rest |
| sarvajith | I don't think that's a good plan | i don't think that's a good plan | i don't think that's a good plan |
| sarvajith | it was about forty dollars | it was about forty dollars | it was about forty dollars |
| sarvajith | where should I park | why don't you get married | why don't you come back |
| sarvajith | please call me back later | please call me back later | please call me back later |
| sarvajith | could you say that again | you say that again | could you say that again |
| sarvajith | that sounds like a great idea | that sounds like a great idea | that sounds like a great idea |
| sarvajith | thanks so much talk to you soon | thanks so much doctor | thanks so much |
| sarvajith | hi sorry I'm in the library right now | i started at the library right now | i'm at the library right now |
| sarvajith | my number is the same as before | my number is the same as before | my number is the same as before |
| sarvajith | did you get my email | did you get my email | did you get my email |
| sarvajith | how did the interview go | how did the interview go | how did the interview go |
| sarvajith | I really like the new design | i really like the new design | i really like the new design |
| sarvajith | we need to book the tickets tonight | we need to book the tickets to day | we did some birthdays today |
