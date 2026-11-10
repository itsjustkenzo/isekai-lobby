import test from 'node:test';
import assert from 'node:assert/strict';
import {furnishInterior} from '../server/interior-furnishing.js';
import {analyzeTerrainLayout} from '../server/terrain-map.js';

function fixture(){
  const width=20,height=20,objects=Array(width*height).fill('.');
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(y<3||x===0||x===width-1||y===height-1)objects[y*width+x]='N';
  objects[19*width+10]='.';
  const assets=[{id:'pew',name:'Oak pew',assetKind:'Furniture',width:3,height:1,solid:true},{id:'altar',name:'Altar',assetKind:'Furniture',width:4,height:1,solid:true},{id:'table',name:'Table',assetKind:'Furniture',width:2,height:1,solid:true},{id:'chair',name:'Chair',assetKind:'Furniture',width:1,height:1,solid:true}];
  return {map:{width,height,objects:objects.join(''),terrain:'o'.repeat(width*height),spawn:{x:10,y:18},paint:{},textures:[],placed:[]},collection:{generatedAssets:assets}};
}
const group=(type,zone,primaryAssetId,secondaryAssetId='',count=1)=>({type,zone,primaryAssetId,secondaryAssetId,accentAssetId:'',count});

test('church groups create aligned pew rows, a north altar and an open entrance aisle',()=>{
  const {map,collection}=fixture(),result=furnishInterior(map,[group('focal','north','altar'),group('seating_rows','west','pew','',4),group('seating_rows','east','pew','',4)],collection);
  assert.equal(result.furnishingReport.completed,3);
  assert.equal(result.placed.filter(p=>p.a==='pew').length,8);
  assert.ok(result.placed.find(p=>p.a==='altar').y<7);
  const occupied=new Set();
  for(const p of result.placed){const asset=collection.generatedAssets.find(a=>a.id===p.a);for(let dx=0;dx<asset.width;dx++){
    const i=p.y*map.width+p.x+dx;assert.equal(occupied.has(i),false);occupied.add(i);
    if(p.y>=7)assert.ok(Math.abs(p.x+dx-10)>1);
  }}
  assert.equal(map.placed.length,0);
});

test('dining members move together and unsafe oversized groups are omitted',()=>{
  const {map,collection}=fixture(),result=furnishInterior(map,[group('dining','west','table','chair')],collection);
  assert.equal(result.placed.length,3);
  const table=result.placed.find(p=>p.a==='table'),chairs=result.placed.filter(p=>p.a==='chair');
  assert.deepEqual(chairs.map(p=>p.y),[table.y,table.y]);
  assert.deepEqual(chairs.map(p=>p.x),[table.x-1,table.x+2]);
  collection.generatedAssets.push({id:'huge',width:30,height:30,solid:true});
  const tooBig=furnishInterior(map,[group('focal','north','huge')],collection);
  assert.equal(tooBig.placed.length,0);assert.equal(tooBig.furnishingReport.omitted,1);
  assert.throws(()=>furnishInterior(map,[group('dining','west','missing')],collection),/saved asset/);
});

test('layout analysis requests functional groups for text-only interior generation',async()=>{
  const previous=process.env.OPENROUTER_API_KEY;process.env.OPENROUTER_API_KEY='test';
  try{
    const result=await analyzeTerrainLayout(null,{width:16,height:18},'interior','Church',async(url,options)=>{
      const body=JSON.parse(options.body);assert.equal(body.messages[0].content.length,1);
      assert.match(body.messages[0].content[0].text,/seating_rows/);
      assert.ok(body.response_format.json_schema.schema.required.includes('furnishingGroups'));
      return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({rows:Array(18).fill('o'.repeat(16)),regions:[],patches:[],placements:[],furnishingGroups:[]})}}]})};
    });
    assert.deepEqual(result.dressing.furnishingGroups,[]);
  }finally{if(previous===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=previous;}
});
