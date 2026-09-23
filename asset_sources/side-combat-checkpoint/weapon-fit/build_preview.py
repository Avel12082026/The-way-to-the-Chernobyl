from pathlib import Path
from PIL import Image,ImageDraw,ImageOps
import json,numpy as np,sys,shutil
sys.path.insert(0,str(Path('game/tools').resolve()))
from clean_sprite_alpha import clean_alpha
root=Path('weapon-fit'); out=root/'fitting'
for d in ['weapons','characters','hands']:(out/d).mkdir(parents=True,exist_ok=True)
anchors=json.loads((root/'weapon-anchors.json').read_text());heavy=json.loads((root/'heavy-grips.json').read_text())
weapons=[];checks=[]
for w in json.loads((root/'catalog.json').read_text()):
 i=w['id'];p=root/f'weapons/{i}.png';im=clean_alpha(Image.open(p))
 if i==99:im=ImageOps.mirror(im)
 im.save(out/f'weapons/{i}.png')
 a=np.asarray(im)[:,:,3];bbox=im.getbbox();w.update(size=im.size,grip=anchors[str(i)],scale=.16 if w['pose']=='pistol' else .5,bbox=bbox)
 if i in [6,102,103,104,105]:w['scale']=.18
 if i in [4,8,9,43,62,73]:w['scale']=.42
 w['fitStatus']='preview'
 if i in [4,8,9,43,62,73]:w['fitStatus']='support-hand-review'
 weapons.append(w);checks.append({'weapon':i,'transparentPixels':int((a==0).sum()),'opaquePixels':int((a==255).sum()),'bbox':bbox,'rightFacing':True})
chars=[]
for n in range(1,97):
 for pose in ['pistol','heavy']:
  p=Path(f'game/asset_sources/side_combat/armor-{n}/{pose}.png');im=Image.open(p).convert('RGBA');a=np.array(im)[:,:,3]
  rows,cols=np.where(a[:700]>128);x=int(cols.max());ys,xs=np.where(a[:700,max(0,x-32):x+1]>128);top=int(ys.min())
  if pose=='pistol':
   grip=[x-68,top+35];regions=[[x-132,top-1,x+2,top+145]]
   if n==1:grip=[838,314];regions=[[790,284,910,406]]
  else:
   grip=heavy[n-1];gx,gy=grip;regions=[[gx-55,gy-35,gx+55,gy+65],[x-108,top,x+2,top+120]]
   if n==1:grip=[550,468];regions=[[492,432,592,523],[849,406,960,482]]
  mask=Image.new('L',im.size);d=ImageDraw.Draw(mask)
  for r in regions:d.rectangle(r,fill=255)
  pixels=np.array(im);pixels[:,:,3]=np.minimum(pixels[:,:,3],np.array(mask));pixels[pixels[:,:,3]==0,:3]=0
  Image.fromarray(pixels).save(out/f'hands/{n}-{pose}.png')
  shutil.copyfile(p,out/f'characters/{n}-{pose}.png')
  chars.append({'armor':n,'pose':pose,'grip':grip,'regions':regions,'support':[x-55,top+35],'fitReview':'preview-not-individually-approved'})
data={'weapons':weapons,'characters':chars,'canvas':[1800,1536],'note':'Примерка оружия. Возможны несовпадения хвата; компактное оружие требует отдельной проверки второй руки.'}
(out/'data.js').write_text('window.FIT_DATA='+json.dumps(data,ensure_ascii=False)+';')
(root/'placements.json').write_text(json.dumps(data,ensure_ascii=False,indent=2));(root/'alpha-check.json').write_text(json.dumps(checks,indent=2))
print(len(weapons),'weapon layers;',len(chars),'poses;',len(weapons)*96,'selectable combinations')
