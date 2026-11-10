import test from 'node:test';
import assert from 'node:assert/strict';
import {connectTerrainPaths} from '../server/terrain-paths.js';
import {addTreeBoundary} from '../server/terrain-boundary.js';
function fixture(){return {width:32,height:24,terrain:'g'.repeat(768),objects:'.'.repeat(768),paint:{},generatedAssets:[{id:'tree',environmentKind:'Tree',width:1,height:1,solid:true},{id:'house',environmentKind:'Building',width:3,height:3,solid:true}],textures:[{id:'grass',terrainCode:'g',surface:'ground'},{id:'path',terrainCode:'d',surface:'ground'}],placed:[{a:'house',x:24,y:12}],spawn:{x:5,y:12}};}
test('wall-free maps allow edge spawns and connect buildings in the former reserved border',()=>{
  const map=fixture();map.spawn={x:0,y:1};map.placed=[{a:'house',x:27,y:2}];
  const result=connectTerrainPaths(map);assert.deepEqual(result.spawn,map.spawn);assert.equal(result.terrain[3*32+28],'d');
});
test('connects a building entrance through vegetation, preserves border and saved artwork',()=>{
  const map=fixture();for(let y=4;y<22;y++)map.placed.push({a:'tree',x:15,y});
  const bordered=addTreeBoundary(map),result=connectTerrainPaths(bordered);
  assert.equal(result.terrain[13*32+25],'d');assert.ok(result.placed.some(p=>p.a==='house'));
  assert.ok(!result.placed.some(p=>p.a==='tree'&&p.x===15&&[12,13].includes(p.y)));
  for(const p of bordered.placed.filter(p=>p.x<2||p.x>=30||p.y<4||p.y>=22))assert.ok(result.placed.some(q=>q.x===p.x&&q.y===p.y&&q.a===p.a));
  assert.deepEqual(result.generatedAssets,bordered.generatedAssets);assert.deepEqual(connectTerrainPaths(bordered),result);assert.equal(map.terrain.includes('d'),false);
});
test('routes around liquid and connects a clearing without painting over the river',()=>{
  const map=fixture(),terrain=[...map.terrain];for(let y=4;y<18;y++)terrain[y*32+16]='w';map.terrain=terrain.join('');
  const result=connectTerrainPaths(addTreeBoundary(map),{clearingCells:[20*32+25,20*32+26,21*32+25,21*32+26]});
  for(let y=4;y<18;y++)assert.equal(result.terrain[y*32+16],'w');
  assert.ok([18,19,20,21].some(y=>result.terrain[y*32+16]==='d'));
});
test('rejects isolated destinations, including custom liquid paint on land',()=>{
  const map=fixture();map.textures.push({id:'mud',name:'Mud',surface:'ground',terrainCode:'g',liquid:true});
  for(let y=4;y<22;y++)map.paint[y*32+16]={id:'mud',surface:'ground'};
  assert.throws(()=>connectTerrainPaths(addTreeBoundary(map)),/separate an important map destination/);
});
