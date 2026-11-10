import test from 'node:test';
import assert from 'node:assert/strict';
import {isLiquidTexture,animatedLiquidAt,drawLiquidTile,liquidPalette,shorelinePixels,drawShoreline} from '../client/src/world/liquidTextures.js';
import {fromSaved,toSaved,isBlocked,canSpawnAt,findSpawn} from '../client/src/world/world.js';
test('liquid detection supports water and coloured liquids, explicit metadata and old saved names',()=>{
 for(const name of ['Reference water','Lava','Acid pool','Slime','Molten gold','Ocean'])assert.equal(isLiquidTexture({name}),true);
 assert.equal(isLiquidTexture({name:'Mystic goo',liquid:true}),true);
 assert.equal(isLiquidTexture({name:'Frozen lake ice',description:'Solid ice over water',liquid:false}),false);
 assert.equal(isLiquidTexture({name:'Dry mud',liquid:false}),false);
 assert.equal(isLiquidTexture({name:'Brick wall',description:'Red stone'}),false);
});
test('animation updates painted liquids on ordinary land and old painted water, excluding solid paint',()=>{
 const textures=[{id:'a',name:'Old custom finish'},{id:'b',name:'Acid'},{id:'c',name:'Stone'}];
 const world={terrain:['w','g','s'],paint:{0:{id:'a'},1:{id:'b'},2:{id:'c'}}};
 assert.equal(animatedLiquidAt(world,0,textures),true);assert.equal(animatedLiquidAt(world,1,textures),true);assert.equal(animatedLiquidAt(world,2,textures),false);
});
test('waves shift reference artwork and bubbles pop into ripples without blue recolouring',()=>{
 const palette=liquidPalette(new Uint8Array([200,40,0,255,220,60,0,255]));
 assert.ok(palette.every((color)=>{const [r,g,b]=color.match(/\d+/g).map(Number);return r>g&&g>b;}));
 const frames=[],source={};let marks=0;
 const ctx={imageSmoothingEnabled:true,fillStyle:'',drawImage(...args){frames.at(-1).push(args.slice(1));},fillRect(x,y,w,h){marks++;assert.ok(x>=0&&y>=0&&x+w<=16&&y+h<=16);assert.ok(palette.includes(this.fillStyle));}};
 for(let tick=0;tick<140;tick++){frames.push([]);drawLiquidTile(ctx,source,0,0,tick,palette);}
 assert.notDeepEqual(frames[0],frames[1]);assert.ok(marks>20);assert.equal(ctx.imageSmoothingEnabled,false);
});
test('liquid metadata survives map saves',()=>{
 const world=fromSaved({width:16,height:16,terrain:'g'.repeat(256),objects:'.'.repeat(256),placed:[],textures:[{id:'liquid',name:'Mystic goo',liquid:true}]});
 assert.equal(toSaved(world).textures[0].liquid,true);
});

function pond(){return {width:5,height:5,terrain:Array.from({length:25},(_,i)=>i%5>=1&&i%5<=3&&Math.floor(i/5)>=1&&Math.floor(i/5)<=3?'w':'g'),paint:{}};}
test('shoreline rounds exposed corners and varies straight shores without internal tile seams',()=>{
 const world=pond();assert.deepEqual(shorelinePixels(world,2,2,[]),[]);
 const corner=shorelinePixels(world,1,1,[]);assert.ok(corner.some((p)=>p.px===3&&p.py===3));
 const straight=shorelinePixels(world,2,1,[]);const depths=Array.from({length:16},(_,x)=>straight.filter((p)=>p.px===x).length);assert.ok(new Set(depths).size>1);assert.ok(straight.every((p)=>p.py<5));
 assert.ok(corner.every((p)=>p.px>=0&&p.py>=0&&p.px<16&&p.py<16));
});
test('diagonal land notches are softened and painted lava follows the same shoreline rules',()=>{
 const world={width:3,height:3,terrain:Array(9).fill('w'),paint:{}};world.terrain[0]='g';
 assert.ok(shorelinePixels(world,1,1,[]).some((p)=>p.px===0&&p.py===0));
 const lava={width:3,height:3,terrain:Array(9).fill('s'),paint:{4:{id:'lava'}}};
 const cuts=shorelinePixels(lava,1,1,[{id:'lava',name:'Lava',liquid:true}]);assert.ok(cuts.length>0);
 // Out-of-map neighbours continue the liquid rather than creating artificial banks.
 assert.deepEqual(shorelinePixels({width:1,height:1,terrain:['w']},0,0,[]),[]);
});
test('shoreline samples neighbouring materials, stays inside its tile and animates bank highlights',()=>{
 const cuts=shorelinePixels(pond(),1,1,[]),ground={},sources=[],fills=[];
 const ctx={drawImage(source,...args){assert.equal(source,ground);sources.push(args);},fillRect(x,y,w,h){assert.ok(x>=16&&y>=16&&x+w<=32&&y+h<=32);fills.push([x,y]);},save(){},restore(){}};
 drawShoreline(ctx,1,1,cuts,()=>ground,['#abcd00'],0);assert.equal(sources.length,cuts.length);const first=JSON.stringify(fills);fills.length=0;
 drawShoreline(ctx,1,1,cuts,()=>ground,['#abcd00'],1);assert.notEqual(JSON.stringify(fills),first);
});

test('all liquid-painted surfaces block walking and spawn, including mud over ordinary land',()=>{
 const world={width:12,height:12,terrain:Array(144).fill('g'),objects:Array(144).fill('.'),placed:[],npcs:[],textures:[]};
 for(const [offset,name] of ['Water','Lava','Mud','Muddy pool','Acid','Slime','Molten gold','Custom goo'].entries()){
   const x=3+offset%4,y=3+Math.floor(offset/4),i=y*12+x,id=String(offset);
   world.textures.push({id,name,...(name==='Custom goo'?{liquid:true}:{})});world.paint??={};world.paint[i]={id,surface:'ground'};
   assert.equal(isBlocked(world,x,y),true,name);assert.equal(canSpawnAt(world,x,y),false,name);
 }
 assert.equal(isBlocked(world,8,8),false);const spawn=findSpawn(world,{x:3,y:3});assert.ok(spawn);assert.equal(isBlocked(world,spawn.x,spawn.y),false);
 // Travel markers cannot make a liquid tile walkable.
 world.objects[3*12+3]='G';assert.equal(isBlocked(world,3,3),true);
});
test('liquid collisions persist after save/load and disappear when custom liquid paint is removed',()=>{
 const id='123456789012345678901234',world=fromSaved({width:12,height:12,terrain:'g'.repeat(144),objects:'.'.repeat(144),placed:[],textures:[{id,name:'Mud',liquid:true}],paint:{65:{id,surface:'ground'}}});
 const loaded=fromSaved(toSaved(world));assert.equal(isBlocked(loaded,5,5),true);delete loaded.paint[65];assert.equal(isBlocked(loaded,5,5),false);
 loaded.terrain[65]='w';assert.equal(isBlocked(loaded,5,5),true);
});
