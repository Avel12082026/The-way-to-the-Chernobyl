"""Report actual hand-review coverage against the client first weapon group."""
import json,re,hashlib
from pathlib import Path
root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text()
start=html.index('{ id: 86, name: "Beretta 21A Bobcat"')
end=html.index('{ id: 20, name: "Дробовик Сайга-410"',start)
roster=[{'id':int(i),'name':n} for i,n in re.findall(r'\{ id: (\d+), name: "([^"]+)"',html[start:end])]
catalog=json.loads((root/'images/combat/catalog.json').read_text())
known={w['id'] for w in catalog['pistols']}
report={'source':'local index.html weapon group Beretta 21A Bobcat through Desert Eagle Mark XIX','source_sha256':hashlib.sha256(html.encode()).hexdigest(),'expected_count':len(roster),'catalog_count':len(known),'missing_from_catalog':[w for w in roster if w['id'] not in known],'hands':{}}
for armor in (91,92):
 review=json.loads((root/f'asset_sources/combat_hand_repair/anatomy-{armor}/review-v4.json').read_text())
 reviewed={w['weapon'] for w in review['pairs']}
 report['hands'][armor]={'reviewed_count':len(reviewed),'expected_count':len(roster),'missing':[w for w in roster if w['id'] not in reviewed],'complete':all(w['id'] in reviewed for w in roster)}
print(json.dumps(report,ensure_ascii=False,indent=2))
