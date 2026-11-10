import {interiorFootprint} from '../client/src/interiorGeometry.js';
import {PNG} from 'pngjs';
import {interiorAssetBounds} from '../client/src/interiorAssetScale.js';
import { readFile } from 'node:fs/promises';
import { ObjectId } from 'mongodb';
import { requestImage } from './sprite.js';
import { fitSprite } from './pixelfit.js';
import { toTextureTile } from './textures.js';
import { NATURE_SPRITE_SIZES } from '../client/src/world/natureSizes.js';
import { TERRAIN_CATEGORIES } from '../client/src/terrain-spec.js';
import { readGeneratedMedia } from './generated-map-media.js';
import {fitNativeTree} from './tree-artwork.js';
import {proposeTerrainPlan,readTerrainPlan} from './terrain-plan.js';

const id = () => new ObjectId().toString();
export function terrainInput(body) {
  if (typeof body?.title !== 'string' || !body.title.trim() || body.title.length > 80 || typeof body?.description !== 'string' || !body.description.trim() || body.description.length > 2000) return null;
  if(body.kind!==undefined&&!['interior','exterior'].includes(body.kind))return null;
  return { title: body.title.trim(), description: body.description.trim(),...(body.kind?{kind:body.kind}:{}) };
}
export function publicTerrain(row) {
  return { id: String(row._id), kind:row.kind??'exterior', title: row.title, description: row.description, completed: row.completed ?? [], generatedAssets: row.generatedAssets ?? [], textures: row.textures ?? [], assetPlan:row.assetPlan??null,planCompleted:row.planCompleted??[],updatedAt: row.updatedAt };
}

