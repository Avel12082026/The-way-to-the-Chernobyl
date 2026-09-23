from pathlib import Path
from PIL import Image,ImageDraw
import json,numpy as np,sys,shutil
sys.path.insert(0,str(Path('game/tools').resolve()))
from clean_sprite_alpha import clean_alpha
root=Path('weapon-fit');out=root/'fitting';out.mkdir(exist_ok=True);(out/'characters').mkdir(exist_ok=True);(out/'weapons').mkdir(exist_ok=True)
anchors={86:(400,650,.16),2:(340,650,.16),87:(360,660,.16),1:(290,650,.16),3:(260,650,.15),88:(300,650,.16),5:(300,650,.16),6:(180,690,.18),89:(300,650,.16)}
weapons=[]
for w in json.loads((root/'catalog.json').read_text()):
 p=root/f'weapons/{w["id"]}.png'
 if not p.exists():continue
 im=clean_alpha(Image.open(p));im.save(out/f'weapons/{w["id"]}.png')
 w['size']=im.size
 if w['id'] in anchors:w['grip']=anchors[w['id']][:2];w['scale']=anchors[w['id']][2]
 elif w['id']==11:w['grip']=[525,530];w['scale']=.53
 else:continue
 weapons.append(w)
chars=[]
for n in range(1,97):
 for pose in ['pistol','heavy']:
  p=Path(f'game/asset_sources/side_combat/armor-{n}/{pose}.png');im=Image.open(p).convert('RGBA');a=np.array(im)[:,:,3]
  rows,cols=np.where(a[:700]>128);x=int(cols.max());ys,xs=np.where(a[:700,max(0,x-32):x+1]>128);top=int(ys.min());mid=float(np.median(ys))
  if pose=='pistol':
   grip=[x-56,top+55];regions=[[x-132,top-1,x+2,top+145]]
  else:
   grip=[550,468];regions=[[492,432,592,523],[x-108,top,x+2,top+120]]
  if n==1 and pose=='pistol':grip=[850,334];regions=[[790,284,910,406]]
  if n==1 and pose=='heavy':regions=[[492,432,592,523],[849,406,960,482]]
  chars.append({'armor':n,'pose':pose,'grip':grip,'regions':regions,'fitReview':'trial-unreviewed' if n!=1 else 'overview-reviewed-trigger-fit-pending'})
  shutil.copyfile(p,out/f'characters/{n}-{pose}.png')
data={'weapons':weapons,'characters':chars,'canvas':[1536,1536],'note':'Примерка. Точное положение пальца на спуске ещё проверяется.'}
(out/'data.js').write_text('window.FIT_DATA='+json.dumps(data,ensure_ascii=False)+';')
(root/'placements.json').write_text(json.dumps(data,ensure_ascii=False,indent=2))
# Overview QA for all pistol poses using one fixed weapon, no character repainting.
gun=Image.open(out/'weapons/86.png');gun=gun.resize((round(gun.width*.16),round(gun.height*.16)),Image.Resampling.LANCZOS)
for start in range(1,97,12):
 sheet=Image.new('RGB',(1800,1050),'#eee');d=ImageDraw.Draw(sheet)
 for k,n in enumerate(range(start,min(start+12,97))):
  c=next(c for c in chars if c['armor']==n and c['pose']=='pistol');im=Image.open(out/f'characters/{n}-pistol.png').convert('RGBA');canvas=Image.new('RGBA',(1536,1536));canvas.alpha_composite(im);x,y=c['grip'];canvas.alpha_composite(gun,(round(x-64),round(y-104)))
  mask=Image.new('L',im.size);md=ImageDraw.Draw(mask)
  for r in c['regions']:md.rectangle(r,fill=255)
  a=np.array(im);a[:,:,3]=np.minimum(a[:,:,3],np.array(mask));canvas.alpha_composite(Image.fromarray(a))
  view=Image.new('RGBA',canvas.size,'#eee');view.alpha_composite(canvas)
  crop=view.crop((250,100,1150,800)).resize((450,350));xx=k%4*450;yy=k//4*350;sheet.paste(crop,(xx,yy));d.text((xx+5,yy+5),str(n),fill='black')
 sheet.save(root/f'pistol-fits-{start}.jpg')
print(len(weapons),'weapons,',len(chars),'poses')
