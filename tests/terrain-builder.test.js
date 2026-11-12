import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { ObjectId } from 'mongodb';
import { PNG } from 'pngjs';
import { generateTerrainCategory, terrainInput, mountTerrainBuilder } from '../server/terrain-builder.js';
import { assembleTerrainMap, analyzeTerrainLayout, selectTerrainCollection, collectionsForMapKind } from '../server/terrain-map.js';
import { blueprintToMap, MAP_PALETTE } from '../server/dream-map.js';
import { readGeneratedMedia } from '../server/generated-map-media.js';
import { fromSaved, toSaved, setAssets, isBlocked } from '../client/src/world/world.js';

function png(width=24,height=32,transparent=true){
  const image=new PNG({width,height});
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(!transparent||(x>1&&x<width-2&&y>1&&y<height-2))image.data.set([80,140,60,255],(y*width+x)*4);
  return PNG.sync.write(image);
}
const terrain={_id:new ObjectId(),title:'Grassland Plains',description:'Green grass, trees and a clear river'};

test('AI selects an existing terrain and detects interior/exterior from the image alone',async()=>{
  const previous=process.env.OPENROUTER_API_KEY;process.env.OPENROUTER_API_KEY='test-key';
  const desert={_id:new ObjectId(),title:'Desert',description:'Sand, dry rocks and cacti'};
  try {
    const result=await selectTerrainCollection(png(),[terrain,desert],async(url,options)=>{
      assert.equal(url,'https://openrouter.ai/api/v1/chat/completions');
      const body=JSON.parse(options.body),content=body.messages[0].content;
      assert.equal(body.response_format.type,'json_schema');
      assert.deepEqual(body.response_format.json_schema.schema.properties.terrainId.enum,[String(terrain._id),String(desert._id)]);
      assert.match(content[0].text,/never a map name/);assert.match(content[0].text,/Desert/);assert.equal(content[1].type,'image_url');
      return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({terrainId:String(desert._id),kind:'exterior',reason:'Dry sand and sparse desert vegetation'})}}]})};
    });
    assert.equal(result.terrainId,String(desert._id));assert.equal(result.kind,'exterior');
    const inside=await selectTerrainCollection(png(),[terrain],async()=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({terrainId:String(terrain._id),kind:'interior',reason:'Enclosed room and wooden floors'})}}]})}));
    assert.equal(inside.kind,'interior');
  }finally{if(previous===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=previous;}
});

test('automatic selection rejects invented IDs and skips paid calls for an empty library',async()=>{
  const previous=process.env.OPENROUTER_API_KEY;process.env.OPENROUTER_API_KEY='test-key';
  try {
    let calls=0;
    await assert.rejects(selectTerrainCollection(png(),[],async()=>{calls++;}),/Assets Builder first/);assert.equal(calls,0);
    for(const [terrainId,kind,message] of [[String(new ObjectId()),'exterior',/unavailable terrain/],[String(terrain._id),'unknown',/Invalid terrain selection/]]) {
      await assert.rejects(selectTerrainCollection(png(),[terrain],async()=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({terrainId,kind,reason:'Detected setting'})}}]})})),message);
    }
  }finally{if(previous===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=previous;}
});

test('terrain form accepts title and description and rejects missing or excessive input',()=>{
  assert.deepEqual(terrainInput({title:' Grassland ',description:' Green grass '}),{title:'Grassland',description:'Green grass'});
  for(const value of [{},{title:' ',description:'trees'},{title:'a'.repeat(81),description:'trees'},{title:'Land',description:'x'.repeat(2001)}])assert.equal(terrainInput(value),null);
});

test('selection requests the closest available approximation rather than requiring an exact image match',async()=>{
  const previous=process.env.OPENROUTER_API_KEY;process.env.OPENROUTER_API_KEY='test-key';
  try{
    const result=await selectTerrainCollection(png(),[terrain],async(_url,options)=>{
      const body=JSON.parse(options.body),prompt=body.messages[0].content[0].text;
      assert.equal(body.response_format.json_schema.schema.properties.terrainId.type,'string');
      assert.match(prompt,/An exact biome, art-style or object match is NOT required/);assert.match(prompt,/explain the substitutions/);
      return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({terrainId:null,kind:'exterior',reason:'The photograph differs in season and building style.'})}}]})};
    });
    assert.equal(result.terrainId,String(terrain._id));assert.match(result.reason,/only available terrain as an approximation/);
  }finally{if(previous===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=previous;}
});

test('built-in builder generates separate native tree variants with one-tile bases',async()=>{
  const prompts=[];
  const result=await generateTerrainCategory(terrain,'trees',async prompt=>{prompts.push(prompt);const [,w,h]=prompt.match(/Separate native (\d+) by (\d+)/);return png(Number(w)*4,Number(h)*4);},png());
  assert.ok(result.assets.every(a=>!a.originalArtwork));
  assert.equal(prompts.length,3);assert.ok(prompts.every(p=>p.includes('Grassland Plains')));
  assert.deepEqual(result.assets.map(a=>{const image=PNG.sync.read(Buffer.from(a.spriteUrl.split(',')[1],'base64'));return [image.width,image.height];}).sort((a,b)=>a[0]-b[0]),[[24,32],[36,48],[48,64]]);
  assert.ok(result.assets.every(a=>a.width===1&&a.height===1));
  assert.ok(readGeneratedMedia({generatedAssets:result.assets,textures:[]},{placed:[],paint:{}}));
});

