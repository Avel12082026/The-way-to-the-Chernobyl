#!/usr/bin/env python3
import importlib.util, subprocess, tempfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
path=ROOT/'tools/install_weapon_class_damage.py'
spec=importlib.util.spec_from_file_location('weapon_class_damage',path)
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)

source=r"""
const SHOP_WEAPONS=[
 ...Array.from({length:29},(_,i)=>({id:1000+i,name:'Автомат A'+(i+1),dmg:100+i,unlockLevel:175+i*3})),
 ...Array.from({length:29},(_,i)=>({id:2000+i,name:'Винтовка R'+(i+1),dmg:100+i,unlockLevel:262+i*3})),
 ...Array.from({length:29},(_,i)=>({id:i===0?86:3000+i,name:i===0?'Beretta 21A Bobcat':'Пистолет P'+(i+1),dmg:100+i,unlockLevel:1+i*3})),
 ...Array.from({length:29},(_,i)=>({id:4000+i,name:'Дробовик S'+(i+1),dmg:100+i,unlockLevel:88+i*3}))
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
assert 'pistol:1.00' in patched
assert 'shotgun:1.25' in patched
assert 'automatic:1.50' in patched
assert 'rifle:1.75' in patched
assert 'getWeaponClassNextCeilingServer(SHOP_WEAPONS' in patched
assert 'getNextItemCeilingServer(SHOP_ARMOR' in patched

again,changed2,replaced2=mod.patch(patched)
assert not changed2 and replaced2==0 and again==patched

runtime=patched+r"""
const auto=SHOP_WEAPONS[0],rifle=SHOP_WEAPONS[29],pistol=SHOP_WEAPONS[58],shotgun=SHOP_WEAPONS[87];
if(weaponDamageClassServer(SHOP_WEAPONS,auto)!=='automatic')throw new Error('auto class');
if(weaponDamageClassServer(SHOP_WEAPONS,rifle)!=='rifle')throw new Error('rifle class');
if(weaponDamageClassServer(SHOP_WEAPONS,pistol)!=='pistol')throw new Error('pistol class');
if(weaponDamageClassServer(SHOP_WEAPONS,shotgun)!=='shotgun')throw new Error('shotgun class');
if(pistol.dmg!==100||shotgun.dmg!==125||auto.dmg!==150||rifle.dmg!==175)
  throw new Error('damage multipliers '+[pistol.dmg,shotgun.dmg,auto.dmg,rifle.dmg].join(','));
console.log('RUNTIME PASS');
"""
with tempfile.TemporaryDirectory() as td:
    candidate=Path(td)/'server.js'
    candidate.write_text(runtime,encoding='utf-8')
    proc=subprocess.run(['node',str(candidate)],check=True,capture_output=True,text=True)
    assert 'RUNTIME PASS' in proc.stdout

print('PASS: weapon class damage installer starts on live-like catalog without starterGear and keeps class hierarchy')
