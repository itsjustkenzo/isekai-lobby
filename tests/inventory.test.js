import { PNG } from 'pngjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { inventorySettings,itemCatalog,starterInventory,inventoryAction,addItems } from '../client/src/world/inventory.js';
import { readInventoryConfig } from '../server/inventory.js';
import { createDefaultWorld,toSaved,fromSaved } from '../client/src/world/world.js';
const art = new PNG({width:1,height:1});art.data.set([100,140,50,255]);
const image = `data:image/png;base64,${PNG.sync.write(art).toString('base64')}`;
const hoe={id:'0123456789abcdef01234567',name:'Hoe',kind:'hoe',description:'Garden tool'};
function game(capacity=20){return {equipment:[hoe],inventory:{...inventorySettings(null),enabled:true,capacity,items:[{id:'carrot',name:'Carrot seeds',description:'Seeds',image,category:'seed',stackLimit:99}],startingItems:[{itemId:`equipment:${hoe.id}`,quantity:1},{itemId:'carrot',quantity:120}]}};}
const at={map:'main',inside:null,x:5,y:5};
test('starter bag stacks seeds at 99 and equipment at 1 with five reference shortcuts',()=>{
 const world=game(),state=starterInventory(world);
 assert.deepEqual(state.slots.map(s=>s.quantity),[1,99,21]);assert.equal(state.hotbar.length,5);
 assert.equal(state.hotbar[0],`equipment:${hoe.id}`);assert.equal(state.slots.length,3);
 assert.throws(()=>starterInventory(game(2)),/do not fit/);
});
test('atomic addition rejects overflow without modifying existing quantities',()=>{
 const world=game(3),state=starterInventory(world),before=structuredClone(state),seed=itemCatalog(world)[0];
 assert.equal(addItems(state,seed,100,3),null);assert.deepEqual(state,before);
});
test('moving a stack into the first row assigns its key without duplicating items',()=>{
 const world=game(),state=starterInventory(world);
 const selected=inventoryAction(state,{type:'select',itemId:`equipment:${hoe.id}`},world);
 const moved=inventoryAction(selected,{type:'move',slotKey:'slot-1',toIndex:8},world);
 assert.equal(moved.hotbar[0],null);assert.equal(moved.slots.length,state.slots.length);
 assert.equal(moved.slots.find(s=>s.key==='slot-1').position,8);
 const returned=inventoryAction(moved,{type:'move',slotKey:'slot-1',toIndex:4},world);
 assert.equal(returned.hotbar[4],`equipment:${hoe.id}`);assert.equal(returned.slots.find(s=>s.key==='slot-1').quantity,1);
 assert.throws(()=>inventoryAction(state,{type:'select',itemId:'not-owned'},world),/do not have/);
 assert.throws(()=>inventoryAction(state,{type:'move',slotKey:'not-owned',toIndex:0},world),/Invalid/);
 assert.throws(()=>inventoryAction(state,{type:'move',slotKey:'slot-1',toIndex:20},world),/Invalid/);
});
test('swapping first-row items swaps shortcuts and keeps stack quantities',()=>{
 const world=game(),state=starterInventory(world);
 const swapped=inventoryAction(state,{type:'move',slotKey:'slot-1',toIndex:1},world);
 assert.equal(swapped.hotbar[0],'carrot');assert.equal(swapped.hotbar[1],`equipment:${hoe.id}`);
 assert.equal(swapped.slots.find(s=>s.key==='slot-2').quantity,99);
});
test('optional drop/discard are enforced; collection is nearby and full bags preserve drops',()=>{
 const world=game(3),state=starterInventory(world);
 assert.throws(()=>inventoryAction(state,{type:'drop',slotKey:'slot-1',quantity:1,location:at,dropId:'one'},world),/disabled/);
 world.inventory.allowDrop=true;
 const dropped=inventoryAction(state,{type:'drop',slotKey:'slot-1',quantity:1,location:at,dropId:'one'},world);
 assert.equal(dropped.slots.length,2);assert.equal(dropped.drops.length,1);
 assert.throws(()=>inventoryAction(dropped,{type:'pickup',dropId:'one',location:{...at,x:20}},world),/Stand beside/);
 const filled=addItems(dropped,itemCatalog(world)[0],99,3);
 assert.throws(()=>inventoryAction(filled,{type:'pickup',dropId:'one',location:at},world),/Bag full/);
 assert.equal(filled.drops.length,1);
 const collected=inventoryAction(dropped,{type:'pickup',dropId:'one',location:at},world);
 assert.equal(collected.drops.length,0);assert.equal(collected.slots.length,3);
 assert.throws(()=>inventoryAction(collected,{type:'discard',slotKey:collected.slots[0].key,quantity:1},world),/disabled/);
});
test('removing the last owned item clears selection and its hotbar references',()=>{
 const world=game();world.inventory.allowDiscard=true;
 let state=starterInventory(world);state=inventoryAction(state,{type:'select',itemId:`equipment:${hoe.id}`},world);
 state=inventoryAction(state,{type:'discard',slotKey:'slot-1',quantity:1},world);
 assert.equal(state.selectedId,null);assert.equal(state.hotbar[0],null);
});
test('sorting consolidates stacks and recomputes shortcuts from first-row positions',()=>{
 const world=game(),state=starterInventory(world);state.slots.push({key:'slot-4',itemId:'carrot',quantity:5});state.selectedId='carrot';
 const sorted=inventoryAction(state,{type:'sort'},world);
 assert.equal(sorted.slots.filter(s=>s.itemId==='carrot').reduce((n,s)=>n+s.quantity,0),125);
 assert.equal(sorted.slots.length,3);assert.equal(sorted.selectedId,'carrot');assert.deepEqual(sorted.hotbar,Array.from({length:5},(_,i)=>sorted.slots.find(s=>s.position===i)?.itemId??null));
});
test('capacity reductions retain existing items and reject new slots',()=>{
 const world=game(),state=starterInventory(world);world.inventory.capacity=1;
 assert.equal(inventoryAction(state,{type:'select',itemId:'carrot'},world).slots.length,3);
 assert.equal(addItems(state,itemCatalog(world)[1],1,1),null);
});
test('creator settings are validated and survive world saves',()=>{
 const world=game();const config=readInventoryConfig(world.inventory,world.equipment);
 assert.equal(config.capacity,20);assert.equal(config.hotbarSize,5);
 assert.throws(()=>readInventoryConfig({...config,capacity:0},world.equipment),/capacity/);
 assert.throws(()=>readInventoryConfig({...config,startingItems:[{itemId:'unknown',quantity:1}]},world.equipment),/starting/);
 assert.throws(()=>readInventoryConfig({...config,capacity:1},world.equipment),/do not fit/);
 const map=createDefaultWorld();map.inventory=config;assert.deepEqual(fromSaved(toSaved(map)).inventory,config);
});

