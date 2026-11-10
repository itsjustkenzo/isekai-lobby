import { textureSurfaces } from '../client/src/world/paintTextures.js';
﻿import test from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { generateTexture, toTextureTile, validTextureLibrary } from '../server/textures.js';
import { createDefaultWorld, createInterior, applyTool, snapshot, restore, toSaved, fromSaved, isBlocked } from '../client/src/world/world.js';

const id = '0123456789abcdef01234567';
function reference() {
  const png = new PNG({width:32,height:32});
  for (let i=0;i<png.data.length;i+=4) { png.data[i]=i%251;png.data[i+1]=100;png.data[i+2]=60;png.data[i+3]=255; }
  return PNG.sync.write(png);
}

test('processed textures are opaque 16px tiles with matching opposite edges', () => {
  const tile=PNG.sync.read(toTextureTile(reference()));
  assert.equal(tile.width,16); assert.equal(tile.height,16);
  for(let i=3;i<tile.data.length;i+=4) assert.equal(tile.data[i],255);
  for(let y=0;y<16;y++) assert.deepEqual(tile.data.subarray(y*64,y*64+4),tile.data.subarray(y*64+60,y*64+64));
  for(let x=0;x<16;x++) assert.deepEqual(tile.data.subarray(x*4,x*4+4),tile.data.subarray(960+x*4,964+x*4));
});

test('library rejects corrupt images, wrong dimensions and duplicate IDs', () => {
  const texture={id,name:'Mossed grey',image:`data:image/png;base64,${toTextureTile(reference()).toString('base64')}`};
  assert.equal(validTextureLibrary([texture]),true);
  assert.equal(validTextureLibrary([{...texture,surface:'wall',description:'Weathered bricks'}]),true);
  assert.equal(validTextureLibrary([{...texture,surface:'roof'}]),false);
  assert.equal(validTextureLibrary([texture,texture]),false);
  assert.equal(validTextureLibrary([{...texture,image:`data:image/png;base64,${reference().toString('base64')}`}]),false);
  assert.equal(validTextureLibrary([{...texture,image:'data:image/png;base64,AAAA'}]),false);
});

test('floor and wall finishes respect boundaries and retain wall collision', () => {
  const room=createInterior();
  const objects=[...room.objects]; const terrain=[...room.terrain];
  assert.equal(applyTool(room,`texture:floor:${id}`,3,1,1).length,0);
  assert.equal(applyTool(room,`texture:wall:${id}`,3,1,1).length,1);
  assert.equal(isBlocked(room,3,1),true);
  assert.equal(applyTool(room,`texture:wall:${id}`,4,5,1).length,0);
  assert.equal(applyTool(room,`texture:floor:${id}`,4,5,3).length,9);
  assert.deepEqual(room.objects,objects);assert.deepEqual(room.terrain,terrain);
  assert.equal(applyTool(room,'texture:wall:clear',3,1,1).length,1);
  assert.equal(isBlocked(room,3,1),true);
});

test('paint survives save/load and undo, including normal floor repainting', () => {
  const room=createInterior(); room.textures=[{id,name:'Moss',image:'test'}];
  applyTool(room,`texture:floor:${id}`,4,5,1);
  const saved=toSaved(room); const loaded=fromSaved(saved);
  assert.deepEqual(loaded.paint,room.paint);assert.deepEqual(loaded.textures,room.textures);
  const before=snapshot(room);
  assert.equal(applyTool(room,'o',4,5,1).length,1);
  assert.equal(room.paint[5*room.width+4],undefined);
  restore(room,before);assert.equal(room.paint[5*room.width+4].id,id);
});

test('prompt and upload generation use the image service with opaque output', async () => {
  const originalFetch=globalThis.fetch; const originalKey=process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY='test-placeholder';
  const requests=[];
  globalThis.fetch=async (_url,options) => {
    requests.push(JSON.parse(options.body));
    return {ok:true,json:async()=>({data:[{b64_json:reference().toString('base64')}]})};
  };
  try {
    await generateTexture('mossed grey floor');
    await generateTexture('Brick walls. Weathered red bricks and pale mortar',reference(),'wall');
    assert.equal(requests[0].background,'opaque');
    assert.equal(requests[0].input_references.length,0);
    assert.match(requests[0].prompt,/mossed grey floor/);
    assert.equal(requests[1].input_references.length,1);
    assert.match(requests[1].prompt,/vertical wall cladding/);
    assert.match(requests[1].prompt,/Brick walls/);
    assert.match(requests[1].prompt,/preserving its colours/);
    assert.match(requests[1].prompt,/STRICT REFERENCE ART STYLE/);
    assert.doesNotMatch(requests[1].prompt,/chunky crisp pixels, a restrained palette/);
    assert.doesNotMatch(requests[0].prompt,/STRICT REFERENCE ART STYLE/);
  } finally {
    globalThis.fetch=originalFetch;
    if(originalKey===undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY=originalKey;
  }
});

test('map context restricts texture options and paint to the matching surface', () => {
  assert.deepEqual(textureSurfaces(true), ['floor','wall']);
  assert.deepEqual(textureSurfaces(false), ['ground']);
  const outside = createDefaultWorld();
  assert.equal(applyTool(outside, `texture:floor:${id}`, 5, 5, 1).length, 0);
  assert.equal(applyTool(outside, `texture:wall:${id}`, 5, 5, 1).length, 0);
  assert.equal(applyTool(outside, `texture:ground:${id}`, 5, 5, 1).length, 1);
  assert.equal(fromSaved(toSaved(outside)).paint[5*outside.width+5].surface, 'ground');
  assert.equal(applyTool(createInterior(), `texture:ground:${id}`, 5, 5, 1).length, 0);
  const legacy = toSaved(outside);
  legacy.paint[5*outside.width+5].surface = 'floor';
  assert.equal(fromSaved(legacy).paint[5*outside.width+5].surface, 'ground');
});
