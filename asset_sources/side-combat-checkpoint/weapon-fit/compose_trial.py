from PIL import Image,ImageDraw
from pathlib import Path
import sys
sys.path.insert(0,str(Path('game/tools').resolve()))
from clean_sprite_alpha import clean_alpha
out=Path('weapon-fit');(out/'previews').mkdir(exist_ok=True)
for wid,src in [(86,'exec-f1f74f79-8a93-4967-878d-5f8672e37726.png'),(11,'exec-dfcb2227-e91a-4bdd-8209-dd4709ea3f30.png')]:
 im=clean_alpha(Image.open(Path('generated_images')/src));im.save(out/f'weapons/{wid}.png')
for pose,wid,scale,anchor,target,regions in [
 ('pistol',86,.16,(400,650),(850,334),[(790,284,910,406)]),
 ('heavy',11,.53,(525,530),(550,468),[(492,432,592,523),(849,406,960,482)])]:
 char=Image.open(f'game/asset_sources/side_combat/armor-1/{pose}.png').convert('RGBA');gun=Image.open(out/f'weapons/{wid}.png')
 canvas=Image.new('RGBA',(1536,1536));canvas.alpha_composite(char)
 gun=gun.resize((round(gun.width*scale),round(gun.height*scale)),Image.Resampling.LANCZOS)
 canvas.alpha_composite(gun,(round(target[0]-anchor[0]*scale),round(target[1]-anchor[1]*scale)))
 mask=Image.new('L',char.size);d=ImageDraw.Draw(mask)
 for r in regions:d.rectangle(r,fill=255)
 import numpy as np
 arr=np.array(char);arr[:,:,3]=np.minimum(arr[:,:,3],np.array(mask));canvas.alpha_composite(Image.fromarray(arr))
 canvas.save(out/f'previews/armor-1-weapon-{wid}.png')
 for bg in ['white','black']:
  v=Image.new('RGBA',canvas.size,bg);v.alpha_composite(canvas);v.convert('RGB').resize((768,768)).save(out/f'previews/armor-1-weapon-{wid}-{bg}.jpg')