test('changing starter grants never refills or overwrites an existing player bag',()=>{
 const world=game();const existing=starterInventory(world);
 world.inventory.startingItems.push({itemId:'carrot',quantity:50});
 const continued=inventoryAction(existing,{type:'sort'},world);
 assert.equal(continued.slots.filter(s=>s.itemId==='carrot').reduce((n,s)=>n+s.quantity,0),120);
 assert.equal(starterInventory(world).slots.filter(s=>s.itemId==='carrot').reduce((n,s)=>n+s.quantity,0),170);
});

test('item asset images are mandatory and corrupt images are rejected',()=>{
 const world=game();
 for (const missing of [undefined, '', null]) {
   const config=structuredClone(world.inventory);config.items[0].image=missing;
   assert.throws(()=>readInventoryConfig(config,world.equipment),/Asset image required/);
 }
 const corrupt=structuredClone(world.inventory);corrupt.items[0].image='not-an-image';
 assert.throws(()=>readInventoryConfig(corrupt,world.equipment),/artwork/);
 assert.equal(readInventoryConfig(world.inventory,world.equipment).items[0].image,image);
});

test('discard and pickup leave other positions fixed and refill empty cells',()=>{
 const world=game();world.inventory.allowDrop=true;
 const state=starterInventory(world);
 const dropped=inventoryAction(state,{type:'drop',slotKey:'slot-1',quantity:1,location:at,dropId:'hoe-drop'},world);
 assert.equal(dropped.hotbar[0],null);assert.equal(dropped.hotbar[1],'carrot');
 const picked=inventoryAction(dropped,{type:'pickup',dropId:'hoe-drop',location:at},world);
 assert.equal(picked.hotbar[0],`equipment:${hoe.id}`);assert.equal(picked.slots.find(s=>s.key==='slot-2').position,1);
});
