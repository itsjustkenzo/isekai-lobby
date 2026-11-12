import test from 'node:test';
import assert from 'node:assert/strict';
import {furnishInterior} from '../server/interior-furnishing.js';
import {isMajorFurniture,furnitureCandidates} from '../server/interior-assemblies.js';

function fixture(){
  const width=20,height=20,objects=Array(400).fill('.');
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(y<3||x===0||x===19||y===19)objects[y*width+x]='N';objects[19*width+10]='.';
  const assets=[{id:'table',name:'Long table',assetKind:'Furniture',width:2,height:1,solid:true},{id:'chair',name:'Wooden stool',assetKind:'Furniture',width:1,height:1,solid:true},{id:'counter',name:'Service counter',assetKind:'Furniture',width:2,height:1,solid:true},{id:'mug',name:'Mug',assetKind:'Indoor prop',width:1,height:1,solid:false}];
  return {map:{width,height,terrain:'o'.repeat(400),objects:objects.join(''),paint:{},textures:[],spawn:{x:10,y:18},placed:[{a:'table',x:4,y:9},{a:'chair',x:15,y:15},{a:'mug',x:12,y:8}]},collection:{generatedAssets:assets}};
}

test('loose table landmarks automatically become complete dining sets; spare seats and micro props are omitted',()=>{
  const {map,collection}=fixture(),result=furnishInterior(map,[],collection,{preserveReference:true});
  assert.equal(result.furnishingReport.converted,1);assert.equal(result.furnishingReport.completed,1);
  assert.equal(result.placed.filter(p=>p.a==='table').length,1);
  assert.ok(result.placed.filter(p=>p.a==='chair').length>=2);
  assert.ok(result.placed.every(p=>p.a!=='mug'));
  assert.ok(!result.placed.some(p=>p.x===15&&p.y===15));
});

test('a dining assembly without seating is omitted rather than falling back to a lone table',()=>{
  const {map,collection}=fixture();collection.generatedAssets=collection.generatedAssets.filter(a=>a.id!=='chair');
  assert.equal(furnishInterior(map,[],collection).placed.length,0);
});

test('counter assembly is wall aligned, keeps staff space and uses related stools',()=>{
  const {map,collection}=fixture();map.placed=[];
  const result=furnishInterior(map,[{type:'service_counter',zone:'north',primaryAssetId:'counter',secondaryAssetId:'chair',accentAssetId:'',count:1}],collection);
  const counter=result.placed.find(p=>p.a==='counter');assert.ok(counter);assert.equal(counter.y,5);
  assert.equal(map.objects[4*20+counter.x],'.');
  assert.ok(result.placed.filter(p=>p.a==='chair').every(p=>p.y===counter.y+2));
});

test('small objects cannot masquerade as major furniture or produce standalone focal chairs',()=>{
  assert.equal(isMajorFurniture({assetKind:'Furniture',name:'Wooden bucket'}),false);
  const {collection}=fixture(),assets=new Map(collection.generatedAssets.map(a=>[a.id,a]));
  assert.deepEqual(furnitureCandidates({type:'focal',primaryAssetId:'chair'},assets,4,8),[]);
});


