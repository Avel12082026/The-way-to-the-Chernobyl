"""Reproducible PNG assembly; original body, gun and hand assets are immutable."""
from pathlib import Path
import argparse, json, math
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
DATA = json.loads((ROOT / 'placements.json').read_text())

def compose(armor, weapon, adjustment=None):
    w = next(w for w in DATA['weapons'] if w['id'] == weapon)
    c = next(c for c in DATA['characters'] if c['armor'] == armor and c['pose'] == w['pose'])
    a = dict(DATA.get('pairAdjustments', {}).get(f'{armor}-{weapon}', {}))
    if adjustment: a.update(adjustment)
    body = Image.open(ROOT / f'fitting/characters/{armor}-{w["pose"]}.png').convert('RGBA')
    gun = Image.open(ROOT / f'fitting/weapons/{weapon}.png').convert('RGBA')
    hands = Image.open(ROOT / f'fitting/hands/{armor}-{w["pose"]}.png').convert('RGBA')
    canvas = Image.new('RGBA', (1800, 1536))
    canvas.alpha_composite(body)
    # One inverse affine transform avoids repeated resize/rotate degradation.
    s = w['scale'] * a.get('size', 100) / 100
    angle = math.radians(a.get('angle', 0))
    co, si = math.cos(angle)/s, math.sin(angle)/s
    tx, ty = c['grip'][0]+a.get('dx',0), c['grip'][1]+a.get('dy',0)
    gx, gy = w['grip']
    affine = (co, si, gx-co*tx-si*ty, -si, co, gy+si*tx-co*ty)
    layer = gun.transform(canvas.size, Image.Transform.AFFINE, affine, Image.Resampling.BICUBIC)
    canvas.alpha_composite(layer)
    canvas.alpha_composite(hands)
    return canvas, layer, c

def backgrounds(im):
    result = []
    for color in ['#ffffff', '#121612']:
        bg = Image.new('RGBA', im.size, color); bg.alpha_composite(im); result.append(bg.convert('RGB'))
    bg = Image.new('RGBA', im.size, '#dddddd'); draw=ImageDraw.Draw(bg)
    for y in range(0,im.height,16):
        for x in range(0,im.width,16):
            if (x//16+y//16)%2: draw.rectangle((x,y,x+15,y+15),fill='#aaaaaa')
    bg.alpha_composite(im); result.append(bg.convert('RGB'))
    return result

if __name__ == '__main__':
    p=argparse.ArgumentParser();p.add_argument('--armor',type=int,required=True);p.add_argument('--weapon',type=int,required=True)
    p.add_argument('--dx',type=float);p.add_argument('--dy',type=float);p.add_argument('--angle',type=float)
    p.add_argument('--out',type=Path,required=True);args=p.parse_args()
    a={key:getattr(args,key) for key in ['dx','dy','angle'] if getattr(args,key) is not None}
    im,_,c=compose(args.armor,args.weapon,a);args.out.parent.mkdir(parents=True,exist_ok=True);im.save(args.out)
    crop=im.crop((max(0,c['grip'][0]-180),c['grip'][1]-150,min(1800,c['support'][0]+220),c['grip'][1]+190))
    views=backgrounds(crop);sheet=Image.new('RGB',(crop.width*3,crop.height))
    for i,v in enumerate(views):sheet.paste(v,(i*crop.width,0))
    sheet.save(args.out.with_name(args.out.stem+'-grip.png'))
