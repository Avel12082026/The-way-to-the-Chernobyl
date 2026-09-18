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

# One item has 50 upgrades in total, not 50 independently for each armor stat.
if 'TOTAL_ARMOR_BUDGET_50_V1' not in s:
    old="    function getUpgradedStat(baseStat, level, ceiling) {\n        const lvl = Math.max(0, Number(level) || 0);"
    new="    function getUpgradedStat(baseStat, level, ceiling) {\n        const lvl = Math.min(UPGRADE_MAX_LEVEL, Math.max(0, Number(level) || 0));"
    if s.count(old)!=1: raise SystemExit('getUpgradedStat: unique reviewed anchor missing')
    s=s.replace(old,new,1)
    old="                const rowMaxed = statLevel >= UPGRADE_MAX_LEVEL;"
    new="""                // TOTAL_ARMOR_BUDGET_50_V1: legacy records are not silently deleted.
                const totalUpgrades=Math.max(parsed.level,Object.values(upgradeData).reduce((n,x)=>n+(Number.isFinite(Number(x))?Math.max(0,Math.floor(Number(x))):0),0));
                const rowMaxed = totalUpgrades >= UPGRADE_MAX_LEVEL;"""
    if s.count(old)!=1: raise SystemExit('armor budget: unique reviewed anchor missing')
    s=s.replace(old,new,1)
    s=s.replace('Всего улучшений предмета: ${parsed.level}', 'Всего улучшений предмета: ${parsed.level} / ${UPGRADE_MAX_LEVEL} (общий предел)')
    s=s.replace('Эта характеристика улучшена до максимума</button>', 'Достигнут общий предел улучшений</button>')

