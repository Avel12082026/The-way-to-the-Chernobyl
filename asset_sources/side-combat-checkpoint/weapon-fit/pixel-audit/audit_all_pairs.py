from pathlib import Path
from PIL import Image
import numpy as np,json,csv,math
from scipy.ndimage import distance_transform_edt,label
r=Path(__file__).resolve().parent;d=json.loads((r/'placements.json').read_text());out=r/'pixel-audit';out.mkdir(exist_ok=True)
weapons={};source=[]
for w in d['weapons']:
 im=Image.open(r/f'fitting/weapons/{w["id"]}.png').convert('RGBA');a=np.array(im.getchannel('A'));s=w['scale'];weapons[w['id']]=im.resize((round(im.width*s),round(im.height*s)),Image.Resampling.LANCZOS)
 source.append({'id':w['id'],'alpha_zero':int((a==0).sum()),'alpha_partial':int(((a>0)&(a<255)).sum()),'opaque':int((a==255).sum()),'border_nonzero':int(np.count_nonzero(a[0])+np.count_nonzero(a[-1])+np.count_nonzero(a[:,0])+np.count_nonzero(a[:,-1]))})
rows=[]
for c in d['characters']:
 hand=Image.open(r/f'fitting/hands/{c["armor"]}-{c["pose"]}.png').getchannel('A');ha=np.array(hand)>128
 for w in d['weapons']:
  if w['pose']!=c['pose']:continue
  g=weapons[w['id']];x=round(c['grip'][0]-w['grip'][0]*w['scale']);y=round(c['grip'][1]-w['grip'][1]*w['scale'])
  layer=Image.new('L',(1800,800));layer.paste(g.getchannel('A'),(x,y));angle=d.get('pairAdjustments',{}).get(f'{c["armor"]}-{w["id"]}',{}).get('angle',0)
  if angle:layer=layer.rotate(-angle,resample=Image.Resampling.BICUBIC,center=tuple(c['grip']))
  ga=np.array(layer)>128
  vals=[]
  for reg in c['regions']:
   x0,y0,x1,y1=map(int,reg);x0=max(0,x0);y0=max(0,y0);x1=min(1024,x1);y1=min(800,y1)
   h=ha[y0:y1,x0:x1];v=ga[y0:y1,x0:x1];overlap=int(np.count_nonzero(h&v))
   # Exact pixel distance within a padded local crop; no anatomical inference.
   pad=250;ax=max(0,x0-pad);ay=max(0,y0-pad);bx=min(1800,x1+pad);by=min(800,y1+pad)
   sub=ga[ay:by,ax:bx];distance=0.0 if overlap else None
   if not overlap and h.any() and sub.any():
    dist=distance_transform_edt(~sub);part=dist[y0-ay:y1-ay,x0-ax:x1-ax];distance=round(float(part[h].min()),2)
   vals.append((overlap,distance))
  rows.append({'armor':c['armor'],'weapon':w['id'],'name':w['name'],'pose':c['pose'],'primary_overlap_pixels':vals[0][0],'primary_gap_pixels':vals[0][1],'support_overlap_pixels':vals[-1][0] if len(vals)>1 else '', 'support_gap_pixels':vals[-1][1] if len(vals)>1 else '', 'anatomy_status':'NOT_REVIEWED','acceptance':'NOT_APPROVED'})
 print(c['armor'],c['pose'],flush=True)
with (out/'all-11136-pairs.csv').open('w',newline='') as f:
 wr=csv.DictWriter(f,fieldnames=rows[0].keys());wr.writeheader();wr.writerows(rows)
(out/'weapon-alpha.json').write_text(json.dumps(source,indent=2));summary={'pairs':len(rows),'primary_no_overlap':sum(v['primary_overlap_pixels']==0 for v in rows),'heavy_support_no_overlap':sum(v['pose']=='heavy' and v['support_overlap_pixels']==0 for v in rows),'anatomically_approved':0,'meaning':'Pixel contact screening only; overlap does not prove correct grip or fingers.'};(out/'summary.json').write_text(json.dumps(summary,indent=2));print(summary)
