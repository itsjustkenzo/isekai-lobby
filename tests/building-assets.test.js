import test from 'node:test';
import assert from 'node:assert/strict';
import {PNG} from 'pngjs';
import {ObjectId} from 'mongodb';
import express from 'express';
import {readBuildingSpec,analyzeBuilding,generateBuildingAsset,mountBuildingAssets} from '../server/building-assets.js';
import {assembleTerrainMap,generateMapFromTerrain} from '../server/terrain-map.js';
import {MAP_PALETTE} from '../server/dream-map.js';
import {connectTerrainPaths} from '../server/terrain-paths.js';
import {readGeneratedMedia} from '../server/generated-map-media.js';
import {fromSaved,toSaved,setAssets,isBlocked} from '../client/src/world/world.js';
function image(w,h){const png=new PNG({width:w,height:h});for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++)png.data.set([90,80,65,255],(y*w+x)*4);return PNG.sync.write(png);}
const spec=()=>readBuildingSpec({type:'Watchtower',setting:'Medieval stone fortress',width:3,height:3,floors:3});
function fixture(){const id=String(new ObjectId()),b=spec(),asset={id,name:'Watchtower',width:b.width,height:b.height,solid:true,assetKind:'Building',building:{...b,sourceId:id},spriteUrl:`data:image/png;base64,${image(b.width*16,b.artHeight).toString('base64')}`};const texture={id:String(new ObjectId()),name:'Grass',surface:'ground',terrainCode:'g',liquid:false,image:`data:image/png;base64,${image(16,16).toString('base64')}`};return {asset,collection:{_id:new ObjectId(),generatedAssets:[asset],textures:[texture]}};}
test('analysis assigns bounded footprints and uses a reference without manual size input',async()=>{
  const previous=process.env.OPENROUTER_API_KEY;process.env.OPENROUTER_API_KEY='test';
  try{const b=await analyzeBuilding('Tall tower',image(32,64),async(_url,options)=>{const body=JSON.parse(options.body);assert.equal(body.messages[0].content[1].type,'image_url');return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(spec())}}]})};});assert.equal(b.width,3);assert.equal(b.artHeight,128);assert.equal(b.entranceX,1);
    assert.equal(readBuildingSpec({...spec(),width:100}),null);
  }finally{if(previous===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=previous;}
});
test('artwork is fitted to exact native tile dimensions from analyzed proportions',async()=>{
  const result=await generateBuildingAsset('Tall tower',image(32,64),{analyze:async()=>spec(),imageRequest:async prompt=>{assert.match(prompt,/48 by 128 logical pixels/);assert.match(prompt,/Reconstruct the concept as a FRONT-FACING RPG building/);assert.match(prompt,/Do not compress, shear, stretch, unfold/);assert.match(prompt,/Do not transfer side-wall windows/);return image(96,256);}});const png=PNG.sync.read(result.sprite);assert.equal(png.width,48);assert.equal(png.height,128);
});
test('selected buildings relocate to dry space, retain taller art and connect their entrance after save/load',()=>{
  const {asset,collection}=fixture(),terrain=Array(32*24).fill('g');terrain[12*32+15]='w';collection.textures.push({...collection.textures[0],id:String(new ObjectId()),terrainCode:'w',liquid:true});
  const base={width:32,height:24,terrain:terrain.join(''),objects:'.'.repeat(768),spawn:{x:5,y:12},propPlacements:[{kind:'Building',buildingId:asset.id,x:15,y:12}]};
  const assembled=assembleTerrainMap(base,collection,'exterior');assert.equal(assembled.placed.length,1);const p=assembled.placed[0];assert.notDeepEqual({x:p.x,y:p.y},{x:15,y:12});
  const map=connectTerrainPaths(assembled);assert.ok(readGeneratedMedia(map,map));setAssets(map.generatedAssets);const loaded=fromSaved(map),saved=toSaved(loaded);
  assert.deepEqual(saved.generatedAssets[0].building,asset.building);assert.equal(isBlocked(loaded,p.x,p.y),true);assert.equal(isBlocked(loaded,p.x+asset.building.entranceX,p.y+1),false);
  assert.equal(map.terrain[12*32+15],'w');assert.equal(readGeneratedMedia({...map,generatedAssets:[{...asset,building:{...asset.building,artHeight:999}}]},map),null);
});
test('building generation requires authentication before analysis and saves only owner-scoped data',async()=>{
  const owner=new ObjectId(),rows=[];let calls=0;const app=express();
  mountBuildingAssets(app,{auth:(req,res,next)=>{if(!req.headers['x-user'])return res.sendStatus(401);req.user={_id:owner};next();},buildings:{insertOne:async row=>rows.push(row)},generating:new Set(),generate:async()=>{calls++;return {spec:spec(),sprite:image(48,128)};}});
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  try{const url=`http://127.0.0.1:${server.address().port}/api/building-assets?description=Stone+tower`;assert.equal((await fetch(url,{method:'POST'})).status,401);assert.equal(calls,0);const response=await fetch(url,{method:'POST',headers:{'x-user':'yes','Content-Type':'image/png'},body:image(32,64)});assert.equal(response.status,201);assert.equal(String(rows[0].userId),String(owner));assert.equal(calls,1);}
  finally{await new Promise(r=>server.close(r));}
});
test('map generation embeds the explicitly selected building and does not invent structures when none are requested',async()=>{
  const {asset,collection}=fixture();
  const analyze=placements=>async(_ref,size,_kind,description)=>{
    assert.match(description,/never invent a cabin/);assert.ok(description.includes(asset.id));
    const png=new PNG({width:size.width,height:size.height});for(let i=0;i<size.width*size.height;i++)png.data.set([...MAP_PALETTE[0].color,255],i*4);
    const buffer=PNG.sync.write(png);buffer.dressing={regions:[],patches:[],placements};return buffer;
  };
  const map=await generateMapFromTerrain(Buffer.from('reference'),640,480,'Tower map','','exterior',collection,analyze([{kind:'Building',buildingId:asset.id,x:20,y:18}]));
  assert.equal(map.placed.filter(p=>p.a===asset.id).length,1);assert.ok(readGeneratedMedia(map,map));
  const empty=await generateMapFromTerrain(Buffer.from('reference'),640,480,'Natural scene','','exterior',collection,analyze([]));assert.equal(empty.placed.length,0);
});
