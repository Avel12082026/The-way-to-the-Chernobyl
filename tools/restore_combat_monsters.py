"""Recover original mutant art with conservative, individually reviewed mattes."""
import argparse
import json
import shutil
from pathlib import Path
from PIL import Image, ImageDraw
from clean_combat_transparency import ROOT, save_and_check, sha
from restore_combat_batch import remove_matte

BASE=ROOT/'asset_sources/combat_restoration'
# Background-only seeds inside enclosed limb gaps; pale skin is never keyed.
HOLES={
    'observer':[(700,440)], 'bloodsucker':[(480,430)],
    'stregun':[(330,470)],
    'fracture':[(800,550),(870,775)]
}

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--downloads',type=Path);args=parser.parse_args()
    records=[]
    for item in json.loads((BASE/'monsters.json').read_text()):
        species=Path(item['target']).stem
        # Source identity, rather than target name, prevents an older variant
        # from silently being reused when a corrected source is selected.
        source=BASE/'originals/mutants'/(item['library_file_id']+'.png')
        if not source.exists():
            if not args.downloads:raise FileNotFoundError(source)
            source.parent.mkdir(parents=True,exist_ok=True)
            shutil.copyfile(args.downloads/item['name'],source)
        im=Image.open(source)
        if im.convert('RGBA').getchannel('A').getextrema()[0]<255:
            out=im.convert('RGBA');operation='native_alpha_unchanged'
        else:
            out=remove_matte(im,-1,checker_override=species!='pseudogiant',spread=12 if species=='observer' else None,hole_seeds=HOLES.get(species,()))
            operation='reviewed_matte_removal'
        record=save_and_check(out,ROOT/'images/combat'/item['target'])
        record.update(source=str(source.relative_to(ROOT)),source_sha256=sha(source.read_bytes()),library_file_id=item['library_file_id'],operation=operation)
        records.append(record)
    (BASE/'monsters_report.json').write_text(json.dumps(records,indent=2)+'\n')
    for page in range(3):
        sheet=Image.new('RGB',(1500,1200),(24,35,41));draw=ImageDraw.Draw(sheet)
        for j,r in enumerate(records[page*12:(page+1)*12]):
            im=Image.open(ROOT/r['path']);im.thumbnail((350,360));x=j%4*375;y=j//4*400
            sheet.paste(im,(x,y+30),im);draw.text((x+5,y+5),Path(r['path']).stem,fill='orange')
        (ROOT/'.validation').mkdir(exist_ok=True)
        sheet.save(ROOT/f'.validation/monsters-clean-{page}.jpg')
    print(f'Restored {len(records)} mutant images')

if __name__=='__main__':main()
