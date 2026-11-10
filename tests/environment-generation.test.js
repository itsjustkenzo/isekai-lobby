import test from 'node:test';
import assert from 'node:assert/strict';
import {populateEnvironment,densityNoise} from '../server/environment-generation.js';
import {drawGroundTransitions} from '../client/src/world/groundTransitions.js';
import {readGeneratedMedia} from '../server/generated-map-media.js';
import {fromSaved,toSaved} from '../client/src/world/world.js';

function fixture(){
  const assets=['small','medium','large'].flatMap((size,k)=>['Tree','Flowers','Rock'].map((key,j)=>({id:`${k}${j}`.padStart(24,'0'),name:`${key} (${size})`,environmentKind:key,sizeVariant:size,width:1,height:1,solid:key!=='Flowers'})));
  const textures=[{id:'g',terrainCode:'g',surface:'ground'},{id:'d',terrainCode:'d',surface:'ground'},{id:'mud',terrainCode:'w',surface:'ground',liquid:true}];
  const collection={_id:'terrain',generatedAssets:assets,textures};
  const map={name:'Test',sourceTerrainId:'terrain',width:64,height:48,terrain:'g'.repeat(3072),objects:'.'.repeat(3072),placed:[],generatedAssets:assets,textures,paint:Object.fromEntries(Array.from({length:3072},(_,i)=>[i,{id:'g',surface:'ground'}])),spawn:{x:32,y:24}};
  return {map,collection};
}
test('seeded population is repeatable across chunk sizes, varied across seeds and uses native saved assets',()=>{
  const {map,collection}=fixture();
  const a=populateEnvironment(map,collection,'exterior',{},123),b=populateEnvironment(map,collection,'exterior',{},123,{chunkSize:7});
  assert.deepEqual(a,b);assert.notDeepEqual(a.placed,populateEnvironment(map,collection,'exterior',{},456).placed);
  assert.ok(a.placed.length>40&&a.placed.length<500);assert.deepEqual(a.generatedAssets,map.generatedAssets);
  assert.equal(new Set(a.placed.map(p=>p.y*64+p.x)).size,a.placed.length);
  assert.deepEqual(new Set(a.placed.map(p=>map.generatedAssets.find(a=>a.id===p.a).sizeVariant)),new Set(['small','medium','large']));
  assert.equal(map.placed.length,0);
});
test('liquids, clearings, paths, spawn and incompatible surfaces are excluded',()=>{
  const {map,collection}=fixture(),reserved=Array.from({length:64},(_,x)=>10*64+x);
  for(let y=0;y<48;y++)map.paint[y*64+20]={id:'mud',surface:'ground'};
  const result=populateEnvironment(map,collection,'exterior',{clearingCells:reserved,referenceRoadCells:Array.from({length:48},(_,y)=>y*64+40)},18);
  assert.ok(result.placed.every(p=>p.y!==10&&p.x!==20&&p.x!==40&&Math.hypot(p.x-32,p.y-24)>3));
  for(const i of reserved)assert.deepEqual(result.paint[i],map.paint[i]);
  for(let y=0;y<48;y++)assert.equal(result.paint[y*64+20].id,'mud');
});
test('new asset families and material rules are registered through data, with missing requirements recorded',()=>{
  const {map,collection}=fixture();const crystal={id:'custom',name:'Crystal',width:1,height:1,solid:false};
  collection.generatedAssets=[crystal];map.generatedAssets=[crystal];
  collection.environmentRules={assets:{Crystal:{role:'crystal',settings:['exterior'],weight:1,spacing:2,terrainCodes:['g']}},requiredAssets:['Crystal','Crystal debris'],surfaces:{g:{alternatives:[]}}};
  const result=populateEnvironment(map,collection,'exterior',{},19);
  assert.ok(result.placed.length>30);assert.ok(result.placed.every(p=>p.a==='custom'));
  assert.deepEqual(result.environmentReport.missingAssets,['Crystal debris']);assert.equal(result.environmentReport.patchCells,0);
  const indoor=populateEnvironment(map,collection,'interior',{},19);assert.equal(indoor.placed.length,0);
});
test('ground variation forms coherent nonrectangular patches and noise stays continuous at chunk seams',()=>{
  const {map,collection}=fixture(),result=populateEnvironment(map,collection,'exterior',{},123);
  const changed=Object.keys(result.paint).map(Number).filter(i=>result.paint[i].id==='d');
  assert.ok(changed.length>10);assert.ok(changed.filter(i=>[i-1,i+1,i-64,i+64].some(j=>result.paint[j]?.id==='d')).length/changed.length>.9);
  assert.ok(Math.abs(densityNoise(123,15.999,20)-densityNoise(123,16.001,20))<.001);
});
test('solid scattering cannot close a one-tile passage and respects minimum spacing',()=>{
  const {map,collection}=fixture();collection.generatedAssets=collection.generatedAssets.filter(a=>a.environmentKind==='Tree');map.generatedAssets=collection.generatedAssets;
  const objects=[...map.objects];for(let x=4;x<60;x++){objects[19*64+x]='N';objects[21*64+x]='N';}map.objects=objects.join('');
  const result=populateEnvironment(map,collection,'exterior',{},24);
  assert.ok(result.placed.every(p=>p.y!==20||p.x<4||p.x>=60));
  for(let i=0;i<result.placed.length;i++)for(let j=i+1;j<result.placed.length;j++)assert.ok(Math.hypot(result.placed[i].x-result.placed[j].x,result.placed[i].y-result.placed[j].y)>=2.4);
});
test('dry ground transitions use crisp neighbouring pixels and skip liquids and regular worlds',()=>{
  const map={sourceTerrainId:'terrain',width:2,height:1,terrain:'gg',paint:{0:{id:'a',surface:'ground'},1:{id:'b',surface:'ground'}}},calls=[],ctx={drawImage:(...args)=>calls.push(args)},source={};
  drawGroundTransitions(ctx,map,1,0,[],()=>source);assert.equal(calls.length,16);assert.equal(ctx.imageSmoothingEnabled,false);
  assert.ok(calls.every(args=>args[3]===args[7]&&args[4]===args[8]));
  calls.length=0;drawGroundTransitions(ctx,{...map,sourceTerrainId:undefined},1,0,[],()=>source);assert.equal(calls.length,0);
  drawGroundTransitions(ctx,map,1,0,[{id:'b',liquid:true}],()=>source);assert.equal(calls.length,0);
});

test('generation diagnostics survive prototype save/load and reject malformed metadata',()=>{
  const report={seed:123,biome:'terrain',added:12,patchCells:40,missingAssets:['Debris']};
  const map={width:32,height:24,terrain:'g'.repeat(768),objects:'.'.repeat(768),paint:{},placed:[],spawn:{x:16,y:12},environmentReport:report};
  assert.deepEqual(readGeneratedMedia({environmentReport:report},map).environmentReport,report);
  assert.deepEqual(toSaved(fromSaved(map)).environmentReport,report);
  for(const invalid of [{...report,seed:-1},{...report,added:999999},{...report,missingAssets:[{}]}])assert.equal(readGeneratedMedia({environmentReport:invalid},map),null);
});