test('texture generation produces validated seamless paint and retains material codes',async()=>{
  const result=await generateTerrainCategory(terrain,'paint',async()=>png(16,16,false),png());
  assert.ok(result.textures.every(t=>!t.originalArtwork));
  assert.equal(result.textures.length,7);assert.ok(result.textures.some(t=>t.terrainCode==='wall'));
  assert.ok(readGeneratedMedia({generatedAssets:[],textures:result.textures},{placed:[],paint:{}}));
});

test('map assembly reuses exact saved images and IDs, persists provenance and blocks liquids',async()=>{
  const trees=await generateTerrainCategory(terrain,'trees',async prompt=>{const [,w,h]=prompt.match(/Separate native (\d+) by (\d+)/);return png(Number(w)*4,Number(h)*4);},png());
  const paints=await generateTerrainCategory(terrain,'paint',async()=>png(16,16,false),png());
  const liquids=await generateTerrainCategory(terrain,'liquid',async()=>png(16,16,false),png());
  const collection={...terrain,generatedAssets:trees.assets,textures:[...paints.textures,...liquids.textures]};
  const blueprint=new PNG({width:16,height:16});
  for(let i=0;i<256;i++)blueprint.data.set([...MAP_PALETTE[0].color,255],i*4);
  blueprint.data.set([...MAP_PALETTE[5].color,255],(4*16+4)*4);
  blueprint.data.set([...MAP_PALETTE[2].color,255],(5*16+5)*4);
  const map=assembleTerrainMap(blueprintToMap(PNG.sync.write(blueprint),{width:16,height:16}),collection,'exterior');
  assert.deepEqual(map.generatedAssets,trees.assets);assert.equal(map.sourceTerrainId,String(terrain._id));assert.equal(map.placed.length,1);
  assert.ok(map.textures.every(t=>collection.textures.some(original=>original.id===t.id&&original.image===t.image)));
  assert.ok(readGeneratedMedia(map,map));setAssets(map.generatedAssets);
  const loaded=fromSaved(map);assert.equal(isBlocked(loaded,5,5),true);assert.equal(toSaved(loaded).sourceTerrainId,map.sourceTerrainId);
  const noTrees=assembleTerrainMap(blueprintToMap(PNG.sync.write(blueprint),{width:16,height:16}),{...collection,generatedAssets:[]},'exterior');
  assert.equal(noTrees.placed.length,0);assert.equal(noTrees.objects[4*16+4],'.');
});

test('failed category requests do not return partial artwork',async()=>{
  await assert.rejects(generateTerrainCategory(terrain,'trees',async()=>{throw new Error('provider failure');},png()),/provider failure/);
});

test('terrain API enforces sessions and ownership before paid generation',async()=>{
  const app=express();app.use(express.json());let queries=[],calls=0;
  const userId=new ObjectId();
  mountTerrainBuilder(app,{auth:(req,res,next)=>{if(req.headers['x-test-user']!=='owner')return res.sendStatus(401);req.user={_id:userId};next();},terrains:{findOne:async query=>{queries.push(query);return null;}},generating:new Set(),generateCategory:async()=>{calls++;return {};}});
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  try{
    const base=`http://127.0.0.1:${server.address().port}`;
    assert.equal((await fetch(`${base}/api/terrains`)).status,401);
    const result=await fetch(`${base}/api/terrains/${new ObjectId()}/generate/trees`,{method:'POST',headers:{'x-test-user':'owner'}});
    assert.equal(result.status,404);assert.equal(calls,0);assert.equal(String(queries[0].userId),String(userId));
  }finally{await new Promise(resolve=>server.close(resolve));}
});

test('layout interpreter uses chat analysis and rejects invented symbols',async()=>{
  const previous=process.env.OPENROUTER_API_KEY;process.env.OPENROUTER_API_KEY='test-key';
  try{
    const image=await analyzeTerrainLayout(png(),{width:16,height:16},'exterior','',async(url,options)=>{
      assert.equal(url,'https://openrouter.ai/api/v1/chat/completions');assert.match(JSON.parse(options.body).messages[0].content[0].text,/Do not generate or supply artwork/);
      return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({rows:Array(16).fill('g'.repeat(16))})}}]})};
    });assert.equal(PNG.sync.read(image).width,16);
    await assert.rejects(analyzeTerrainLayout(png(),{width:16,height:16},'exterior','',async()=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({rows:Array(16).fill('Z'.repeat(16))})}}]})})),/Invalid map blueprint/);
  }finally{if(previous===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=previous;}
});

test('explicit exterior mode excludes indoor collections and cannot be overridden by AI classification',async()=>{
  const outdoor={...terrain,kind:'exterior'},indoor={_id:new ObjectId(),kind:'interior',textures:[{surface:'floor'}]};
  assert.deepEqual(collectionsForMapKind([outdoor,indoor],'exterior'),[outdoor]);
  assert.deepEqual(collectionsForMapKind([outdoor,indoor],'interior'),[indoor]);
  const previous=process.env.OPENROUTER_API_KEY;process.env.OPENROUTER_API_KEY='test';
  try{
    const selected=await selectTerrainCollection(png(),[outdoor],async(url,options)=>{
      assert.match(JSON.parse(options.body).messages[0].content[0].text,/explicitly selected exterior/);
      return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({terrainId:String(outdoor._id),kind:'interior',reason:'Selected terrain'})}}]})};
    },'exterior');
    assert.equal(selected.kind,'exterior');
  }finally{if(previous===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=previous;}
});
