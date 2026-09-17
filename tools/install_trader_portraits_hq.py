"""Refresh cache-busting hashes for HQ trader portraits and trade UI."""
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
    ('js','ui/trader-hubs.js'),
]
for kind,rel in assets:
    f=ROOT/rel
    if not f.is_file():
        raise SystemExit('Missing asset: '+rel)
    v=hashlib.sha256(f.read_bytes()).hexdigest()[:12]
    if kind=='css':
        pattern=rf'<link\\b[^>]*href="{re.escape(rel)}(?:\\?[^"]*)?"[^>]*>'
        tag=f'<link rel="stylesheet" href="{rel}?v={v}">'
    else:
        pattern=rf'<script\\b[^>]*src="{re.escape(rel)}(?:\\?[^"]*)?"[^>]*>\\s*</script>'
        tag=f'<script src="{rel}?v={v}"></script>'
    s,n=re.subn(pattern,lambda _:tag,s)
    if n!=1:
        raise SystemExit(f'Expected one {rel} tag, got {n}')

if s.index('ui/trader-hubs.js') < s.index('ui/trade-menu.js'):
    raise SystemExit('Trader hubs must load after trade menu')
p.write_text(s,encoding='utf-8')
print('HQ trader portrait cache-busting installed')
