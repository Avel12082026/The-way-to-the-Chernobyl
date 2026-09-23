from pathlib import Path
from PIL import Image
import numpy as np
from scipy import ndimage as n
r=Path('audit-work/weapon-fit/reviewed-variants')
for k,f in [(8,'exec-79ba98f1-0d9b-44b8-911a-90e2ee07d347.png'),(9,'exec-cd6ebaa9-a419-4ebe-aebc-60ee651385af.png')]:
 im=Image.open(Path('generated_images')/f).convert('RGB');a=np.array(im).astype(float);smooth=n.gaussian_filter(a,(1.2,1.2,0));energy=n.gaussian_filter(np.mean((a-smooth)**2,axis=2),1)
 mask=energy>9;mask=n.binary_closing(mask,iterations=3);lab,num=n.label(mask);counts=np.bincount(lab.ravel());counts[0]=0;mask=lab==counts.argmax();holes=n.binary_fill_holes(mask)&~mask;hl,hn=n.label(holes);hc=np.bincount(hl.ravel());fill=hc<6000;fill[0]=False;mask|=fill[hl];mask=n.binary_closing(mask,iterations=2);alpha=(n.gaussian_filter(mask.astype(float),.6)*255).astype('uint8');rgba=np.dstack([a.astype('uint8'),alpha]);rgba[alpha==0,:3]=0;out=Image.fromarray(rgba);out.save(r/f'armor-{k}-aks74u-cutout-trial.png');bg=Image.new('RGBA',out.size,'white');bg.alpha_composite(out);bg.thumbnail((600,900));bg.convert('RGB').save(r/f'armor-{k}-cutout-review.jpg')
