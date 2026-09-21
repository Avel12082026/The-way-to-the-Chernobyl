#!/usr/bin/env python3
import importlib.util, subprocess, tempfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
path=ROOT/'tools/install_weapon_class_damage.py'
spec=importlib.util.spec_from_file_location('weapon_class_damage',path)
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)

source=r"""
const SHOP_WEAPONS=[
 ...Array.from({length:29},(_,i)=>({id:1000+i,name:i===0?'АКС-74У':'A'+(i+1),dmg:100+i,unlockLevel:175+i*3})),
 ...Array.from({length:29},(_,i)=>({id:2000+i,name:i===0?'СВД':'R'+(i+1),dmg:100+i,unlockLevel:262+i*3})),
 ...Array.from({length:29},(_,i)=>({id:i===0?86:3000+i,name:i===0?'Beretta 21A Bobcat':'P'+(i+1),dmg:100+i,unlockLevel:1+i*3})),
 ...Array.from({length:29},(_,i)=>({id:4000+i,name:i===0?'Remington 870':'S'+(i+1),dmg:100+i,unlockLevel:88+i*3}))
];
const SHOP_ARMOR=[];
function getUpgradedStatServer(baseStat,level,ceiling){ return baseStat; }
function getNextItemCeilingServer(list,item,statKey){ return Infinity; }
function a(){
  const x=getNextItemCeilingServer(SHOP_WEAPONS,SHOP_WEAPONS[0],'dmg');
  const y=getNextItemCeilingServer(SHOP_ARMOR,{},'armor');
  return [x,y];
}
const app={listen(){}};
app.listen(3000);
"""

patched,changed,replaced=mod.patch(source)
assert changed
assert replaced==1
assert mod.MARK in patched
assert "String(o&&o.name||'')==='Beretta 21A Bobcat'" in patched
assert 'const classSize=29' in patched
assert "pistolStart!==classSize*2" in patched
assert 'const WEAPON_DAMAGE_BASE=80' in patched
assert 'const WEAPON_DAMAGE_GROWTH=1.05' in patched
assert 'weaponDamageForProgressionIndexServer' in patched
assert 'weaponDamageProgressionIndexServer' in patched
assert 'getWeaponClassNextCeilingServer(SHOP_WEAPONS' in patched
assert 'getNextItemCeilingServer(SHOP_ARMOR' in patched

again,changed2,replaced2=mod.patch(patched)
assert not changed2 and replaced2==0 and again==patched

legacy_block=r"""// WEAPON_CLASS_DAMAGE_V1
const WEAPON_CLASS_DAMAGE_MULTIPLIERS={pistol:1,shotgun:1.25,automatic:1.5,rifle:1.75};
function weaponDamageClassServer(){return'pistol';}
function getWeaponClassNextCeilingServer(list,item,statKey){return Infinity;}

"""
legacy=patched.replace(mod.BLOCK,legacy_block,1)
upgraded,changed3,replaced3=mod.patch(legacy)
assert changed3
assert 'const WEAPON_DAMAGE_BASE=80' in upgraded
assert 'WEAPON_CLASS_DAMAGE_MULTIPLIERS' not in upgraded
assert upgraded.count(mod.MARK)==1
assert 'getWeaponClassNextCeilingServer(SHOP_WEAPONS' in upgraded

runtime=patched+r"""
const auto=SHOP_WEAPONS[0],rifle=SHOP_WEAPONS[29],pistol=SHOP_WEAPONS[58],shotgun=SHOP_WEAPONS[87];
if(weaponDamageClassServer(SHOP_WEAPONS,auto)!=='automatic')throw new Error('auto class');
if(weaponDamageClassServer(SHOP_WEAPONS,rifle)!=='rifle')throw new Error('rifle class');
if(weaponDamageClassServer(SHOP_WEAPONS,pistol)!=='pistol')throw new Error('pistol class');
if(weaponDamageClassServer(SHOP_WEAPONS,shotgun)!=='shotgun')throw new Error('shotgun class');
if(pistol.dmg!==80||shotgun.dmg!==329||auto.dmg!==1355||rifle.dmg!==5579)
  throw new Error('damage progression '+[pistol.dmg,shotgun.dmg,auto.dmg,rifle.dmg].join(','));
const regular=SHOP_WEAPONS.filter(w=>!w.adminOnly);
const ordered=[...regular.slice(58,87),...regular.slice(87,116),...regular.slice(0,29),...regular.slice(29,58)];
for(let i=1;i<ordered.length;i++){
  if(!(ordered[i-1].dmg<ordered[i].dmg))throw new Error('damage not strictly increasing at '+i);
}
if(ordered[115].dmg!==21871)throw new Error('final rifle damage '+ordered[115].dmg);
console.log('RUNTIME PASS');
"""
with tempfile.TemporaryDirectory() as td:
    candidate=Path(td)/'server.js'
    candidate.write_text(runtime,encoding='utf-8')
    proc=subprocess.run(['node',str(candidate)],check=True,capture_output=True,text=True)
    assert 'RUNTIME PASS' in proc.stdout

print('PASS: weapon damage strictly increases through pistols, shotguns, automatics and rifles')
