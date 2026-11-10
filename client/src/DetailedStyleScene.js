import {playStep} from './world/sfx.js';
import Phaser from 'phaser';
import {pixelateSprite} from './world/characterSprite.js';
import {DETAIL_TILE as T,DETAIL_CHARACTER_HEIGHT,DETAIL_ASSETS,detailedStyleScene,detailedStyleBlocked} from './detailedStyleSpec.js';

export class DetailedStyleScene extends Phaser.Scene{
  constructor({assets,heroUrl,onAction=()=>{}}){super('detailed-style-lab');this.onAction=onAction;this.artwork=assets;this.heroUrl=heroUrl;this.room=detailedStyleScene();}
  preload(){for(const a of this.artwork)this.load.image(a.id,a.image);if(this.heroUrl)this.load.image('hero-source',this.heroUrl);}
  create(){
    const graphics=this.add.graphics().setDepth(-1),{width,height}=this.room;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const side=x===0||x===width-1||y===height-1,wall=y<3&&!side,key=wall?'wall':'floor';
      if(!side&&this.textures.exists(key))this.add.image(x*T,y*T,key).setOrigin(0).setDepth(-3);
      else graphics.fillStyle(side?0x2b2333:wall?0x665c70:0x807462).fillRect(x*T,y*T,T,T);
      if(side)graphics.lineStyle(2,0x514556).strokeRect(x*T,y*T,T,T);
    }
    this.lights=new Map();
    for(const p of this.room.placed){
      const spec=DETAIL_ASSETS[p.id],cx=(p.x+spec.footprint[0]/2)*T,bottom=(p.y+1)*T;
      graphics.fillStyle(0x17121b,.25).fillEllipse(cx,bottom-5,spec.footprint[0]*T*.8,14);
      if(p.id==='lamp'){
        const glow=this.add.graphics().setDepth(-2);this.lights.set(p,glow);for(let r=4;r>=1;r--)glow.fillStyle(0xffc067,.025).fillCircle(cx,bottom-24,r*24);
      }
      if(this.textures.exists(p.id))this.add.image(cx,bottom,p.id).setOrigin(.5,1).setDepth(bottom);
      else graphics.fillStyle(0x55404c).fillRect(cx-spec.width/2,bottom-spec.height,spec.width,spec.height);
    }
    this.pos={x:(this.room.spawn.x+.5)*T,y:(this.room.spawn.y+1)*T-6};
    if(this.textures.exists('hero-source')){
      const source=this.textures.get('hero-source').getSourceImage();
      this.textures.addCanvas('hero-detailed',pixelateSprite(source,{height:DETAIL_CHARACTER_HEIGHT-2}));
      this.hero=this.add.image(this.pos.x,this.pos.y,'hero-detailed').setOrigin(.5,1);
    }else this.hero=this.add.rectangle(this.pos.x,this.pos.y,40,DETAIL_CHARACTER_HEIGHT,0xd8c7b6).setOrigin(.5,1);
    this.walkMotion={height:0};this.walking=false;
    this.followTarget=this.add.zone(this.pos.x,this.pos.y,1,1);
    this.shadow=this.add.ellipse(this.pos.x,this.pos.y-2,34,10,0x16121c,.3);
    this.cursors=this.input.keyboard.createCursorKeys();this.keys=this.input.keyboard.addKeys('W,A,S,D');this.input.keyboard.clearCaptures();
    this.cameras.main.setBounds(0,0,width*T,height*T).setZoom(Math.max(1,Math.round(window.devicePixelRatio||1))).setRoundPixels(true);
    this.cameras.main.startFollow(this.followTarget,true,1,1);
    this.input.on('wheel',(pointer,objects,dx,dy)=>{
      const base=Math.max(1,Math.round(window.devicePixelRatio||1)),camera=this.cameras.main;
      camera.setZoom(Phaser.Math.Clamp(camera.zoom+(dy<0?base:-base),base,base*3));
    });
    this.input.on('pointerdown',pointer=>{
      if(pointer.button!==0)return;
      const world=pointer.positionToCamera(this.cameras.main);
      const target=this.room.placed.find(p=>{
        const spec=DETAIL_ASSETS[p.id],cx=(p.x+spec.footprint[0]/2)*T,bottom=(p.y+1)*T;
        return Math.abs(world.x-cx)<=spec.width/2&&world.y>=bottom-spec.height&&world.y<=bottom;
      });
      if(!target){this.onAction('No nearby object selected. Walk with WASD or arrow keys.');return;}
      const tx=(target.x+DETAIL_ASSETS[target.id].footprint[0]/2)*T,ty=(target.y+1)*T;
      if(Math.hypot(this.pos.x-tx,this.pos.y-ty)>T*2.5){this.onAction('Move closer to interact.');return;}
      if(target.id==='lamp'){const light=this.lights.get(target);light.setVisible(!light.visible);this.onAction(light.visible?'Candlelight on.':'Candlelight off.');}
      else this.onAction({throne:'An ornate throne. Walk around it to check scale and layering.',table:'A carved table. Its base blocks movement while the artwork extends above it.',chair:'An upholstered chair. Compare its height with your character.'}[target.id]);
    });
  }
  footstep(){
    const context=this.sound.context;
    if(this.muted||!context||this.sound.locked||context.state!=='running')return;
    this.stepAlternate=!this.stepAlternate;
    playStep(context,this.sound.destination??context.destination,'s',this.stepAlternate,true);
  }
  update(time,delta){
    const k=this.input.keyboard;if(!this.hero)return;
    let dx=Number(this.keys.D.isDown||this.cursors.right.isDown)-Number(this.keys.A.isDown||this.cursors.left.isDown),dy=Number(this.keys.S.isDown||this.cursors.down.isDown)-Number(this.keys.W.isDown||this.cursors.up.isDown);
    if(!k?.enabled){dx=0;dy=0;}
    const beforeX=this.pos.x,beforeY=this.pos.y;
    const length=Math.hypot(dx,dy)||1,step=192*Math.min(delta,50)/1000;dx=dx/length*step;dy=dy/length*step;
    const fits=(x,y)=>[-12,12].every(ox=>[-10,-1].every(oy=>!detailedStyleBlocked(this.room,Math.floor((x+ox)/T),Math.floor((y+oy)/T))));
    if(fits(this.pos.x+dx,this.pos.y))this.pos.x+=dx;if(fits(this.pos.x,this.pos.y+dy))this.pos.y+=dy;
    const moving=Math.hypot(this.pos.x-beforeX,this.pos.y-beforeY)>.01;
    if(moving!==this.walking){
      this.walking=moving;this.walkTween?.stop();
      if(moving)this.footstep();
      this.walkTween=this.tweens.add({
        targets:this.walkMotion,height:moving?9:0,
        duration:moving?145:130,ease:moving?'Sine.Out':'Bounce.Out',
        onRepeat:()=>{if(this.walking&&this.input.keyboard?.enabled)this.footstep();},
        yoyo:moving,repeat:moving?-1:0,
      });
    }
    const idle=!moving&&this.walkMotion.height<.1?Math.round((Math.sin(time/650)+1)*.5):0;
    const hop=Math.round(this.walkMotion.height)+idle;
    if(dx)this.hero.setFlipX(dx<0);
    this.hero.setPosition(Math.round(this.pos.x),Math.round(this.pos.y)-hop).setDepth(this.pos.y);
    this.followTarget.setPosition(Math.round(this.pos.x),Math.round(this.pos.y));
    this.shadow.setPosition(this.hero.x,Math.round(this.pos.y)-2).setDepth(this.pos.y-.1).setScale(1-this.walkMotion.height*.018).setAlpha(.3-this.walkMotion.height*.008);
  }
}
