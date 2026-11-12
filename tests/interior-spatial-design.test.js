import test from 'node:test';
import assert from 'node:assert/strict';
import {designInteriorLayout,validateInteriorDesign} from '../server/interior-spatial-design.js';
function fixture(){
  const width=16,height=16,objects=Array(256).fill('.');
  for(let y=0;y<16;y++)for(let x=0;x<16;x++)if(y<3||x===0||x===15||y===15)objects[y*16+x]='N';objects[248]='.';
  return {map:{width,height,objects:objects.join(''),terrain:'o'.repeat(256),textures:[],spawn:{x:8,y:14},placed:[]},collection:{title:'Dining room',generatedAssets:[{id:'table',name:'Dining table',assetKind:'Furniture',width:2,height:1,solid:true},{id:'chair',name:'Chair',assetKind:'Furniture',width:1,height:1,solid:true}]}};
}
test('spatial validation rejects overlaps, blocked entrances, invalid assets and isolated floor',()=>{
  const {map,collection}=fixture();
  assert.match(validateInteriorDesign(map,[{assetId:'table',x:4,y:6},{assetId:'chair',x:4,y:6}],collection).join(' '),/overlap/);
  assert.match(validateInteriorDesign(map,[{assetId:'table',x:8,y:14}],collection).join(' '),/spawn or entrance/);
  assert.match(validateInteriorDesign(map,[{assetId:'missing',x:4,y:6}],collection).join(' '),/invalid saved/);
  assert.match(validateInteriorDesign(map,Array.from({length:7},(_,i)=>({assetId:'table',x:1+i*2,y:8})),collection).join(' '),/disconnected/);
});
test('AI revises the whole invalid layout and accepted coordinates remain exact without filler',async()=>{
  const {map,collection}=fixture();let calls=0;
  const placements=[{assetId:'table',x:4,y:6},{assetId:'chair',x:3,y:6},{assetId:'chair',x:6,y:6}];
  const result=await designInteriorLayout(map,null,collection,async(url,options)=>{
    const body=JSON.parse(options.body);calls++;
    if(calls===2){assert.match(body.messages.at(-1).content,/overlap/);assert.match(body.messages.at(-1).content,/ALL placements/);}
    return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({design:'Dining set with walkways',placements:calls===1?[placements[0],placements[0]]:placements})}}]})};
  });
  assert.equal(calls,2);assert.deepEqual(result.placed,placements.map(p=>({a:p.assetId,x:p.x,y:p.y})));
  assert.equal(result.furnishingReport.designAttempts,2);assert.deepEqual(map.placed,[]);
});
test('repeated invalid AI layouts stop at three attempts without a partial map',async()=>{
  const {map,collection}=fixture();let calls=0;
  await assert.rejects(designInteriorLayout(map,null,collection,async()=>{calls++;return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({design:'Invalid',placements:[{assetId:'table',x:8,y:14}]})}}]})};}),/three attempts/);
  assert.equal(calls,3);assert.deepEqual(map.placed,[]);
});
