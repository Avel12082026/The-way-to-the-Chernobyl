from pathlib import Path
from PIL import Image,ImageDraw
import json
r=Path(__file__).resolve().parent;d=json.loads((r/'placements.json').read_text());out=r/'pixel-audit';out.mkdir(exist_ok=True)
for start in range(1,97,12):
 sheet=Image.new('RGB',(2048,1536),'#dedede');pen=ImageDraw.Draw(sheet)
 for j,n in enumerate(range(start,start+12)):
  for k,pose in enumerate(['pistol','heavy']):
   c=next(c for c in d['characters'] if c['armor']==n and c['pose']==pose);im=Image.open(r/f'fitting/characters/{n}-{pose}.png').convert('RGBA');gx,gy=c['grip'];x0=max(0,gx-140);y0=max(0,gy-110);crop=im.crop((x0,y0,x0+512,y0+220));idx=j*2+k;x=idx%4*512;y=idx//4*256;sheet.paste(crop,(x,y+30),crop);pen.text((x+8,y+8),f'ARMOR {n} / {pose} / ORIGINAL HANDS',fill='black')
 sheet.save(out/f'base-hands-{start:02}.jpg',quality=95)
print('8 sheets / 192 original hand poses')
