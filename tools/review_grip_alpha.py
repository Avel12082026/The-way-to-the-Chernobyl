"""Composite a foreground on two backgrounds; does not modify source art."""
from pathlib import Path
from PIL import Image
import sys,json,hashlib
source=Path(sys.argv[1]); im=Image.open(source).convert('RGBA')
result=Image.new('RGB',(1536,1024),'white')
for x,color in [(0,(235,232,224)),(768,(30,45,60))]:
    bg=Image.new('RGBA',im.size,color+(255,));bg.alpha_composite(im)
    result.paste(bg.resize((768,512)).convert('RGB'),(x,0))
crop=im.crop((760,330,1160,840));bg=Image.new('RGBA',crop.size,(235,232,224,255));bg.alpha_composite(crop)
result.paste(bg.convert('RGB'),(450,513));result.save(source.with_name(source.stem+'-alpha-review.jpg'))
print(json.dumps({'source':str(source),'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'alpha_range':im.getchannel('A').getextrema(),'corners':[im.getpixel(p)[3] for p in [(0,0),(im.width-1,0)]]}))
