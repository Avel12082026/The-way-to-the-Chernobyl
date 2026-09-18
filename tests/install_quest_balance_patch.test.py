import importlib.util
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('installer',ROOT/'tools/install_quest_balance_server.py')
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)

source="""const UPGRADE_MAX_LEVEL = 100;
const UPGRADE_BYTE_THRESHOLD = 50;
const UPGRADE_MAX_BONUS_PCT_SERVER = 0.5;
function getUpgradedStatServer(baseStat, level, ceiling) {
    const lvl = Math.max(0, Number(level) || 0);
    const base = Number(baseStat) || 0;
    const pct = Math.min(UPGRADE_MAX_BONUS_PCT_SERVER, lvl * (UPGRADE_MAX_BONUS_PCT_SERVER / UPGRADE_MAX_LEVEL));
    const raw = base === 0 ? Math.round(lvl) : Math.round(base * (1 + pct));
    return (typeof ceiling === 'number') ? Math.min(raw, ceiling) : raw;
}
const bulletResist = getUpgradedStatServer(base.armor, u.armor || 0, getNextItemCeilingServer(SHOP_ARMOR, base, 'armor'));
const hitAbsorption = getUpgradedStatServer(base.hitAbsorption || 0, u.hitAbsorption || 0, getNextItemCeilingServer(SHOP_ARMOR, base, 'hitAbsorption'));
stats[key] = getUpgradedStatServer(stats[key] || 0, u[key]);

function upgradeWeaponFixture() {
        if (parsed.level >= UPGRADE_MAX_LEVEL) return res.json({ success: false, error: 'Этот предмет уже улучшен до максимума' });
        const weaponCeiling = getNextItemCeilingServer(SHOP_WEAPONS, weaponBase, 'dmg');
        if (getUpgradedStatServer(weaponBase.dmg, parsed.level, weaponCeiling) >= weaponCeiling) return res.json({success:false});
        const usesTokens = parsed.level >= UPGRADE_BYTE_THRESHOLD;
        const newLevel=parsed.level+1;
        const newDamage=getUpgradedStatServer(weaponBase.dmg, newLevel, weaponCeiling);
}
function upgradeArmorFixture() {
    const stableKey = getStableArmorKeyServer(itemName);
    data.armorUpgradeData = data.armorUpgradeData || {};
""" + mod.OLD_UPGRADE_GUARD + """
    let armorStatCeiling = Infinity;
    if (isCoreStat) {
        armorStatCeiling = getNextItemCeilingServer(SHOP_ARMOR, armorBase, statKey);
    }
    const usesTokens = statLevel >= UPGRADE_BYTE_THRESHOLD;
}
function equipWeaponFixture() {
    const a=getUpgradedStatServer(weapon.dmg,parsed.level,ceiling);
    const b=getUpgradedStatServer(base.dmg, parsed.level, ceiling);
}
function getResearchSuitUnlockTierServer(level) {
    // Исследовательские комбинезоны открываются каждые 25 уровней игрока — та же логика,
    // что getResearchSuitUnlockTier на клиенте.
    return Math.min(14, 4 + Math.floor((Math.max(1, Number(level) || 1) - 1) / 50));
}
const PVE_NPC_TIER_HP = {1:25,2:480,3:690,4:1095,5:1720,6:2685,7:4160,8:6420,9:9250,10:13310,11:19170,12:27600,13:39750,14:57240};
const PVE_NPC_TIER_DMG = {1:43,2:45,3:46,4:47,5:50,6:53,7:56,8:60,9:72,10:84,11:95,12:106,13:117,14:129};
const PVE_NPC_TIER_MULT = {1:1.37,2:0.97,3:1.05,4:1.08,5:1.14,6:1.05,7:0.97,8:0.86,9:0.86,10:0.72,11:0.76,12:0.87,13:0.78,14:0.84};
    return {...pick,kind:'mutant',enemyHp:Number(pick.hp)||1,maxEnemyHp:Number(pick.hp)||1,medkitsUsed:0};
expectedTier=Math.min(PVE_NPC_MAX_TIER,1+Math.floor(level/20));
const name=a.artifacts[Math.floor(Math.random()*a.artifacts.length)];pveAddItem(data,name,1,true);found.push(name);
const second=a.artifacts[Math.floor(Math.random()*a.artifacts.length)];pveAddItem(data,second,1,true);found.push(second);
""" + mod.OLD_RAID_END + """
""" + mod.OLD_DEFENSE + """
app.listen(PORT, () => {
"""

patched,changed=mod.patch(source)
assert changed
assert 'const UPGRADE_MAX_LEVEL = 50;' in patched
assert 'const UPGRADE_BYTE_THRESHOLD = 25;' in patched
assert 'const UPGRADE_MAX_BONUS_PCT_SERVER = 0.25;' in patched
assert 'adminOnly = false' in patched
assert 'legacyPct = Math.min(0.5, legacyLevel * 0.005)' in patched
assert 'weaponMaxLevel=weaponBase.adminOnly?100:UPGRADE_MAX_LEVEL' in patched
assert 'weaponBase.adminOnly ? Infinity' in patched
assert 'weaponBase.adminOnly ? 50 : UPGRADE_BYTE_THRESHOLD' in patched
assert 'adminBalanceExcluded ? statLevel >= 100' in patched
assert 'isCoreStat && !adminBalanceExcluded' in patched
assert 'adminBalanceExcluded ? 50 : UPGRADE_BYTE_THRESHOLD' in patched
assert '!!base.adminOnly' in patched
assert '!!weapon.adminOnly' in patched

assert 'const unlocks=[[4,135],[5,175],[6,220],[7,265],[8,305],[9,350],[10,395],[11,440],[12,480],[13,525],[14,570]];' in patched
assert '1:240,2:480' in patched
assert '1:28,2:45' in patched
assert 'earlyFloor' in patched
assert 'Math.floor(level/40)' in patched
assert patched.count('questBalance.pickArtifact')==2
assert mod.NEW_RAID_END in patched
assert mod.NEW_DEFENSE in patched
assert mod.NEW_UPGRADE_GUARD in patched
assert 'Math.min(UPGRADE_MAX_LEVEL' in patched
assert patched.count(mod.MARK)==1
assert not mod.LIVE_DEPLOYMENT_READY

again,changed2=mod.patch(patched)
assert not changed2 and again==patched

# Anchor ambiguity must fail closed.
try:
    mod.patch(source+"\n"+mod.OLD_DEFENSE)
    raise AssertionError('ambiguous anchors accepted')
except RuntimeError:
    pass

# Never auto-upgrade an old experimental server patch.
try:
    mod.patch('// QUEST_BALANCE_V1')
    raise AssertionError('unreviewed V1 patch accepted')
except RuntimeError:
    pass

print('Installer: ordinary +50 cap, admin legacy +100 curve, atomic raid return, finite defense and release gate: OK')
