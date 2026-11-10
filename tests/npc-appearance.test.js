import test from 'node:test';
import assert from 'node:assert/strict';
import {npcAppearanceInput,generateNpcAppearance,npcGenerationError} from '../server/npc-appearance.js';
import {PNG} from 'pngjs';
import {generateSprite} from '../server/sprite.js';

test('NPC appearance modes validate prompts while preserving existing photo requests',()=>{
  assert.deepEqual(npcAppearanceInput({}),{mode:'photo',appearance:''});
  assert.deepEqual(npcAppearanceInput({mode:'prompt',appearance:' Silver hair '}),{mode:'prompt',appearance:'Silver hair'});
  for(const q of [{mode:'other'},{mode:'prompt',appearance:' '},{mode:'prompt',appearance:'x'.repeat(1001)},{mode:'random',appearance:[]}])assert.equal(npcAppearanceInput(q),null);
});

test('NPC random and prompt appearances use a game reference without requiring a photo',async()=>{
  for(const mode of ['random','prompt']){
    let calls=0;
    const result=await generateNpcAppearance('female',{mode,appearance:'Silver-haired merchant'},undefined,{imageRequest:async(prompt,refs)=>{
      calls++;assert.equal(refs.length,1);assert.ok(refs[0].length>12);assert.match(prompt,/32px-tall/);assert.match(prompt,/Transparent background/);
      if(mode==='prompt')assert.match(prompt,/Silver-haired merchant/);
      return Buffer.from('artwork');
    }});
    assert.equal(calls,1);assert.equal(result.toString(),'artwork');
  }
});

test('photo mode preserves the existing character conversion pipeline',async()=>{
  const upload=Buffer.from('photo');let calls=0;
  const result=await generateNpcAppearance('male',{mode:'photo'},upload,{photoRequest:async(gender,image)=>{calls++;assert.equal(gender,'male');assert.equal(image,upload);return Buffer.from('sprite');},imageRequest:()=>assert.fail('unexpected text generation')});
  assert.equal(calls,1);assert.equal(result.toString(),'sprite');
});

test('photo generation sends both references with broad concept guidance and the master style',async()=>{
  const upload=PNG.sync.write(new PNG({width:2,height:2}));let calls=0;
  await generateNpcAppearance('female',{mode:'photo'},upload,{photoRequest:(gender,image,options)=>generateSprite(gender,image,{...options,imageRequest:async(prompt,refs)=>{
    calls++;assert.match(prompt,/absolute master reference/);
    assert.match(prompt,/portrait, full-body photo, drawing, animal, object or landscape/);
    assert.match(prompt,/infer missing clothing/);
    assert.equal(refs.length,2);assert.equal(refs[1],upload);return Buffer.from('sprite');
  }})});
  assert.equal(calls,1);
});

test('NPC errors distinguish provider configuration, credits, rate limits and timeouts',()=>{
  assert.match(npcGenerationError({imageStatus:402}),/insufficient credits/);
  assert.match(npcGenerationError({imageStatus:401}),/credentials/);
  assert.match(npcGenerationError({imageStatus:429}),/rate-limited/);
  assert.match(npcGenerationError({name:'TimeoutError'}),/timed out/);
  assert.match(npcGenerationError({imageStatus:400}),/HTTP 400/);
  assert.doesNotMatch(npcGenerationError(new Error('secret provider detail')),/secret/);
});
