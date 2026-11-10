import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {ObjectId} from 'mongodb';
import {mountInteriorPrototype} from '../server/interior-prototype.js';

test('interior prototype checks ownership and materials before requesting a text-only AI layout',async()=>{
  const app=express();app.use(express.json());const userId=new ObjectId(),id=new ObjectId();let calls=0,queries=[];
  const row={_id:id,kind:'interior',title:'Tavern',description:'Oak furniture',textures:[{surface:'floor'},{surface:'wall'}]};
  mountInteriorPrototype(app,{auth:(req,res,next)=>{if(req.headers['x-owner']!=='yes')return res.sendStatus(401);req.user={_id:userId};next();},terrains:{findOne:async query=>{queries.push(query);return String(query._id)===String(id)?row:null;}},generating:new Set(),generate:async(...args)=>{calls++;assert.equal(args[0],null);assert.equal(args[5],'interior');assert.equal(args[6],row);assert.equal(args[8],'small');assert.match(args[4],/Oak furniture/);return {name:'Tavern prototype',width:16,height:16};}});
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  try{
    const url=`http://127.0.0.1:${server.address().port}/api/terrains/`,options={method:'POST',headers:{'Content-Type':'application/json','x-owner':'yes'},body:JSON.stringify({size:'small'})};
    assert.equal((await fetch(url+id+'/interior-prototype',{method:'POST'})).status,401);
    assert.equal((await fetch(url+new ObjectId()+'/interior-prototype',options)).status,404);assert.equal(calls,0);
    const response=await fetch(url+id+'/interior-prototype',options);assert.equal(response.status,200);assert.equal((await response.json()).map.width,16);assert.equal(calls,1);
    assert.ok(queries.every(q=>q.userId===userId));
    row.textures=[];assert.equal((await fetch(url+id+'/interior-prototype',options)).status,400);assert.equal(calls,1);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
