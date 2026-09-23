from pathlib import Path
import json,math
r=Path('weapon-fit');p=r/'placements.json';d=json.loads(p.read_text());d['pairAdjustments']={}
# Keep the same weapon scale; pivot around the dominant hand, never stretch the art.
for c in d['characters']:
 if c['pose']!='heavy':continue
 for w in d['weapons']:
  if w['pose']!='heavy':continue
  dx=c['support'][0]-c['grip'][0]
  if dx<=0:continue
  # Fore-end baseline calibrated against armor 1 / weapon 11.
  dy=c['support'][1]-20-c['grip'][1]
  angle=math.degrees(math.atan2(dy,dx)-math.atan2(-50,dx))
  angle=max(-12,min(12,angle))
  d['pairAdjustments'][f'{c["armor"]}-{w["id"]}']={'angle':round(angle,3),'status':'support-height-trial'}
p.write_text(json.dumps(d,ensure_ascii=False,indent=2));(r/'fitting/data.js').write_text('window.FIT_DATA='+json.dumps(d,ensure_ascii=False)+';')
