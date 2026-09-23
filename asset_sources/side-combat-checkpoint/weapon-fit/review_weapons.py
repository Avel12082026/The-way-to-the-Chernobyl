from PIL import Image,ImageDraw
from pathlib import Path
import sys
sys.path.insert(0,'game/tools')
from clean_sprite_alpha import clean_alpha
files=sorted(Path('weapon-fit/weapons').glob('*.png'),key=lambda p:int(p.stem))
for start in range(0,len(files),12):
 out=Image.new('RGB',(1800,1200),'#eee');d=ImageDraw.Draw(out)
 for k,p in enumerate(files[start:start+12]):
  im=clean_alpha(Image.open(p));im.thumbnail((440,350));x=k%4*450;y=k//4*400
  out.paste(im,(x,y+25),im);d.text((x+5,y+5),p.stem,fill='black')
 out.save(f'weapon-fit/weapon-review-{start}.jpg')
print(len(files))
