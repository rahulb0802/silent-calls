# lora_cv5_feasibility_r8_attn_ffn_s300_lr0.0005

5-fold cross-validation by sentence on `feasibility` clips · rank 8, alpha 16, targets attn_ffn · 300 steps, lr 0.0005, batch 8

| who | stage | clips | top1_wer | exact@1 | exact@5 | exact@10 | oracle_wer@10 | within1@5 |
|---|---|---|---|---|---|---|---|---|
| ALL | before | 90 | 38% | 32% | 50% | 53% | 25% | 63% |
| ALL | step 100 | 90 | 31% | 42% | 54% | 59% | 19% | 70% |
| ALL | step 200 | 90 | 33% | 40% | 53% | 59% | 19% | 67% |
| ALL | after | 90 | 34% | 40% | 54% | 60% | 18% | 68% |
| rahul | before | 30 | 39% | 33% | 57% | 57% | 26% | 63% |
| rahul | step 100 | 30 | 23% | 43% | 60% | 67% | 9% | 77% |
| rahul | step 200 | 30 | 26% | 43% | 63% | 70% | 9% | 77% |
| rahul | after | 30 | 26% | 43% | 63% | 70% | 9% | 80% |
| nilesh | before | 30 | 57% | 13% | 23% | 23% | 42% | 40% |
| nilesh | step 100 | 30 | 57% | 17% | 23% | 23% | 43% | 40% |
| nilesh | step 200 | 30 | 59% | 13% | 23% | 23% | 42% | 33% |
| nilesh | after | 30 | 59% | 13% | 23% | 27% | 41% | 33% |
| sarvajith | before | 30 | 16% | 50% | 70% | 80% | 7% | 87% |
| sarvajith | step 100 | 30 | 11% | 67% | 80% | 87% | 5% | 93% |
| sarvajith | step 200 | 30 | 15% | 63% | 73% | 83% | 6% | 90% |
| sarvajith | after | 30 | 15% | 63% | 77% | 83% | 6% | 90% |

