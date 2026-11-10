import React,{useEffect,useState} from 'react';
const kinds=['texture','Tree','Bush','Rock','Flowers','Potted plant','Log','Barrel','Building'];
const nature=['Tree','Bush','Rock','Flowers','Potted plant'];
export default function TerrainPlanReview({terrain,blocked,onGenerate}){
  const [plan,setPlan]=useState(terrain.assetPlan);
  useEffect(()=>setPlan(terrain.assetPlan),[terrain.assetPlan]);
  const locked=Boolean(terrain.planCompleted?.length),count=plan.items.filter(p=>p.selected).reduce((n,p)=>n+(nature.includes(p.kind)?3:1),0);
  const edit=(id,change)=>setPlan(p=>({...p,items:p.items.map(item=>item.id===id?{...item,...change}:item)}));
  return <section className="terrain-plan-review"><h3>Review your biome asset plan</h3><p>{plan.interpretation}</p><p>Names identify species and materials. Nature items get three separately drawn sizes. Optional suggestions start deselected. This version creates decorative artwork, not animals or NPCs.</p>
    {plan.items.map(item=><fieldset key={item.id} disabled={blocked||locked}><legend><label><input type="checkbox" checked={item.selected} onChange={e=>edit(item.id,{selected:e.target.checked})}/> {item.name}{item.optional?' (optional)':''}{terrain.planCompleted?.includes(item.id)?' — ready':''}</label></legend>
      <label>Name<input maxLength={40} value={item.name} onChange={e=>edit(item.id,{name:e.target.value})}/></label>
      <label>Artwork type<select value={item.kind} onChange={e=>edit(item.id,{kind:e.target.value})}>{kinds.map(k=><option key={k}>{k}</option>)}</select></label>
      <label>Artwork description<textarea rows={2} maxLength={600} value={item.description} onChange={e=>edit(item.id,{description:e.target.value})}/></label>
      <label>Where it belongs<textarea rows={2} maxLength={400} value={item.placement} onChange={e=>edit(item.id,{placement:e.target.value})}/></label>
      {item.kind==='texture'&&<><label>Material role<select value={item.code} onChange={e=>{const code=e.target.value;edit(item.id,{code,liquid:code==='w',surface:code==='wall'?'wall':['o','c'].includes(code)?'floor':'ground'});}}>{[['g','Base ground / variation'],['d','Soil / path'],['s','Rock / solid ice'],['a','Sand'],['w','Liquid (blocks movement)'],['o','Wood floor'],['c','Carpet floor'],['wall','Wall']].map(([code,label])=><option value={code} key={code}>{label}</option>)}</select></label><small>Solid ice uses a dry ground role; liquid paint always blocks movement.</small></>}
      <button type="button" className="text-button" onClick={()=>setPlan(p=>({...p,items:p.items.filter(x=>x.id!==item.id)}))}>Remove from plan</button>
    </fieldset>)}
    {!locked&&<button type="button" className="text-button" disabled={blocked||plan.items.length>=20} onClick={()=>{const id=Array.from(crypto.getRandomValues(new Uint8Array(12)),x=>x.toString(16).padStart(2,'0')).join('');setPlan(p=>({...p,items:[...p.items,{id,name:'New asset',description:'Describe this asset.',placement:'Describe its suitable surroundings.',kind:'Bush',selected:true,optional:false,code:'g',surface:'ground',liquid:false}]}));}}>+ Add plan item</button>}
    <p>{count} artwork images selected. Each nature family counts as three. Planning uses analysis credits; generating uses image credits. Exact cost depends on your configured models; failed artwork may require another attempt.</p>
    {locked&&<p>The plan is locked because generation has started. Completed items will be skipped when resuming.</p>}
    <button type="button" className="design-button" disabled={blocked||!count||plan.items.filter(p=>p.selected).every(p=>terrain.planCompleted?.includes(p.id))} onClick={()=>onGenerate(plan)}>{locked?'Generate remaining approved assets':'Approve plan and generate selected assets'}</button>
  </section>;
}
