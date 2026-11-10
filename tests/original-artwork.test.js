import test from 'node:test';
import assert from 'node:assert/strict';
import {PNG} from 'pngjs';
import {ObjectId} from 'mongodb';
import {preserveArtwork,validOriginalArtwork} from '../server/original-artwork.js';
import {readGeneratedMedia} from '../server/generated-map-media.js';
import {fromSaved,toSaved} from '../client/src/world/world.js';
import {artworkLayout,drawOriginalArtwork,drawTileRegion} from '../client/src/world/originalArtwork.js';
function image(w,h){const png=new PNG({width:w,height:h});for(let y=4;y<h-4;y++)for(let x=4;x<w-4;x++)png.data.set([x%256,y%256,77,255],(y*w+x)*4);return PNG.sync.write(png);}
test('masters retain source resolution and exact pixels with independent game dimensions',()=>{
  const raw=image(256,512),art=preserveArtwork(raw,24,32),stored=Buffer.from(art.image.split(',')[1],'base64');assert.deepEqual(stored,raw);assert.equal(PNG.sync.read(stored).height,512);assert.equal(art.displayHeight,32);assert.equal(art.frame.height,504);assert.ok(validOriginalArtwork(art,24,32));assert.equal(validOriginalArtwork(art,48,64),false);
  const layout=artworkLayout({originalArtwork:art});assert.ok(layout.height<=32&&layout.width<=24);
});
test('original assets survive embedded generated-map validation and save/load with unchanged footprints',()=>{
  const asset={id:String(new ObjectId()),name:'Small tree',environmentKind:'Tree',sizeVariant:'small',width:1,height:1,solid:true,spriteUrl:`data:image/png;base64,${image(24,32).toString('base64')}`,originalArtwork:preserveArtwork(image(256,512),24,32)};
  const map={width:16,height:16,terrain:'g'.repeat(256),objects:'.'.repeat(256),placed:[],paint:{},generatedAssets:[asset],textures:[]};const media=readGeneratedMedia(map,map);assert.ok(media);assert.deepEqual(media.generatedAssets[0].originalArtwork,asset.originalArtwork);
  const saved=toSaved(fromSaved({...map,...media}));assert.equal(saved.generatedAssets[0].width,1);assert.equal(saved.generatedAssets[0].originalArtwork.displayHeight,32);
  assert.equal(readGeneratedMedia({...map,generatedAssets:[{...asset,originalArtwork:{...asset.originalArtwork,image:'https://example.com/untrusted.png'}}]},map),null);
});
test('high-resolution ground stays opaque and matches opposite edges without dropping interior detail',()=>{
  const art=preserveArtwork(image(128,128),16,16,{tile:true}),png=PNG.sync.read(Buffer.from(art.image.split(',')[1],'base64'));
  assert.equal(png.width,128);assert.deepEqual([...png.data.subarray((64*128+64)*4,(64*128+64)*4+4)],[64,64,77,255]);
  for(let y=0;y<128;y++)assert.deepEqual(png.data.subarray(y*128*4,y*128*4+4),png.data.subarray((y*128+127)*4,(y*128+127)*4+4));
  for(let x=0;x<128;x++)assert.deepEqual(png.data.subarray(x*4,x*4+4),png.data.subarray((127*128+x)*4,(127*128+x)*4+4));
});
test('preview drawing fits native artwork and liquid/shore sampling uses the whole high-resolution tile',()=>{
  const calls=[],ctx={drawImage:(...args)=>calls.push(args)},art=preserveArtwork(image(256,512),24,32),source={width:1024,height:1024};
  drawOriginalArtwork(ctx,source,{originalArtwork:art},16,48);assert.equal(calls[0][3],248);assert.ok(calls[0][7]<=24&&calls[0][8]<=32);
  drawTileRegion(ctx,source,1,2,3,4,16,32,3,4);assert.deepEqual(calls[1].slice(1),[64,128,192,256,16,32,3,4]);
});
