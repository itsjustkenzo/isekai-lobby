import {ObjectId} from 'mongodb';
import {generateEquipment,validEquipmentLibrary} from './equipment.js';
export function objectInput(body){
  if(!body||typeof body.name!=='string'||!body.name.trim()||body.name.length>60||typeof body.description!=='string'||!body.description.trim()||body.description.length>800)return null;
  return {name:body.name.trim(),description:body.description.trim(),kind:'custom'};
}
const publicObject=row=>({id:String(row._id),name:row.name,description:row.description,kind:row.kind,image:row.image,...(row.originalArtwork?{originalArtwork:row.originalArtwork}:{}),updatedAt:row.updatedAt});
export function mountObjectBuilder(app,{auth,objects,generating,generate=generateEquipment}){
  app.get('/api/objects',auth,async(req,res,next)=>{try{res.json({objects:(await objects.find({userId:req.user._id}).sort({updatedAt:-1}).toArray()).map(publicObject)});}catch(error){next(error);}});
  app.post('/api/objects/generate',auth,async(req,res)=>{
    const input=objectInput(req.body);if(!input)return res.status(400).json({error:'Name your object and describe its appearance.'});
    const key=`equipment:${req.user._id}`;if(generating.has(key))return res.status(409).json({error:'An object is already generating. Please wait.'});
    generating.add(key);
    try{
      const image=await generate(input.name,input.description,input.kind,null),_id=new ObjectId();
      const row={...input,_id,userId:req.user._id,image:`data:image/png;base64,${image.toString('base64')}`,...(image.originalArtwork?{originalArtwork:image.originalArtwork}:{}),createdAt:new Date(),updatedAt:new Date()};
      if(!validEquipmentLibrary([{...input,id:String(_id),image:row.image,...(row.originalArtwork?{originalArtwork:row.originalArtwork}:{})}]))throw new Error('Invalid generated object artwork');
      await objects.insertOne(row);res.status(201).json({object:publicObject(row)});
    }catch(error){res.status(502).json({error:'Could not generate and save this object. Check image-generation credits and server configuration, then try again.'});}
    finally{generating.delete(key);}
  });
}
