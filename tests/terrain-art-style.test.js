import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PNG} from 'pngjs';
import {ObjectId} from 'mongodb';
import {generateTerrainCategory} from '../server/terrain-builder.js';

function image(){const png=new PNG({width:16,height:16});for(let i=0;i<png.data.length;i+=4)png.data.set([80,130,60,255],i);return PNG.sync.write(png);}
const collection={title:'Grassland plains',description:'Green grass and leafy trees',planItem:{id:new ObjectId().toString(),name:'Grass',description:'Green grass ground',kind:'texture',surface:'ground',code:'g',liquid:false}};

test('terrain generation uses current male/female artwork and detailed biome-appropriate direction',async()=>{
  const expected=await Promise.all(['male','female'].map(g=>readFile(new URL('../server/references/'+g+'.png',import.meta.url))));let calls=0;
  const result=await generateTerrainCategory(collection,'paint',async(prompt,refs)=>{
    calls++;assert.equal(refs.length,2);refs.forEach((ref,i)=>assert.ok(ref.equals(expected[i])));
    assert.match(prompt,/Detailed fantasy pixel-art environment/);assert.match(prompt,/Never draw people/);assert.match(prompt,/Do not force royal burgundy/);assert.match(prompt,/16 by 16/);return image();
  });
  assert.equal(calls,1);const png=PNG.sync.read(Buffer.from(result.textures[0].image.split(',')[1],'base64'));assert.equal(png.width,16);
});

test('creator scene reference follows the two style images and retains material authority',async()=>{
  const raw=image();let calls=0;
  await generateTerrainCategory({...collection,referenceImage:`data:image/png;base64,${raw.toString('base64')}`},'paint',async(prompt,refs)=>{
    calls++;assert.equal(refs.length,3);assert.ok(refs[2].equals(raw));assert.match(prompt,/Image 3 is the interior reference/);return raw;
  });assert.equal(calls,1);
});
