"""Refresh or install cache-busted HQ trader portrait/trade assets idempotently."""
from pathlib import Path
import hashlib, re

ROOT=Path(__file__).resolve().parents[1]
p=ROOT/'index.html'
s=p.read_text(encoding='utf-8')

assets=[
    ('css','ui/trade-menu.css'),
    ('css','ui/trader-hubs.css'),
    ('js','ui/bunker-menu.js'),
    ('js','ui/trade-menu.js'),
    ('js','ui/trader-portrait-data.js'),
    ('js','ui/trader-hubs.js'),
]
for kind,rel in assets:
    f=ROOT/rel
    if not f.is_file():
        raise SystemExit('Missing asset: '+rel)
    v=hashlib.sha256(f.read_bytes()).hexdigest()[:12]
    if kind=='css':
        pattern=rf'<link\b[^>]*href=["\']{re.escape(rel)}(?:\?[^"\']*)?["\'][^>]*>'
        tag=f'<link rel="stylesheet" href="{rel}?v={v}">'
        anchor='</head>'
    else:
        pattern=rf'<script\b[^>]*src=["\']{re.escape(rel)}(?:\?[^"\']*)?["\'][^>]*>\s*</script>'
        tag=f'<script src="{rel}?v={v}"></script>'
        anchor='</body>'
    if re.search(pattern,s):
        s,n=re.subn(pattern,lambda _:tag,s,count=1)
        if n!=1:
            raise SystemExit(f'Could not refresh {rel}')
    else:
        if s.count(anchor)!=1:
            raise SystemExit(f'Unexpected HTML boundary while installing {rel}')
        s=s.replace(anchor,tag+'\n'+anchor,1)

# Trade must load after bunker; trader hubs must load after trade.
if s.index('ui/trade-menu.js') < s.index('ui/bunker-menu.js'):
    raise SystemExit('Trade menu must load after bunker menu')
if s.index('ui/trader-portrait-data.js') < s.index('ui/trade-menu.js'):
    raise SystemExit('Portrait data must load after trade menu')
if s.index('ui/trader-hubs.js') < s.index('ui/trader-portrait-data.js'):
    raise SystemExit('Trader hubs must load after portrait data')

p.write_text(s,encoding='utf-8')
print('HQ trader portrait cache-busting installed')
