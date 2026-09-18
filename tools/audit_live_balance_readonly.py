#!/usr/bin/env python3
"""Read-only, aggregate-only preflight before migrating equipment and artifact balance."""
import argparse
import hashlib
import json
import math
import re
import sqlite3
import sys
import time
from pathlib import Path


def number(value, default=0):
    if isinstance(value, bool):
        return default
    try:
        value = float(value)
        return value if math.isfinite(value) else default
    except (ValueError, TypeError, OverflowError):
        return default


def inspect(root):
    server = (root / 'server.js').resolve(strict=True)
    database = (root / 'game.db').resolve(strict=True)
    raw = server.read_bytes()
    source = raw.decode('utf-8')
    constants = {}
    for name in ('UPGRADE_MAX_LEVEL', 'UPGRADE_MAX_BONUS_PCT', 'UPGRADE_BYTE_THRESHOLD'):
        m = re.search(r'const\s+' + name + r'\s*=\s*([0-9.]+)\s*;', source)
        constants[name] = float(m[1]) if m else None
    counts = dict(profiles=0, invalidProfiles=0, profilesWithUpgradesOver50=0,
                  profilesWithEquippedArtifacts=0, profilesWithArmorUpgradeRecords=0)
    maxima = dict(level=0, maxHealth=0, weaponDamage=0, armor=0,
                  visibleUpgradeLevel=0, armorUpgradeTotal=0)
    tiers = {'1-49': 0, '50-149': 0, '150-299': 0, '300-499': 0, '500+': 0}
    end = time.monotonic() + 35
    con = sqlite3.connect(database.as_uri() + '?mode=ro', uri=True, timeout=10)
    con.set_progress_handler(lambda: int(time.monotonic() > end), 1000)
    try:
        con.execute('PRAGMA query_only=ON')
        con.execute('BEGIN')
        for (text,) in con.execute('SELECT data FROM players'):
            if time.monotonic() > end:
                raise RuntimeError('Read-only audit timed out; no game data changed')
            counts['profiles'] += 1
            try:
                data = json.loads(text)
                if not isinstance(data, dict):
                    raise ValueError()
            except (ValueError, TypeError):
                counts['invalidProfiles'] += 1
                continue
            gear = [data.get(k) if isinstance(data.get(k), dict) else {} for k in ('weapon', 'armor')]
            names = [str(x.get('name', '')) for x in gear]
            for key in ('inventory', 'warehouse'):
                bag = data.get(key)
                if isinstance(bag, dict):
                    names.extend(str(n) for n in bag)
            levels = [int(m[1]) for n in names if (m := re.search(r' \+(\d{1,9})[\u200B-\u200D\u2060\uFEFF]*$', n))]
            records = data.get('armorUpgradeData')
            records = records if isinstance(records, dict) else {}
            totals = [sum(max(0, number(v)) for v in record.values()) for record in records.values() if isinstance(record, dict)]
            max_level = max(levels, default=0)
            max_total = max(totals, default=0)
            counts['profilesWithUpgradesOver50'] += int(max_level > 50 or max_total > 50)
            counts['profilesWithEquippedArtifacts'] += int(isinstance(data.get('artifactSlots'), list) and any(data['artifactSlots']))
            counts['profilesWithArmorUpgradeRecords'] += int(bool(records))
            values = dict(level=number(data.get('level')), maxHealth=number(data.get('maxHealth')),
                          weaponDamage=number(gear[0].get('dmg')), armor=number(gear[1].get('armor')),
                          visibleUpgradeLevel=max_level, armorUpgradeTotal=max_total)
            for key, value in values.items():
                maxima[key] = max(maxima[key], value)
            lv = values['level']
            tiers['1-49' if lv < 50 else '50-149' if lv < 150 else '150-299' if lv < 300 else '300-499' if lv < 500 else '500+'] += 1
        tables = {x[0] for x in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        pending = {name: con.execute('SELECT COUNT(*) FROM ' + name).fetchone()[0] if name in tables else None
                   for name in ('raid_sessions', 'pve_battles', 'quest_receipts')}
        con.rollback()
    finally:
        con.close()
    return {'mode': 'READ_ONLY', 'profileIdentifiersIncluded': False, 'gameDataChanged': False,
            'sourceSha256': hashlib.sha256(raw).hexdigest(), 'serverBytes': len(raw),
            'upgradeConstants': constants, 'counts': counts, 'maxima': maxima,
            'levelBands': tiers, 'pendingRowCounts': pending,
            'scope': 'Players equipment, backpack, warehouse and armor stat records only. Market/parcels need a separate migration audit.'}


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--root', type=Path, default=Path('/var/www/pocketzone'))
    args = p.parse_args()
    try:
        print(json.dumps(inspect(args.root), ensure_ascii=False, indent=2, allow_nan=False))
    except Exception as error:
        print('READ_ONLY audit failed (' + type(error).__name__ + '). Game code, profiles and service were not modified.', file=sys.stderr)
        sys.exit(1)
