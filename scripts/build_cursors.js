import { PNG } from 'pngjs';
import { mkdirSync,writeFileSync } from 'node:fs';
const palette={k:'#292338',w:'#fff1cf',g:'#f2c14e',d:'#a0663a',s:'#6e4426',m:'#b9c8cf'};
const shapes={
 arrow:['k...............','kk..............','kwk.............','kwwk............','kwwwk...........','kwwwwk..........','kwwwwwk.........','kwwwwwwk........','kwwwwwwwk.......','kwwwwkkkkk......','kwwkwk..........','kwk.kwk.........','kk..kwk.........','k....kwk........','.....kk.........','................'],
 hand:['.....kk.........','....kwwk........','....kwwk........','....kwwk........','....kwwkk.......','....kwwkwkk.....','....kwwkwwkk....','.kk.kwwwwwwwk...','kwwkkwwwwwwwk...','kwwwkwwwwwwwk...','.kwwwwwwwwwwk...','..kwwwwwwwwwk...','...kwwwwwwwk....','...kwwwwwwwk....','....kkkkkkk.....','................'],
 hoe:['................','.......kkkkkk...','......kmmmmmmk..','......kmmwwmmk..','.......kkdkkk...','........kdk.....','.......kdsk.....','.......kdk......','......kdsk......','......kdk.......','.....kdsk.......','.....kdk........','....kdsk........','....kkk.........','................','................'],
 grab:['................','................','.....kk..kk.....','....kwwkkwwk....','..kkkwwkkwwkk...','.kwwkwwwwwwwwk..','.kwwwwwwwwwwwk..','..kwwwwwwwwwwk..','..kwwwwwwwwwwk..','...kwwwwwwwwk...','...kwwwwwwwwk...','....kwwwwwwk....','....kkkkkkkk....','................','................','................'],
 cross:['................','.......kk.......','.......kgk......','.......kgk......','.......kk.......','................','..kkk......kkk..','.kggk..kk..kggk.','..kkk..kk..kkk..','................','.......kk.......','.......kgk......','.......kgk......','.......kk.......','................','................']
};
mkdirSync('client/public/cursors',{recursive:true});
for(const [name,rows] of Object.entries(shapes)){
 const png=new PNG({width:32,height:32});
 rows.forEach((row,y)=>[...row].forEach((char,x)=>{
  if(!palette[char])return;const rgb=palette[char].slice(1).match(/../g).map(c=>parseInt(c,16));
  for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++)png.data.set([...rgb,255],((y*2+dy)*32+x*2+dx)*4);
 }));
 writeFileSync(`client/public/cursors/${name}.png`,PNG.sync.write(png));
}
console.log('Built 5 pixel-art cursors (32 x 32).');
