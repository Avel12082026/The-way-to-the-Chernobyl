from pathlib import Path
import sys
import numpy as np
from scipy import ndimage as ndi
from PIL import Image
root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/'tools'))
from export_transparent_armor import frame
out=root/'asset_sources/armor_16_96'
for kind in ['char','icon']:
 im=Image.open(out/f'armor_{kind}_16_rgb_draft.png').convert('RGB'); a=np.array(im).astype(float)
 gray=(a.max(2)-a.min(2)<20)&(a.min(2)>155)
 labels,n=ndi.label(gray); counts=np.bincount(labels.ravel()); bg=np.isin(labels,np.where(counts>250)[0]);bg[labels==0]=False
 fg=~bg
 labs,n=ndi.label(fg); counts=np.bincount(labs.ravel());counts[0]=0;fg=labs==counts.argmax()
 # Smooth only the silhouette boundary; retain internal openings.
 alpha=np.clip(ndi.distance_transform_edt(fg),0,1)*255
 rgba=np.dstack([a.astype('uint8'),alpha.astype('uint8')]);rgba[alpha==0,:3]=0
 cut=Image.fromarray(rgba);cut.save(out/f'armor_{kind}_16.png')
 result,_=frame(cut,'character' if kind=='char' else 'icon');result.save(out/f'armor_{kind}_16.webp',quality=90,method=6)
 assert Image.open(out/f'armor_{kind}_16.webp').getchannel('A').tobytes()==result.getchannel('A').tobytes()
 for color,label in [('#eeeeee','light'),('#202020','dark')]:
  canvas=Image.new('RGBA',result.size,color);canvas.alpha_composite(result);canvas.convert('RGB').save(out/f'{kind}_{label}.jpg')
