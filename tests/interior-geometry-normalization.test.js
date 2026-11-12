import test from 'node:test';
import assert from 'node:assert/strict';
import {PNG} from 'pngjs';
import {normalizeInteriorCollection} from '../server/interior-geometry.js';

test('saved pale high-resolution furniture keeps its pixels when normalizing an older footprint',()=>{
  const source=new PNG({width:96,height:96});source.data.fill(255);
  const asset={id:'chair',name:'White chair',assetKind:'Furniture',width:2,height:1,pixelScale:3,spriteUrl:`data:image/png;base64,${PNG.sync.write(source).toString('base64')}`};
  const normalized=normalizeInteriorCollection({generatedAssets:[asset]}).generatedAssets[0];
  assert.equal(normalized.width,1);assert.equal(normalized.pixelScale,3);
  const image=PNG.sync.read(Buffer.from(normalized.spriteUrl.split(',')[1],'base64'));
  assert.equal(image.width,48);assert.equal(image.height,96);
  assert.ok(image.data.some((value,i)=>i%4===3&&value===255));
  assert.equal(asset.width,2);
});

test('broken saved furniture reports which asset needs attention',()=>{
  assert.throws(()=>normalizeInteriorCollection({generatedAssets:[{name:'Broken chair',assetKind:'Furniture',width:2,height:1,spriteUrl:'broken'}]}),/Broken chair/);
});
