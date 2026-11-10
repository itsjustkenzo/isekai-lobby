import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {PNG} from 'pngjs';
import {ObjectId} from 'mongodb';
import {mountInteriorImageCollection,analyzeInteriorReference} from '../server/interior-image-collection.js';
import {generateTerrainCategory} from '../server/terrain-builder.js';

function image(){const p=new PNG({width:16,height:16});for(let i=0;i<p.data.length;i+=4)p.data.set([90,70,40,255],i);return PNG.sync.write(p);}

test('image collection analyzes before planning and saves the reference with owner-scoped data',async()=>{
  const app=express(),userId=new ObjectId();let row,analyzed=0;
  mountInteriorImageCollection(app,{auth:(req,res,next)=>{if(!req.headers['x-owner'])return res.sendStatus(401);req.user={_id:userId};next();},raw:express.raw({type:()=>true,limit:'2mb'}),terrains:{insertOne:async value=>{row=value;}},generating:new Set(),analyze:async reference=>{analyzed++;assert.match(reference,/^data:image\/png;base64,/);return {title:'Church',description:'Stone floors, plaster walls and pews'};},plan:async value=>{assert.equal(value.title,'Church');assert.ok(value.referenceImage);return {items:[],interpretation:'Church'};}});
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  try{
    const url=`http://127.0.0.1:${server.address().port}/api/terrains/from-interior-image`;
    assert.equal((await fetch(url,{method:'POST',body:image()})).status,401);
    const response=await fetch(url,{method:'POST',headers:{'x-owner':'yes','Content-Type':'image/png'},body:image()});
    assert.equal(response.status,201);assert.equal((await response.json()).terrain.title,'Church');assert.equal(row.userId,userId);assert.equal(row.kind,'interior');assert.equal(analyzed,1);
    const invalid=await fetch(url,{method:'POST',headers:{'x-owner':'yes'},body:'not an image'});assert.equal(invalid.status,400);assert.equal(analyzed,1);
  }finally{await new Promise(resolve=>server.close(resolve));}
});

test('reference interpretation sends the picture to vision analysis',async()=>{
  const old=process.env.OPENROUTER_API_KEY;process.env.OPENROUTER_API_KEY='test';
  try{
    const result=await analyzeInteriorReference('data:image/png;base64,test','',async(url,options)=>{
      const body=JSON.parse(options.body);assert.equal(body.messages[0].content[1].type,'image_url');assert.match(body.messages[0].content[0].text,/churches, temples, caves/);
      return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({title:'Temple',description:'A stone shrine with lamps'})}}]})};
    });assert.equal(result.title,'Temple');
  }finally{if(old===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=old;}
});

test('reference-based collection generation sends scene and game style references together',async()=>{
  let calls=0;const raw=image();
  const result=await generateTerrainCategory({title:'Temple',description:'Stone shrine',referenceImage:`data:image/png;base64,${raw.toString('base64')}`,planItem:{id:new ObjectId().toString(),name:'Stone floor',description:'Pale stone',kind:'texture',code:'s',surface:'floor',liquid:false}},'paint',async(prompt,refs)=>{calls++;assert.equal(refs.length,2);assert.ok(refs[1].equals(raw));assert.match(prompt,/Image 2 is the interior reference/);return raw;},raw);
  assert.equal(calls,1);assert.equal(result.textures[0].surface,'floor');
});