| user | sentence | before | after |
|---|---|---|---|
| rahul | hey can you hear me okay | hey can you hear me o k | hey can you hear me ok |
| rahul | no I haven't heard back yet | no i haven't heard back yet | no i have a good idea |
| rahul | I'll be there in ten minutes | i'll be there in ten minutes | i'll be there in ten minutes |
| rahul | what time does it start | what time is this going | what time does it start |
| rahul | can you speak a little louder | can you speak a little louder | can you speak a little louder |
| rahul | I'm running a little late | i'm running a little light | i'm running a little late |
| rahul | let's meet tomorrow morning | let's meet tomorrow morning | let's meet tomorrow morning |
| rahul | can you send me the link | can you tell me that | can you send me a letter |
| rahul | I'm not feeling very well today | i'm not feeling very well to day | i'm not feeling very well today |
| rahul | I'll pick up the groceries on the way home | i'll make up groceries on the way home | i'll become groceries on the way home |
| rahul | leave the package at the front door | if they buy each other very short | give the package to the front door |
| rahul | okay bye see you later | hurry up i see you later | okay i'll see you later |
| rahul | yes that works for me | it's not one for me | does that work for me |
| rahul | sure go ahead | sure go ahead | sure okay |
| rahul | can we move it to three thirty | and we move into three thirty | can we move into learning |
| rahul | I just finished my homework | i try to finish my homework | i just finished my homework |
| rahul | the doctor said I need to rest | and understand i need to rest | the doctor said i need to rest |
| rahul | I don't think that's a good plan | i know that that's a grand plan | i know that that's a great play |
| rahul | it was about forty dollars | it was about forty dollars | it was about forty dollars |
| rahul | where should I park | where should i be | where should i party |
| rahul | please call me back later | he taught me my leader | he saw me by little |
| rahul | could you say that again | could you say that again | could you say that again |
| rahul | that sounds like a great idea | it sounds like a great idea | it sounds like a great idea |
| rahul | thanks so much talk to you soon | so i'm not sure i do so | thank you so much |
| rahul | hi sorry I'm in the library right now | i'm in the library right now | i'm at the library right now |
| rahul | my number is the same as before | i got a pretty good example before i | my number is the same as before |
| rahul | did you get my email | can you get my email | can you get my email |
| rahul | how did the interview go | how can i feel at home | how can you go |
| rahul | I really like the new design | i really like the new design | i really like the new design |
| rahul | we need to book the tickets tonight | we need you more than a chance to die | we need to mark the test today |
| nilesh | hey can you hear me okay | and then you're going to be ok | i don't know me ok |
| nilesh | no I haven't heard back yet | no i haven't come in yet | don't ever come back again |
| nilesh | I'll be there in ten minutes | i'll be there in ten minutes | i'll be there in ten minutes |
| nilesh | what time does it start | ridiculously tall | what that does is talk |
| nilesh | can you speak a little louder | on monday and saturday | don't make it louder |
| nilesh | I'm running a little late | i'm going to look at it | i'm ready to leave |
| nilesh | let's meet tomorrow morning | tomorrow morning | hi tomorrow morning |
| nilesh | can you send me the link | or something like | there's something there |
| nilesh | I'm not feeling very well today | i'm not feeling very well today | i'm not feeling very well today |
| nilesh | I'll pick up the groceries on the way home | call me up don't stop me | come along me can you start me |
| nilesh | leave the package at the front door | leave the bags at the front door | i'll have them back inside the front door |
| nilesh | okay bye see you later | let me ask you again | am i straight |
| nilesh | yes that works for me | that's how it works for me | nice language for me |
| nilesh | sure go ahead | did you know that | did you know that |
| nilesh | can we move it to three thirty | removing the green card | they were moving all the way there |
| nilesh | I just finished my homework | i also finished my week | i'll just finish my homework |
| nilesh | the doctor said I need to rest | doctor said i can do this | the doctor said i did crazy |
| nilesh | I don't think that's a good plan | that's a good plan | that's a good plan |
| nilesh | it was about forty dollars | it was about forty dollars | and what's the better for you now |
| nilesh | where should I park | question number | where should i marry |
| nilesh | please call me back later | he's coming back here | because i'll be back later |
| nilesh | could you say that again | you say that again | you say the name |
| nilesh | that sounds like a great idea | it sounds like a great idea | that sounds like a great idea |
| nilesh | thanks so much talk to you soon | so i'm going to start | so please talk a little soon |
| nilesh | hi sorry I'm in the library right now | i'm in the library right now | yes i'm in the library right now |
| nilesh | my number is the same as before | my number is the same as before | my number is the same as before |
| nilesh | did you get my email | you get my email | can you get my email |
| nilesh | how did the interview go | how can you never know | how did that ever go |
| nilesh | I really like the new design | i really like | i really like to use |
| nilesh | we need to book the tickets tonight | but it's | but i don't believe it |
| sarvajith | hey can you hear me okay | can you hear me ok | hey can you hear me going |
| sarvajith | no I haven't heard back yet | no i haven't gone back yet | no i haven't heard back yet |
| sarvajith | I'll be there in ten minutes | i'll be there in ten minutes | i'll be there in ten minutes |
| sarvajith | what time does it start | what time does it start | what time does it start |
| sarvajith | can you speak a little louder | can you speak a little louder | can you speak a little louder |
| sarvajith | I'm running a little late | i'm running a little late | i'm running a little late |
| sarvajith | let's meet tomorrow morning | let's meet tomorrow morning | let's meet tomorrow morning |
| sarvajith | can you send me the link | can you tell me that like | can you say to me the like |
| sarvajith | I'm not feeling very well today | i'm not feeling very well to day | i'm not feeling very well today |
| sarvajith | I'll pick up the groceries on the way home | i'll pick up the groceries on my way home | i'll pick up the groceries on my way home |
| sarvajith | leave the package at the front door | leave the package on the front door | leave the package in the front door |
| sarvajith | okay bye see you later | okay but see you later | okay buy see you later |
| sarvajith | yes that works for me | yes that was me | yes that was me |
| sarvajith | sure go ahead | go ahead | sure go ahead |
| sarvajith | can we move it to three thirty | can we move it to thirty | can we move into thirty |
| sarvajith | I just finished my homework | i just finished my homework | i just finished my homework |
| sarvajith | the doctor said I need to rest | the doctor said i need rest | the doctor said i need to rest |
| sarvajith | I don't think that's a good plan | i don't think that's a good plan | i don't think that's a good plan |
| sarvajith | it was about forty dollars | it was about forty dollars | it was about forty dollars |
| sarvajith | where should I park | why don't you get married | why don't you get married |
| sarvajith | please call me back later | please call me back later | please call me back later |
| sarvajith | could you say that again | you say that again | could you say that again |
| sarvajith | that sounds like a great idea | that sounds like a great idea | that sounds like a great idea |
| sarvajith | thanks so much talk to you soon | thanks so much doctor | thanks so much |
| sarvajith | hi sorry I'm in the library right now | i started at the library right now | i'm at the library right now |
| sarvajith | my number is the same as before | my number is the same as before | my number is the same as before |
| sarvajith | did you get my email | did you get my email | did you get my email |
| sarvajith | how did the interview go | how did the interview go | how did the interview go |
| sarvajith | I really like the new design | i really like the new design | i really like the new design |
| sarvajith | we need to book the tickets tonight | we need to book the tickets to day | we need to put the test today |
