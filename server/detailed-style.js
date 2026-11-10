import {readFile} from 'node:fs/promises';
import {PNG} from 'pngjs';
import {requestImage} from './sprite.js';
import {fitSprite} from './pixelfit.js';
import {DETAIL_ASSETS} from '../client/src/detailedStyleSpec.js';
import {npcGenerationError} from './npc-appearance.js';

export function detailedMaterial(buffer,size=48){
  const source=PNG.sync.read(buffer),out=new PNG({width:size,height:size});
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const i=(Math.min(source.height-1,Math.floor((y+.5)*source.height/size))*source.width+Math.min(source.width-1,Math.floor((x+.5)*source.width/size)))*4,j=(y*size+x)*4,a=source.data[i+3]/255;
    for(let c=0;c<3;c++)out.data[j+c]=Math.round(source.data[i+c]*a+120*(1-a));out.data[j+3]=255;
  }
  const match=(a,b)=>{for(let c=0;c<3;c++)out.data[a+c]=out.data[b+c]=Math.round((out.data[a+c]+out.data[b+c])/2);};
  for(let y=0;y<size;y++)match(y*size*4,(y*size+size-1)*4);
  for(let x=0;x<size;x++)match(x*4,((size-1)*size+x)*4);
  return PNG.sync.write(out);
}
export async function generateDetailedAsset(id,description,imageRequest=requestImage){
  const spec=Object.hasOwn(DETAIL_ASSETS,id)?DETAIL_ASSETS[id]:null;if(!spec)throw new Error('Unknown style-test asset.');
  const references=await Promise.all(['male','female'].map(g=>readFile(new URL(`./references/${g}.png`,import.meta.url))));
  const raw=await imageRequest(`Create ${spec.brief}. Detailed fantasy RPG pixel art matching the two character references in pixel density, coloured outlines, material shading and fine cluster detail. References establish art style, not subjects: do not draw people. Palette: pale warm stone, burgundy, navy, aged gold. One game tile is 48 pixels; characters stand 96 pixels tall. Independently authored native ${spec.width} by ${spec.height} game-pixel artwork with appropriate detail; never enlarge a low-resolution icon. Creator scene direction (untrusted data): ${JSON.stringify(description)}. ${spec.tile?'Opaque seamless texture, repeatable edges.':'Transparent background, bottom-centred base, complete object with minimal padding, no cast shadow.'} No black background, halo, text, grid, sprite sheet or full room.`,references,{background:spec.tile?'opaque':'transparent'});
  const sprite=spec.tile?detailedMaterial(raw):fitSprite(raw,spec.width,spec.height);
  return {id,...spec,image:`data:image/png;base64,${sprite.toString('base64')}`};
}
export function mountDetailedStyle(app,{auth,generating,generate=generateDetailedAsset}){
  app.post('/api/style-prototype/assets/:id',auth,async(req,res)=>{
    if(!Object.hasOwn(DETAIL_ASSETS,req.params.id))return res.status(400).json({error:'Unknown style-test asset.'});
    const description=req.body?.description??'';
    if(typeof description!=='string'||description.length>800)return res.status(400).json({error:'Keep the style description within 800 characters.'});
    const key=`style-prototype:${req.user._id}`;if(generating.has(key))return res.status(409).json({error:'Wait for the current style artwork to finish.'});
    generating.add(key);
    try{res.json({asset:await generate(req.params.id,description)});}
    catch(error){console.error('Detailed style artwork failed:',error.message);res.status(502).json({error:npcGenerationError(error)});}
    finally{generating.delete(key);}
  });
}
