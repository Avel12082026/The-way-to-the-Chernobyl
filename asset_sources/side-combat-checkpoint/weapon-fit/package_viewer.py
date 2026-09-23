from pathlib import Path
from PIL import Image
from concurrent.futures import ThreadPoolExecutor
import io,base64,json
r=Path('weapon-fit/fitting');out=Path('weapon-fit/web');out.mkdir(exist_ok=True)
files=list(r.rglob('*.png'))
def encode(p):
 im=Image.open(p);im.load();b=io.BytesIO();im.save(b,format='WEBP',quality=93,method=4);data=b.getvalue();dest=out/p.relative_to(r).with_suffix('.webp');dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data)
 return str(p.relative_to(r)),'data:image/webp;base64,'+base64.b64encode(data).decode()
with ThreadPoolExecutor(max_workers=4) as pool:assets=dict(pool.map(encode,files))
html=(r/'index.html').read_text();embedded='<script>'+ (r/'data.js').read_text() +'window.FIT_ASSETS='+json.dumps(assets)+';</script>'
Path('SIDE-COMBAT-PREVIEW.html').write_text(html.replace('<script src="data.js"></script>',embedded))
(out/'index.html').write_text(html.replace('}.png','}.webp'));(out/'data.js').write_text((r/'data.js').read_text())
print('Embedded viewer',Path('SIDE-COMBAT-PREVIEW.html').stat().st_size,'bytes;',len(files),'assets')