test('repeated dining sets furnish both halves of a hall without loose seating or blocked routes',()=>{
  const {map,collection}=fixture();map.placed=[];
  const groups=['west','east'].map(zone=>({type:'dining',zone,x:zone==='west'?4:14,y:5,primaryAssetId:'table',secondaryAssetId:'chair',accentAssetId:'',count:3}));
  const result=furnishInterior(map,groups,collection,{preserveReference:true});
  assert.equal(result.furnishingReport.requested,6);
  assert.equal(result.furnishingReport.completed,6);
  assert.ok(result.placed.filter(p=>p.a==='table').length>=6);
  for(const side of [p=>p.x<10,p=>p.x>10]){
    const tables=result.placed.filter(p=>p.a==='table'&&side(p));
    assert.ok(tables.some(p=>p.y<10));assert.ok(tables.some(p=>p.y>=13));
  }
  const occupied=new Set();
  for(const p of result.placed){
    const a=collection.generatedAssets.find(a=>a.id===p.a);
    for(let dy=0;dy<a.height;dy++)for(let dx=0;dx<a.width;dx++){
      const key=`${p.x+dx},${p.y-dy}`;assert.equal(occupied.has(key),false);occupied.add(key);
    }
  }
  const reachable=new Set(['10,19']),queue=[[10,19]];
  for(let i=0;i<queue.length;i++)for(const [x,y] of [[queue[i][0]-1,queue[i][1]],[queue[i][0]+1,queue[i][1]],[queue[i][0],queue[i][1]-1],[queue[i][0],queue[i][1]+1]]){
    const key=`${x},${y}`;
    if(x>0&&x<19&&y>=3&&y<19&&!occupied.has(key)&&!reachable.has(key)){reachable.add(key);queue.push([x,y]);}
  }
  for(let y=3;y<19;y++)for(let x=1;x<19;x++)if(!occupied.has(`${x},${y}`))assert.ok(reachable.has(`${x},${y}`));
});

test('a sparse reference is not automatically filled with extra furniture',()=>{
  const {map,collection}=fixture();map.placed=[];
  const result=furnishInterior(map,[{type:'dining',zone:'west',x:4,y:5,primaryAssetId:'table',secondaryAssetId:'chair',accentAssetId:'',count:1}],collection,{preserveReference:true});
  assert.equal(result.placed.filter(p=>p.a==='table').length,1);
  assert.equal(result.placed.find(p=>p.a==='table').y,5);
});


test('busy hall density fills large gaps even when AI only requests four upper tables',()=>{
  const {map,collection}=fixture();map.placed=[];collection.title='Adventurer guild tavern';
  const groups=[[4,5],[13,5],[4,9],[13,9]].map(([x,y])=>({type:'dining',zone:x<10?'west':'east',x,y,primaryAssetId:'table',secondaryAssetId:'chair',accentAssetId:'',count:1}));
  const result=furnishInterior(map,groups,collection,{preserveReference:true});
  assert.ok(result.furnishingReport.addedForDensity>0);
  assert.ok(result.furnishingReport.coverage>=30);
  assert.ok(result.placed.filter(p=>p.a==='table').some(p=>p.y>=13));
  assert.equal(result.placed.filter(p=>p.a==='chair').length,result.placed.filter(p=>p.a==='table').length*4);
  collection.description='Sparse tavern with an open floor for dancing';
  const sparse=furnishInterior(map,groups,collection,{preserveReference:true});
  assert.equal(sparse.furnishingReport.addedForDensity,0);
});


test('packed mode fits materially more complete furniture sets while retaining floor connectivity',()=>{
  const {map,collection}=fixture();map.placed=[];
  const groups=[{type:'dining',zone:'west',x:4,y:5,primaryAssetId:'table',secondaryAssetId:'chair',accentAssetId:'',count:1}];
  const normal=furnishInterior(map,groups,collection,{preserveReference:true});
  const packed=furnishInterior(map,groups,collection,{preserveReference:true,packed:true});
  assert.ok(packed.placed.length>normal.placed.length*3);
  assert.ok(packed.furnishingReport.coverage>=45);
  assert.equal(packed.furnishingReport.targetCoverage,65);
  const occupied=new Set(packed.placed.flatMap(p=>{const a=collection.generatedAssets.find(a=>a.id===p.a);return Array.from({length:a.width*a.height},(_,i)=>(p.y-Math.floor(i/a.width))*20+p.x+i%a.width);}));
  const queue=[390],seen=new Set(queue);
  for(let n=0;n<queue.length;n++){const i=queue[n],x=i%20,y=Math.floor(i/20);for(const [nx,ny] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){const k=ny*20+nx;if(nx>0&&nx<19&&ny>=3&&ny<19&&!occupied.has(k)&&!seen.has(k)){seen.add(k);queue.push(k);}}}
  for(let y=3;y<19;y++)for(let x=1;x<19;x++)if(!occupied.has(y*20+x))assert.ok(seen.has(y*20+x));
});
