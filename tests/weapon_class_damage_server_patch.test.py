#!/usr/bin/env python3
import importlib.util
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
path=ROOT/'tools/install_weapon_class_damage.py'
spec=importlib.util.spec_from_file_location('weapon_class_damage',path)
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)

source=r"""
const SHOP_WEAPONS=[];
const SHOP_ARMOR=[];
function getUpgradedStatServer(baseStat,level,ceiling){ return baseStat; }
function getNextItemCeilingServer(list,item,statKey){ return Infinity; }
function a(){
  const x=getNextItemCeilingServer(SHOP_WEAPONS,weapon,'dmg');
  const y=getNextItemCeilingServer(SHOP_ARMOR,armor,'armor');
  return [x,y];
}
app.listen(3000);
"""

patched,changed,replaced=mod.patch(source)
assert changed
assert replaced==1
assert mod.MARK in patched
assert 'WEAPON_CLASS_DAMAGE_MULTIPLIERS' in patched
assert 'pistol:1.00' in patched
assert 'shotgun:1.25' in patched
assert 'automatic:1.50' in patched
assert 'rifle:1.75' in patched
assert 'getWeaponClassNextCeilingServer(SHOP_WEAPONS' in patched
assert 'getNextItemCeilingServer(SHOP_ARMOR' in patched
assert "counts.pistol!==29" in patched
assert "counts.shotgun!==29" in patched
assert "counts.automatic!==29" in patched
assert "counts.rifle!==29" in patched

again,changed2,replaced2=mod.patch(patched)
assert not changed2 and replaced2==0 and again==patched

print('PASS: weapon class damage installer is idempotent, class-aware for upgrades, and keeps armor ceiling logic untouched')
