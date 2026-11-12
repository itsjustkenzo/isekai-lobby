import test from 'node:test';
import assert from 'node:assert/strict';
import {PNG} from 'pngjs';
import {environmentVariants,environmentVariantIndex,normalizeEnvironmentFootprints,treeSprite,restoreShrunkNatureSprites} from '../server/environment-variants.js';
function sprite(){const png=new PNG({width:32,height:48});for(let y=0;y<48;y++)for(let x=0;x<32;x++)png.data.set([31,100,50,255],(y*32+x)*4);return PNG.sync.write(png);}
test('environment sizes preserve pixel colours, bottom anchoring and collision footprint',()=>{
 const variants=environmentVariants(sprite(),{id:'old',name:'Tree',width:2,height:2,solid:true});
 assert.deepEqual(variants.map((a)=>a.sizeVariant),['small','medium','large']);assert.equal(new Set(variants.map((a)=>a.id)).size,3);
 const counts=variants.map((asset)=>{assert.equal(asset.width,1);assert.equal(asset.height,1);assert.equal(asset.solid,true);const png=PNG.sync.read(Buffer.from(asset.spriteUrl.split(',')[1],'base64'));assert.equal(png.height,{small:32,medium:48,large:64}[asset.sizeVariant]);let opaque=0;for(let i=0;i<png.data.length;i+=4)if(png.data[i+3]){opaque++;assert.deepEqual([...png.data.subarray(i,i+4)],[31,100,50,255]);}assert.equal(png.data[(((png.height-1)*png.width)+Math.floor(png.width/2))*4+3],255);return opaque;});
 assert.ok(counts[0]<counts[1]&&counts[1]<=counts[2]);
});
test('rocks, bushes and flowers vary while furniture retains its designed size',()=>{
 for(const name of ['Rock','Bush','Flowers','Potted plant'])assert.equal(environmentVariants(sprite(),{name,width:2,height:2}).length,3);
 for(const name of ['Building','Bed','Table'])assert.equal(environmentVariants(sprite(),{name,width:2,height:2}).length,1);
 const choices=new Set();for(let y=0;y<16;y++)for(let x=0;x<16;x++){const value=environmentVariantIndex(x,y,3);choices.add(value);assert.equal(value,environmentVariantIndex(x,y,3));}assert.equal(choices.size,3);
});

test('older generated environment assets become one tile while IDs, placements and furniture remain intact',()=>{
 const original={id:'tree',name:'Tree (small)',environmentKind:'Tree',sizeVariant:'small',width:2,height:2,spriteUrl:`data:image/png;base64,${sprite().toString('base64')}`};
 const furniture={...original,id:'bed',name:'Bed',environmentKind:undefined};
 const map={generatedAssets:[original,furniture],placed:[{a:'tree',x:4,y:5}]};
 const updated=normalizeEnvironmentFootprints(map);assert.equal(updated.generatedAssets[0].width,1);assert.equal(updated.generatedAssets[0].height,1);assert.equal(updated.generatedAssets[0].id,'tree');assert.deepEqual(updated.placed,map.placed);assert.equal(updated.generatedAssets[1],furniture);assert.equal(original.width,2);
 assert.deepEqual(normalizeEnvironmentFootprints(updated),updated);
});

test('tree conversion never magnifies existing source pixels to achieve a taller canvas',()=>{
 const source=new PNG({width:8,height:8});for(let y=0;y<8;y++)for(let x=0;x<8;x++)source.data.set([x*20,y*20,30,255],(y*8+x)*4);
 const result=treeSprite(source,'large');assert.equal(result.height,64);assert.equal(result.width,8);
 for(let y=0;y<8;y++)for(let x=0;x<8;x++)assert.deepEqual([...result.data.subarray(((56+y)*8+x)*4,((56+y)*8+x)*4+4)],[x*20,y*20,30,255]);
});

test('high-resolution tree migration preserves exact artwork and placement counts across repeated reloads',()=>{
  const assets=['small','medium','large'].map((size,n)=>{
    const height=[96,144,192][n],png=new PNG({width:height*3/4,height});
    for(let i=0;i<png.data.length;i+=4)png.data.set([30,100,50,255],i);
    return {id:'tree-'+size,name:'Oak ('+size+')',environmentKind:'Tree',sizeVariant:size,width:1,height:1,pixelScale:3,spriteUrl:'data:image/png;base64,'+PNG.sync.write(png).toString('base64')};
  });
  const map={generatedAssets:assets,placed:assets.map((a,i)=>({a:a.id,x:3+i*3,y:7}))};
  let loaded=structuredClone(map);
  for(let n=0;n<3;n++)loaded=normalizeEnvironmentFootprints(JSON.parse(JSON.stringify(loaded)));
  assert.deepEqual(loaded,map);
});

test('known shrunken trees recover from exact source IDs, without replacing intact art or deleted definitions',()=>{
  const png=new PNG({width:72,height:96});png.data.fill(255);
  const original={id:'oak',name:'Oak',environmentKind:'Tree',sizeVariant:'small',width:1,height:1,pixelScale:3,spriteUrl:'data:image/png;base64,'+PNG.sync.write(png).toString('base64')};
  const damaged={...original,spriteUrl:'data:image/png;base64,'+sprite().toString('base64')};
  const map={generatedAssets:[damaged],placed:[{a:'oak',x:4,y:6}]};
  const restored=restoreShrunkNatureSprites(map,{generatedAssets:[original]});
  assert.equal(restored.generatedAssets[0].spriteUrl,original.spriteUrl);
  assert.deepEqual(restored.placed,map.placed);
  assert.equal(restoreShrunkNatureSprites(map,{generatedAssets:[]}).generatedAssets[0].spriteUrl,damaged.spriteUrl);
  assert.equal(restoreShrunkNatureSprites(restored,{generatedAssets:[original]}).generatedAssets[0].spriteUrl,original.spriteUrl);
});
