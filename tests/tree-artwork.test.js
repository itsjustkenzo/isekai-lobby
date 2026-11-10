import test from 'node:test';
import assert from 'node:assert/strict';
import {PNG} from 'pngjs';
import {fitNativeTree} from '../server/tree-artwork.js';
import {NATURE_SPRITE_SIZES} from '../client/src/world/natureSizes.js';

function subject(width,height){const p=new PNG({width,height});for(let y=2;y<height-2;y++)for(let x=2;x<width-2;x++)p.data.set([70,130,50,255],(y*width+x)*4);return PNG.sync.write(p);}
function visibleHeight(p){let top=p.height,bottom=-1;for(let y=0;y<p.height;y++)for(let x=0;x<p.width;x++)if(p.data[(y*p.width+x)*4+3]>=128){top=Math.min(top,y);bottom=Math.max(bottom,y);}return bottom-top+1;}
test('each generated tree fills the same visible 32/48/64px height as default-sized tree artwork',()=>{
  for(const [size,[width,height]] of Object.entries(NATURE_SPRITE_SIZES.Tree)){
    const p=PNG.sync.read(fitNativeTree(subject(width*4,height*4),size));assert.equal(p.width,width);assert.equal(p.height,height);assert.equal(visibleHeight(p),height);
  }
});
test('a small raster cannot masquerade as a large tree inside a padded canvas',()=>{
  assert.throws(()=>fitNativeTree(subject(24,32),'large'),error=>error.shortTree===true&&/64 visible pixels/.test(error.message));
});
test('wide short silhouettes are rejected instead of silently shrinking to fit the tree width',()=>{
  assert.throws(()=>fitNativeTree(subject(256,128),'medium'),error=>error.shortTree===true);
});
