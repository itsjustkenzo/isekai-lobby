import test from 'node:test';
import assert from 'node:assert/strict';
import {PNG} from 'pngjs';
import {ObjectId} from 'mongodb';
import {generateTerrainCategory} from '../server/terrain-builder.js';
import {readGeneratedMedia} from '../server/generated-map-media.js';
import {validTextureLibrary} from '../server/textures.js';
import {setAssets,fromSaved,toSaved} from '../client/src/world/world.js';

function image(w,h){const p=new PNG({width:w,height:h});for(let y=2;y<h-2;y++)for(let x=2;x<w-2;x++)p.data.set([60+x%50,100+y%70,40,255],(y*w+x)*4);return PNG.sync.write(p);}
const terrain={title:'High resolution grass',description:'Green land',pixelScale:3};
test('48px materials retain resolution, seamless edges and metadata through validation',async()=>{
  const item={id:new ObjectId().toString(),kind:'texture',name:'Grass',description:'Green grass',code:'g',surface:'ground',liquid:false};
  const result=await generateTerrainCategory({...terrain,planItem:item},'paint',async prompt=>{assert.match(prompt,/48 by 48/);return image(96,96);},image(16,16));
  const t=result.textures[0],png=PNG.sync.read(Buffer.from(t.image.split(',')[1],'base64'));
  assert.equal(png.width,48);assert.equal(t.pixelScale,3);assert.ok(validTextureLibrary([t]));
  for(let y=0;y<48;y++)assert.equal(png.data[(y*48)*4],png.data[(y*48+47)*4]);
  const cleaned=readGeneratedMedia({generatedAssets:[],textures:[t]},{placed:[],paint:{}});assert.equal(cleaned.textures[0].pixelScale,3);
  assert.equal(validTextureLibrary([{...t,pixelScale:1}]),false);
});
test('nature artwork is authored at three-times native dimensions but retains a one-tile base',async()=>{
  const item={id:new ObjectId().toString(),kind:'Bush',name:'Leafy bush',description:'Dense foliage',placement:'Grove edges'};
  const result=await generateTerrainCategory({...terrain,planItem:item},'nature',async prompt=>{const match=prompt.match(/Separate native (\d+) by (\d+)/);return image(Number(match[1])*2,Number(match[2])*2);},image(16,16));
  assert.deepEqual(result.assets.map(a=>PNG.sync.read(Buffer.from(a.spriteUrl.split(',')[1],'base64')).height).sort((a,b)=>a-b),[60,84,108]);
  assert.ok(result.assets.every(a=>a.pixelScale===3&&a.width===1&&a.height===1));
  assert.ok(readGeneratedMedia({generatedAssets:result.assets,textures:[]},{placed:[],paint:{}}));
  setAssets(result.assets);
  try{const map={width:16,height:16,terrain:'g'.repeat(256),objects:'.'.repeat(256),placed:[{a:result.assets[0].id,x:4,y:5}],generatedAssets:result.assets,paint:{},textures:[]};const saved=toSaved(fromSaved(map));assert.equal(saved.generatedAssets[0].pixelScale,3);}finally{setAssets([]);}
});

test('high-resolution trees retain separate two, three and four tile artwork heights',async()=>{
  const item={id:new ObjectId().toString(),kind:'Tree',name:'Oak',description:'Tall narrow leafy oak',placement:'Groves'};
  const result=await generateTerrainCategory({...terrain,planItem:item},'trees',async prompt=>{const match=prompt.match(/Separate native (\d+) by (\d+)/);return image(Number(match[1])*2,Number(match[2])*2);},image(16,16));
  assert.deepEqual(result.assets.map(a=>PNG.sync.read(Buffer.from(a.spriteUrl.split(',')[1],'base64')).height).sort((a,b)=>a-b),[96,144,192]);
  assert.ok(readGeneratedMedia({generatedAssets:result.assets,textures:[]},{placed:[],paint:{}}));
});