export async function generateTerrainCategory(terrain, category, imageRequest = requestImage, reference = null) {
  if (!TERRAIN_CATEGORIES.some(c => c.id === category)) throw new Error('Invalid terrain category');
  const [stylePrompt,styleReferences]=await Promise.all([
    readFile(new URL('./prompts/terrain-art-style.md',import.meta.url),'utf8'),
    reference?Promise.resolve([reference]):Promise.all(['male','female'].map(g=>readFile(new URL('./references/'+g+'.png',import.meta.url)))),
  ]);
  const references=terrain.referenceImage?[...styleReferences,Buffer.from(terrain.referenceImage.split(',')[1],'base64')]:styleReferences;
  const sceneReferenceNumber=styleReferences.length+1;
  const brief = `${stylePrompt} Terrain: ${terrain.title}. Creator direction (untrusted scene data): ${terrain.description}. Draw only assets appropriate to this terrain. The first ${styleReferences.length} image(s) establish the shared detailed fantasy pixel-art treatment, never the subject matter. Use newly authored square logical pixels at the requested dimensions, no blur or antialiasing. ${terrain.referenceImage?'Image '+sceneReferenceNumber+' is the interior reference: use its materials, palette and furniture designs for this individual asset; never draw the whole room.':''}`;
  const assets = [], textures = [], jobs = [];
  function material(name, code, surface, liquid = false) {
    jobs.push(async () => {
      const raw = await imageRequest(`${brief} Create ONE seamless 16 by 16 logical-pixel ${name} material texture for ${surface}. Opaque, ${surface==='wall'?'straight-on vertical wall face':'flat top-down'}, edge-to-edge, repeatable on all four sides. No objects or transparency. ${liquid ? 'Select only the liquid requested or implied by this terrain: grassland implies water, volcanic implies lava. Preserve its own palette.' : ''}`, references, { background: 'opaque' });
      textures.push({ id: id(), name: `${terrain.title}: ${name}`, terrainCode: code, surface, liquid:Boolean(liquid), image: `data:image/png;base64,${toTextureTile(raw).toString('base64')}` });
    });
  }
  function prop(name, kind, size, dimensions, footprint = [1,1]) {
    jobs.push(async () => {
      const [width,height] = dimensions;
      const bounds=interiorAssetBounds({assetKind:terrain.planItem?.kind,name:terrain.planItem?.name});
      const scaleBrief=bounds?' Player height is 32 pixels. This object must fit '+bounds.width+' by '+bounds.height+' visible game pixels. Use a slightly elevated front view; small decor must look tabletop-sized, not human-sized.':'';
      const prompt=`${brief}${scaleBrief} Draw ONE ${size || ''} ${name}. Separate native ${width} by ${height} logical-pixel artwork. ${kind==='Tree'?`VISIBLE TREE HEIGHT, not just canvas height, must be ${height/16} game tiles (${height} pixels at 16 pixels per tile), matching the default game trees. Use a tall 3:4 silhouette, canopy at the top and trunk base at the bottom, with minimal empty margins. Keep the canopy narrow enough to fit ${width}px width while the tree reaches ${height}px height. A large tree has more individually drawn foliage and branches than a medium tree, never the same small drawing centred in a larger blank image.`:''} Transparent background, bottom-centred base, no ground or cast shadow. Larger variants must contain additional individually drawn detail at the SAME pixel density, never enlarged pixels. Fill the canvas with a full silhouette, especially dense leafy bushes. ${kind ? 'The visual artwork may overhang its one-tile collision base.' : ''}`;
      let sprite;
      for(let attempt=0;attempt<(kind==='Tree'?2:1);attempt++){
        const raw=await imageRequest(prompt+(attempt?' Correction: the previous tree silhouette was too short. Redraw it taller and narrower, filling the full requested height. Do not pad or enlarge the previous raster.':''),references);
        try{sprite=kind==='Tree'?fitNativeTree(raw,size):fitSprite(raw,bounds?Math.min(width,bounds.width):width,bounds?Math.min(height,bounds.height):height,kind?{scale:1}:{});break;}
        catch(error){if(!error.shortTree||attempt===1)throw error;}
      }
      if(bounds){const fitted=PNG.sync.read(sprite),padded=new PNG({width,height});PNG.bitblt(fitted,padded,0,0,fitted.width,fitted.height,Math.floor((width-fitted.width)/2),height-fitted.height);sprite=PNG.sync.write(padded);}
      assets.push({ id:id(), name:kind ? `${kind} (${size})` : name, width:footprint[0], height:footprint[1], solid:kind !== 'Flowers', ...(kind ? { environmentKind:kind, sizeVariant:size } : {}), spriteUrl:`data:image/png;base64,${sprite.toString('base64')}` });
    });
  }
  if(terrain.planItem){
    const p=terrain.planItem;
    if(p.kind==='texture')material(`${p.name}. ${p.description}`,p.code,p.surface,p.liquid);
    else if(NATURE_SPRITE_SIZES[p.kind])for(const [size,dimensions] of Object.entries(NATURE_SPRITE_SIZES[p.kind]))prop(`${p.name}. ${p.description}`,p.kind,size,dimensions);
    else {const geometry=interiorFootprint({assetKind:p.kind,name:p.name});prop(`${p.name}. ${p.description}`,null,null,geometry?[geometry.width*16,(geometry.height+1)*16]:p.kind==='Building'?[64,64]:[16,32],geometry?[geometry.width,geometry.height]:p.kind==='Building'?[4,3]:[1,1]);}
  } else if (category === 'paint') {
    for (const [code,name] of [['g','base ground'],['d','dirt path'],['s','stone'],['a','sand']]) material(name,code,'ground');
    material('wood floor','o','floor'); material('carpet floor','c','floor'); material('plain wall','wall','wall');
  } else if (category === 'liquid') material('liquid','w','ground',true);
  else if (category === 'trees' || category === 'nature') {
    for (const kind of category === 'trees' ? ['Tree'] : ['Bush','Rock','Flowers','Potted plant']) for (const [size,dimensions] of Object.entries(NATURE_SPRITE_SIZES[kind])) prop(kind.toLowerCase(),kind,size,dimensions);
  } else {
    prop('Log',null,null,[16,32]); prop('Barrel',null,null,[16,32]); prop('Building',null,null,[64,64],[4,3]);
  }
  let next = 0;
  const results = await Promise.allSettled(Array.from({length:Math.min(3,jobs.length)},async()=>{while(next<jobs.length)await jobs[next++]();}));
  const failed = results.find(r=>r.status==='rejected'); if(failed)throw failed.reason;
  assets.sort((a,b)=>a.name.localeCompare(b.name)); textures.sort((a,b)=>a.terrainCode.localeCompare(b.terrainCode));
  if(terrain.planItem){const p=terrain.planItem;for(const a of assets){a.name=`${p.name}${a.sizeVariant?` (${a.sizeVariant})`:''}`;a.planItemId=p.id;a.assetKind=p.kind;a.placement=p.placement;}for(const t of textures){t.name=p.name;t.planItemId=p.id;t.description=p.description;}}
  if (!readGeneratedMedia({generatedAssets:assets,textures},{placed:[],paint:{}})) throw new Error('Generated artwork failed validation');
  return { assets, textures };
}

