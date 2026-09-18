#!/usr/bin/env python3
"""Read-only aggregate preflight for the live player-balance migration.

Administrator-only weapons, armor and artifacts are deliberately excluded from every
balance aggregate. This script never writes game code, player profiles or SQLite rows.
"""
import argparse
import hashlib
import json
import math
import re
import sqlite3
import sys
import time
from pathlib import Path


INVISIBLE='\u200b\u200c\u200d\u2060\ufeff'


def number(value, default=0.0):
    if isinstance(value, bool):
        return default
    try:
        value=float(value)
        return value if math.isfinite(value) else default
    except (ValueError, TypeError, OverflowError):
        return default


def extract_json_array(source, const_name):
    """Extract a JSON-compatible JS array assigned to a const without regex truncation."""
    match=re.search(r'const\s+'+re.escape(const_name)+r'\s*=\s*\[',source)
    if not match:
        return []
    start=source.find('[',match.start())
    depth=0
    quote=None
    escaped=False
    for index in range(start,len(source)):
        ch=source[index]
        if quote is not None:
            if escaped:
                escaped=False
            elif ch=='\\':
                escaped=True
            elif ch==quote:
                quote=None
            continue
        if ch in ('"',"'"):
            quote=ch
            continue
        if ch=='[':
            depth+=1
        elif ch==']':
            depth-=1
            if depth==0:
                raw=source[start:index+1]
                try:
                    value=json.loads(raw)
                except (ValueError, TypeError, json.JSONDecodeError):
                    return []
                return value if isinstance(value,list) else []
    return []


def clean_base(name):
    visible=str(name or '').rstrip(INVISIBLE)
    return re.sub(r' \+\d+$','',visible)


def visible_upgrade_level(name):
    match=re.search(r' \+(\d{1,9})['+INVISIBLE+r']*$',str(name or ''))
    return int(match.group(1)) if match else 0