# Administrator-only equipment is outside ordinary player balance.
# Keep its legacy +100 / +50% curve while ordinary gear uses the new global +50 / +25% model.
if 'ADMIN_BALANCE_EXCLUSION_V1' not in s:
    old="""    function getUpgradedStat(baseStat, level, ceiling) {
        const lvl = Math.min(UPGRADE_MAX_LEVEL, Math.max(0, Number(level) || 0));
        const base = Number(baseStat) || 0;
        const pct = Math.min(UPGRADE_MAX_BONUS_PCT, lvl * (UPGRADE_MAX_BONUS_PCT / UPGRADE_MAX_LEVEL));
        const raw = base === 0 ? Math.round(lvl) : Math.round(base * (1 + pct));
        return (typeof ceiling === 'number') ? Math.min(raw, ceiling) : raw;
    }"""
    new="""    // ADMIN_BALANCE_EXCLUSION_V1: administrator-only equipment keeps its legacy
    // upgrade curve and is never used when tuning ordinary player progression.
    function getUpgradedStat(baseStat, level, ceiling, adminOnly = false) {
        const base = Number(baseStat) || 0;
        if (adminOnly) {
            const lvl = Math.max(0, Number(level) || 0);
            const pct = Math.min(0.5, lvl * 0.005);
            return base === 0 ? Math.round(lvl) : Math.round(base * (1 + pct));
        }
        const lvl = Math.min(UPGRADE_MAX_LEVEL, Math.max(0, Number(level) || 0));
        const pct = Math.min(UPGRADE_MAX_BONUS_PCT, lvl * (UPGRADE_MAX_BONUS_PCT / UPGRADE_MAX_LEVEL));
        const raw = base === 0 ? Math.round(lvl) : Math.round(base * (1 + pct));
        return (typeof ceiling === 'number') ? Math.min(raw, ceiling) : raw;
    }
    function getItemUpgradeMaxLevel(item) { return item && item.adminOnly ? 100 : UPGRADE_MAX_LEVEL; }
    function getItemUpgradeByteThreshold(item) { return item && item.adminOnly ? 50 : UPGRADE_BYTE_THRESHOLD; }"""
    if s.count(old)!=1: raise SystemExit('admin upgrade curve: unique reviewed anchor missing')
    s=s.replace(old,new,1)

    # Any displayed/effective admin value uses the preserved legacy curve.
    s=s.replace("getUpgradedStat(base.dmg, parsed.level, getNextItemCeiling(weapons, base, 'dmg'))",
                "getUpgradedStat(base.dmg, parsed.level, getNextItemCeiling(weapons, base, 'dmg'), !!base.adminOnly)")
    s=s.replace("getUpgradedStat(base.dmg, parsed.level + 1, getNextItemCeiling(weapons, base, 'dmg'))",
                "getUpgradedStat(base.dmg, parsed.level + 1, getNextItemCeiling(weapons, base, 'dmg'), !!base.adminOnly)")
    s=s.replace("getUpgradedStat(weapon.dmg, parsed.level, getNextItemCeiling(weapons, weapon, 'dmg'))",
                "getUpgradedStat(weapon.dmg, parsed.level, getNextItemCeiling(weapons, weapon, 'dmg'), !!weapon.adminOnly)")
    s=s.replace("getUpgradedStat(base.armor, parsed.level, getNextItemCeiling(armorItems, base, 'armor'))",
                "getUpgradedStat(base.armor, parsed.level, getNextItemCeiling(armorItems, base, 'armor'), !!base.adminOnly)")
    s=s.replace("getUpgradedStat(base.armor, u.armor || 0, getNextItemCeiling(armorItems, base, 'armor'))",
                "getUpgradedStat(base.armor, u.armor || 0, getNextItemCeiling(armorItems, base, 'armor'), !!base.adminOnly)")
    s=s.replace("getUpgradedStat(base.hitAbsorption || 0, u.hitAbsorption || 0, getNextItemCeiling(armorItems, base, 'hitAbsorption'))",
                "getUpgradedStat(base.hitAbsorption || 0, u.hitAbsorption || 0, getNextItemCeiling(armorItems, base, 'hitAbsorption'), !!base.adminOnly)")
    s=s.replace("stats[key] = getUpgradedStat(stats[key] || 0, u[key]);",
                "stats[key] = getUpgradedStat(stats[key] || 0, u[key], undefined, !!base.adminOnly);")
    s=s.replace("getUpgradedStat(baseStatValue, statLevel + 1, ceiling)",
                "getUpgradedStat(baseStatValue, statLevel + 1, ceiling, !!base.adminOnly)")

    old="""            const parsed = parseGearName(current.name);
            const maxed = parsed.level >= UPGRADE_MAX_LEVEL;
            const base = weapons.find(w => w.name === parsed.baseName);
            const currentStat = getUpgradedStat(base.dmg, parsed.level, getNextItemCeiling(weapons, base, 'dmg'), !!base.adminOnly);
            const nextStat = getUpgradedStat(base.dmg, parsed.level + 1, getNextItemCeiling(weapons, base, 'dmg'), !!base.adminOnly);
            const usesTokens = parsed.level >= UPGRADE_BYTE_THRESHOLD;"""
    new="""            const parsed = parseGearName(current.name);
            const base = weapons.find(w => w.name === parsed.baseName);
            if (!base) return '';
            const itemMaxLevel = getItemUpgradeMaxLevel(base);
            const itemByteThreshold = getItemUpgradeByteThreshold(base);
            const maxed = parsed.level >= itemMaxLevel;
            const currentStat = getUpgradedStat(base.dmg, parsed.level, getNextItemCeiling(weapons, base, 'dmg'), !!base.adminOnly);
            const nextStat = getUpgradedStat(base.dmg, parsed.level + 1, getNextItemCeiling(weapons, base, 'dmg'), !!base.adminOnly);
            const usesTokens = parsed.level >= itemByteThreshold;"""
    if s.count(old)!=1: raise SystemExit('equipped admin weapon UI: unique reviewed anchor missing')
    s=s.replace(old,new,1)
    old_text="Уровень улучшения: ${parsed.level} / ${UPGRADE_MAX_LEVEL}${parsed.level < UPGRADE_BYTE_THRESHOLD ? ` (до ${UPGRADE_BYTE_THRESHOLD} — за Байты)` : ' (за Жетоны сталкера)'}"
    new_text="Уровень улучшения: ${parsed.level} / ${itemMaxLevel}${parsed.level < itemByteThreshold ? ` (до ${itemByteThreshold} — за Байты)` : ' (за Жетоны сталкера)'}"
    if s.count(old_text)<2: raise SystemExit('weapon level labels: reviewed anchors missing')
    s=s.replace(old_text,new_text,1)

    old="""            const parsed = parseGearName(itemName);
            const maxed = parsed.level >= UPGRADE_MAX_LEVEL;
            const base = armorItems.find(a => a.name === parsed.baseName);
            if (!base) return '';"""
    new="""            const parsed = parseGearName(itemName);
            const base = armorItems.find(a => a.name === parsed.baseName);
            if (!base) return '';
            const itemMaxLevel = getItemUpgradeMaxLevel(base);
            const itemByteThreshold = getItemUpgradeByteThreshold(base);
            const maxed = !base.adminOnly && parsed.level >= itemMaxLevel;"""
    if s.count(old)!=1: raise SystemExit('admin armor header: unique reviewed anchor missing')
    s=s.replace(old,new,1)

    old="""                const totalUpgrades=Math.max(parsed.level,Object.values(upgradeData).reduce((n,x)=>n+(Number.isFinite(Number(x))?Math.max(0,Math.floor(Number(x))):0),0));
                const rowMaxed = totalUpgrades >= UPGRADE_MAX_LEVEL;
                const rowUsesTokens = statLevel >= UPGRADE_BYTE_THRESHOLD;"""
    new="""                const totalUpgrades=Math.max(parsed.level,Object.values(upgradeData).reduce((n,x)=>n+(Number.isFinite(Number(x))?Math.max(0,Math.floor(Number(x))):0),0));
                const rowMaxed = base.adminOnly ? statLevel >= 100 : totalUpgrades >= itemMaxLevel;
                const rowUsesTokens = statLevel >= itemByteThreshold;"""
    if s.count(old)!=1: raise SystemExit('admin armor row limit: unique reviewed anchor missing')
    s=s.replace(old,new,1)
    old_text="Уровень этой характеристики: ${statLevel} / ${UPGRADE_MAX_LEVEL}${statLevel < UPGRADE_BYTE_THRESHOLD ? ` (до ${UPGRADE_BYTE_THRESHOLD} — за Байты)` : ' (за Жетоны сталкера)'}"
    new_text="Уровень этой характеристики: ${statLevel} / ${base.adminOnly ? 100 : itemMaxLevel}${statLevel < itemByteThreshold ? ` (до ${itemByteThreshold} — за Байты)` : ' (за Жетоны сталкера)'}"
    if s.count(old_text)!=1: raise SystemExit('armor stat level label: reviewed anchor missing')
    s=s.replace(old_text,new_text,1)
    old_text="Всего улучшений предмета: ${parsed.level} / ${UPGRADE_MAX_LEVEL} (общий предел)"
    new_text="${base.adminOnly ? `Администраторское снаряжение вне игрового баланса · улучшений: ${parsed.level}` : `Всего улучшений предмета: ${parsed.level} / ${itemMaxLevel} (общий предел)`}"
    if s.count(old_text)!=1: raise SystemExit('armor total label: reviewed anchor missing')
    s=s.replace(old_text,new_text,1)

    old="""            const parsed = parseGearName(name);
            const maxed = parsed.level >= UPGRADE_MAX_LEVEL;
            const base = weapons.find(w => w.name === parsed.baseName);
            const currentStat = getUpgradedStat(base.dmg, parsed.level, getNextItemCeiling(weapons, base, 'dmg'), !!base.adminOnly);
            const nextStat = getUpgradedStat(base.dmg, parsed.level + 1, getNextItemCeiling(weapons, base, 'dmg'), !!base.adminOnly);
            const usesTokens = parsed.level >= UPGRADE_BYTE_THRESHOLD;"""
    new="""            const parsed = parseGearName(name);
            const base = weapons.find(w => w.name === parsed.baseName);
            if (!base) return '';
            const itemMaxLevel = getItemUpgradeMaxLevel(base);
            const itemByteThreshold = getItemUpgradeByteThreshold(base);
            const maxed = parsed.level >= itemMaxLevel;
            const currentStat = getUpgradedStat(base.dmg, parsed.level, getNextItemCeiling(weapons, base, 'dmg'), !!base.adminOnly);
            const nextStat = getUpgradedStat(base.dmg, parsed.level + 1, getNextItemCeiling(weapons, base, 'dmg'), !!base.adminOnly);
            const usesTokens = parsed.level >= itemByteThreshold;"""
    if s.count(old)!=1: raise SystemExit('inventory admin weapon UI: unique reviewed anchor missing')
    s=s.replace(old,new,1)
    if s.count(old_text:= "Уровень улучшения: ${parsed.level} / ${UPGRADE_MAX_LEVEL}${parsed.level < UPGRADE_BYTE_THRESHOLD ? ` (до ${UPGRADE_BYTE_THRESHOLD} — за Байты)` : ' (за Жетоны сталкера)'}")!=1:
        raise SystemExit('inventory weapon level label: reviewed anchor missing')
    s=s.replace(old_text,new_text,1)

# Cache bust the gesture and trader modules. These replacements are idempotent.
for asset in ('inventory/drag.js','inventory/drag.css','ui/trader-hubs.js','ui/trader-hubs.css'):
    esc=re.escape(asset)
    s,n=re.subn(esc+r'(?:\?v=[^"\'<>\s]+)?',asset+'?v=20260919q3',s)
    if n<1: raise SystemExit('asset tag not found: '+asset)

path.write_text(s,encoding='utf-8')
print('client balance patch: OK')
