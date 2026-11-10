import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {ObjectId} from 'mongodb';
import {PNG} from 'pngjs';
import {objectInput,mountObjectBuilder} from '../server/object-builder.js';
test('object builder needs only name and appearance and ignores client type fields',()=>{
  assert.deepEqual(objectInput({name:'Frying pan',description:'Cast iron with a wooden handle'}),{name:'Frying pan',description:'Cast iron with a wooden handle',kind:'custom'});
  assert.equal(objectInput({name:'Object',description:'Iron',kind:'script'}).kind,'custom');
  assert.equal(objectInput({name:'',description:'Iron'}),null);
});
test('generation authenticates before spending credits, validates artwork and saves owner-scoped objects',async()=>{
  const owner=new ObjectId(),stored=[],generating=new Set();let calls=0;
  const app=express();app.use(express.json());
  mountObjectBuilder(app,{auth:(req,res,next)=>{if(!req.headers['x-user'])return res.sendStatus(401);req.user={_id:owner};next();},objects:{insertOne:async row=>{stored.push(row);}},generating,generate:async()=>{calls++;return PNG.sync.write(new PNG({width:16,height:32}));}});
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  try{const url=`http://127.0.0.1:${server.address().port}/api/objects/generate`,input={name:'Iron pickaxe',description:'Iron head and wooden grip'},send=user=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...(user?{'x-user':'yes'}:{})},body:JSON.stringify(input)});
    assert.equal((await send(false)).status,401);assert.equal(calls,0);
    generating.add(`equipment:${owner}`);assert.equal((await send(true)).status,409);assert.equal(calls,0);generating.clear();
    const response=await send(true);assert.equal(response.status,201);const data=await response.json();assert.equal(data.object.name,input.name);assert.equal(String(stored[0].userId),String(owner));assert.equal(generating.size,0);assert.equal(calls,1);
  }finally{await new Promise(r=>server.close(r));}
});
