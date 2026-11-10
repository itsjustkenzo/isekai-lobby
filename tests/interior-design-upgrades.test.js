import test from 'node:test';
import assert from 'node:assert/strict';
import {interiorFootprint,isSurfaceDecor,validSurfacePlacement} from '../client/src/interiorGeometry.js';
import {furnishInterior} from '../server/interior-furnishing.js';
import {pruneTerrainAsset} from '../server/terrain-deletion.js';
import {setAssets,fromSaved,toSaved} from '../client/src/world/world.js';
import {drawInteriorLightingTile} from '../client/src/world/interiorLighting.js';

function fixture(){
  const width=20,height=20,objects=Array(400).fill('.');
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(y<3||x===0||x===19||y===19)objects[y*20+x]='N';
  objects[19*20+10]='.';
  const assets=[{id:'table',name:'Oak table',assetKind:'Furniture',width:2,height:1,solid:true},{id:'lamp',name:'Table lamp',assetKind:'Indoor prop',width:1,height:1,solid:true}];
  return {map:{kind:'indoor',wallRows:3,width,height,terrain:'o'.repeat(400),objects:objects.join(''),paint:{},placed:[],spawn:{x:10,y:18},generatedAssets:assets,textures:[]},collection:{generatedAssets:assets}};
}

test('native footprints distinguish seating and beds; floor lamps are not tabletop decor',()=>{
  assert.deepEqual(interiorFootprint({assetKind:'Furniture',name:'Chair'}),{width:1,height:1});
  assert.deepEqual(interiorFootprint({assetKind:'Furniture',name:'Bed'}),{width:2,height:2});
  assert.deepEqual(interiorFootprint({assetKind:'Furniture',name:'Sofa'}),{width:2,height:1});
  assert.equal(isSurfaceDecor({assetKind:'Indoor prop',name:'Standing floor lamp'}),false);
});

test('tabletop attachment survives save/load, adds no occupied tile and is removed with its support',()=>{
  const {map,collection}=fixture();
  const group={type:'focal',zone:'west',primaryAssetId:'table',secondaryAssetId:'',accentAssetId:'lamp',count:1,x:3,y:6};
  const result=furnishInterior(map,[group],collection,{preserveReference:true});
  const lamp=result.placed.find(p=>p.a==='lamp');assert.ok(lamp.supportAssetId);
  assert.equal(validSurfacePlacement(lamp,result.placed,collection.generatedAssets),true);
  assert.equal(validSurfacePlacement(lamp,[],collection.generatedAssets),false);
  setAssets(collection.generatedAssets);
  try{
    const world=fromSaved(result),saved=toSaved(world);assert.deepEqual(saved.placed,result.placed);
    assert.equal(world.occupied[lamp.y*20+lamp.x].a,'table');
  }finally{setAssets([]);}
  const cleaned=pruneTerrainAsset({placed:result.placed},'table');assert.equal(cleaned.placed.length,0);
});

test('reference anchors are preserved and distant relocation is avoided',()=>{
  const {map,collection}=fixture(),group={type:'focal',zone:'east',primaryAssetId:'table',secondaryAssetId:'',accentAssetId:'',count:1,x:3,y:6};
  const result=furnishInterior(map,[group],collection,{preserveReference:true});
  assert.equal(result.placed[0].x,3);assert.equal(result.placed[0].y,6);
});

test('indoor floor rendering includes warm light and contact shadows while exteriors stay untouched',()=>{
  const {map,collection}=fixture();map.placed=[{a:'table',x:3,y:6},{a:'lamp',x:3,y:6,supportAssetId:'table',elevation:10}];
  const fills=[],ctx={fillRect(){fills.push(this.fillStyle);}};
  drawInteriorLightingTile(ctx,map,3,6,collection.generatedAssets);
  assert.ok(fills.some(c=>c.startsWith('rgba(255,184,80,')));
  assert.ok(fills.includes('rgba(24,18,30,.22)'));
  fills.length=0;drawInteriorLightingTile(ctx,{...map,kind:'outdoor'},3,6,collection.generatedAssets);assert.equal(fills.length,0);
});
