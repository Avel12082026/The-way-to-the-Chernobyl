#!/usr/bin/env python3
import importlib.util, sys, tempfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
installer=ROOT/'tools/install_combat_balance_bundle.py'
spec=importlib.util.spec_from_file_location('combat_bundle_server_only',installer)
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
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
const app={post(){},listen(){}};
app.post('/api/shop/buy',(req,res)=>{});
app.post('/api/raid/step',(req,res)=>{});
app.post('/api/pve/victory',(req,res)=>{});
app.listen(3000);
"""

with tempfile.TemporaryDirectory() as td:
    root=Path(td)
    server=root/'server.js'
    server.write_text(source,encoding='utf-8')
    assert not (root/'index.html').exists()
    before=server.read_bytes()
    old_argv=sys.argv[:]
    try:
        sys.argv=['install_combat_balance_bundle.py','--base','unused','--root',str(root),'--server-only','--check']
        mod.main()
    finally:
        sys.argv=old_argv
    assert server.read_bytes()==before
    assert not (root/'index.html').exists()

print('PASS: --server-only --check works when the VPS has no index.html and makes no changes')
