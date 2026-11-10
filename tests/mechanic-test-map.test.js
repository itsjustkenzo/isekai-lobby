import test from 'node:test';
import assert from 'node:assert/strict';
import {createMechanicTestMap} from '../client/src/mechanicTestMap.js';
import {initialMechanicPreview} from '../client/src/mechanicPreview.js';
import {isBlocked} from '../client/src/world/world.js';
test('mechanics map uses normal terrain and collision with a clear player spawn',()=>{
  const world=createMechanicTestMap(initialMechanicPreview());assert.equal(world.width,12);assert.equal(world.height,8);
  assert.ok(world.terrain.includes('g'));assert.ok(world.terrain.includes('d'));assert.equal(isBlocked(world,3,4),false);
  assert.equal(isBlocked(world,7,2),true);assert.equal(isBlocked(world,7,4),true);assert.equal(isBlocked(world,-1,4),true);
});
test('test map instances own their mutable terrain, objects and target state',()=>{
  const state=initialMechanicPreview(),first=createMechanicTestMap(state);first.objects[2*12+7]='.';first.terrain[0]='w';
  const second=createMechanicTestMap(state);assert.equal(second.objects[2*12+7],'T');assert.equal(second.terrain[0],'g');assert.equal(state.targets[0].health,3);
  const removed=createMechanicTestMap({...state,targets:state.targets.map(t=>({...t,health:0}))});assert.equal(isBlocked(removed,7,2),false);
});
