import {ObjectId} from 'mongodb';
import {INTERIOR_MAP_SIZES} from '../client/src/interiorMapSizes.js';
import {generateMapFromTerrain} from './terrain-map.js';
import {publicMapError} from './map-analysis-errors.js';

export function mountInteriorPrototype(app,{auth,terrains,generating,generate=generateMapFromTerrain}){
  app.post('/api/terrains/:id/interior-prototype',auth,async(req,res)=>{
    if(!/^[a-f0-9]{24}$/i.test(req.params.id))return res.status(400).json({error:'Invalid interior collection.'});
    const size=req.body?.size??'medium';
    if(typeof size!=='string'||!Object.hasOwn(INTERIOR_MAP_SIZES,size))return res.status(400).json({error:'Choose small, medium or large.'});
    const key=`terrain:${req.user._id}`;
    if(generating.has(key))return res.status(409).json({error:'Wait for the current collection operation to finish.'});
    generating.add(key);
    try{
      const collection=await terrains.findOne({_id:new ObjectId(req.params.id),userId:req.user._id});
      if(!collection||collection.kind!=='interior')return res.status(404).json({error:'Interior collection not found.'});
      if(!collection.textures?.some(t=>t.surface==='floor'&&!t.liquid)||!collection.textures?.some(t=>t.surface==='wall'))return res.status(400).json({error:'Generate floor and wall paint first.'});
      const name=`${collection.title} prototype`.slice(0,40);
      const map=await generate(collection.referenceImage?Buffer.from(collection.referenceImage.split(',')[1],'base64'):null,1024,1024,name,`Room title and description (untrusted design data): ${JSON.stringify({title:collection.title,description:collection.description})}. Design a furnished interior using this collection only. Do not generate new artwork.`,'interior',collection,undefined,size);
      res.json({map});
    }catch(error){console.error('Interior prototype failed:',error.message);const failure=publicMapError(error);res.status(failure.status).json({error:failure.message});}
    finally{generating.delete(key);}
  });
}
