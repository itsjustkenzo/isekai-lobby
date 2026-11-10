"""Build the HUD's browser font from the existing 3x5 canvas glyphs; no dependencies."""
import ast, re, struct
from pathlib import Path

root = Path(__file__).resolve().parent.parent
source = (root / 'client/src/world/pixelUi.js').read_text(encoding='utf-8')
block = source.split('const FONT = {', 1)[1].split('\n};', 1)[0]
pattern = r'''('(?:\\.|[^'])*'|"(?:\\.|[^"])*"|[A-Za-z0-9]+)\s*:\s*(\[[^\]]*\])'''
glyphs = {}
for match in re.finditer(pattern, block):
    key = match[1]
    glyphs[ast.literal_eval(key) if key[0] in "\"'" else key] = ast.literal_eval(match[2])
assert len(glyphs) >= 45, len(glyphs)
glyphs.update({'+':['...','.#.','###','.#.','...'], '=':['...','###','...','###','...'], '_':['...','...','...','...','###'], '*':['...','#.#','.#.','#.#','...'], '<':['..#','.#.','#..','.#.','..#'], '>':['#..','.#.','..#','.#.','#..']})
u16=lambda n:struct.pack('>H',n&65535)
i16=lambda n:struct.pack('>h',n)
u32=lambda n:struct.pack('>I',n&0xffffffff)
pad=lambda data:data+b'\0'*((-len(data))%4)
checksum=lambda data:sum(struct.unpack('>'+'I'*(len(pad(data))//4),pad(data)))&0xffffffff

def outline(rows):
    points=[];ends=[]
    for y,row in enumerate(rows):
        for x,char in enumerate(row):
            if char=='#':
                px,py=x*125,(4-y)*125
                points += [(px,py),(px,py+125),(px+125,py+125),(px+125,py)]
                ends.append(len(points)-1)
    if not points:return b''
    data=i16(len(ends))+i16(0)+i16(0)+i16(len(rows[0])*125)+i16(625)
    data+=b''.join(u16(n) for n in ends)+u16(0)+b'\x01'*len(points)
    for axis in (0,1):
        previous=0
        for point in points:
            data+=i16(point[axis]-previous);previous=point[axis]
    return pad(data)

rows_list=[glyphs['?']]+list(glyphs.values())
ids={key:i+1 for i,key in enumerate(glyphs)}
char_map={ord(key):gid for key,gid in ids.items()}
for char in 'abcdefghijklmnopqrstuvwxyz':char_map[ord(char)]=ids[char.upper()]
for char,alias in {'\u00d7':'X','\u00b7':'.','\u2013':'-','\u2014':'-','\u2192':'>','\u2019':"'"}.items():char_map[ord(char)]=ids[alias]
glyf=b'';offsets=[]
for rows in rows_list:offsets.append(len(glyf));glyf+=outline(rows)
offsets.append(len(glyf))
count=len(rows_list)
head=u32(0x00010000)+u32(0x00010000)+u32(0)+u32(0x5f0f3cf5)+u16(3)+u16(1000)+b'\0'*16+i16(0)+i16(0)+i16(625)+i16(625)+u16(0)+u16(8)+i16(2)+i16(1)+i16(0)
hhea=u32(0x00010000)+i16(800)+i16(-200)+i16(0)+u16(750)+i16(0)+i16(0)+i16(625)+i16(1)+i16(0)+i16(0)+b'\0'*8+i16(0)+u16(count)
maxp=u32(0x00010000)+u16(count)+b''.join(u16(n) for n in [160,40,0,0,2,0,0,0,0,0,0,0,0])
hmtx=b''.join(u16((len(rows[0])+1)*125)+i16(0) for rows in rows_list)
codes=sorted(char_map)+[65535];segments=len(codes);power=2**(segments.bit_length()-1)
fmt4=u16(4)+u16(16+8*segments)+u16(0)+u16(segments*2)+u16(power*2)+u16(power.bit_length()-1)+u16(segments*2-power*2)
fmt4+=b''.join(u16(c) for c in codes)+u16(0)+b''.join(u16(c) for c in codes)
fmt4+=b''.join(u16((char_map[c]-c) if c!=65535 else 1) for c in codes)+b'\0\0'*segments
cmap=u16(0)+u16(1)+u16(3)+u16(1)+u32(12)+fmt4
names={1:'Isekai Pixel',2:'Regular',3:'IsekaiPixel-Regular-1.0',4:'Isekai Pixel',5:'Version 1.0',6:'IsekaiPixel-Regular'}
strings=b'';records=b''
for nid,value in names.items():
    data=value.encode('utf-16-be');records+=u16(3)+u16(1)+u16(0x409)+u16(nid)+u16(len(data))+u16(len(strings));strings+=data
name=u16(0)+u16(len(names))+u16(6+len(records))+records+strings
os2=bytearray(78)
def put(offset,value,signed=False):os2[offset:offset+2]=i16(value) if signed else u16(value)
put(0,0);put(2,500,True);put(4,400);put(6,5)
for offset,value in [(10,650),(12,600),(16,75),(18,650),(20,600),(24,350),(26,50),(28,250)]:put(offset,value)
os2[42:46]=u32(1);os2[58:62]=b'ISKI';put(62,64);put(64,32);put(66,max(char_map));put(68,800,True);put(70,-200,True);put(72,0,True);put(74,800);put(76,200)
post=u32(0x00030000)+u32(0)+i16(-100)+i16(50)+u32(0)+b'\0'*16
tables={'OS/2':bytes(os2),'cmap':cmap,'glyf':glyf,'head':head,'hhea':hhea,'hmtx':hmtx,'loca':b''.join(u32(n) for n in offsets),'maxp':maxp,'name':name,'post':post}
n=len(tables);power=2**(n.bit_length()-1)
font=u32(0x00010000)+u16(n)+u16(power*16)+u16(power.bit_length()-1)+u16(n*16-power*16)
offset=12+n*16;body=b'';head_offset=0
for tag,data in sorted(tables.items()):
    font+=tag.encode('ascii')+u32(checksum(data))+u32(offset)+u32(len(data))
    if tag=='head':head_offset=offset
    body+=pad(data);offset+=len(pad(data))
font=bytearray(font+body)
font[head_offset+8:head_offset+12]=u32(0xb1b0afba-checksum(font))
assert checksum(font)==0xb1b0afba
assert len(head)==54 and len(hhea)==36 and len(maxp)==32
output=root/'client/public/fonts/isekai-pixel.ttf'
output.write_bytes(font)
print(f'Built {output.name}: {count} glyphs, {len(font)} bytes')
