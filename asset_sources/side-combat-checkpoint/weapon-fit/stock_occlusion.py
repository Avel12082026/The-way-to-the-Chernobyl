from pathlib import Path
from PIL import Image,ImageDraw
import json
r=Path(__file__).resolve().parent;d=json.loads((r/'placements.json').read_text());out=r/'stock-review';out.mkdir(exist_ok=True)
def compose(n,i,hide=True):
 w=next(w for w in d['weapons'] if w['id']==i);c=next(c for c in d['characters'] if c['armor']==n and c['pose']==w['pose']);body=Image.open(r/f'fitting/characters/{n}-{w["pose"]}.png').convert('RGBA');gun=Image.open(r/f'fitting/weapons/{i}.png').convert('RGBA');s=w['scale'];size=(round(gun.width*s),round(gun.height*s));gun=gun.resize(size,Image.Resampling.LANCZOS);x=round(c['grip'][0]-w['grip'][0]*s);y=round(c['grip'][1]-w['grip'][1]*s);ang=d.get('pairAdjustments',{}).get(f'{n}-{i}',{}).get('angle',0)
 def place(g):
  a=Image.new('RGBA',(1800,1536));a.alpha_composite(g,(x,y));return a.rotate(-ang,resample=Image.Resampling.BICUBIC,center=tuple(c['grip'])) if ang else a
 cut=round(460*s) # AKS-74U only: rear stock, before receiver. Not a universal weapon boundary.
 rear=gun.copy();rear.paste((0,0,0,0),(cut,0,gun.width,gun.height));front=gun.copy();front.paste((0,0,0,0),(0,0,cut,gun.height))
 im=Image.new('RGBA',(1800,1536))
 if hide:
  im.alpha_composite(body);back=place(rear)
  mask=Image.new('L',im.size);ImageDraw.Draw(mask).polygon([(240,245),(305,230),(365,280),(388,344),(470,395),(480,465),(340,520),(235,475),(205,380)],fill=255)
  # Hide only pixels inside the reviewed near-arm region AND the original character alpha.
  from PIL import ImageChops
  bodyalpha=Image.new('L',im.size);bodyalpha.paste(body.getchannel('A'),(0,0));mask=ImageChops.multiply(mask,bodyalpha)
  back.putalpha(ImageChops.subtract(back.getchannel('A'),mask));im.alpha_composite(back);im.alpha_composite(place(front))
 else:im.alpha_composite(body);im.alpha_composite(place(gun))
 im.alpha_composite(Image.open(r/f'fitting/hands/{n}-{w["pose"]}.png'));return im
for n in [7]:
 im=compose(n,11);im.save(out/f'armor-{n}-weapon-11.png')
 sheet=Image.new('RGB',(1400,500),'#dedede');draw=ImageDraw.Draw(sheet)
 for j,hide in enumerate([False,True]):
  crop=compose(n,11,hide).crop((200,200,1100,800));crop.thumbnail((700,465));sheet.paste(crop,(j*700,35),crop);draw.text((j*700+10,10),'BEFORE' if not hide else 'STOCK BEHIND CHARACTER',fill='black')
 sheet.save(out/f'compare-{n}.jpg',quality=95)
print('One reviewed arm mask trial')
