const {test}=require('node:test');
const assert=require('node:assert/strict');
const {LocalVoice,parseDecision}=require('../electron/local-voice.cjs');

function connected(){
  const voice=new LocalVoice(()=>{});
  const sent=[];const listeners={};
  voice.socket={readyState:1,bufferedAmount:0,send:data=>sent.push(JSON.parse(data)),close(){},addEventListener:(type,fn)=>{listeners[type]=fn;}};
  voice.state={...voice.state,connection:'connected'};
  return {voice,sent,deliver:message=>voice.handleMessage(JSON.stringify(message))};
}

test('parseDecision keeps valid options and drops malformed ones',()=>{
  const d=parseDecision({utterance_id:'u1',route:'choose',options:[{text:'a',prob:0.6,p_jev:0.5},{text:'',prob:0.2},{text:'b',prob:2}],timings_ms:{jev:80}});
  assert.deepEqual(d,{utteranceId:'u1',route:'choose',options:[{text:'a',prob:0.6,jev:true}],jev:true,timings:{jev:80}});
  assert.equal(parseDecision({utterance_id:'u1',route:'shout',options:[]}),null);
});

test('decide sends candidates without auto-speak and resolves with the decision',async()=>{
  const {voice,sent,deliver}=connected();
  const pending=voice.decide({utteranceId:'u1',candidates:[{text:'hi server',score:-1},{text:'',score:0}],vocab:['Sarvajith']});
  assert.deepEqual(sent,[{type:'candidates',utterance_id:'u1',candidates:[{text:'hi server',score:-1}],vocab:['Sarvajith'],me:'',auto_speak:false}]);
  deliver({type:'decision',utterance_id:'u1',route:'choose',options:[{text:'hi server',prob:0.9,p_jev:null}],timings_ms:{}});
  assert.equal((await pending).options[0].text,'hi server');
  deliver({type:'repair',utterance_id:'u1',text:'hi Sarvajith'});
  assert.deepEqual(voice.snapshot().repair,{utteranceId:'u1',text:'hi Sarvajith'});
});

test('decide resolves null when the service errors or is not connected',async()=>{
  const {voice,deliver}=connected();
  const pending=voice.decide({utteranceId:'u2',candidates:[{text:'x',score:0}],vocab:[]});
  deliver({type:'error',message:'boom'});
  assert.equal(await pending,null);
  const offline=new LocalVoice(()=>{});
  assert.equal(await offline.decide({utteranceId:'u3',candidates:[{text:'x',score:0}],vocab:[]}),null);
});

test('live captions update in place and give way to the finished line',()=>{
  const {voice,deliver}=connected();
  deliver({type:'caption',speaker:'them',text:'Hi, this',final:false});
  deliver({type:'caption',speaker:'them',text:'Hi, this is Sarv',final:false});
  assert.deepEqual(voice.snapshot().liveCaption,{speaker:'Other person',text:'Hi, this is Sarv'});
  assert.deepEqual(voice.snapshot().captions,[]);
  deliver({type:'caption',speaker:'them',text:'Hi, this is Sarvajith.'});
  assert.equal(voice.snapshot().liveCaption,null);
  assert.deepEqual(voice.snapshot().captions,[{speaker:'Other person',text:'Hi, this is Sarvajith.'}]);
});

test('names from the service are kept for the lip-reader',()=>{
  const {voice,deliver}=connected();
  deliver({type:'names',names:['rahul','priya','',5]});
  assert.deepEqual(voice.snapshot().callNames,['rahul','priya']);
});

test('co-pilot replies are kept with their facts, and an empty list clears them',()=>{
  const {voice,deliver}=connected();
  deliver({type:'copilot',for_line:'When are you free?',latency_ms:2300,steps:[{tool:'calendar',query:'next 7 days',results:2}],
    replies:[{text:"I'm free after 2.",facts:[{source:'calendar',detail:'Design review, Tue 1-2pm'},{source:'web',detail:'x'}]},{text:' ',facts:[]}]});
  const c=voice.snapshot().copilot;
  assert.deepEqual(c.replies,[{text:"I'm free after 2.",facts:[{source:'calendar',detail:'Design review, Tue 1-2pm'}]}]);
  assert.equal(c.latencyMs,2300);assert.equal(c.steps[0].tool,'calendar');
  deliver({type:'copilot',for_line:'',latency_ms:0,replies:[]});
  assert.equal(voice.snapshot().copilot,null);
});

test('review request and result',()=>{
  const {voice,sent,deliver}=connected();
  voice.review(['Rahul','',5]);
  assert.deepEqual(sent.at(-1),{type:'review',vocab:['Rahul']});
  assert.equal(voice.snapshot().review.pending,true);
  deliver({type:'review',summary:'Names were hard.',moments:3,latency_ms:9000,proposals:[{kind:'vocabulary',value:'Devansh',reason:'ask the bunch'},{kind:'delete',value:'x'}]});
  const r=voice.snapshot().review;
  assert.equal(r.pending,false);assert.deepEqual(r.proposals,[{kind:'vocabulary',value:'Devansh',reason:'ask the bunch'}]);
});
