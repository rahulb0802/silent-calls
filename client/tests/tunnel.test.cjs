const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {Tunnel}=require('../electron/tunnel.cjs');

const config={host:'h',user:'u',key:'/k',remotePort:8000};
function fakeChild(){const c=new EventEmitter();c.stderr=new EventEmitter();c.stderr.setEncoding=()=>{};c.killed=false;c.kill=()=>{c.killed=true;c.emit('exit');};return c;}

test('reuses a tunnel that already answers, without starting ssh',async()=>{
  let spawned=0;
  const t=new Tunnel(config,{spawnFn:()=>{spawned++;return fakeChild();},healthFn:async()=>true,exists:()=>true});
  assert.deepEqual(await t.ensure(8000),{ok:true,mode:'existing',message:'GPU reachable.'});
  assert.equal(spawned,0);
});

test('starts ssh with a local forward and waits until the GPU answers',async()=>{
  let calls=0,args;const child=fakeChild();
  const t=new Tunnel(config,{spawnFn:(cmd,a)=>{args=a;return child;},healthFn:async()=>++calls>2,exists:()=>true});
  const r=await t.ensure(8000);
  assert.equal(r.ok,true);assert.equal(r.mode,'started');
  assert.ok(args.includes('8000:localhost:8000') && args.includes('u@h') && args.includes('BatchMode=yes'));
  t.stop();assert.equal(child.killed,true);
});

test('reports a missing key and an ssh that exits',async()=>{
  const missing=new Tunnel(config,{spawnFn:fakeChild,healthFn:async()=>false,exists:()=>false});
  assert.match((await missing.ensure(8000)).message,/SSH key not found/);
  const child=fakeChild();
  const t=new Tunnel(config,{spawnFn:()=>{setTimeout(()=>{child.stderr.emit('data','Permission denied (publickey).');child.emit('exit');},50);return child;},healthFn:async()=>false,exists:()=>true});
  const r=await t.ensure(8000);
  assert.equal(r.ok,false);assert.match(r.message,/Permission denied/);
});
