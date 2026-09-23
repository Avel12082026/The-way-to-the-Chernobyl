"""Render every weapon on a fixed character without altering source assets."""
from pathlib import Path
import json, hashlib
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import binary_erosion
from compose_modular import ROOT, DATA, compose, backgrounds

out=ROOT/'pixel-review';out.mkdir(exist_ok=True)
audit=[]
for w in DATA['weapons']:
    p=ROOT/f'fitting/weapons/{w["id"]}.png'
    with Image.open(p) as im:
        rgba=im.convert('RGBA');a=np.asarray(rgba.getchannel('A'));core=binary_erosion(a>0,iterations=3)
        audit.append({'id':w['id'],'name':w['name'],'width':im.width,'height':im.height,
                      'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),
                      'transparent_pixels':int((a==0).sum()),'opaque_pixels':int((a==255).sum()),
                      'partial_alpha_core_pixels':int(((a>0)&(a<255)&core).sum()),
                      'edge_nonzero_pixels':int(np.count_nonzero(a[0])+np.count_nonzero(a[-1])+np.count_nonzero(a[:,0])+np.count_nonzero(a[:,-1])),
                      'status':'SOURCE_REVIEW_REQUIRED' if any([a[0].any(),a[-1].any(),a[:,0].any(),a[:,-1].any()]) else 'ALPHA_PRESENT_NOT_VISUALLY_CERTIFIED'})
(out/'source-alpha-audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2))
for pose in ['pistol','heavy']:
    weapons=[w for w in DATA['weapons'] if w['pose']==pose]
    for start in range(0,len(weapons),8):
        sheet=Image.new('RGB',(1600,1040),'#e7e7e7');draw=ImageDraw.Draw(sheet)
        for k,w in enumerate(weapons[start:start+8]):
            im,_,c=compose(1,w['id']);crop=im.crop((c['grip'][0]-220,c['grip'][1]-170, min(1800,c['support'][0]+450),c['grip'][1]+240))
            crop.thumbnail((790,220));bg=backgrounds(crop)[2]
            x=(k%2)*800;y=(k//2)*260;sheet.paste(bg,(x,y+30));draw.text((x+8,y+6),f'Armor 1 / weapon {w["id"]} / {pose}',fill='black')
        sheet.save(out/f'weapons-{pose}-{start+1:03d}.jpg',quality=95)
print('Weapon sources audited:',len(audit),'; edge warnings:',sum(x['edge_nonzero_pixels']>0 for x in audit))
