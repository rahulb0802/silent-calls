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
  assert.deepEqual(sent,[{type:'candidates',utterance_id:'u1',candidates:[{text:'hi server',score:-1}],vocab:['Sarvajith'],auto_speak:false}]);
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
