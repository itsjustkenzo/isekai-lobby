import test from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { generateEquipment, validEquipmentLibrary } from '../server/equipment.js';
import { canUseHoe } from '../client/src/world/equipment.js';
import { createDefaultWorld, fromSaved, toSaved } from '../client/src/world/world.js';
const id='0123456789abcdef01234567';
function image(width=16,height=32) {
  const png=new PNG({width,height});
  for(let y=3;y<height-2;y++) for(let x=6;x<10;x++) png.data.set([120,80,40,255],(y*width+x)*4);
  for(let y=3;y<6;y++) for(let x=2;x<14;x++) png.data.set([160,170,180,255],(y*width+x)*4);
  return PNG.sync.write(png);
}
function item() {return {id,name:'Garden hoe',description:'Iron blade and wooden handle',kind:'hoe',image:`data:image/png;base64,${image().toString('base64')}`};}
test('only a hoe enables tilling',()=>{
  assert.equal(canUseHoe(item()),true);
  assert.equal(canUseHoe({...item(),kind:'sword'}),false);
  assert.equal(canUseHoe(null),false);
});
test('equipment validation rejects malformed sprites, unknown types and duplicates',()=>{
  const hoe=item();assert.equal(validEquipmentLibrary([hoe]),true);
  assert.equal(validEquipmentLibrary([hoe,hoe]),false);
  assert.equal(validEquipmentLibrary([{...hoe,kind:'unknown'}]),false);
  assert.equal(validEquipmentLibrary([{...hoe,image:`data:image/png;base64,${image(16,16).toString('base64')}`}]),false);
  assert.equal(validEquipmentLibrary([{...hoe,image:'data:image/png;base64,AAAA'}]),false);
});
test('equipment assets and their tool types survive world save and load',()=>{
  const world=createDefaultWorld();world.equipment=[item()];
  const restored=fromSaved(toSaved(world));assert.deepEqual(restored.equipment,world.equipment);
  restored.equipment[0].name='Changed';assert.equal(world.equipment[0].name,'Garden hoe');
});
test('equipment generation produces a held-size sprite and passes the design and reference to AI',async()=>{
  const originalFetch=globalThis.fetch,originalKey=process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY='test-placeholder';let request;
  globalThis.fetch=async(_url,options)=>{request=JSON.parse(options.body);return {ok:true,json:async()=>({data:[{b64_json:image().toString('base64')}]})};};
  try {
    const output=await generateEquipment('Garden hoe','Iron blade and wooden handle','hoe',image());
    const png=PNG.sync.read(output);assert.equal(png.width,16);assert.equal(png.height,32);
    assert.match(request.prompt,/Garden hoe/);assert.match(request.prompt,/handheld Hoe/);
    assert.equal(request.input_references.length,1);assert.equal(request.background,'transparent');
    assert.equal(validEquipmentLibrary([{...item(),image:`data:image/png;base64,${output.toString('base64')}`}]),true);
  } finally {globalThis.fetch=originalFetch;if(originalKey===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=originalKey;}
});
