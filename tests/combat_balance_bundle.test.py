#!/usr/bin/env python3
import importlib.util, subprocess, tempfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
path=ROOT/'tools/install_combat_balance_bundle.py'
spec=importlib.util.spec_from_file_location('combat_bundle',path)
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)

# No network in this integration test: the bundle must be able to compose the
# checked-in helper patches into one server candidate.
mod.fetch=lambda _base,rel:(ROOT/rel).read_bytes()

source=r"""
const SHOP_WEAPONS=[
 ...Array.from({length:29},(_,i)=>({id:1000+i,name:i===0?'АКС-74У':'A'+i,dmg:100+i,unlockLevel:10+i})),
 ...Array.from({length:29},(_,i)=>({id:2000+i,name:i===0?'СВД':'R'+i,dmg:100+i,unlockLevel:20+i})),
 ...Array.from({length:29},(_,i)=>({id:i===0?86:3000+i,name:i===0?'Beretta 21A Bobcat':'P'+i,dmg:100+i,unlockLevel:30+i})),
 ...Array.from({length:29},(_,i)=>({id:4000+i,name:i===0?'Remington 870':'S'+i,dmg:100+i,unlockLevel:40+i}))
];
const SHOP_ARMOR=Array.from({length:14},(_,i)=>({name:'Armor '+(i+1),tier:i+1,armor:10+i,hitAbsorption:5+i,unlockLevel:1+i*40}));
const SHOP_ARTIFACTS=[{name:'Artifact',tier:1,stats:{health:10,bulletResist:4,hitAbsorption:4}}];
const PVE_MUTANTS=[{name:'Mutant',tier:1,hp:100,dmg:10}];
const PVE_SCHEMA='pve_battles';
const db={prepare(){return{get(){return null},run(){return{changes:1}}}}};
const requireAuth=(_q,_s,n)=>n();
function safeParsePlayerData(x){return JSON.parse(x)}
function parseGearNameServer(name){return {baseName:String(name||'').replace(/\s+\+\d+$/,'')}}
function getUpgradedStatServer(base){return Number(base)||0}
function getNextItemCeilingServer(){return Infinity}
function ceilingFixture(){return getNextItemCeilingServer(SHOP_WEAPONS,SHOP_WEAPONS[0],'dmg')}
function raidCreateNpcPayload(){return {name:'npc',tier:1,hp:100,dmg:10}}
function raidCreateMutantPayload(){return {name:'mutant',tier:1,hp:100,dmg:10}}
function encounter(data){
  const npc=raidCreateNpcPayload(data);
  const mutant=raidCreateMutantPayload(data);
  return[npc,mutant];
}
const app={
  post(){},
  listen(){}
};
app.post('/api/shop/buy',(req,res)=>{});
app.post('/api/raid/step',(req,res)=>{});
app.post('/api/pve/victory',(req,res)=>{});
app.listen(3000);
"""

patched,status=mod.apply_patches(source,'unused')
assert len(status)==3
for marker in (
    '// WEAPON_CLASS_DAMAGE_V1',
    '// WEAPON_UNLOCK_EVERY_3_LEVELS_V1',
    '// NPC_WEAPON_LOOT_WINDOW_V1',
    '// PVE_ADAPTIVE_COMBAT_V1',
    'npcLootDropChanceServer',
    'pveAdaptiveNpcPayloadServer',
    'pveAdaptiveMutantPayloadServer',
):
    assert marker in patched,marker

with tempfile.TemporaryDirectory() as td:
    candidate=Path(td)/'server.js'
    candidate.write_text(patched,encoding='utf-8')
    subprocess.run(['node','--check',str(candidate)],check=True,capture_output=True,text=True)
    proc=subprocess.run(['node',str(candidate)],check=True,capture_output=True,text=True)

print('PASS: atomic bundle composes weapon damage, progression, rare NPC loot and adaptive PvE')
