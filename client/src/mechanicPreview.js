import {validMechanicBehavior} from './mechanicBehavior.js';
export function initialMechanicPreview(){return {player:{x:3,y:4,dx:1,dy:0},targets:[{id:'tree',name:'Practice tree',x:7,y:2,health:3},{id:'dummy',name:'Training dummy',x:7,y:4,health:3}],lastUsed:null,health:5,resources:0,interactions:0,signals:0,emotes:0,message:'Move with WASD or arrow keys. Left-click a target to try the action.'};}
export function movePreview(state,dx,dy){const x=state.player.x+dx,y=state.player.y+dy,blocked=x<0||y<0||x>=12||y>=8||state.targets.some(t=>t.health>0&&t.x===x&&t.y===y);return {...state,player:{...state.player,...(!blocked?{x,y}:{}),dx,dy}};}
export function performPreview(state,mechanic,now,targetId){
  if(!mechanic.name?.trim()||!Number.isFinite(mechanic.cooldown)||mechanic.cooldown<0||!Number.isFinite(mechanic.range)||mechanic.range<0)return {...state,message:'Give the action a name and valid range/cooldown first.'};
  const remaining=state.lastUsed===null?0:Math.max(0,mechanic.cooldown*1000-(now-state.lastUsed));
  if(remaining)return {...state,message:`Cooling down: ${(remaining/1000).toFixed(1)}s remaining.`};
  const target=state.targets.find(t=>t.id===targetId&&t.health>0),self=mechanic.target==='self';
  if(!self){
    if(!target)return {...state,message:'Choose a remaining practice target.'};
    if(Math.hypot(target.x-state.player.x,target.y-state.player.y)>mechanic.range)return {...state,message:`${target.name} is out of range. Move closer.`};
    if(mechanic.target==='direction'){
      const dx=target.x-state.player.x,dy=target.y-state.player.y,p=state.player;
      if(dx*p.dx+dy*p.dy<=0||Math.abs(dx*p.dy-dy*p.dx)>.5)return {...state,message:'Face the target using a movement key first.'};
    }
  }
  const behavior=validMechanicBehavior(mechanic.behavior)?mechanic.behavior:null,amount=behavior?.amount??1;
  const category=({damage:'combat',heal:'heal',gather:'gathering',move:'movement',interact:'interaction',emote:'emote',signal:'custom'})[behavior?.effect]??mechanic.category;
  const result={...state,lastUsed:now,message:`${mechanic.name} performed${self?' on self':` on ${target.name}`}.`};
  if(category==='heal'){result.health=Math.min(10,(state.health??5)+amount);result.message=`${mechanic.name}: restored ${amount} practice health.`;
  }else if(category==='movement'){
    let next=state;for(let i=0;i<Math.min(12,Math.floor(Math.min(mechanic.range,behavior?.amount??mechanic.range)));i++){const moved=movePreview(next,state.player.dx,state.player.dy);if(moved.player.x===next.player.x&&moved.player.y===next.player.y)break;next=moved;}
    if(next.player.x===state.player.x&&next.player.y===state.player.y)return {...state,message:'Movement is blocked or range is less than one tile.'};
    result.player=next.player;result.message=`${mechanic.name}: moved to (${next.player.x}, ${next.player.y}).`;
  }else if(category==='combat'){
    if(self)result.message=`${mechanic.name}: self-targeted combat effect.`;
    else {result.targets=state.targets.map(t=>t.id===target.id?{...t,health:Math.max(0,t.health-amount)}:t);result.message=`${mechanic.name}: ${target.name} lost ${amount} practice hit points.`;}
  }else if(category==='gathering'){
    if(self||target.id!=='tree')return {...state,message:'Gathering needs the practice tree as its target.'};
    result.resources=state.resources+amount;result.targets=state.targets.map(t=>t.id===target.id?{...t,health:Math.max(0,t.health-amount)}:t);result.message=`${mechanic.name}: collected ${amount} ${behavior?.resourceName||'practice resource'}.`;
  }else if(category==='emote')result.emotes=state.emotes+1;
  else if(category==='interaction')result.interactions=state.interactions+1;
  else result.signals=state.signals+1;
  return result;
}
