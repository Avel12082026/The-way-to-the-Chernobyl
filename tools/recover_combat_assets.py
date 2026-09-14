"""Restore verified generated originals without modifying their pixels."""
import json, shutil, sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]
source=Path(sys.argv[1])
assets={
'chernobyl-dog':['9dd7841e-c14c-4c8e-a942-46fe6ce1fce1','9fcf94e1-bf70-4ca2-9785-c367ef75a335','e7e67c54-9c07-4e89-8a6c-65609a678e12','475c147d-dad0-4ac8-a94f-e5ab69cfc856'],
'flesh':['3f6d1fb9-7e06-4ffc-af82-5a5ee5617e18','4c033193-393c-45e9-a1dd-931461572123','a6688808-5b17-465e-9a38-383d1550347a','b798678f-d4d5-4a93-99be-4ef4bd628891'],
'boar':['c7c4d267-d679-49bc-9eec-553fbdf9a890','e50abd59-c160-418e-8944-29512e381c4c','b0d09df5-4371-42e9-a50b-f3ad67729a61','6c7046cf-97a4-436c-88aa-d640fe32a69c'],
'isotope':['b7127ec7-6e1d-44ee-b3ab-5bacbfa06370','172d0df6-ce11-4d3f-bad8-8e6e10a84d20','3d9ffdb4-2477-4379-b3d0-e8f5e14e1353','329d30d5-c8a7-4673-9d1e-48aa0868f431'],
'hinge':['02f51a88-85ff-4829-aa46-b53ab84a9835','c9da2d1c-f1d6-4702-a60e-a9dda60ae956','b8f9dba5-4464-4a2d-83a6-51c57b9878aa','088b7602-92f1-4a4d-89c2-fdd9226f73ab'],
'zombie':['d0e7f539-a56a-4565-8ccb-2acb85aa14cf','f85c2cbb-80be-47f1-85f1-426939df2b5d','4b1b1407-850d-4618-bd26-c83cff4e57c1','960ea2a5-0fc1-4592-8c40-348e228affb4']}
records=[]
def copy(uid,path):
 src=source/f'exec-{uid}.png'; dst=root/'images/combat'/path
 dst.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(src,dst)
 records.append({'original':src.name,'path':str(dst.relative_to(root))})
for species,ids in assets.items():
 copy(ids[0],f'mutants/{species}.png')
 for i,uid in enumerate(ids[1:],1):copy(uid,f'backgrounds/{species}/{i}.png')
for weapon,uid in {2:'963609ee-5b82-46f8-a302-4fb99c4a4385',87:'124aeb08-12ba-4c76-869f-fb7187deea50'}.items():copy(uid,f'pistols/{weapon}.png')
(root/'images/combat/recovery.json').write_text(json.dumps(records,indent=2)+'\n')
print(f'Restored {len(records)} unmodified assets')
