import test from 'node:test';
import assert from 'node:assert/strict';
import {drawInteriorBorderTile,INTERIOR_BORDER} from '../client/src/world/interiorBorder.js';

test('generated interior cutaway sides and bottom have the fixed purple fill and outer outline',()=>{
  const world={kind:'indoor',width:16,height:18};
  for(const [x,y] of [[0,5],[15,5],[3,17]]){
    const calls=[],ctx={fillRect(...rect){calls.push({color:this.fillStyle,rect});}};
    assert.equal(drawInteriorBorderTile(ctx,world,x,y),true);
    assert.equal(calls[0].color,INTERIOR_BORDER.fill);
    assert.ok(calls.some(c=>c.color===INTERIOR_BORDER.outline));
  }
});

test('south centre draws a wood-framed doorway, leaving north faces and exterior maps untouched',()=>{
  const calls=[],ctx={fillRect(){calls.push(this.fillStyle);}},world={indoorMap:true,width:16,height:18};
  assert.equal(drawInteriorBorderTile(ctx,world,8,17),true);
  assert.ok(calls.includes(INTERIOR_BORDER.door));assert.ok(calls.includes(INTERIOR_BORDER.wood));
  calls.length=0;
  assert.equal(drawInteriorBorderTile(ctx,world,8,1),false);
  assert.equal(drawInteriorBorderTile(ctx,{width:16,height:18},0,5),false);
  assert.equal(calls.length,0);
});
