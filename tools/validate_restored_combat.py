"""Integrity, alpha and reviewed matte regression checks for restored assets."""
import hashlib
import json
from pathlib import Path
import numpy as np
from PIL import Image
from restore_combat_monsters import HOLES

ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'asset_sources/combat_restoration'
for report in ['report.json','monsters_report.json']:
    for record in json.loads((BASE/report).read_text()):
        path=ROOT/record['path'];source=ROOT/record['source']
        assert hashlib.sha256(path.read_bytes()).hexdigest()==record['sha256'],path
        assert hashlib.sha256(source.read_bytes()).hexdigest()==record['source_sha256'],source
        assert list(Image.open(path).size)==record['size'],path

catalog=json.loads((ROOT/'images/combat/catalog.json').read_text())
sprites=[ROOT/'images/combat'/p['image'] for p in catalog['pistols']]
sprites += [ROOT/'images/combat'/s['mutant'] for s in catalog['species']]
for path in sprites:
    im=Image.open(path);assert im.mode=='RGBA',path
    alpha=np.array(im.getchannel('A'))
    assert (alpha==0).sum()>10000,path
    assert (alpha>240).sum()>10000,path
    assert not alpha[:10,:10].any(),f'Background in corner: {path}'

for species,seeds in HOLES.items():
    alpha=Image.open(ROOT/f'images/combat/mutants/{species}.png').getchannel('A')
    for point in seeds:assert alpha.getpixel(point)==0,(species,point)
# Pale anatomy must survive the same key that removes neutral backgrounds.
for species,point in [('observer',(750,50)),('poltergeist',(480,100)),('electrochimera',(480,170))]:
    im=Image.open(ROOT/f'images/combat/mutants/{species}.png')
    assert im.getpixel(point)[3]>240,(species,point,'lost pale anatomy')
# White sight markings are weapon details, not part of the removed matte.
gun=Image.open(ROOT/'images/combat/pistols/95.png')
source=Image.open(BASE/'originals/pistols/95.png').convert('RGBA')
rect=(825,570,960,660)
src=np.array(source.crop(rect));dst=np.array(gun.crop(rect))
bright=(src[:,:,:3].min(2)>245)
assert (dst[:,:,3][bright]>240).any(),'Lost Glock sight highlight'
print(f'{len(sprites)} foreground sprites: real alpha, intact files, clean reviewed gaps and preserved pale details')
