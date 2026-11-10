import test from 'node:test';
import assert from 'node:assert/strict';
import { canTill, drawSoilPatch } from '../client/src/world/farming.js';
import { createDefaultWorld, createInterior, fromSaved, toSaved, snapshot, restore } from '../client/src/world/world.js';

function field() {
  const world = createDefaultWorld();
  const i = 6 * world.width + 6;
  world.objects[i] = '.'; world.objects[i + 1] = '.';
  world.farmCells = [i, i + 1];
  return { world, i };
}

test('only marked, clear grass within one tile can be tilled', () => {
  const {world,i} = field();
  assert.equal(canTill(world,6,6,{x:6,y:7}),true);
  assert.equal(canTill(world,6,6,{x:8,y:8}),false);
  assert.equal(canTill(world,5,6,{x:6,y:6}),false);
  world.terrain[i]='w';assert.equal(canTill(world,6,6),false);
  world.terrain[i]='g';world.objects[i]='G';assert.equal(canTill(world,6,6),false);
  world.objects[i]='.';world.restCells=[i];assert.equal(canTill(world,6,6),false);
  world.restCells=[];world.occupied={[i]:{a:'bed'}};assert.equal(canTill(world,6,6),false);
  world.occupied={};world.npcs=[{x:6,y:6}];assert.equal(canTill(world,6,6),false);
  assert.equal(canTill(createInterior(),6,6),false);
});

test('soil joins at shared edges without modifying base terrain or creator textures', () => {
  const {world,i} = field();
  world.paint = {[i]:{surface:'ground',id:'0123456789abcdef01234567'}};
  const before = toSaved(world);
  const rects = [];
  const ctx = {fillStyle:'',fillRect(...args) {rects.push(args);}};
  drawSoilPatch(ctx,world,6,6,new Set([i]));
  assert.deepEqual(rects[0],[98,98,12,12]);
  rects.length=0;
  drawSoilPatch(ctx,world,6,6,new Set([i,i+1]));
  assert.deepEqual(rects[0],[98,98,14,12]);
  assert.deepEqual(toSaved(world),before);
  rects.length=0;drawSoilPatch(ctx,world,6,6,new Set());assert.equal(rects.length,0);
});

test('farmable areas survive saving and undo; runtime tilled state is excluded from world saves', () => {
  const {world,i} = field();
  const before=snapshot(world);world.farmCells=[];restore(world,before);
  assert.deepEqual(world.farmCells,[i,i+1]);
  assert.deepEqual(fromSaved(toSaved(world)).farmCells,[i,i+1]);
  world.tilled=new Set([i]);assert.equal(toSaved(world).tilled,undefined);
});
