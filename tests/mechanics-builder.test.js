import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {ObjectId} from 'mongodb';
import {readMechanic,mountMechanicsBuilder,generateMechanic} from '../server/mechanics-builder.js';
const action={name:'Chop wood',description:'Swing an axe at a nearby tree.',category:'gathering',target:'nearby',cooldown:1.5,range:1};
test('action definitions validate types, limits and supported settings',()=>{
  assert.deepEqual(readMechanic({...action,userId:'forged',code:'untrusted'}),action);
  for(const change of [{name:''},{cooldown:-1},{range:Infinity},{category:'execute script'},{target:'global'},{range:'2'}])assert.equal(readMechanic({...action,...change}),null);
});
test('AI generates validated executable effects using description and selected object metadata',async()=>{
  const previous=process.env.OPENROUTER_API_KEY;process.env.OPENROUTER_API_KEY='test';
  try{
    const behavior={effect:'gather',amount:2,animation:'swing',duration:600,resourceName:'wood'};
    const mechanic=await generateMechanic('Chop wood with my axe',{name:'Iron axe',description:'Wooden handle'},async(_url,options)=>{
      const body=JSON.parse(options.body);assert.match(body.messages[0].content,/Iron axe/);assert.match(body.messages[0].content,/Chop wood/);assert.doesNotMatch(body.messages[0].content,/data:image/);
      return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({...action,behavior})}}]})};
    });assert.deepEqual(mechanic.behavior,behavior);assert.equal(mechanic.description,'Chop wood with my axe');
    assert.equal(readMechanic({...action,behavior:{...behavior,effect:'execute-code'}}),null);
  }finally{if(previous===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=previous;}
});
test('unowned attached objects cannot be used for AI generation or persisted in actions',async()=>{
  const owner=new ObjectId(),objectId=String(new ObjectId());let calls=0,writes=0;
  const app=express();app.use(express.json());mountMechanicsBuilder(app,{auth:(req,res,next)=>{req.user={_id:owner};next();},mechanics:{insertOne:async()=>{writes++;}},objects:{findOne:async query=>{assert.equal(String(query.userId),String(owner));return null;}},generate:async()=>{calls++;}});
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  try{const base=`http://127.0.0.1:${server.address().port}/api/mechanics`;
    for(const path of ['/generate',''])assert.equal((await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...action,objectId})})).status,400);
    assert.equal(calls,0);assert.equal(writes,0);
  }finally{await new Promise(r=>server.close(r));}
});
test('mechanics endpoints require authentication, scope writes to owner and confirm server deletion',async()=>{
  const owner=new ObjectId(),rowId=new ObjectId(),calls=[];let row;
  const app=express();app.use(express.json());
  mountMechanicsBuilder(app,{auth:(req,res,next)=>{if(!req.headers['x-user'])return res.sendStatus(401);req.user={_id:req.headers['x-user']==='owner'?owner:new ObjectId()};next();},mechanics:{insertOne:async value=>{row={...value,_id:rowId};return {insertedId:rowId};},updateOne:async(q,u)=>{calls.push(q);if(String(q.userId)!==String(owner))return {matchedCount:0};Object.assign(row,u.$set);return {matchedCount:1};},deleteOne:async q=>{calls.push(q);if(String(q.userId)!==String(owner))return {deletedCount:0};row=null;return {deletedCount:1};}}});
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  try{
    const base=`http://127.0.0.1:${server.address().port}/api/mechanics`,request=(path,method,body,user='owner')=>fetch(base+path,{method,headers:{'Content-Type':'application/json',...(user?{'x-user':user}:{})},...(body?{body:JSON.stringify(body)}:{})});
    assert.equal((await request('','POST',action,null)).status,401);
    const created=await request('','POST',{...action,userId:'forged'});assert.equal(created.status,201);assert.equal(String(row.userId),String(owner));
    assert.equal((await request(`/${rowId}`,'PUT',action,'other')).status,404);
    assert.equal((await request(`/${rowId}`,'DELETE',null,'other')).status,404);assert.ok(row);
    assert.equal((await request(`/${rowId}`,'PUT',{...action,name:'Chop oak'})).status,200);assert.equal(row.name,'Chop oak');
    assert.equal((await request(`/${rowId}`,'DELETE')).status,200);assert.equal(row,null);assert.ok(calls.every(q=>q.userId instanceof ObjectId));
  }finally{await new Promise(r=>server.close(r));}
});
