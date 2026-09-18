"""Idempotent installer/validator for interaction polish v2. No player/server mutations."""
from pathlib import Path
import hashlib,re
ROOT=Path(__file__).resolve().parents[1]
required={
 'ui/trade-menu.js':["version: '1.3.1'","openTradeItemInfoFromHold","520","queues[source].delete(name)","#tradeMenu,#itemInfoModal"],
 'ui/trader-hubs.js':["/api/friends/pending","newFriendRequest","['dm','parcel','system','friend']","telegram.className=backpack.className"],
 'ui/trader-hubs.css':[".pda-notification-friend","#bunkerPda .pda-notification-friend"],
}
for rel,markers in required.items():
    s=(ROOT/rel).read_text(encoding='utf-8')
    for marker in markers:
        if marker not in s: raise SystemExit(f'{rel}: missing {marker}')
p=ROOT/'index.html'; s=p.read_text(encoding='utf-8')
for rel in ['ui/trade-menu.js','ui/trader-hubs.js','ui/trader-hubs.css']:
    v=hashlib.sha256((ROOT/rel).read_bytes()).hexdigest()[:12]
    pattern=r'((?:src|href)="'+re.escape(rel)+r')(?:\?[^\"]*)?("[^>]*>)'
    s,n=re.subn(pattern,lambda m:m[1]+'?v='+v+m[2],s)
    if n!=1: raise SystemExit('Missing/duplicate script or stylesheet: '+rel)
p.write_text(s,encoding='utf-8')
print('Interaction polish v2 validated; cache hashes refreshed')
