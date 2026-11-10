import test from 'node:test';
import assert from 'node:assert/strict';
import {PNG} from 'pngjs';
import {ObjectId} from 'mongodb';
import {applyTerrainDressing} from '../server/terrain-dressing.js';
import {assembleTerrainMap,analyzeTerrainLayout,generateMapFromTerrain} from '../server/terrain-map.js';
import {readGeneratedMedia} from '../server/generated-map-media.js';
import {setAssets,fromSaved,toSaved} from '../client/src/world/world.js';

const polygon=(type,terrain,points,density='medium')=>({type,terrain,points:points.map(([x,y])=>({x,y})),width:1,density});
function png(width,height){const p=new PNG({width,height});p.data.fill(255);return `data:image/png;base64,${PNG.sync.write(p).toString('base64')}`;}
function fixture(){
  const collection={_id:new ObjectId(),generatedAssets:[...['small','medium','large'].map((size,i)=>({id:new ObjectId().toString(),name:`Tree (${size})`,environmentKind:'Tree',sizeVariant:size,width:1,height:1,solid:true,spriteUrl:png([24,36,48][i],[32,48,64][i])})),{id:new ObjectId().toString(),name:'Bush (small)',environmentKind:'Bush',sizeVariant:'small',width:1,height:1,solid:true,spriteUrl:png(24,20)}],textures:['g','d','w'].map(code=>({id:new ObjectId().toString(),name:code,terrainCode:code,surface:'ground',...(code==='w'?{liquid:true}:{}),image:png(16,16)}))};
  const terrain=Array(32*24).fill('g');for(let y=0;y<24;y++)terrain[y*32+16]='d';for(let x=0;x<32;x++)terrain[23*32+x]='w';
  return {collection,map:{name:'Woodland',width:32,height:24,terrain:terrain.join(''),objects:'.'.repeat(768),spawn:{x:24,y:12},assetHints:{},placed:[],npcs:[],interiors:{},links:{}}};
}

test('forest regions create coherent tree stands over connected ground patches, not isolated scattering',()=>{
  const {map,collection}=fixture();
  const regions=[polygon('forest','d',[[1,1],[14,1],[14,22],[1,22]],'dense'),polygon('clearing','g',[[5,7],[10,7],[10,13],[5,13]])];
  const result=assembleTerrainMap(applyTerrainDressing(map,{regions},collection,'exterior'),collection,'exterior');
  const trees=result.placed.filter(p=>collection.generatedAssets.find(a=>a.id===p.a)?.environmentKind==='Tree');
  assert.ok(trees.length>25);assert.ok(trees.every(p=>p.x>=1&&p.x<14&&p.y>=1&&p.y<22));
  assert.ok(trees.every(p=>!(p.x>=5&&p.x<10&&p.y>=7&&p.y<13)));
  const withNeighbor=trees.filter(p=>trees.some(q=>p!==q&&Math.hypot(p.x-q.x,p.y-q.y)<=3));
  assert.ok(withNeighbor.length/trees.length>.9,'A woodland should form a connected-looking stand');
  for(let y=0;y<24;y++)assert.equal(result.terrain[y*32+16],map.terrain[y*32+16]);
  assert.equal(result.terrain[9*32+7],'g');assert.equal(result.terrain[4*32+6],'d');
  assert.ok(trees.some(p=>result.paint[p.y*32+p.x].id===collection.textures.find(t=>t.terrainCode==='d').id));
  assert.ok(readGeneratedMedia(result,result));setAssets(result.generatedAssets);const saved=toSaved(fromSaved(result));
  assert.deepEqual(saved.placed,result.placed);assert.deepEqual(saved.paint,result.paint);
});

test('treelines follow a planned path and avoid original roads, liquid and spawn space',()=>{
  const {map,collection}=fixture();
  const line=polygon('treeline','keep',[[1,4],[12,5],[19,4],[30,6]],'dense');line.width=2;
  const result=applyTerrainDressing(map,{regions:[line]},collection,'exterior');
  const trees=result.propPlacements.filter(p=>p.kind==='Tree');assert.ok(trees.length>=10);
  assert.ok(trees.every(p=>p.y>=2&&p.y<=8));assert.ok(trees.every(p=>Math.abs(p.x-16)>1));
  assert.ok(trees.every(p=>map.terrain[p.y*32+p.x]!=='w'));
  assert.deepEqual(result,applyTerrainDressing(map,{regions:[line]},collection,'exterior'));
});

test('clearings override vegetation in blueprint hints and explicit decorations',()=>{
  const {map,collection}=fixture();map.assetHints.Tree=[8*32+8];
  const objects=[...map.objects];objects[8*32+8]='T';map.objects=objects.join('');
  const plan={regions:[polygon('forest','keep',[[1,1],[14,1],[14,20],[1,20]],'dense'),polygon('clearing','keep',[[5,5],[11,5],[11,11],[5,11]])],placements:[{kind:'Tree',x:7,y:7}]};
  const dressed=applyTerrainDressing(map,plan,collection,'exterior');assert.deepEqual(dressed.assetHints.Tree,[]);assert.equal(dressed.objects[8*32+8],'.');
  assert.ok(dressed.propPlacements.every(p=>!(p.x>=5&&p.x<11&&p.y>=5&&p.y<11)));
});

test('composition does not invent unavailable plants or turn interiors into forests',()=>{
  const {map,collection}=fixture();const regions=[polygon('forest','keep',[[1,1],[12,1],[12,20],[1,20]])];
  assert.deepEqual(applyTerrainDressing(map,{regions},{...collection,generatedAssets:[]},'exterior').propPlacements,[]);
  const inside={...map,terrain:'o'.repeat(768),interior:true};assert.deepEqual(applyTerrainDressing(inside,{regions},collection,'interior').propPlacements,[]);
  assert.throws(()=>applyTerrainDressing(map,{regions:[{...regions[0],points:[{x:-1,y:0},{x:5,y:5},{x:0,y:5}]}]},collection,'exterior'),/Invalid landscape region/);
});

test('structured AI regions reach the generated map as connected paint and tree stands',async()=>{
  const {collection}=fixture(),previous=process.env.OPENROUTER_API_KEY;process.env.OPENROUTER_API_KEY='test';
  try{
    const result=await generateMapFromTerrain(Buffer.from('reference'),640,480,'Landscape','','exterior',collection,async(reference,size,kind,description)=>analyzeTerrainLayout(reference,size,kind,description,async(_url,options)=>{
      const request=JSON.parse(options.body);assert.ok(request.response_format.json_schema.schema.properties.regions);assert.ok(request.response_format.json_schema.schema.required.includes('regions'));
      assert.match(request.messages[0].content[0].text,/COMPOSITION FIRST/);
      return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({rows:Array(size.height).fill('g'.repeat(size.width)),regions:[polygon('forest','d',[[1,1],[25,1],[25,30],[1,30]],'dense'),polygon('clearing','g',[[8,8],[17,8],[17,17],[8,17]])],patches:[],placements:[]})}}]})};
    }));
    assert.ok(result.placed.length>60);assert.ok([...result.terrain].filter(t=>t==='d').length>400);
    // The clearing remains open, with a dry path allowed to reach its centre.
    assert.ok(['g','d'].includes(result.terrain[12*result.width+12]));
    assert.equal(result.placed.some(p=>p.x===12&&p.y===12),false);assert.ok(readGeneratedMedia(result,result));
  }finally{if(previous===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=previous;}
});
