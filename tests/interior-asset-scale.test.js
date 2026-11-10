import test from 'node:test';
import assert from 'node:assert/strict';
import {interiorAssetBounds,interiorSpriteLayout} from '../client/src/interiorAssetScale.js';

test('room artwork uses character-relative size limits without changing footprints',()=>{
  const data=new Uint8ClampedArray(32*32*4).fill(255);
  const table={name:'Oak table',assetKind:'Furniture',width:2,height:1};
  const layout=interiorSpriteLayout(table,data,32,32);
  assert.equal(layout.displayHeight,24);assert.equal(layout.displayWidth,24);
  assert.deepEqual([table.width,table.height],[2,1]);
  assert.equal(interiorAssetBounds({name:'Tall wardrobe',assetKind:'Furniture'}).height,32);
  const candle=interiorSpriteLayout({assetKind:'Indoor prop'},data,32,32);
  assert.equal(candle.displayHeight,12);
  assert.equal(interiorAssetBounds({environmentKind:'Tree'}),null);
});

test('small artwork is never enlarged and padding does not count toward its visible size',()=>{
  const data=new Uint8ClampedArray(16*32*4);
  for(let y=24;y<32;y++)for(let x=4;x<12;x++)data[(y*16+x)*4+3]=255;
  const layout=interiorSpriteLayout({assetKind:'Indoor prop'},data,16,32);
  assert.equal(layout.displayHeight,8);assert.equal(layout.displayWidth,8);
  assert.equal(layout.y,24);
});

test('seating has smaller native bounds, with wider sofas and lower stools',()=>{
  const bounds=name=>interiorAssetBounds({assetKind:'Furniture',name});
  assert.deepEqual(bounds('Oak dining chair'),{width:16,height:18});
  assert.deepEqual(bounds('Velvet sofa'),{width:28,height:16});
  assert.deepEqual(bounds('Wooden bench'),{width:28,height:16});
  assert.deepEqual(bounds('Bar stool'),{width:12,height:12});
  assert.deepEqual(bounds('Leather ottoman'),{width:12,height:12});
  assert.deepEqual(bounds('Dining table'),{width:32,height:24});
});
