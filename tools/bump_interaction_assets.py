from pathlib import Path
import hashlib,re

root=Path(__file__).resolve().parents[1]
p=root/'index.html'
s=p.read_text(encoding='utf-8')
for rel in ['ui/trade-menu.js','ui/trader-hubs.js','ui/trader-hubs.css']:
    v=hashlib.sha256((root/rel).read_bytes()).hexdigest()[:12]
    s,n=re.subn(re.escape(rel)+r'(?:\?v=[A-Za-z0-9._-]+)?', rel+'?v='+v, s)
    if n!=1:
        raise SystemExit(f'expected one cache-bust reference for {rel}, got {n}')
p.write_text(s,encoding='utf-8')
print('interaction asset versions refreshed')
