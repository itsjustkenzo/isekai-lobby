import test from 'node:test';
import assert from 'node:assert/strict';
import {PNG} from 'pngjs';
import {dreamMapSize,blueprintToMap} from '../server/dream-map.js';
import {fromSaved,toSaved} from '../client/src/world/world.js';

test('generated interiors use exact presets regardless of image size or aspect ratio',()=>{
  for(const [preset,size] of Object.entries({small:{width:16,height:16},medium:{width:16,height:18},large:{width:20,height:20}})){
    for(const [w,h] of [[1024,1024],[8192,200],[200,8192]])assert.deepEqual(dreamMapSize(w,h,'interior',preset),size);
    const png=new PNG({width:8,height:8});png.data.fill(255);
    const map=blueprintToMap(PNG.sync.write(png),size,'Room','interior');
    const doorX=Math.floor(size.width/2);
    for(let y=size.height-3;y<size.height;y++)assert.equal(map.objects[y*size.width+doorX],'.');
    assert.equal(map.objects[(size.height-1)*size.width],'X');
    assert.equal(map.objects[size.width+doorX],'N');
    const saved=toSaved(fromSaved(map));
    assert.equal(saved.width,size.width);assert.equal(saved.height,size.height);
  }
  assert.deepEqual(dreamMapSize(1000,1000,'interior'),{width:16,height:18});
  assert.throws(()=>dreamMapSize(1000,1000,'interior','huge'),/small, medium or large/);
});

test('exterior sizing remains proportional and independent of interior presets',()=>{
  for(const preset of ['small','medium','large'])assert.deepEqual(dreamMapSize(1024,512,'exterior',preset),{width:64,height:32});
});

test('AI wall symbols inside an interior are removed while all perimeter sides remain',()=>{
  const size={width:16,height:18},png=new PNG({width:8,height:8});
  for(let i=0;i<png.data.length;i+=4)png.data.set([81,83,92,255],i);
  const map=blueprintToMap(PNG.sync.write(png),size,'Open room','interior');
  for(let y=3;y<size.height-1;y++)for(let x=1;x<size.width-1;x++)assert.equal(map.objects[y*size.width+x],'.');
  assert.equal(map.objects[1*size.width+8],'N');
  assert.equal(map.objects[8*size.width],'X');
  assert.equal(map.objects[8*size.width+15],'X');
  assert.equal(map.objects[17*size.width+1],'X');
  assert.equal(map.objects[17*size.width+8],'.');
});
