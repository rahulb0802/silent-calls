const {test}=require('node:test');
const assert=require('node:assert/strict');
const {HoldKey}=require('../electron/hold-key.cjs');
test('emits only configured key transitions, ignores repeats and unrelated keys',()=>{
  const events=[];const gate=new HoldKey(66,type=>events.push(type));
  gate.up(66);gate.down(30);gate.up(30);gate.down(66);gate.down(66);gate.up(30);gate.up(66);gate.up(66);
  assert.deepEqual(events,['down','up']);
  gate.down(66);gate.up(66);assert.deepEqual(events,['down','up','down','up']);
});
