import test from 'node:test';
import assert from 'node:assert/strict';
import {createBuildingScaleMap} from '../client/src/buildingScaleMap.js';
import {setAssets,libraryAssets,isBlocked} from '../client/src/world/world.js';
test('scale preview fits full-height artwork and places the player outside the entrance',()=>{
  const asset={id:'tower',name:'Tower',width:3,height:3,solid:true,building:{artHeight:128,entranceX:1}};
  const previous=libraryAssets();setAssets([asset]);
  try{const world=createBuildingScaleMap(asset),p=world.placed[0];assert.equal(world.generatedAssets[0].width,3);assert.equal(world.generatedAssets[0].building.artHeight,128);
    assert.ok((p.y+1)*16-128>=0);assert.equal(world.spawn.x,p.x+1);assert.equal(world.spawn.y,p.y+2);assert.equal(isBlocked(world,world.spawn.x,world.spawn.y),false);assert.equal(isBlocked(world,p.x,p.y),true);
    world.generatedAssets[0].building.entranceX=0;assert.equal(asset.building.entranceX,1);
  }finally{setAssets(previous);}
});
test('small cottages and large buildings both have room for the player to walk around',()=>{
  const previous=libraryAssets();
  try{
  for(const [width,height,artHeight] of [[2,2,80],[8,6,176]]){
    const asset={id:'building',name:'Building',width,height,solid:true,building:{artHeight,entranceX:Math.floor(width/2)}};setAssets([asset]);
    const world=createBuildingScaleMap(asset),p=world.placed[0];
    assert.ok(p.x>=3);assert.ok(p.x+width<world.width-2);assert.ok(p.y+3<world.height);assert.equal(world.generatedAssets[0].width,width);
  }
  }finally{setAssets(previous);}
});
