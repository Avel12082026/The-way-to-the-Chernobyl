from pathlib import Path
from PIL import Image
import cv2,numpy as np
from scipy import ndimage as ndi
r=Path(__file__).resolve().parent/'reviewed-variants'
for k,f in [(8,'exec-79ba98f1-0d9b-44b8-911a-90e2ee07d347.png'),(9,'exec-cd6ebaa9-a419-4ebe-aebc-60ee651385af.png')]:
 a=np.array(Image.open(Path('generated_images')/f).convert('RGB'));seed=np.array(Image.open(r/f'armor-{k}-aks74u-cutout-trial.png').getchannel('A'))>128
 mask=np.full(seed.shape,cv2.GC_PR_BGD,np.uint8);mask[seed]=cv2.GC_PR_FGD;mask[ndi.binary_erosion(seed,iterations=5)]=cv2.GC_FGD;mask[~ndi.binary_dilation(seed,iterations=20)]=cv2.GC_BGD
 cv2.grabCut(a,mask,None,np.zeros((1,65),np.float64),np.zeros((1,65),np.float64),5,cv2.GC_INIT_WITH_MASK)
 fg=((mask==cv2.GC_FGD)|(mask==cv2.GC_PR_FGD)) & ndi.binary_dilation(seed,iterations=3);alpha=np.uint8(fg)*255;out=Image.fromarray(np.dstack([a,alpha]));out.save(r/f'armor-{k}-aks74u-clean.png')
 bg=Image.new('RGBA',out.size,'white');bg.alpha_composite(out);bg.thumbnail((700,1050));bg.convert('RGB').save(r/f'armor-{k}-final-review.jpg');print(k,flush=True)
