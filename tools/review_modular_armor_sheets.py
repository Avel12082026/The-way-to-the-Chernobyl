from PIL import Image, ImageDraw
from pathlib import Path
import json,sys
armor=int(sys.argv[1]);p=Path(__file__).resolve().parents[1]/f'asset_sources/combat_hand_repair/anatomy-{armor}'
ids=[e['weapon'] for e in json.loads((p/'all-pairs.json').read_text())]
for start in range(0,len(ids),6):
 grip=Image.new('RGB',(1500,1000),(210,210,205));flash=Image.new('RGB',(1536,1536),(30,30,30));gd=ImageDraw.Draw(grip);fd=ImageDraw.Draw(flash)
 for i,w in enumerate(ids[start:start+6]):
  im=Image.open(p/f'pair-{w}.png');bg=Image.new('RGBA',im.size,(210,210,205,255));bg.alpha_composite(im);crop=bg.crop((725,465,1100,815)).resize((500,466));grip.paste(crop.convert('RGB'),(i%3*500,i//3*500+30));gd.text((i%3*500+10,i//3*500+5),str(w),fill='black')
  shot=Image.open(p/f'shot-{w}.jpg');shot.thumbnail((768,512));flash.paste(shot,(i%2*768,i//2*512));fd.text((i%2*768+10,i//2*512+10),str(w),fill='white')
 grip.save(p/f'grip-sheet-{start//6+1}.jpg');flash.save(p/f'flash-sheet-{start//6+1}.jpg')
