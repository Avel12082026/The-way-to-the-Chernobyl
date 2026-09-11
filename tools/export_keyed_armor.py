"""Export a individually reviewed chroma-key or RGBA source, preserving PNG alpha in WebP."""
import argparse,json,hashlib
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from export_transparent_armor import frame
p=argparse.ArgumentParser();p.add_argument('source',type=Path);p.add_argument('output',type=Path);p.add_argument('--kind',choices=['char','icon'],required=True);a=p.parse_args()
im=Image.open(a.source)
if im.mode=='RGBA' and im.getchannel('A').getextrema()[0]==0:
 cut=im.copy()
else:
 rgb=np.array(im.convert('RGB')).astype(float)
 key=(np.minimum(rgb[:,:,0],rgb[:,:,2])-rgb[:,:,1])
 bg=(key>80)&(rgb[:,:,0]>120)&(rgb[:,:,2]>120)
 if bg.mean()<.1: raise ValueError('No reliable magenta key or existing alpha; needs individual mask')
 foreground=~bg
 labels,n=ndi.label(foreground);counts=np.bincount(labels.ravel());counts[0]=0;foreground=labels==counts.argmax()
 alpha=foreground.astype('uint8')*255
 # Remove chroma spill only at boundary, preserving red armor elsewhere.
 edge=foreground&~ndi.binary_erosion(foreground,iterations=2)
 spill=edge&(key>20)
 rgb[:,:,2][spill]=np.minimum(rgb[:,:,2][spill],rgb[:,:,1][spill])
 rgb[:,:,0][spill]=np.minimum(rgb[:,:,0][spill],rgb[:,:,1][spill]+30)
 rgba=np.dstack([rgb.astype('uint8'),alpha]);rgba[alpha==0,:3]=0;cut=Image.fromarray(rgba)
a.output.parent.mkdir(parents=True,exist_ok=True)
cut.save(a.output.with_suffix('.png'))
result,meta=frame(cut,'character' if a.kind=='char' else 'icon')
result.save(a.output,quality=90,method=6)
saved=Image.open(a.output)
assert saved.getchannel('A').tobytes()==result.getchannel('A').tobytes()
for color,label in [('#eeeeee','light'),('#202020','dark')]:
 canvas=Image.new('RGBA',result.size,color);canvas.alpha_composite(saved);canvas.convert('RGB').save(a.output.with_name(a.output.stem+'_'+label+'.jpg'))
print(json.dumps({'file':str(a.output),'sha256':hashlib.sha256(a.output.read_bytes()).hexdigest(),'size':saved.size,'alpha_lossless':True,**meta}))
