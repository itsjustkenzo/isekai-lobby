import {PNG} from 'pngjs';
export const MAX_ORIGINAL_BYTES=2*1024*1024;
export function preserveArtwork(buffer,displayWidth,displayHeight,{tile=false}={}){
  if(buffer.length>MAX_ORIGINAL_BYTES||buffer.length<24)throw new Error('Original artwork exceeds the supported image storage limit');
  const width=buffer.readUInt32BE(16),height=buffer.readUInt32BE(20);
  if(width<1||height<1||width>2048||height>2048)throw new Error('Unsupported original artwork dimensions');
  const png=PNG.sync.read(buffer);let left=width,top=height,right=-1,bottom=-1;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(png.data[(y*width+x)*4+3]>0){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
  if(tile||right<left){left=0;top=0;right=width-1;bottom=height-1;}
  // Match opposite edges at source resolution, retaining interior pixel detail.
  // Texture masters remain opaque and seamless when sampled as one game tile.
  let rendered=buffer;
  if(tile){
    for(let i=0;i<png.data.length;i+=4){const a=png.data[i+3]/255;for(let c=0;c<3;c++)png.data[i+c]=Math.round(png.data[i+c]*a+100*(1-a));png.data[i+3]=255;}
    const match=(a,b)=>{for(let c=0;c<3;c++)png.data[a+c]=png.data[b+c]=Math.round((png.data[a+c]+png.data[b+c])/2);};
    for(let y=0;y<height;y++)match(y*width*4,(y*width+width-1)*4);
    for(let x=0;x<width;x++)match(x*4,((height-1)*width+x)*4);
    rendered=PNG.sync.write(png);
  }
  return {image:`data:image/png;base64,${rendered.toString('base64')}`,frame:{x:left,y:top,width:right-left+1,height:bottom-top+1},displayWidth,displayHeight};
}
export function validOriginalArtwork(a,w,h){
  if(!a||a.displayWidth!==w||a.displayHeight!==h||typeof a.image!=='string'||a.image.length>Math.ceil(MAX_ORIGINAL_BYTES*4/3)+100||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(a.image))return false;
  const f=a.frame;if(!f||![f.x,f.y,f.width,f.height].every(Number.isInteger)||f.x<0||f.y<0||f.width<1||f.height<1)return false;
  try{const b=Buffer.from(a.image.split(',')[1],'base64');if(b.length>MAX_ORIGINAL_BYTES||b.length<24)return false;const width=b.readUInt32BE(16),height=b.readUInt32BE(20);if(width>2048||height>2048||f.x+f.width>width||f.y+f.height>height)return false;PNG.sync.read(b);return true;}catch{return false;}
}
