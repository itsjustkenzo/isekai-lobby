import test from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { generateItemImage } from '../server/items.js';
import { readInventoryConfig } from '../server/inventory.js';
import { inventorySettings } from '../client/src/world/inventory.js';

test('AI item artwork uses the name and description, needs no upload, and passes save validation', async () => {
  const png=new PNG({width:32,height:32});
  for(let y=8;y<24;y++)for(let x=8;x<24;x++)png.data.set([70,140,40,255],(y*32+x)*4);
  const originalFetch=globalThis.fetch,originalKey=process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY='test-placeholder';let request;
  globalThis.fetch=async(_url,options)=>{request=JSON.parse(options.body);return {ok:true,json:async()=>({data:[{b64_json:PNG.sync.write(png).toString('base64')}]})};};
  try {
    const generated=await generateItemImage('Carrot seeds','A green seed packet with an orange carrot','seed');
    const tile=PNG.sync.read(generated);assert.equal(tile.width,16);assert.equal(tile.height,16);
    assert.match(request.prompt,/Carrot seeds/);assert.match(request.prompt,/orange carrot/);
    assert.equal(request.input_references.length,0);assert.equal(request.background,'transparent');
    const image=`data:image/png;base64,${generated.toString('base64')}`;
    const config=readInventoryConfig({...inventorySettings(null),items:[{id:'carrot',name:'Carrot seeds',description:'Seeds',category:'seed',stackLimit:99,image}]},[]);
    assert.equal(config.items[0].image,image);
  } finally {globalThis.fetch=originalFetch;if(originalKey===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=originalKey;}
});
test('unsupported item types are rejected before image generation', async () => {
  await assert.rejects(generateItemImage('Item','Design','unknown'),/Invalid item category/);
});
