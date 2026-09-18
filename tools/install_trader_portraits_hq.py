"""Install HQ trader portrait assets with deterministic script ordering."""
from pathlib import Path
import hashlib, re

ROOT=Path(__file__).resolve().parents[1]
p=ROOT/'index.html'
s=p.read_text(encoding='utf-8')

def version(rel):
    f=ROOT/rel
    if not f.is_file():
        raise SystemExit('Missing asset: '+rel)
    return hashlib.sha256(f.read_bytes()).hexdigest()[:12]

def script_pattern(rel):
    return re.compile(r'<script\b[^>]*src=["\']'+re.escape(rel)+r'(?:\?[^"\']*)?["\'][^>]*>\s*</script>')

def css_pattern(rel):
    return re.compile(r'<link\b[^>]*href=["\']'+re.escape(rel)+r'(?:\?[^"\']*)?["\'][^>]*>')

def one_or_insert(rel, kind, anchor):
    global s
    v=version(rel)
    if kind=='css':
        pat=css_pattern(rel)
        tag=f'<link rel="stylesheet" href="{rel}?v={v}">'
    else:
        pat=script_pattern(rel)
        tag=f'<script src="{rel}?v={v}"></script>'
    matches=list(pat.finditer(s))
    if len(matches)>1:
        raise SystemExit(f'Duplicate {rel} tags before normalization: {len(matches)}')
    if matches:
        s=pat.sub(tag,s,count=1)
    else:
        if s.count(anchor)!=1:
            raise SystemExit(f'Unexpected HTML boundary for {rel}')
        s=s.replace(anchor,tag+'\n'+anchor,1)
    return tag

# CSS can remain in its normal head position.
one_or_insert('ui/trade-menu.css','css','</head>')
one_or_insert('ui/trader-hubs.css','css','</head>')

# Keep bunker/trade where the app already expects them, but refresh hashes.
bunker_tag=one_or_insert('ui/bunker-menu.js','js','</body>')
trade_tag=one_or_insert('ui/trade-menu.js','js','</body>')

# Portrait data and hubs must always load immediately after TradeMenu, in this exact order.
for rel in ('ui/trader-portrait-data.js','ui/trader-hubs.js'):
    s=script_pattern(rel).sub('',s)

data_tag=f'<script src="ui/trader-portrait-data.js?v={version("ui/trader-portrait-data.js")}"></script>'
hubs_tag=f'<script src="ui/trader-hubs.js?v={version("ui/trader-hubs.js")}"></script>'

trade_matches=list(script_pattern('ui/trade-menu.js').finditer(s))
if len(trade_matches)!=1:
    raise SystemExit(f'Expected one trade menu script after normalization, got {len(trade_matches)}')
m=trade_matches[0]
s=s[:m.end()]+'\n'+data_tag+'\n'+hubs_tag+s[m.end():]

# Final invariants.
for rel in ('ui/bunker-menu.js','ui/trade-menu.js','ui/trader-portrait-data.js','ui/trader-hubs.js'):
    n=len(list(script_pattern(rel).finditer(s)))
    if n!=1:
        raise SystemExit(f'Expected exactly one {rel} tag, got {n}')

positions={rel:s.index(rel) for rel in ('ui/bunker-menu.js','ui/trade-menu.js','ui/trader-portrait-data.js','ui/trader-hubs.js')}
if not (positions['ui/bunker-menu.js'] < positions['ui/trade-menu.js'] < positions['ui/trader-portrait-data.js'] < positions['ui/trader-hubs.js']):
    raise SystemExit('Unexpected trader script order: '+repr(positions))

# Canonicalize blank lines so a second installer run is byte-for-byte identical.
s=re.sub(r'\n[ \t]*\n(?:[ \t]*\n)+','\n\n',s)

p.write_text(s,encoding='utf-8')
print('HQ trader portrait assets installed in deterministic order')