def inspect(root):
    root=root.resolve()
    server=(root/'server.js').resolve(strict=True)
    database=(root/'game.db').resolve(strict=True)
    raw=server.read_bytes()
    source=raw.decode('utf-8')

    weapons=extract_json_array(source,'SHOP_WEAPONS')
    armor_items=extract_json_array(source,'SHOP_ARMOR')
    artifacts=extract_json_array(source,'SHOP_ARTIFACTS')

    admin_weapons={str(x.get('name')) for x in weapons if isinstance(x,dict) and x.get('adminOnly') and x.get('name')}
    admin_armor={str(x.get('name')) for x in armor_items if isinstance(x,dict) and x.get('adminOnly') and x.get('name')}
    admin_artifacts={str(x.get('name')) for x in artifacts if isinstance(x,dict) and x.get('adminOnly') and x.get('name')}
    admin_gear=admin_weapons|admin_armor

    constants={}
    for name in ('UPGRADE_MAX_LEVEL','UPGRADE_MAX_BONUS_PCT_SERVER','UPGRADE_BYTE_THRESHOLD'):
        match=re.search(r'const\s+'+re.escape(name)+r'\s*=\s*([0-9.]+)\s*;',source)
        constants[name]=float(match.group(1)) if match else None

    counts={
        'profiles':0,
        'invalidProfiles':0,
        'profilesExcludedForAdminEquipped':0,
        'profilesWithPlayerGearUpgradesOver50':0,
        'profilesWithRegularEquippedArtifacts':0,
        'profilesWithRegularArmorUpgradeRecords':0,
    }
    maxima={
        'level':0.0,
        'maxHealthWithoutAdminLoadout':0.0,
        'weaponDamageWithoutAdminLoadout':0.0,
        'armorWithoutAdminLoadout':0.0,
        'visiblePlayerUpgradeLevel':0.0,
        'regularArmorUpgradeTotal':0.0,
    }
    level_bands={'1-49':0,'50-149':0,'150-299':0,'300-499':0,'500+':0}
    deadline=time.monotonic()+35

    con=sqlite3.connect(database.as_uri()+'?mode=ro',uri=True,timeout=10)
    con.set_progress_handler(lambda:int(time.monotonic()>deadline),1000)
    try:
        con.execute('PRAGMA query_only=ON')
        con.execute('BEGIN')
        for (text,) in con.execute('SELECT data FROM players'):
            if time.monotonic()>deadline:
                raise RuntimeError('Read-only audit timed out; no game data changed')
            counts['profiles']+=1
            try:
                data=json.loads(text)
                if not isinstance(data,dict):
                    raise ValueError()
            except (ValueError,TypeError,json.JSONDecodeError):
                counts['invalidProfiles']+=1
                continue

            weapon=data.get('weapon') if isinstance(data.get('weapon'),dict) else {}
            armor=data.get('armor') if isinstance(data.get('armor'),dict) else {}
            equipped_weapon_base=clean_base(weapon.get('name'))
            equipped_armor_base=clean_base(armor.get('name'))

            artifact_slots=data.get('artifactSlots') if isinstance(data.get('artifactSlots'),list) else []
            belt=data.get('belt') if isinstance(data.get('belt'),list) else []
            equipped_artifacts=[str(x or '').rstrip(INVISIBLE) for x in [*artifact_slots,*belt] if x]
            has_admin_artifact=any(name in admin_artifacts for name in equipped_artifacts)
            admin_equipped=(equipped_weapon_base in admin_weapons or
                            equipped_armor_base in admin_armor or
                            has_admin_artifact)
            counts['profilesExcludedForAdminEquipped']+=int(admin_equipped)

            names=[str(weapon.get('name','')),str(armor.get('name',''))]
            for key in ('inventory','warehouse'):
                bag=data.get(key)
                if isinstance(bag,dict):
                    names.extend(str(name) for name in bag)
            player_names=[name for name in names if clean_base(name) not in admin_gear]
            levels=[visible_upgrade_level(name) for name in player_names]
            max_level=max(levels,default=0)

            records=data.get('armorUpgradeData')
            records=records if isinstance(records,dict) else {}
            regular_records=[
                record for stable,record in records.items()
                if isinstance(record,dict) and clean_base(stable) not in admin_armor
            ]
            totals=[sum(max(0.0,number(value)) for value in record.values()) for record in regular_records]
            max_total=max(totals,default=0.0)

            counts['profilesWithPlayerGearUpgradesOver50']+=int(max_level>50 or max_total>50)
            regular_equipped_artifacts=[name for name in equipped_artifacts if name not in admin_artifacts]
            counts['profilesWithRegularEquippedArtifacts']+=int(bool(regular_equipped_artifacts))
            counts['profilesWithRegularArmorUpgradeRecords']+=int(bool(regular_records))

            level=number(data.get('level'))
            maxima['level']=max(maxima['level'],level)
            maxima['visiblePlayerUpgradeLevel']=max(maxima['visiblePlayerUpgradeLevel'],max_level)
            maxima['regularArmorUpgradeTotal']=max(maxima['regularArmorUpgradeTotal'],max_total)

            # Profile combat maxima are only meaningful when no administrator-only
            # item is equipped. This prevents admin gear/artifacts from contaminating
            # ordinary player balance measurements.
            if not admin_equipped:
                maxima['maxHealthWithoutAdminLoadout']=max(maxima['maxHealthWithoutAdminLoadout'],number(data.get('maxHealth')))
                maxima['weaponDamageWithoutAdminLoadout']=max(maxima['weaponDamageWithoutAdminLoadout'],number(weapon.get('dmg')))
                maxima['armorWithoutAdminLoadout']=max(maxima['armorWithoutAdminLoadout'],number(armor.get('armor')))

            band='1-49' if level<50 else '50-149' if level<150 else '150-299' if level<300 else '300-499' if level<500 else '500+'
            level_bands[band]+=1

        tables={row[0] for row in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        pending={
            name:(con.execute('SELECT COUNT(*) FROM '+name).fetchone()[0] if name in tables else None)
            for name in ('raid_sessions','pve_battles','quest_receipts')
        }
        con.rollback()
    finally:
        con.close()

    return {
        'mode':'READ_ONLY',
        'profileIdentifiersIncluded':False,
        'gameDataChanged':False,
        'sourceSha256':hashlib.sha256(raw).hexdigest(),
        'serverBytes':len(raw),
        'upgradeConstants':constants,
        'catalogCounts':{
            'playerWeapons':sum(1 for x in weapons if isinstance(x,dict) and not x.get('adminOnly')),
            'playerArmor':sum(1 for x in armor_items if isinstance(x,dict) and not x.get('adminOnly')),
            'playerArtifacts':sum(1 for x in artifacts if isinstance(x,dict) and not x.get('adminOnly')),
        },
        'adminExcluded':{
            'weapons':sorted(admin_weapons),
            'armor':sorted(admin_armor),
            'artifacts':sorted(admin_artifacts),
        },
        'counts':counts,
        'maxima':maxima,
        'levelBands':level_bands,
        'pendingRowCounts':pending,
        'scope':'Ordinary-player balance only. Administrator-only weapons, armor and artifacts are excluded from all balance aggregates and combat maxima. Market/parcels require their own migration audit before release.',
    }


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root',type=Path,default=Path('/var/www/pocketzone'))
    args=parser.parse_args()
    try:
        print(json.dumps(inspect(args.root),ensure_ascii=False,indent=2,allow_nan=False))
    except Exception as error:
        print('READ_ONLY audit failed ('+type(error).__name__+'). Game code, profiles and service were not modified.',file=sys.stderr)
        sys.exit(1)
