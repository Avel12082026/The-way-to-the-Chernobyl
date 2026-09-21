#!/usr/bin/env python3
import importlib.util, subprocess, tempfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
path=ROOT/'tools/install_weapon_progression.py'
spec=importlib.util.spec_from_file_location('weapon_progression',path)
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)

source=r"""
const SHOP_WEAPONS=[];
const db={prepare(){return{get(){return null},run(){return{changes:1}}}}};
const requireAuth=(_q,_s,n)=>n();
function safeParsePlayerData(x){return JSON.parse(x)}
function parseGearNameServer(name){return {baseName:name}}
function raidCreateNpcPayload(data){return {name:'npc',tier:1};}
const app={post(){},listen(){}};
app.post('/api/shop/buy',(req,res,next)=>next());
app.post('/api/shop/buy',(req,res)=>{});
app.post('/api/raid/step',(req,res)=>{});
app.post('/api/pve/victory',(req,res)=>{});
app.listen(3000);
"""

patched,changed=mod.patch(source)
assert changed
assert mod.MARK in patched
assert mod.NPC_MARK in patched
assert mod.VICTORY_MARK in patched

for text in [
    "weapon.unlockLevel=1+index*3",
    "const ordered=[...pistols,...shotguns,...automatics,...rifles]",
    "weaponProgressionNpcWeaponServer",
    "const shift=Math.floor(Math.random()*3)-1",
    "npc.weaponDrop=weapon.name",
    "Оружие с NPC:",
    "Это оружие откроется на ",
]:
    assert text in patched,text

# Progression middleware must run before original routes.
assert patched.index(mod.MARK)<patched.index("app.post('/api/shop/buy'",patched.index(mod.MARK)+1)
assert patched.index(mod.NPC_MARK)<patched.index("app.post('/api/raid/step'",patched.index(mod.NPC_MARK)+1)
assert patched.index(mod.VICTORY_MARK)<patched.index("app.post('/api/pve/victory'",patched.index(mod.VICTORY_MARK)+1)

again,changed2=mod.patch(patched)
assert not changed2 and again==patched

with tempfile.TemporaryDirectory() as td:
    candidate=Path(td)/'server.js'
    candidate.write_text(patched,encoding='utf-8')
    subprocess.run(['node','--check',str(candidate)],check=True)

print('PASS: 3-level weapon progression installer is idempotent; trader gate and NPC ±1 weapon/drop window are present')
