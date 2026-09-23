from pathlib import Path
from PIL import Image,ImageDraw
import json
r=Path('weapon-fit');data=json.loads((r/'placements.json').read_text());out=r/'combined-review';out.mkdir(exist_ok=True)
def compose(n,w):
 c=next(c for c in data['characters'] if c['armor']==n and c['pose']==w['pose']);b=r/'fitting';im=Image.new('RGBA',(1800,1536));im.alpha_composite(Image.open(b/f'characters/{n}-{w["pose"]}.png'));g=Image.open(b/f'weapons/{w["id"]}.png');s=w['scale'];g=g.resize((round(g.width*s),round(g.height*s)),Image.Resampling.LANCZOS);layer=Image.new('RGBA',im.size);layer.alpha_composite(g,(round(c['grip'][0]-w['grip'][0]*s),round(c['grip'][1]-w['grip'][1]*s)));angle=data.get('pairAdjustments',{}).get(f'{n}-{w["id"]}',{}).get('angle',0);layer=layer.rotate(-angle,resample=Image.Resampling.BICUBIC,center=tuple(c['grip']));im.alpha_composite(layer);im.alpha_composite(Image.open(b/f'hands/{n}-{w["pose"]}.png'));return im,c
if __name__=='__main__':
 for start in range(0,len(data['weapons']),12):
  sheet=Image.new('RGB',(1800,1200),'#eee');d=ImageDraw.Draw(sheet)
  for k,w in enumerate(data['weapons'][start:start+12]):
   im,c=compose(1,w);crop=im.crop((250,100,1600,950));crop.thumbnail((450,370));x=k%4*450;y=k//4*400;sheet.paste(crop,(x,y+25),crop);d.text((x+5,y+5),str(w['id']),fill='black')
  sheet.save(out/f'weapons-{start}.jpg')
 for start in range(1,97,12):
  sheet=Image.new('RGB',(1800,1200),'#eee');d=ImageDraw.Draw(sheet)
  for k,n in enumerate(range(start,min(start+12,97))):
   w=next(w for w in data['weapons'] if w['id']==11);im,c=compose(n,w);crop=im.crop((250,150,1450,1050)).resize((450,338));x=k%4*450;y=k//4*400;sheet.paste(crop,(x,y+25),crop);d.text((x+5,y+5),str(n),fill='black')
  sheet.save(out/f'armor-{start}.jpg')
 for n,i in [(1,86),(1,11),(16,86),(48,50),(96,11)]:
  w=next(w for w in data['weapons'] if w['id']==i);im,c=compose(n,w);im.save(out/f'armor-{n}-weapon-{i}.png')
 print('Review sheets ready')
