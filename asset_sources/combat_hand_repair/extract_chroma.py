"""Extract a magenta-backed candidate without treating neutral steel as background."""
import sys
from PIL import Image
import numpy as np
from scipy import ndimage as ndi
im=np.array(Image.open(sys.argv[1]).convert('RGB')).astype(float)
strength=np.minimum(im[:,:,0],im[:,:,2])-im[:,:,1]
a=np.clip((180-strength)/140,0,1)
a[strength<40]=1
# Despill boundary pixels only; don't alter opaque gun/skin/sleeve colors.
rgb=im.copy(); edge=(a>0)&(a<1)
for c in [0,2]:
 rgb[:,:,c][edge]=np.clip((im[:,:,c][edge]-255*(1-a[edge]))/a[edge],0,255)
rgb[a==0]=0
Image.fromarray(np.dstack([rgb,a*255]).astype('uint8'),'RGBA').save(sys.argv[2])
print('Saved RGBA; transparent pixels:',int((a==0).sum()))
