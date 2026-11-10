import test from 'node:test';
import assert from 'node:assert/strict';
import {initialMechanicPreview,movePreview,performPreview} from '../client/src/mechanicPreview.js';
const action={name:'Strike',category:'combat',target:'nearby',range:1,cooldown:2};
test('preview enforces range and cooldown and modifies only temporary target health',()=>{
  const source=initialMechanicPreview();assert.match(performPreview(source,action,1000,'dummy').message,/out of range/);assert.equal(source.lastUsed,null);
  const nearby={...source,player:{x:6,y:4,dx:1,dy:0}},hit=performPreview(nearby,action,1000,'dummy');assert.equal(hit.targets[1].health,2);assert.equal(source.targets[1].health,3);
  const blocked=performPreview(hit,action,2000,'dummy');assert.equal(blocked.targets[1].health,2);assert.match(blocked.message,/Cooling down/);
  assert.equal(performPreview(hit,action,3000,'dummy').targets[1].health,1);
});
test('movement stays in bounds, respects solid targets and directional actions require facing',()=>{
  const source={...initialMechanicPreview(),player:{x:6,y:4,dx:-1,dy:0}};
  assert.equal(movePreview(source,1,0).player.x,6);
  assert.match(performPreview(source,{...action,target:'direction'},0,'dummy').message,/Face the target/);
  const dash=performPreview(source,{...action,category:'movement',target:'self',range:32},0);assert.equal(dash.player.x,0);assert.equal(source.player.x,6);
});
test('gathering consumes practice tree resources and reset produces fresh state',()=>{
  const source={...initialMechanicPreview(),player:{x:6,y:2,dx:1,dy:0}},gather={...action,category:'gathering',cooldown:0};
  const result=performPreview(source,gather,100,'tree');assert.equal(result.resources,1);assert.equal(result.targets[0].health,2);assert.equal(initialMechanicPreview().resources,0);
  assert.match(performPreview({...source,player:{x:6,y:4,dx:1,dy:0}},gather,0,'dummy').message,/practice tree/);
});
test('self actions and custom signals run without executing description text',()=>{
  for(const [category,key] of [['emote','emotes'],['interaction','interactions'],['custom','signals']]){
    const result=performPreview(initialMechanicPreview(),{...action,category,target:'self',description:'arbitrary text'},0);assert.equal(result[key],1);
  }
});
test('generated effects use their validated amounts and healing stays within practice limits',()=>{
  const behavior={effect:'damage',amount:2,animation:'swing',duration:500,resourceName:''};
  const state={...initialMechanicPreview(),player:{x:6,y:4,dx:1,dy:0}};
  assert.equal(performPreview(state,{...action,behavior},0,'dummy').targets[1].health,1);
  assert.equal(performPreview(state,{...action,target:'self',behavior:{...behavior,effect:'heal',amount:20}},0).health,10);
});
