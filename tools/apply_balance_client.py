#!/usr/bin/env python3
import re
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
path=ROOT/'index.html'
s=path.read_text(encoding='utf-8')
MARK='BALANCE_20260919_V2'

def sub_once(pattern,repl,label,flags=0):
    global s
    s2,n=re.subn(pattern,repl,s,count=1,flags=flags)
    if n!=1: raise SystemExit(f'{label}: expected 1 match, found {n}')
    s=s2

if MARK not in s:
    sub_once(r'const\s+UPGRADE_MAX_LEVEL\s*=\s*(?:100|50)\s*;(?:\s*//\s*BALANCE_20260919_V1)?',
             f'const UPGRADE_MAX_LEVEL = 50; // {MARK}','upgrade max')
    sub_once(r'const\s+UPGRADE_BYTE_THRESHOLD\s*=\s*(?:50|25)\s*;',
             'const UPGRADE_BYTE_THRESHOLD = 25;','upgrade byte threshold')
    sub_once(r'const\s+UPGRADE_MAX_BONUS_PCT\s*=\s*(?:0\.5|0\.25)\s*;',
             'const UPGRADE_MAX_BONUS_PCT = 0.25;','upgrade max bonus')

    research="""function getResearchSuitUnlockTier(level) {
        const lv = Math.max(1, Number(level) || 1);
        const unlocks = [[4,135],[5,175],[6,220],[7,265],[8,305],[9,350],[10,395],[11,440],[12,480],[13,525],[14,570]];
        let tier = 0;
        for (const [value, required] of unlocks) if (lv >= required) tier = value;
        return tier;
    }"""
    pattern=r'function\s+getResearchSuitUnlockTier\(level\)\s*\{[\s\S]*?\n\s*\}'
    matches=list(re.finditer(pattern,s))
    if len(matches)!=1: raise SystemExit(f'research suit gate: expected 1 match, found {len(matches)}')
    m=matches[0];s=s[:m.start()]+research+s[m.end():]

# Cache bust the gesture and trader modules. These replacements are idempotent.
for asset in ('inventory/drag.js','inventory/drag.css','ui/trader-hubs.js','ui/trader-hubs.css'):
    esc=re.escape(asset)
    s,n=re.subn(esc+r'(?:\?v=[^"\'<>\s]+)?',asset+'?v=20260919q2',s)
    if n<1: raise SystemExit('asset tag not found: '+asset)

path.write_text(s,encoding='utf-8')
print('client balance patch: OK')