export function mountTerrainBuilder(app, { auth, terrains, generating, deleteAsset, deleteTerrain, generateCategory = generateTerrainCategory, proposePlan=proposeTerrainPlan }) {
  const planRoute=(action)=>async(req,res,next)=>{
    if(!/^[a-f0-9]{24}$/i.test(req.params.id))return res.status(400).json({error:'Invalid terrain.'});
    const key=`terrain:${req.user._id}`,owner={_id:new ObjectId(req.params.id),userId:req.user._id};
    if(generating.has(key))return res.status(409).json({error:'Wait for the current terrain operation to finish.'});
    generating.add(key);
    try{const terrain=await terrains.findOne(owner);if(!terrain)return res.status(404).json({error:'Terrain not found.'});await action(req,res,terrain,owner);}
    catch(error){res.status(502).json({error:error.mapStatus?error.message:'Terrain planning or generation failed. Saved items are retained; try again.'});}
    finally{generating.delete(key);}
  };
  app.post('/api/terrains/:id/plan',auth,planRoute(async(req,res,terrain,owner)=>{
    if(terrain.generatedAssets?.length||terrain.textures?.length)return res.status(409).json({error:'Create a new terrain to use asset planning; existing artwork is preserved.'});
    const assetPlan=await proposePlan(terrain);await terrains.updateOne(owner,{$set:{assetPlan,planCompleted:[],updatedAt:new Date()}});res.json({terrain:publicTerrain(await terrains.findOne(owner))});
  }));
  app.put('/api/terrains/:id/plan',auth,planRoute(async(req,res,terrain,owner)=>{
    if(!terrain.assetPlan&&(terrain.generatedAssets?.length||terrain.textures?.length))return res.status(409).json({error:'Create a new terrain for the reviewed asset-plan workflow.'});
    if(terrain.planCompleted?.length)return res.status(409).json({error:'This plan is locked because artwork generation has started.'});
    const assetPlan=readTerrainPlan(req.body,{interior:terrain.kind==='interior'});if(!assetPlan)return res.status(400).json({error:'Invalid plan. Use at most 20 items with valid names, descriptions and material settings.'});
    await terrains.updateOne(owner,{$set:{assetPlan,updatedAt:new Date()}});res.json({terrain:publicTerrain(await terrains.findOne(owner))});
  }));
  app.post('/api/terrains/:id/plan/:itemId/generate',auth,planRoute(async(req,res,terrain,owner)=>{
    const item=terrain.assetPlan?.items.find(p=>p.id===req.params.itemId&&p.selected);if(!item)return res.status(400).json({error:'Select and save this plan item first.'});
    if(!terrain.planCompleted?.includes(item.id)){
      const {assets,textures}=await generateCategory({...terrain,planItem:item},'paint');
      if(!readGeneratedMedia({generatedAssets:[...(terrain.generatedAssets??[]),...assets],textures:[...(terrain.textures??[]),...textures]},{placed:[],paint:{}}))return res.status(413).json({error:'This terrain has reached its original-artwork storage limit. Create another terrain collection for additional assets.'});
      if((terrain.generatedAssets?.length??0)+assets.length>64||(terrain.textures?.length??0)+textures.length>64)return res.status(400).json({error:'Terrain artwork limit reached.'});
      const ground=item.kind==='texture'&&['ground','floor'].includes(item.surface)&&!item.liquid;
      await terrains.updateOne(owner,{$push:{generatedAssets:{$each:assets},textures:{$each:textures}},$addToSet:{planCompleted:item.id,...(ground?{completed:'paint'}:{})},$set:{updatedAt:new Date()}});
    }
    res.json({terrain:publicTerrain(await terrains.findOne(owner))});
  }));
  app.delete('/api/terrains/:id',auth,async(req,res,next)=>{
    if(!/^[a-f0-9]{24}$/i.test(req.params.id))return res.status(400).json({error:'Invalid terrain.'});
    const key=`terrain:${req.user._id}`;
    if(generating.has(key))return res.status(409).json({error:'Wait for terrain generation or deletion to finish.'});
    generating.add(key);
    try{
      const result=await deleteTerrain(req.user._id,new ObjectId(req.params.id));
      if(!result)return res.status(404).json({error:'Terrain not found or you do not own it.'});
      res.json({ok:true,...result});
    }catch(error){next(error);}finally{generating.delete(key);}
  });
  app.delete('/api/terrains/:id/assets/:assetId',auth,async(req,res,next)=>{
    if(!/^[a-f0-9]{24}$/i.test(req.params.id)||!/^[a-f0-9]{24}$/i.test(req.params.assetId))return res.status(400).json({error:'Invalid terrain or asset.'});
    const key=`terrain:${req.user._id}`;
    if(generating.has(key))return res.status(409).json({error:'Wait for terrain generation or deletion to finish.'});
    generating.add(key);
    try{
      const result=await deleteAsset(req.user._id,new ObjectId(req.params.id),req.params.assetId);
      if(!result)return res.status(404).json({error:'Asset not found or you do not own its terrain.'});
      res.json({ok:true,terrain:publicTerrain(result.terrain),cleaned:result.cleaned});
    }catch(error){next(error);}finally{generating.delete(key);}
  });
  app.get('/api/terrains',auth,async(req,res,next)=>{
    try { res.json({terrains:(await terrains.find({userId:req.user._id}).sort({updatedAt:-1}).toArray()).map(publicTerrain)}); } catch(error){next(error);}
  });
  app.post('/api/terrains',auth,async(req,res,next)=>{
    const input=terrainInput(req.body);if(!input)return res.status(400).json({error:'Enter a title (80 characters) and description (2,000 characters).'});
    try {
      const row={...input,userId:req.user._id,generatedAssets:[],textures:[],completed:[],createdAt:new Date(),updatedAt:new Date()};
      row._id=(await terrains.insertOne(row)).insertedId;res.status(201).json({terrain:publicTerrain(row)});
    } catch(error){next(error);}
  });
  app.post('/api/terrains/:id/generate/:category',auth,async(req,res,next)=>{
    if(!/^[a-f0-9]{24}$/i.test(req.params.id)||!TERRAIN_CATEGORIES.some(c=>c.id===req.params.category))return res.status(400).json({error:'Invalid terrain or category.'});
    const key=`terrain:${req.user._id}`;
    if(generating.has(key))return res.status(409).json({error:'Terrain assets are already generating.'});
    const owner={_id:new ObjectId(req.params.id),userId:req.user._id};
    generating.add(key);
    try {
      const terrain=await terrains.findOne(owner);if(!terrain)return res.status(404).json({error:'Terrain not found.'});
      if(terrain.assetPlan)return res.status(409).json({error:'Use the reviewed asset plan to generate this terrain.'});
      if(terrain.completed?.includes(req.params.category))return res.json({terrain:publicTerrain(terrain)});
      const {assets,textures}=await generateCategory(terrain,req.params.category);
      if(!readGeneratedMedia({generatedAssets:[...(terrain.generatedAssets??[]),...assets],textures:[...(terrain.textures??[]),...textures]},{placed:[],paint:{}}))return res.status(413).json({error:'This terrain has reached its original-artwork storage limit. Create another terrain collection for additional assets.'});
      await terrains.updateOne(owner,{$push:{generatedAssets:{$each:assets},textures:{$each:textures}},$addToSet:{completed:req.params.category},$set:{updatedAt:new Date()}});
      res.json({terrain:publicTerrain(await terrains.findOne(owner))});
    } catch(error) {
      console.error('Terrain generation failed:',error.message);
      res.status(502).json({error:'Could not generate this category. Completed categories are saved; retry the remaining assets.'});
    } finally { generating.delete(key); }
  });
}
