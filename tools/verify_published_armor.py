import concurrent.futures,hashlib,json,time,urllib.request
from pathlib import Path
root=Path(__file__).resolve().parents[1]
assets=json.loads((root/'ASSET_MANIFEST_16_96.json').read_text())['assets']
base='https://avel12082026.github.io/The-way-to-the-Chernobyl/'
def check(a):
 url=base+a['file']+'?v='+a['version']
 try:
  with urllib.request.urlopen(url,timeout=45) as r:data=r.read()
  actual=hashlib.sha256(data).hexdigest()
  return dict(file=a['file'],expected=a['sha256'],actual=actual,passed=actual==a['sha256'])
 except Exception as e:return dict(file=a['file'],passed=False,error=str(e))
with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:results=list(pool.map(check,assets))
report=dict(base_url=base,checked=len(results),passed=sum(x['passed'] for x in results),results=results)
(root/'ASSET_PUBLICATION_16_96.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k!='results'}))
