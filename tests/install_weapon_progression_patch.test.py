import importlib.util
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('installer',ROOT/'tools/install_weapon_progression_server.py')
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)

source="""// QUEST_BALANCE_V2
function createFreshPlayerDataServer() {
    return {
        weapon:{name:'Beretta 21A Bobcat',tier:1,dmg:80},
    };
}
app.get('/api/player/:id', (req, res) => {
    const data = {
        ...publicEquippedLoadout(full),
        nickname: full.nickname, username: row.username,
        level: Number(full.level)||1,
        stats: full.stats || {},
        weapon: full.weapon || null, armor: full.armor || null, detector: full.detector || null,
    };
});
function raidCreateNpcPayload(data){
    const tier=raidNpcTier(data);
    const faction='x';
    const safeWeapons=SHOP_WEAPONS.filter(w=>Number(w.tier)<=tier&&!w.adminOnly&&!w.isPremiumWeapon);
    const safeArmors=SHOP_ARMOR.filter(a=>Number(a.tier)<=tier&&!a.adminOnly&&!a.isPremiumArmor);
    const wt=Math.max(...safeWeapons.map(w=>Number(w.tier)||0));
    const at=Math.max(...safeArmors.map(a=>Number(a.tier)||0));
    const weaponPool=safeWeapons.filter(w=>Number(w.tier)===wt);
    const armorPool=safeArmors.filter(a=>Number(a.tier)===at);
    const weapon=weaponPool[0];
    const armor=armorPool[0];
    return {weaponName:weapon.name,armorName:armor.name};
}
function raidCreateMutantPayload(data){return null;}
const questBalance = require('./quest-balance.cjs')({
    app,db,requireAuth,rateLimit,
    SHOP_WEAPONS,SHOP_ARMOR,SHOP_ARTIFACTS,SHOP_MUTANT_LOOT,PVE_MUTANTS,RAID_ANOMALIES,
    resolveSellPriceServer,parseGearNameServer
});
app.listen(PORT,()=>{});
"""

patched,changed=mod.patch(source)
assert changed
assert mod.MARK in patched
assert "coins:Number(full.coins)||0, breedCredits:Number(full.breedCredits)||0" in patched
assert "exp:Number(full.exp)||0" in patched
assert "dmg:66" in patched
assert "weaponProgression.combatPool(Number(data.level)||1)" in patched
assert "const weaponPool=safeWeapons;" in patched
assert "require('./weapon-progression.cjs')" in patched
assert patched.index("require('./weapon-progression.cjs')") < patched.index("require('./quest-balance.cjs')")
again,changed2=mod.patch(patched)
assert not changed2 and again==patched

data,by_name=mod.load_progression(ROOT/'data/weapon-progression.json')
assert len(by_name)==116
assert 'Убиваю взглядом' not in by_name
assert mod.effective_damage(by_name['Beretta 21A Bobcat'],50)==round(by_name['Beretta 21A Bobcat']['damage']*1.25)
print('weapon progression installer patch: guarded, idempotent, currencies public, admin excluded')
