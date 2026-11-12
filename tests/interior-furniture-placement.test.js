import test from 'node:test';
import assert from 'node:assert/strict';
import {ObjectId} from 'mongodb';
import {PNG} from 'pngjs';
import {terrainPropKind} from '../server/terrain-prop-kind.js';
import {dressingSchema} from '../server/terrain-dressing.js';
import {generateMapFromTerrain} from '../server/terrain-map.js';
import {readGeneratedMedia} from '../server/generated-map-media.js';
import {setAssets,fromSaved,toSaved} from '../client/src/world/world.js';

test('interior layout accepts saved furniture and indoor prop categories',()=>{
  assert.equal(terrainPropKind({assetKind:'Furniture',name:'Oak dining table'}),'Table');
  assert.equal(terrainPropKind({assetKind:'Furniture',name:'Wooden wardrobe'}),'Furniture');
  assert.equal(terrainPropKind({assetKind:'Indoor prop',name:'Candle'}),'Indoor prop');
  const schema=dressingSchema({width:16,height:18},'interior');
  assert.ok(schema.placements.items.properties.kind.enum.includes('Furniture'));
  assert.ok(schema.placements.items.properties.kind.enum.includes('Indoor prop'));
});

test('generated interior places exact saved furnishings and retains them through save/load',async()=>{
  const image=(w,h)=>{const p=new PNG({width:w,height:h});p.data.fill(100);for(let i=3;i<p.data.length;i+=4)p.data[i]=255;return `data:image/png;base64,${PNG.sync.write(p).toString('base64')}`;};
  const assets=[['Oak table','Furniture',2],['Wardrobe','Furniture',2],['Oak chair','Furniture',1]].map(([name,assetKind,width])=>({id:new ObjectId().toString(),name,assetKind,width,height:1,solid:true,spriteUrl:image(width*16,32)}));
  const textures=[['floor','o'],['wall','wall']].map(([surface,terrainCode])=>({id:new ObjectId().toString(),name:surface,surface,terrainCode,image:image(16,16)}));
  const collection={_id:new ObjectId(),kind:'interior',title:'Tavern',generatedAssets:assets,textures};
  const map=await generateMapFromTerrain(Buffer.from('reference'),1024,1024,'Tavern','','interior',collection,async(reference,size,kind,description)=>{
    assert.match(description,new RegExp(assets[1].id));
    const png=new PNG(size);for(let i=0;i<png.data.length;i+=4)png.data.set([170,115,67,255],i);
    const buffer=PNG.sync.write(png);
    buffer.dressing={regions:[],patches:[],placements:assets.map((asset,i)=>({kind:terrainPropKind(asset),assetId:asset.id,buildingId:'',x:3+i*4,y:5}))};
    return buffer;
  });
  assert.deepEqual(new Set(map.placed.map(p=>p.a)),new Set(assets.map(a=>a.id)));
  assert.ok(readGeneratedMedia(map,map));
  setAssets(assets);
  try{const saved=toSaved(fromSaved(map));assert.deepEqual(saved.placed,map.placed);assert.equal(saved.generatedAssets.length,3);}finally{setAssets([]);}
});
