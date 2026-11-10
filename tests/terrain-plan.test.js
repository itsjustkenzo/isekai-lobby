import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {ObjectId} from 'mongodb';
import {PNG} from 'pngjs';
import {readTerrainPlan,proposeTerrainPlan} from '../server/terrain-plan.js';
import {generateTerrainCategory,mountTerrainBuilder} from '../server/terrain-builder.js';
import {readGeneratedMedia} from '../server/generated-map-media.js';
const item=(kind,name,extra={})=>({id:new ObjectId().toString(),kind,name,description:`Native artwork of ${name}`,placement:'Suitable dry areas',optional:false,selected:true,code:'g',surface:'ground',liquid:false,...extra});
const plan=()=>({interpretation:'Dry sandy desert with sparse native plants',items:[item('texture','Desert sand'),item('Tree','Columnar cactus'),item('Bush','Thorny shrub'),item('texture','Oasis water',{code:'w',liquid:true,optional:true,selected:false})]});
test('planner proposes named ecological families and optional items without requesting artwork',async()=>{
  const previous=process.env.OPENROUTER_API_KEY;process.env.OPENROUTER_API_KEY='test';
  try{const result=await proposeTerrainPlan({title:'Desert',description:'Hot sand and sparse life'},async(url,options)=>{
    const body=JSON.parse(options.body);assert.equal(body.response_format.type,'json_schema');assert.match(body.messages[0].content,/No animals/);assert.match(body.messages[0].content,/Desert/);
    return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(plan())}}]})};
  });assert.equal(result.items[1].name,'Columnar cactus');assert.equal(result.items[3].selected,false);assert.ok(readTerrainPlan(result));}
  finally{if(previous===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=previous;}
});
test('plan validation rejects duplicates, unsupported creatures and missing primary dry ground',()=>{
  const p=plan();assert.ok(readTerrainPlan(p));
  assert.equal(readTerrainPlan({...p,items:[...p.items,p.items[0]]}),null);
  assert.equal(readTerrainPlan({...p,items:[p.items[0],item('Animal','Lizard')]}),null);
  assert.equal(readTerrainPlan({...p,items:p.items.slice(1)}),null);
  assert.equal(readTerrainPlan({...p,items:[p.items[0],item('texture','Ice',{code:'w',liquid:false})]}),null);
});
test('approved species generate three distinct native sizes and retain identity through media validation',async()=>{
  const p=item('Tree','Oak tree'),calls=[];
  const result=await generateTerrainCategory({title:'Plains',description:'Oak woodland',planItem:p},'paint',async prompt=>{
    calls.push(prompt);const [,w,h]=prompt.match(/Separate native (\d+) by (\d+)/),png=new PNG({width:Number(w),height:Number(h)});for(let y=0;y<png.height;y++)for(let x=2;x<png.width-2;x++)png.data.set([50,120,65,255],(y*png.width+x)*4);return PNG.sync.write(png);
  },Buffer.from('reference'));
  assert.equal(calls.length,3);assert.ok(calls.every(p=>p.includes('Oak tree')));
  assert.deepEqual(new Set(result.assets.map(a=>a.name)),new Set(['Oak tree (small)','Oak tree (medium)','Oak tree (large)']));
  const media=readGeneratedMedia({generatedAssets:result.assets},{placed:[],paint:{}});assert.ok(media);assert.ok(media.generatedAssets.every(a=>a.planItemId===p.id&&a.placement===p.placement));
  assert.deepEqual(result.assets.map(a=>PNG.sync.read(Buffer.from(a.spriteUrl.split(',')[1],'base64')).height).sort((a,b)=>a-b),[32,48,64]);
});
test('plan API enforces ownership, selection, resume idempotence and locks started plans',async()=>{
  const owner=new ObjectId(),terrainId=new ObjectId(),state={_id:terrainId,userId:owner,title:'Desert',description:'Dry sand',generatedAssets:[],textures:[],planCompleted:[],completed:[]};let calls=0;
  const app=express();app.use(express.json());
  mountTerrainBuilder(app,{auth:(req,res,next)=>{if(!req.headers['x-owner'])return res.sendStatus(401);req.user={_id:req.headers['x-owner']==='yes'?owner:new ObjectId()};next();},generating:new Set(),terrains:{findOne:async q=>String(q.userId)===String(owner)&&String(q._id)===String(terrainId)?structuredClone(state):null,updateOne:async(q,u)=>{Object.assign(state,u.$set??{});for(const [key,v] of Object.entries(u.$push??{}))state[key].push(...v.$each);for(const [key,v] of Object.entries(u.$addToSet??{}))if(!state[key].includes(v))state[key].push(v);}},proposePlan:async()=>plan(),generateCategory:async()=>{calls++;return {assets:[],textures:[]};}});
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  try{const base=`http://127.0.0.1:${server.address().port}/api/terrains/${terrainId}`,request=(path,method='POST',body,who='yes')=>fetch(base+path,{method,headers:{'x-owner':who,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    assert.equal((await request('/plan','POST',null,'no')).status,404);assert.equal(calls,0);
    assert.equal((await request('/plan')).status,200);assert.equal(calls,0);
    const p=state.assetPlan;assert.equal((await request('/plan','PUT',p)).status,200);
    assert.equal((await request(`/plan/${p.items[3].id}/generate`)).status,400);
    assert.equal((await request(`/plan/${p.items[1].id}/generate`)).status,200);
    assert.equal((await request(`/plan/${p.items[1].id}/generate`)).status,200);assert.equal(calls,1);
    assert.equal((await request('/plan','PUT',p)).status,409);
    assert.equal((await request('/generate/trees')).status,409);assert.equal(calls,1);
  }finally{await new Promise(r=>server.close(r));}
});

test('interior plans require floors and walls and reject outdoor families',()=>{
  const items=[item('texture','Oak floor',{surface:'floor',code:'o'}),item('texture','Plaster wall',{surface:'wall',code:'wall'}),item('Furniture','Oak table',{surface:'floor'}),item('Indoor prop','Candle',{surface:'floor'})];
  const value={interpretation:'Rustic room',items};
  assert.ok(readTerrainPlan(value,{interior:true}));
  assert.equal(readTerrainPlan({...value,items:items.slice(1)},{interior:true}),null);
  assert.equal(readTerrainPlan({...value,items:items.filter(p=>p.code!=='wall')},{interior:true}),null);
  assert.equal(readTerrainPlan({...value,items:[...items,item('Tree','Oak')]},{interior:true}),null);
});

test('interior furniture generation has native artwork, footprint and supported metadata',async()=>{
  const result=await generateTerrainCategory({title:'Tavern',description:'Warm oak',planItem:item('Furniture','Oak table',{surface:'floor'})},'paint',async()=>{
    const png=new PNG({width:32,height:32});for(let y=3;y<29;y++)for(let x=3;x<29;x++)png.data.set([80,50,30,255],(y*32+x)*4);return PNG.sync.write(png);
  },Buffer.from('reference'));
  assert.equal(result.assets.length,1);
  assert.deepEqual([result.assets[0].width,result.assets[0].height],[2,1]);
  assert.equal(result.assets[0].assetKind,'Furniture');
  assert.ok(readGeneratedMedia({generatedAssets:result.assets,textures:[]},{placed:[],paint:{}}));
});
