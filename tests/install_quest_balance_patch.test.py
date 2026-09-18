import importlib.util
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('installer',ROOT/'tools/install_quest_balance_server.py')
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)

source="""
const UPGRADE_MAX_LEVEL = 100;
const UPGRADE_BYTE_THRESHOLD = 50;
const UPGRADE_MAX_BONUS_PCT_SERVER = 0.5;
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
    db.prepare('DELETE FROM pve_battles WHERE player_id=?').run(playerId);
    return res.json({success:true});
});

app.post('/api/raid/step'
app.listen(PORT, () => {
"""
patched,changed=mod.patch(source)
assert changed
assert 'const UPGRADE_MAX_LEVEL = 50;' in patched
assert 'const UPGRADE_BYTE_THRESHOLD = 25;' in patched
assert 'const UPGRADE_MAX_BONUS_PCT_SERVER = 0.25;' in patched
assert 'const unlocks=[[4,135],[5,175],[6,220],[7,265],[8,305],[9,350],[10,395],[11,440],[12,480],[13,525],[14,570]];' in patched
assert '1:240,2:480' in patched
assert '1:28,2:45' in patched
assert 'earlyFloor' in patched
assert 'Math.floor(level/40)' in patched
assert patched.count('questBalance.pickArtifact')==2
assert 'questBalance.markRaidReturn(playerId)' in patched
assert patched.count(mod.MARK)==1
again,changed2=mod.patch(patched)
assert not changed2 and again==patched
print('quest server installer patch: OK')
