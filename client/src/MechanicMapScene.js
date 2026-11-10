import {PlayScene} from './world/PlayScene.js';
import {TILE} from './world/art.js';
import {initialMechanicPreview,performPreview} from './mechanicPreview.js';
import {createMechanicTestMap} from './mechanicTestMap.js';
export class MechanicMapScene extends PlayScene{
  constructor({mechanic,heroUrl,object,onState,onReady,onError}){
    const state=initialMechanicPreview();state.targets[1].name='Practice rock';
    super({world:createMechanicTestMap(state),heroUrl,spawn:{x:3,y:4},equipment:object??null,equipmentLibrary:object?[object]:[],muted:true,ambienceVolume:0,time:{mode:'off'},weather:{mode:'off'}});
    this.mechanic=mechanic;this.practice=state;this.object=object;this.onState=onState;this.onReady=onReady;this.onError=onError;
    this.options.onMechanicAction=(x,y)=>this.perform(this.practice.targets.find(t=>t.x===x&&t.y===y&&t.health>0)?.id);
  }
  create(){
    super.create();this.input.keyboard.clearCaptures();this.input.keyboard.enabled=false;
    this.rangeOverlay=this.add.graphics().setDepth(-.5);this.grid=this.add.graphics().setDepth(-.4);
    this.grid.lineStyle(.5,0xffffff,.22);
    for(let x=0;x<=this.world.width;x++)this.grid.lineBetween(x*TILE,0,x*TILE,this.world.height*TILE);
    for(let y=0;y<=this.world.height;y++)this.grid.lineBetween(0,y*TILE,this.world.width*TILE,y*TILE);
    this.onReady?.(this);this.onState?.(this.practice);this.follow();
  }
  inputDirection(){const direction=super.inputDirection();if(direction)this.facing=Math.abs(direction.dx)>Math.abs(direction.dy)?{dx:Math.sign(direction.dx),dy:0}:{dx:0,dy:Math.sign(direction.dy)};return direction;}
  perform(targetId='dummy'){
    if(!this.hero){this.onError?.('Your character is still loading. Please wait.');return;}
    if(this.mechanic.objectId&&!this.object){this.onError?.('The attached object is unavailable. Choose another object.');return;}
    const feet=this.feetTile(),before={...this.practice,player:{...feet,...(this.facing??{dx:1,dy:0})}},now=Date.now(),next=performPreview(before,this.mechanic,now,targetId);
    this.practice=next;this.onState?.(next);
    if(next.lastUsed===before.lastUsed)return;
    if(next.player.x!==feet.x||next.player.y!==feet.y){this.pos.x=next.player.x*TILE+TILE/2;this.pos.y=next.player.y*TILE+TILE-2;this.placeHero();}
    const changed=[];
    for(const t of next.targets)if(t.health<=0&&this.world.objects[t.y*this.world.width+t.x]!=='.'){this.world.objects[t.y*this.world.width+t.x]='.';changed.push(t.y*this.world.width+t.x);}
    if(changed.length)this.updateTiles(changed);
    const duration=this.mechanic.behavior?.duration??400;
    if(this.heldEquipment)this.tweens.add({targets:this.heldEquipment,angle:{from:-55,to:55},duration:duration/2,yoyo:true,onComplete:()=>this.heldEquipment?.setAngle(0)});
    else this.tweens.add({targets:this.hop,y:-3,duration:duration/2,yoyo:true});
    const glow=this.add.graphics().setDepth(this.pos.y+2),healing=this.mechanic.behavior?.effect==='heal';glow.lineStyle(1,healing?0x71f6ab:0xffe391,.9).strokeCircle(this.pos.x,this.pos.y-10,10);
    this.tweens.add({targets:glow,alpha:0,duration,onComplete:()=>glow.destroy()});
  }
  update(time,delta){super.update(time,delta);if(!this.rangeOverlay||!this.pos)return;const feet=this.feetTile();this.rangeOverlay.clear().fillStyle(0xffdf36,.15);for(let y=0;y<this.world.height;y++)for(let x=0;x<this.world.width;x++)if(Math.hypot(x-feet.x,y-feet.y)<=this.mechanic.range)this.rangeOverlay.fillRect(x*TILE,y*TILE,TILE,TILE);}
  follow(){if(!this.cameras?.main)return;const cam=this.cameras.main,w=this.world.width*TILE,h=this.world.height*TILE,zoom=Math.max(1,Math.floor(Math.min(cam.width/(w+16),cam.height/(h+32))));this.setView(zoom,(w-cam.width/zoom)/2,(h-cam.height/zoom)/2);}
}
