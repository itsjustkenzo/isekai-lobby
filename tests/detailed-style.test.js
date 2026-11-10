import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {PNG} from 'pngjs';
import {DETAIL_TILE,DETAIL_CHARACTER_HEIGHT,detailedStyleScene,detailedStyleBlocked} from '../client/src/detailedStyleSpec.js';
import {detailedMaterial,mountDetailedStyle,generateDetailedAsset} from '../server/detailed-style.js';

function png(){const p=new PNG({width:128,height:128});for(let y=0;y<128;y++)for(let x=0;x<128;x++)p.data.set([80+x%80,60+y%80,50,255],(y*128+x)*4);return PNG.sync.write(p);}
test('isolated detailed scene retains two-tile character scale and valid furniture collisions',()=>{
  assert.equal(DETAIL_CHARACTER_HEIGHT/DETAIL_TILE,2);const scene=detailedStyleScene();
  assert.equal(detailedStyleBlocked(scene,scene.spawn.x,scene.spawn.y),false);
  assert.equal(detailedStyleBlocked(scene,7,5),true);assert.equal(detailedStyleBlocked(scene,8,5),true);
  assert.equal(detailedStyleBlocked(scene,0,8),true);assert.equal(detailedStyleBlocked(scene,8,2),true);
  const other=detailedStyleScene();scene.placed.length=0;assert.ok(other.placed.length>0);
});
test('detailed floor processing produces new native 48px opaque seamless artwork',()=>{
  const tile=PNG.sync.read(detailedMaterial(png()));assert.equal(tile.width,48);assert.equal(tile.height,48);
  for(let y=0;y<48;y++)for(let c=0;c<4;c++)assert.equal(tile.data[(y*48)*4+c],tile.data[(y*48+47)*4+c]);
  for(let i=3;i<tile.data.length;i+=4)assert.equal(tile.data[i],255);
});
test('detailed generation requests independently drawn native artwork and both character references',async()=>{
  let calls=0;const asset=await generateDetailedAsset('floor','Royal hall',async(prompt,refs,options)=>{calls++;assert.equal(refs.length,2);assert.match(prompt,/48 by 48/);assert.match(prompt,/never enlarge/);assert.equal(options.background,'opaque');return png();});
  assert.equal(calls,1);assert.equal(asset.width,48);assert.match(asset.image,/^data:image\/png;base64,/);
});
test('style generation requires a session, rejects invalid requests before paid work and saves nothing',async()=>{
  const app=express();app.use(express.json());let calls=0;
  mountDetailedStyle(app,{auth:(req,res,next)=>{if(!req.headers['x-user'])return res.sendStatus(401);req.user={_id:'owner'};next();},generating:new Set(),generate:async id=>{calls++;return {id,image:'test'};}});
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  try{const root=`http://127.0.0.1:${server.address().port}/api/style-prototype/assets/`,opts={method:'POST',headers:{'Content-Type':'application/json','x-user':'owner'},body:'{}'};
    assert.equal((await fetch(root+'floor',{method:'POST'})).status,401);
    assert.equal((await fetch(root+'missing',opts)).status,400);assert.equal(calls,0);
    assert.equal((await fetch(root+'floor',opts)).status,200);assert.equal(calls,1);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
