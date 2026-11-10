import test from 'node:test';
import assert from 'node:assert/strict';
import {avatarFrame} from '../client/src/world/characterSprite.js';
test('full-resolution avatar framing identifies transparent padding without rewriting pixels',()=>{
  const data=new Uint8ClampedArray(1024*1024*4);data.set([219,47,92,255],(20*1024+100)*4);data.set([30,80,110,5],(1000*1024+900)*4);
  const before=data.slice();assert.deepEqual(avatarFrame(data,1024,1024),{x:100,y:20,width:801,height:981});assert.deepEqual(data,before);
});
test('opaque and transparent source images keep their original frame dimensions',()=>{
  const opaque=new Uint8ClampedArray(16*32*4).fill(255);assert.deepEqual(avatarFrame(opaque,16,32),{x:0,y:0,width:16,height:32});assert.deepEqual(avatarFrame(new Uint8ClampedArray(64),4,4),{x:0,y:0,width:4,height:4});
});
